// optimizer.js — Optimierung per linearem Programm (SPEC „Version 2 › Optimierung“).
// optimize({ targets, objective, allowAlternates, excluded, mods, data, limits }) → Result | { error: "infeasible", items }.
// Reine Funktionen, kein DOM, kein localStorage; einziger Daten-Import ist der Standardwert für `limits`.
import resourceLimits from "./resourceLimits.js";
import {
  EPS,
  hasOwn,
  isPositiveNumber,
  compareIds,
  effectiveRecipe,
  normalizeTargets,
  importSet,
  emptyResult,
  buildResult,
} from "./result.js";

/** Gewicht des Nebenziels: Maschinen bei "resources", gewichtete Rohstoffe bei "power". */
const SECONDARY_WEIGHT = 1e-6;
/** Gewicht je Einheit für unbegrenzte Rohstoffe (Wasser) und Rohstoffe ohne Eintrag in `limits`. */
const UNLIMITED_WEIGHT = 1e-6;
/** Gewicht je Einheit für Items ohne jedes Rezept in data.recipes (teuer: nur wenn nötig, wie solve() missingRecipe). */
const MISSING_RECIPE_WEIGHT = 1;
/** Strafkosten (MW-Äquivalent je Einheit) für Items ohne Rezept beim Ziel "power". */
const MISSING_RECIPE_POWER_PENALTY = 1e4;

// ---------------------------------------------------------------------------------------------
// Simplex
// ---------------------------------------------------------------------------------------------

/** Nach so vielen degenerierten Pivots in Folge (Schritt 0) gilt die Bland-Regel, bis das Ziel wieder sinkt. */
const BLAND_AFTER = 50;
/** Relative Toleranz für Gleichstand im Quotiententest (eng, damit Basiswerte nicht negativ driften). */
const RATIO_TIE = 1e-12;

/**
 * Löst B·y = b für die Basisspalten der Ausgangsmatrix (Gauß mit Spaltenpivotsuche).
 * Liefert die Basiswerte ohne die im Tableau aufgelaufenen Rundungsfehler; null, wenn B singulär ist.
 */
function solveBasis(T0, basis, N) {
  const m = basis.length;
  const M = new Array(m);
  for (let r = 0; r < m; r++) {
    const row = new Float64Array(m + 1);
    for (let c = 0; c < m; c++) row[c] = T0[r][basis[c]];
    row[m] = T0[r][N];
    M[r] = row;
  }
  for (let c = 0; c < m; c++) {
    let p = c;
    let big = Math.abs(M[c][c]);
    for (let r = c + 1; r < m; r++) {
      const v = Math.abs(M[r][c]);
      if (v > big) {
        big = v;
        p = r;
      }
    }
    if (!(big > 1e-13)) return null;
    if (p !== c) [M[p], M[c]] = [M[c], M[p]];
    const prow = M[c];
    for (let r = c + 1; r < m; r++) {
      const row = M[r];
      const f = row[c] / prow[c];
      if (f === 0) continue;
      for (let k = c; k <= m; k++) row[k] -= f * prow[k];
    }
  }
  const y = new Float64Array(m);
  for (let c = m - 1; c >= 0; c--) {
    let s = M[c][m];
    for (let k = c + 1; k < m; k++) s -= M[c][k] * y[k];
    y[c] = s / M[c][c];
  }
  return y;
}

/**
 * Lexikografisches lineares Programm: minimiere objectives[0], auf dessen Optimum objectives[1], …
 * unter A·z ≥ b, z ≥ 0. Zweiphasen-Simplex auf dichtem Tableau; Preisregel größter Abstieg (Dantzig),
 * nach BLAND_AFTER degenerierten Schritten in Folge Bland-Regel gegen Kreiseln, bis das Ziel wieder sinkt.
 * Toleranzen 1e-9 relativ (Ziele werden auf max |c| = 1 normiert). Die Basiswerte der Lösung werden
 * am Ende aus der Ausgangsmatrix neu berechnet.
 * @param {number} nCols Anzahl Strukturvariablen z
 * @param {{ cols: number[], vals: number[], rhs: number }[]} rows je Zeile: Σ vals[t]·z[cols[t]] ≥ rhs
 * @param {ArrayLike<number>[]} objectives Kostenvektoren der Länge nCols; leer → nur Zulässigkeit (Phase 1)
 * @returns {{ status: "optimal" | "infeasible" | "unbounded", x: Float64Array | null, iterations: number }}
 *   "unbounded": eine Richtung ohne Schranke wurde gesperrt; x ist dann zulässig, aber nicht optimal.
 */
