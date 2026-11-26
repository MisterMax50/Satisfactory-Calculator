// solver.js — Produktionsberechnung solve({ targets, recipeChoice, data }). Reine Funktionen, kein DOM,
// kein localStorage, keine globalen Daten-Importe: der Solver kennt nur die übergebenen Daten.

/** Toleranz für Rundung, Vorzeichen-Entscheidungen und Aufrunden der Maschinenzahl. */
export const EPS = 1e-9;
/** Exponent der Untertaktungsformel (SPEC „Solver“). */
export const POWER_EXPONENT = 1.321928;

const hasOwn = (obj, key) =>
  obj !== null && typeof obj === "object" && Object.prototype.hasOwnProperty.call(obj, key);

const isPositiveNumber = (v) => typeof v === "number" && Number.isFinite(v) && v > 0;

/** Rundet auf ein 1e-9-Raster, damit keine Fließkomma-Artefakte entstehen (2.9999999999 → 3). */
export function roundTol(x) {
  if (!Number.isFinite(x)) return 0;
  const r = Math.round(x * 1e9) / 1e9;
  return r === 0 ? 0 : r; // -0 vermeiden
}

/** Aufgerundete Maschinenzahl mit Toleranz (3.0000000001 → 3); 0 nur, wenn nichts läuft. */
export function ceilMachines(machines) {
  if (!(machines > 0)) return 0;
  return Math.max(1, Math.ceil(machines - EPS));
}

/** Leistung einer Zeile: ceil(m) × P × (m / ceil(m)) ^ 1.321928. */
export function rowPower(machines, powerPerMachine) {
  const n = ceilMachines(machines);
  if (n === 0 || typeof powerPerMachine !== "number" || !Number.isFinite(powerPerMachine)) return 0;
  return n * powerPerMachine * Math.pow(machines / n, POWER_EXPONENT);
}

/** Strom je Maschine bei 100 %: recipe.power ?? buildings[recipe.building].power (sonst 0). */
export function machinePower(recipe, buildings) {
  if (recipe && typeof recipe.power === "number" && Number.isFinite(recipe.power)) return recipe.power;
  const b = recipe && hasOwn(buildings, recipe.building) ? buildings[recipe.building] : null;
  return b && typeof b.power === "number" && Number.isFinite(b.power) ? b.power : 0;
}

/** Bereinigte Kopie eines Rezepts mit Netto-Koeffizienten je Item und Durchlauf; null, wenn unbrauchbar. */
function normalizeRecipe(id, recipe) {
  if (!recipe || typeof recipe !== "object" || !isPositiveNumber(recipe.duration)) return null;
  const clean = (list) =>
    Array.isArray(list)
      ? list
          .filter((e) => e && typeof e.item === "string" && isPositiveNumber(e.amount))
          .map((e) => ({ item: e.item, amount: e.amount }))
      : [];
  const inputs = clean(recipe.inputs);
  const outputs = clean(recipe.outputs);
  if (outputs.length === 0) return null;
  const net = new Map();
  for (const o of outputs) net.set(o.item, (net.get(o.item) ?? 0) + o.amount);
  for (const i of inputs) net.set(i.item, (net.get(i.item) ?? 0) - i.amount);
  return {
    id,
    building: typeof recipe.building === "string" ? recipe.building : null,
    duration: recipe.duration,
    power: recipe.power,
    inputs,
    outputs,
    net,
  };
}

/** Mengen pro Minute für eine Maschine bei 100 %: { inputs: [{item, rate}], outputs: [{item, rate}] }. */
export function perMinute(recipe) {
  const r = normalizeRecipe(recipe && recipe.id, recipe);
  if (!r) return { inputs: [], outputs: [] };
  const f = 60 / r.duration;
  const scale = (list) => list.map((e) => ({ item: e.item, rate: roundTol(e.amount * f) }));
  return { inputs: scale(r.inputs), outputs: scale(r.outputs) };
}

