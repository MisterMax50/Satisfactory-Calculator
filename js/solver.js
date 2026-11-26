// solver.js — Produktionsberechnung solve({ targets, recipeChoice, data, mods }). Reine Funktionen, kein DOM,
// kein localStorage, keine globalen Daten-Importe: der Solver kennt nur die übergebenen Daten.
// Das Result baut js/result.js (buildResult); hier wird nur das Gleichungssystem gelöst.
import {
  EPS,
  POWER_EXPONENT,
  roundTol,
  ceilMachines,
  rowPower,
  machinePower,
  compareIds,
  hasOwn,
  normalizeRecipe,
  effectiveRecipe,
  normalizeTargets,
  importSet,
  emptyResult,
  buildResult,
} from "./result.js";

export { EPS, POWER_EXPONENT, roundTol, ceilMachines, rowPower, machinePower, effectiveRecipe };

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

/**
 * Berechnet die Produktion für die Ziele.
 * @param {{ targets: {item: string, rate: number}[], recipeChoice?: Object<string,string>, data: object,
 *           mods?: { sloops?: Object<string, number>, imports?: string[] } }} args
 * @returns Result gemäß SPEC „Solver“/„Version 2“ oder { error: "cycle", items }
 */
export function solve({ targets, recipeChoice, data, mods } = {}) {
  const items = data && hasOwn(data, "items") && data.items && typeof data.items === "object" ? data.items : {};
  const recipes = data && data.recipes && typeof data.recipes === "object" ? data.recipes : {};
  const choice = recipeChoice && typeof recipeChoice === "object" ? recipeChoice : {};
  const imports = importSet(mods);

  // 1. Ziele prüfen: unbekannte Items und Raten ≤ 0 werden ignoriert, gleiche Items summiert.
  const { goals, demand } = normalizeTargets(targets, items);
  if (goals.length === 0) return emptyResult();

  // Rohstoffe und Importe werden nie produziert.
  const isRaw = (id) => hasOwn(items, id) && !!items[id] && items[id].raw === true;
  const recipeCache = new Map();
  const getRecipe = (rid) => {
    if (typeof rid !== "string" || !hasOwn(recipes, rid)) return null;
    if (!recipeCache.has(rid)) recipeCache.set(rid, effectiveRecipe(rid, data, mods));
    return recipeCache.get(rid);
  };
  const produces = (r, id) => !!r && r.outputs.some((o) => o.item === id);
  const resolved = new Map();
  // Gewähltes Rezept: recipeChoice (falls gültig und es das Item erzeugt), sonst defaultRecipe.
  const recipeFor = (id) => {
    if (resolved.has(id)) return resolved.get(id);
    let r = null;
    if (hasOwn(items, id) && !isRaw(id) && !imports.has(id)) {
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

  // 2. Erreichbare Items sammeln; jedes produzierte Item bekommt genau ein Rezept.
  const roots = [...demand.keys()];
  const assign = new Map(); // Item → Rezept (Variable des Systems)
  const owner = new Map(); // Rezept-ID → Item (ein Rezept dient nur einem Item)
  const seen = new Set(roots);
  const queue = [...roots];
  while (queue.length) {
    const id = queue.shift();
    const r = recipeFor(id);
    if (!r || owner.has(r.id)) continue; // ohne eigenes Rezept: wird bilanziert (raw/surplus)
    owner.set(r.id, id);
    assign.set(id, r);
    for (const inp of r.inputs) {
      if (!seen.has(inp.item)) {
        seen.add(inp.item);
        queue.push(inp.item);
      }
    }
  }

  // 3. Lineares System „Netto je Item = Bedarf“ lösen; negative Raten → Rezept aus, Item als Überschuss.
  let active = [...assign.keys()];
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
    active = active.filter((_, j) => j !== worst);
  }

  // 4. Result aus den Rezeptraten (js/result.js). Abgeschaltete Items behalten ihr Rezept für Baum und Tiefe.
  const rates = {};
  const rowItems = {};
  active.forEach((id, j) => {
    if (!(x[j] > 0)) return;
    const rid = assign.get(id).id;
    rates[rid] = x[j];
    rowItems[rid] = id;
  });
  const itemRecipes = {};
  for (const [id, r] of assign) itemRecipes[id] = r.id;
  return buildResult({ rates, targets: goals, data, mods, rowItems, itemRecipes });
}