export function solveLP(nCols, rows, objectives = []) {
  const m = rows.length;
  let nArt = 0;
  for (const r of rows) if (r.rhs > 0) nArt++;
  const artStart = nCols + m; // Spalten: Struktur | Überschuss (je Zeile) | künstlich (Zeilen mit rhs > 0)
  const N = artStart + nArt;
  const W = N + 1; // letzte Spalte = rechte Seite

  // Zeile mit rhs > 0:  A·z − e + a = rhs (a in der Basis);  sonst: −A·z + e = −rhs (e in der Basis).
  const T = new Array(m);
  const basis = new Int32Array(m);
  let aScale = 0;
  let bScale = 0;
  let artSum = 0;
  for (let i = 0, k = 0; i < m; i++) {
    const { cols, vals, rhs } = rows[i];
    const row = new Float64Array(W);
    const sign = rhs > 0 ? 1 : -1;
    for (let t = 0; t < cols.length; t++) {
      row[cols[t]] += sign * vals[t];
      aScale = Math.max(aScale, Math.abs(vals[t]));
    }
    row[nCols + i] = -sign;
    if (rhs > 0) {
      row[artStart + k] = 1;
      basis[i] = artStart + k++;
      artSum += rhs;
    } else {
      basis[i] = nCols + i;
    }
    row[N] = rhs > 0 ? rhs : -rhs || 0;
    bScale = Math.max(bScale, row[N]);
    T[i] = row;
  }
  const T0 = T.map((row) => row.slice());
  const tolPiv = EPS * Math.max(1, aScale);
  const tolVal = EPS * Math.max(1, bScale);
  const tolCost = EPS;

  // Zielzeilen (reduzierte Kosten, Spalte N = −Zielwert). Startbasis: Kosten 0 außer Künstlichen in Phase 1.
  const phase1 = new Float64Array(W);
  for (let i = 0; i < m; i++) {
    if (basis[i] < artStart) continue;
    const row = T[i];
    for (let j = 0; j < W; j++) phase1[j] -= row[j];
  }
  for (let j = artStart; j < N; j++) phase1[j] = 0;
  const objRows = objectives.map((c) => {
    const o = new Float64Array(W);
    let s = 0;
    for (let j = 0; j < nCols; j++) s = Math.max(s, Math.abs(c[j] || 0));
    const f = s > 0 ? 1 / s : 1;
    for (let j = 0; j < nCols; j++) o[j] = (c[j] || 0) * f;
    return o;
  });
  const allObj = [phase1, ...objRows];

  const eligible = new Uint8Array(N).fill(1);
  const nz = new Int32Array(W);
  const maxIter = 50 * (m + N) + 1000;
  let iterations = 0;
  let unbounded = false;

  const pivot = (pr, pc) => {
    const prow = T[pr];
    const inv = 1 / prow[pc];
    let len = 0;
    for (let j = 0; j < W; j++) {
      const v = prow[j];
      if (v !== 0) {
        prow[j] = v * inv;
        nz[len++] = j;
      }
    }
    prow[pc] = 1;
    const eliminate = (row) => {
      const f = row[pc];
      if (f === 0) return;
      for (let t = 0; t < len; t++) {
        const j = nz[t];
        row[j] -= f * prow[j];
      }
      row[pc] = 0;
    };
    for (let i = 0; i < m; i++) {
      if (i === pr) continue;
      const row = T[i];
      eliminate(row);
      if (row[N] < 0 && row[N] > -tolVal) row[N] = 0; // Rundungsfehler, keine echte Unzulässigkeit
    }
    for (const o of allObj) eliminate(o);
    basis[pr] = pc;
    iterations++;
  };

  // Simplex-Schleife für Zielzeile d.
  //   Dantzig: eintretend die Spalte mit dem kleinsten d_j < −tol, austretend bei Quotienten-Gleichstand
  //            das größte Pivotelement. Bland: kleinster Index mit d_j < −tol, kleinster Basisindex.
  const run = (d) => {
    let degenerate = 0;
    for (let it = 0; it < maxIter; it++) {
      const bland = degenerate >= BLAND_AFTER;
      let pc = -1;
      let most = -tolCost;
      for (let j = 0; j < N; j++) {
        if (eligible[j] && d[j] < most) {
          pc = j;
          if (bland) break;
          most = d[j];
        }
      }
      if (pc < 0) return;
      let best = Infinity;
      for (let i = 0; i < m; i++) {
        const a = T[i][pc];
        if (a > tolPiv) {
          const ratio = T[i][N] / a;
          if (ratio < best) best = ratio;
        }
      }
      if (best === Infinity) {
        // Keine Schranke in dieser Richtung (bei Kosten ≥ 0 nur durch Rundung möglich): Spalte sperren.
        eligible[pc] = 0;
        unbounded = true;
        continue;
      }
      const tie = best + RATIO_TIE * Math.max(1, best);
      let pr = -1;
      for (let i = 0; i < m; i++) {
        const a = T[i][pc];
        if (!(a > tolPiv) || T[i][N] / a > tie) continue;
        if (pr < 0) pr = i;
        else if (bland ? basis[i] < basis[pr] : a > T[pr][pc] || (a === T[pr][pc] && basis[i] < basis[pr])) pr = i;
      }
      degenerate = best <= tolVal ? degenerate + 1 : 0;
      pivot(pr, pc);
    }
  };

  // Phase 1: Summe der Künstlichen minimieren.
  run(phase1);
  let infeas = 0;
  for (let i = 0; i < m; i++) if (basis[i] >= artStart) infeas += T[i][N];
  if (infeas > EPS * Math.max(1, artSum)) return { status: "infeasible", x: null, iterations };
  unbounded = false;

  // Künstliche (Wert 0) aus der Basis treiben, danach sperren.
  for (let i = 0; i < m; i++) {
    if (basis[i] < artStart) continue;
    T[i][N] = 0;
    let pc = -1;
    let big = tolPiv;
    for (let j = 0; j < artStart; j++) {
      const a = Math.abs(T[i][j]);
      if (a > big) {
        big = a;
        pc = j;
      }
    }
    if (pc >= 0) pivot(i, pc); // sonst redundante Zeile: Künstliche bleibt bei 0
  }
  for (let j = artStart; j < N; j++) eligible[j] = 0;

  // Phase 2 lexikografisch: nach jedem Ziel nur Spalten mit reduzierten Kosten ≈ 0 weiter zulassen.
  for (let q = 0; q < objRows.length; q++) {
    run(objRows[q]);
    if (q + 1 < objRows.length) {
      const d = objRows[q];
      for (let j = 0; j < N; j++) if (eligible[j] && d[j] > tolCost) eligible[j] = 0;
    }
  }

  const xB = solveBasis(T0, basis, N);
  const x = new Float64Array(nCols);
  for (let i = 0; i < m; i++) {
    if (basis[i] >= nCols) continue;
    const v = xB ? xB[i] : T[i][N];
    x[basis[i]] = v > 0 ? v : 0;
  }
  return { status: unbounded ? "unbounded" : "optimal", x, iterations };
}