/**
 * Löst A·x = b per Gauß-Elimination mit Spaltenpivotsuche.
 * Gibt x zurück oder null, wenn die Matrix (numerisch) singulär ist.
 */
export function solveLinear(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  let scale = 0;
  for (const row of A) for (const v of row) scale = Math.max(scale, Math.abs(v));
  const tol = 1e-10 * Math.max(1, scale);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (!(Math.abs(M[p][c]) > tol)) return null;
    if (p !== c) [M[p], M[c]] = [M[c], M[p]];
    const pivot = M[c][c];
    for (let r = c + 1; r < n; r++) {
      const f = M[r][c] / pivot;
      if (f === 0) continue;
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n];
    for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k];
    x[r] = s / M[r][r];
  }
  return x;
}

/** Leeres Ergebnis (keine gültigen Ziele). */
function emptyResult() {
  return { rows: [], raw: [], surplus: [], power: 0, machineCount: 0, tree: [] };
}

/** Matrix des Systems: Zeile = Item-Gleichung, Spalte = Rezept des jeweiligen Items. */
function buildMatrix(active, assign) {
  return active.map((rowItem) => active.map((colItem) => assign.get(colItem).net.get(rowItem) ?? 0));
}

/**
 * Items, die das System singulär machen. Die Matrix ist (symmetrisch permutiert) blockdreieckig
 * entlang der starken Zusammenhangskomponenten des Item-Graphen; singulär ist sie genau dann,
 * wenn ein Block singulär ist. Gemeldet werden die Items aller singulären Blöcke.
 */
function singularItems(active, assign) {
  const index = new Map(active.map((it, i) => [it, i]));
  const adj = active.map((it) => {
    const out = [];
    for (const [k, c] of assign.get(it).net) if (k !== it && c !== 0 && index.has(k)) out.push(index.get(k));
    return out;
  });
  // Tarjan (rekursiv; Tiefe ist durch die Rezeptkettenlänge begrenzt)
  const n = active.length;
  const idx = new Array(n).fill(-1);
  const low = new Array(n).fill(0);
  const onStack = new Array(n).fill(false);
  const stack = [];
  const comps = [];
  let counter = 0;
  const strong = (v) => {
    idx[v] = low[v] = counter++;
    stack.push(v);
    onStack[v] = true;
    for (const w of adj[v]) {
      if (idx[w] === -1) {
        strong(w);
        low[v] = Math.min(low[v], low[w]);
      } else if (onStack[w]) {
        low[v] = Math.min(low[v], idx[w]);
      }
    }
    if (low[v] === idx[v]) {
      const comp = [];
      let w;
      do {
        w = stack.pop();
        onStack[w] = false;
        comp.push(w);
      } while (w !== v);
      comps.push(comp);
    }
  };
  for (let v = 0; v < n; v++) if (idx[v] === -1) strong(v);

  const result = [];
  for (const comp of comps) {
    const its = comp.map((i) => active[i]);
    if (solveLinear(buildMatrix(its, assign), its.map(() => 0)) === null) result.push(...its);
  }
  return (result.length ? result : [...active]).sort(compareIds);
}

function compareIds(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Tiefe je Item = längster Pfad von einem Ziel im Graphen „Item → Eingänge seines Rezepts“.
 * Rückwärtskanten (Zyklen) werden per Tiefensuche entfernt, der Rest ist ein DAG.
 */
function computeDepths(roots, edges) {
  const state = new Map(); // 1 = auf dem Pfad, 2 = fertig
  const order = [];
  const dag = new Map();
  const visit = (u) => {
    state.set(u, 1);
    const kept = [];
    for (const v of edges.get(u) ?? []) {
      const s = state.get(v);
      if (s === 1) continue; // Rückwärtskante
      kept.push(v);
      if (s === undefined) visit(v);
    }
    dag.set(u, kept);
    state.set(u, 2);
    order.push(u);
  };
  for (const r of roots) if (!state.has(r)) visit(r);
  const depth = new Map(roots.map((r) => [r, 0]));
  for (let i = order.length - 1; i >= 0; i--) {
    const u = order[i];
    const du = depth.get(u) ?? 0;
    for (const v of dag.get(u)) if ((depth.get(v) ?? -1) < du + 1) depth.set(v, du + 1);
  }
  return depth;
}

/**
 * Berechnet die Produktion für die Ziele.
 * @param {{ targets: {item: string, rate: number}[], recipeChoice?: Object<string,string>, data: object }} args
 * @returns Result gemäß SPEC „Solver“ oder { error: "cycle", items }
 */
export function solve({ targets, recipeChoice, data } = {}) {
  const items = data && hasOwn(data, "items") && data.items && typeof data.items === "object" ? data.items : {};
  const recipes = data && data.recipes && typeof data.recipes === "object" ? data.recipes : {};
  const buildings = data && data.buildings && typeof data.buildings === "object" ? data.buildings : {};
  const choice = recipeChoice && typeof recipeChoice === "object" ? recipeChoice : {};

  // 1. Ziele prüfen: unbekannte Items und Raten ≤ 0 werden ignoriert, gleiche Items summiert.
  const goals = [];
  const demand = new Map();
  for (const t of Array.isArray(targets) ? targets : []) {
    if (!t || typeof t !== "object" || typeof t.item !== "string" || !hasOwn(items, t.item)) continue;
    if (!isPositiveNumber(t.rate)) continue;
    goals.push({ item: t.item, rate: t.rate });
    demand.set(t.item, (demand.get(t.item) ?? 0) + t.rate);
  }
  if (goals.length === 0) return emptyResult();

  const isRaw = (id) => hasOwn(items, id) && !!items[id] && items[id].raw === true;
  const recipeCache = new Map();
  const getRecipe = (rid) => {
    if (typeof rid !== "string" || !hasOwn(recipes, rid)) return null;
    if (!recipeCache.has(rid)) recipeCache.set(rid, normalizeRecipe(rid, recipes[rid]));
    return recipeCache.get(rid);
  };
  const produces = (r, id) => !!r && r.outputs.some((o) => o.item === id);
  const resolved = new Map();
  // Gewähltes Rezept: recipeChoice (falls gültig und es das Item erzeugt), sonst defaultRecipe. Rohstoffe nie.
  const recipeFor = (id) => {
    if (resolved.has(id)) return resolved.get(id);
    let r = null;
    if (hasOwn(items, id) && !isRaw(id)) {
      const chosen = hasOwn(choice, id) ? getRecipe(choice[id]) : null;
      if (produces(chosen, id)) r = chosen;
      else {
        const def = getRecipe(items[id] ? items[id].defaultRecipe : null);
        if (produces(def, id)) r = def;
      }
    }
    resolved.set(id, r);
    return r;
  };

  // 2. Erreichbare Items sammeln; jedes Nicht-Rohstoff-Item bekommt genau ein Rezept.
  const roots = [...demand.keys()];
  const assign = new Map(); // Item → Rezept (Variable des Systems)
  const owner = new Map(); // Rezept-ID → Item (ein Rezept dient nur einem Item)
  const edges = new Map(); // Item → Eingangs-Items (für die Tiefe)
  const seen = new Set(roots);
  const queue = [...roots];
  while (queue.length) {
    const id = queue.shift();
    if (isRaw(id)) continue;
    const r = recipeFor(id);
    if (!r || owner.has(r.id)) continue; // ohne eigenes Rezept: wird bilanziert (raw/surplus)
    owner.set(r.id, id);
    assign.set(id, r);
    const next = [];
    for (const inp of r.inputs) {
      if (!next.includes(inp.item)) next.push(inp.item);
      if (!seen.has(inp.item)) {
        seen.add(inp.item);
        queue.push(inp.item);
      }
    }
    edges.set(id, next);
  }

  // 3. Lineares System „Netto je Item = Bedarf“ lösen; negative Raten → Rezept aus, Item als Überschuss.
  let active = [...assign.keys()];
  const deactivated = new Set();
  let x = [];
  for (;;) {
    if (active.length === 0) {
      x = [];
      break;
    }
    const sol = solveLinear(buildMatrix(active, assign), active.map((it) => demand.get(it) ?? 0));
    if (!sol) return { error: "cycle", items: singularItems(active, assign) };
    const tolX = EPS * Math.max(1, ...sol.map(Math.abs));
    let worst = -1;
    for (let j = 0; j < sol.length; j++) if (sol[j] < -tolX && (worst < 0 || sol[j] < sol[worst])) worst = j;
    if (worst < 0) {
      x = sol.map((v) => (Math.abs(v) <= tolX ? 0 : v));
      break;
    }
    deactivated.add(active[worst]);
    active = active.filter((_, j) => j !== worst);
  }

  // 4. Zeilen, Strom, Maschinen.
  const depth = computeDepths(roots, edges);
  const balance = new Map();
  let maxFlow = 0;
  for (const v of demand.values()) maxFlow = Math.max(maxFlow, v);
  const rows = [];
  let power = 0;
  let machineCount = 0;
  active.forEach((id, j) => {
    const runs = x[j];
    if (!(runs > 0)) return;
    const r = assign.get(id);
    for (const [k, c] of r.net) balance.set(k, (balance.get(k) ?? 0) + c * runs);
    const scale = (list) =>
      list.map((e) => {
        maxFlow = Math.max(maxFlow, e.amount * runs);
        return { item: e.item, rate: roundTol(e.amount * runs) };
      });
    const machines = (runs * r.duration) / 60;
    const p = rowPower(machines, machinePower(r, buildings));
    power += p;
    machineCount += ceilMachines(machines);
    rows.push({
      recipe: r.id,
      item: id,
      runsPerMin: roundTol(runs),
      machines: roundTol(machines),
      building: r.building,
      power: roundTol(p),
      inputs: scale(r.inputs),
      outputs: scale(r.outputs),
    });
  });
  rows.sort((a, b) => (depth.get(a.item) ?? 0) - (depth.get(b.item) ?? 0) || compareIds(a.item, b.item));

  // 5. Bilanz aller Items ohne eigene Gleichung: Fehlmenge → raw, Mehrmenge → surplus.
  const activeSet = new Set(active);
  const tolFlow = EPS * Math.max(1, maxFlow);
  const raw = [];
  const surplus = [];
  const balanceItems = new Set([...balance.keys(), ...demand.keys()]);
  for (const id of [...balanceItems].sort(compareIds)) {
    if (activeSet.has(id)) continue;
    const net = (balance.get(id) ?? 0) - (demand.get(id) ?? 0);
    if (net < -tolFlow) {
      const entry = { item: id, rate: roundTol(-net) };
      if (!isRaw(id) && !deactivated.has(id)) entry.missingRecipe = true;
      raw.push(entry);
    } else if (net > tolFlow) {
      surplus.push({ item: id, rate: roundTol(net) });
    }
  }

  // 6. Baum je Ziel (reine Anzeige, ohne Nebenprodukt-Gutschrift).
  const buildNode = (id, rate, path) => {
    const r = recipeFor(id);
    const node = { item: id, rate: roundTol(rate), recipe: r ? r.id : null, children: [] };
    if (path.has(id)) {
      node.cycle = true;
      return node;
    }
    if (!r) return node;
    let main = 0;
    for (const o of r.outputs) if (o.item === id) main += o.amount;
    const runs = rate / main;
    path.add(id);
    for (const inp of r.inputs) node.children.push(buildNode(inp.item, inp.amount * runs, path));
    path.delete(id);
    return node;
  };
  const tree = goals.map((g) => buildNode(g.item, g.rate, new Set()));

  return { rows, raw, surplus, power: roundTol(power), machineCount, tree };
}