// ---------------------------------------------------------------------------------------------
// Optimierung
// ---------------------------------------------------------------------------------------------

/**
 * Gewicht je geliefertem Item und Minute („gewichtete Rohstoffe“): Importe 0, Items ohne Rezept 1,
 * Rohstoffe 1 / Weltlimit.
 */
function supplyWeight(id, imports, missing, limits) {
  if (imports.has(id)) return 0;
  if (missing.has(id)) return MISSING_RECIPE_WEIGHT;
  const limit = hasOwn(limits, id) ? limits[id] : undefined;
  return isPositiveNumber(limit) ? 1 / limit : UNLIMITED_WEIGHT; // Infinity (Wasser) oder fehlend
}

function withExtras(result, objectiveValue, usedRecipes) {
  result.objectiveValue = objectiveValue;
  result.usedRecipes = usedRecipes;
  return result;
}

/**
 * Wählt Rezepte per linearem Programm (SPEC „Version 2 › Optimierung“).
 * @param {{
 *   targets: {item: string, rate: number}[],
 *   objective?: "resources" | "power",
 *   allowAlternates?: boolean,
 *   excluded?: string[],                      // ausgeschlossene Rezept-IDs
 *   mods?: { sloops?: Object<string, number>, imports?: string[] },
 *   data: object,
 *   limits?: Object<string, number>,          // Weltlimit je Rohstoff (Standard: js/resourceLimits.js)
 * }} args
 * @returns {object} Result aus buildResult() plus `objectiveValue` und `usedRecipes: { itemId: [recipeId] }`,
 *   oder `{ error: "infeasible", items: [itemId] }` (Ziel-Items, die sich nicht herstellen lassen).
 *   Items, für die data.recipes gar kein Rezept hat, werden wie Rohstoffe geliefert (Gewicht 1) und stehen
 *   in `raw` mit `missingRecipe: true`; infeasible heißt also: vorhandene Rezepte sind alle gesperrt.
 */
export function optimize({
  targets,
  objective = "resources",
  allowAlternates = true,
  excluded = [],
  mods = {},
  data,
  limits = resourceLimits,
} = {}) {
  const items = data && data.items && typeof data.items === "object" ? data.items : {};
  const recipes = data && data.recipes && typeof data.recipes === "object" ? data.recipes : {};
  const mode = objective === "power" ? "power" : "resources";
  const imports = importSet(mods);
  const banned = new Set(Array.isArray(excluded) ? excluded.filter((x) => typeof x === "string") : []);

  const { goals, demand } = normalizeTargets(targets, items);
  if (goals.length === 0) return withExtras(emptyResult(), 0, {});

  const isRaw = (id) => hasOwn(items, id) && !!items[id] && items[id].raw === true;
  // Items, die kein Rezept in data.recipes als Output hat (unabhängig von excluded/allowAlternates).
  const withRecipe = new Set();
  for (const r of Object.values(recipes)) {
    if (!r || !Array.isArray(r.outputs)) continue;
    for (const o of r.outputs) if (o && typeof o.item === "string" && isPositiveNumber(o.amount)) withRecipe.add(o.item);
  }
  const isMissing = (id) => !isRaw(id) && !imports.has(id) && !withRecipe.has(id);
  const missing = { has: isMissing };
  const isSupply = (id) => isRaw(id) || imports.has(id) || isMissing(id);

  // 1. Erlaubte Rezepte (mit Somersloops) und ihre Erzeugnisse (Netto > 0).
  const eff = new Map();
  const producers = new Map();
  for (const rid of Object.keys(recipes).sort(compareIds)) {
    if (banned.has(rid)) continue;
    const src = recipes[rid];
    if (!allowAlternates && src && src.alternate === true) continue;
    const r = effectiveRecipe(rid, data, mods);
    if (!r) continue;
    eff.set(rid, r);
    for (const o of r.outputs) {
      if (!(r.net.get(o.item) > 0)) continue;
      if (!producers.has(o.item)) producers.set(o.item, []);
      const list = producers.get(o.item);
      if (!list.includes(rid)) list.push(rid);
    }
  }

  // 2. Rückwärts erreichbare Rezepte. Rohstoffe und Importe werden nur geliefert, nicht aufgeklappt.
  const taken = new Set();
  const seen = new Set();
  const stack = [...demand.keys()];
  while (stack.length) {
    const id = stack.pop();
    if (seen.has(id)) continue;
    seen.add(id);
    if (isSupply(id)) continue;
    for (const rid of producers.get(id) ?? []) {
      if (taken.has(rid)) continue;
      taken.add(rid);
      for (const inp of eff.get(rid).inputs) if (!seen.has(inp.item)) stack.push(inp.item);
    }
  }
  const lpRecipes = [...taken].sort(compareIds);
  const nRec = lpRecipes.length;

  // 3. Zeilen je Item: Σ x_r·net_ri + s_i ≥ Ziel_i. Items ohne Verbrauch und ohne Ziel sind immer erfüllt.
  const entries = new Map();
  lpRecipes.forEach((rid, j) => {
    for (const [item, c] of eff.get(rid).net) {
      if (c === 0) continue;
      if (!entries.has(item)) entries.set(item, []);
      entries.get(item).push([j, c]);
    }
  });
  const rowIds = [...new Set([...entries.keys(), ...demand.keys()])]
    .filter((id) => (demand.get(id) ?? 0) > 0 || (entries.get(id) ?? []).some(([, c]) => c < 0))
    .sort(compareIds);
  const supplyIds = rowIds.filter(isSupply);
  const supplyCol = new Map(supplyIds.map((id, k) => [id, nRec + k]));
  const nCols = nRec + supplyIds.length;
  const rowsFor = (dem) =>
    rowIds.map((id) => {
      const cols = [];
      const vals = [];
      for (const [j, c] of entries.get(id) ?? []) {
        cols.push(j);
        vals.push(c);
      }
      if (supplyCol.has(id)) {
        cols.push(supplyCol.get(id));
        vals.push(1);
      }
      return { cols, vals, rhs: dem.get(id) ?? 0 };
    });

  // 4. Kosten: Maschinen = x_r × Dauer / 60; Strom linear (ohne Untertaktungs-Exponent).
  const weight = (id) => supplyWeight(id, imports, missing, limits);
  const rawCost = new Float64Array(nCols);
  const machineCost = new Float64Array(nCols);
  const powerCost = new Float64Array(nCols);
  lpRecipes.forEach((rid, j) => {
    const r = eff.get(rid);
    machineCost[j] = r.duration / 60;
    powerCost[j] = (r.duration / 60) * Math.max(0, r.power);
  });
  supplyIds.forEach((id, k) => {
    rawCost[nRec + k] = weight(id);
    // Auch bei "Strom sparen" sollen Items ohne Rezept nur genutzt werden, wenn es nicht anders geht.
    if (missing.has(id) && !imports.has(id)) powerCost[nRec + k] = MISSING_RECIPE_POWER_PENALTY;
  });
  const primary = mode === "power" ? powerCost : rawCost;
  const secondary = mode === "power" ? rawCost : machineCost;
  const combined = new Float64Array(nCols);
  for (let j = 0; j < nCols; j++) combined[j] = primary[j] + SECONDARY_WEIGHT * secondary[j];

  // Zweite Stufe (Nebenziel allein auf dem Optimum) nur als numerischer Gleichstandsbrecher: bei "power"
  // liegt 1e-6 × gewichtete Rohstoffe sonst unter der Toleranz.
  const lp = solveLP(nCols, rowsFor(demand), [combined, secondary]);

  if (lp.status === "infeasible") {
    // Mit unbeschränkter Lieferung ist die Summe zulässiger Einzelziele zulässig → Ziele einzeln prüfen.
    const bad = [];
    for (const [id, rate] of demand) {
      if (solveLP(nCols, rowsFor(new Map([[id, rate]])), []).status === "infeasible") bad.push(id);
    }
    return { error: "infeasible", items: bad.length ? bad : [...demand.keys()] };
  }

  // 5. Raten (winzige verwerfen), Zeilen-Items, Rezept je Item.
  let maxRate = 0;
  for (let j = 0; j < nRec; j++) maxRate = Math.max(maxRate, lp.x[j]);
  const tolRate = EPS * Math.max(1, maxRate);
  const rates = {};
  const active = [];
  for (let j = 0; j < nRec; j++) {
    if (lp.x[j] > tolRate) {
      rates[lpRecipes[j]] = lp.x[j];
      active.push(lpRecipes[j]);
    }
  }

  const consumed = new Set(demand.keys());
  for (const rid of active) for (const inp of eff.get(rid).inputs) consumed.add(inp.item);
  const rowItems = {};
  for (const rid of active) {
    const r = eff.get(rid);
    const outs = r.outputs.filter((o) => r.net.get(o.item) > 0 && !isSupply(o.item));
    const pick = outs.find((o) => consumed.has(o.item)) ?? outs[0] ?? r.outputs[0];
    rowItems[rid] = pick.item;
  }

  // Rezept je Item (für Baum und Tiefe, wenn ein Item nur als Nebenprodukt anfällt): eigene Zeile vor
  // Nebenprodukt, dann größter Ausstoß, dann kleinste ID.
  const best = new Map();
  for (const rid of active) {
    const r = eff.get(rid);
    for (const o of r.outputs) {
      if (isSupply(o.item) || !(r.net.get(o.item) > 0)) continue;
      const own = rowItems[rid] === o.item;
      const rate = o.amount * rates[rid];
      const cur = best.get(o.item);
      if (!cur || (own && !cur.own) || (own === cur.own && rate > cur.rate)) best.set(o.item, { rid, rate, own });
    }
  }
  const itemRecipes = {};
  for (const id of [...best.keys()].sort(compareIds)) itemRecipes[id] = best.get(id).rid;

  const usedRecipes = {};
  for (const id of [...new Set(active.map((rid) => rowItems[rid]))].sort(compareIds)) {
    usedRecipes[id] = active.filter((rid) => rowItems[rid] === id);
  }

  // 6. Zielwert aus den endgültigen Raten (Lieferung = Defizit der Rohstoffe/Importe).
  const net = new Map();
  let machines = 0;
  let power = 0;
  for (const rid of active) {
    const r = eff.get(rid);
    const x = rates[rid];
    for (const [k, c] of r.net) net.set(k, (net.get(k) ?? 0) + c * x);
    machines += (x * r.duration) / 60;
    power += ((x * r.duration) / 60) * Math.max(0, r.power);
  }
  let rawSum = 0;
  for (const id of new Set([...net.keys(), ...demand.keys()])) {
    if (!isSupply(id)) continue;
    const need = (demand.get(id) ?? 0) - (net.get(id) ?? 0);
    if (need > 0) rawSum += need * weight(id);
  }
  const objectiveValue = mode === "power" ? power + SECONDARY_WEIGHT * rawSum : rawSum + SECONDARY_WEIGHT * machines;

  const result = buildResult({ rates, targets: goals, data, mods, rowItems, itemRecipes });
  return withExtras(result, objectiveValue, usedRecipes);
}
