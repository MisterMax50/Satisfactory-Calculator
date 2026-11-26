// result.js — Gemeinsames Ergebnis buildResult({ rates, targets, data, mods }) für solve() und optimize().
// Reine Funktionen, kein DOM, kein localStorage, keine globalen Daten-Importe (SPEC „Version 2 › Gemeinsames Ergebnis“).

/** Toleranz für Rundung, Vorzeichen-Entscheidungen und Aufrunden der Maschinenzahl. */
export const EPS = 1e-9;
/** Exponent der Untertaktungsformel (SPEC „Solver“). */
export const POWER_EXPONENT = 1.321928;
/** Standard-Exponent für den Somersloop-Strom, wenn das Gebäude keinen eigenen hat. */
export const DEFAULT_BOOST_POWER_EXPONENT = 2;

export const hasOwn = (obj, key) =>
  obj !== null && typeof obj === "object" && Object.prototype.hasOwnProperty.call(obj, key);

export const isPositiveNumber = (v) => typeof v === "number" && Number.isFinite(v) && v > 0;

const isFiniteNumber = (v) => typeof v === "number" && Number.isFinite(v);
const objOr = (v) => (v && typeof v === "object" ? v : {});

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

export function compareIds(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Netto-Koeffizienten je Item und Durchlauf: Outputs − Inputs. */
function netOf(inputs, outputs) {
  const net = new Map();
  for (const o of outputs) net.set(o.item, (net.get(o.item) ?? 0) + o.amount);
  for (const i of inputs) net.set(i.item, (net.get(i.item) ?? 0) - i.amount);
  return net;
}

/** Bereinigte Kopie eines Rezepts mit Netto-Koeffizienten je Item und Durchlauf; null, wenn unbrauchbar. */
export function normalizeRecipe(id, recipe) {
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
  return {
    id,
    building: typeof recipe.building === "string" ? recipe.building : null,
    duration: recipe.duration,
    power: recipe.power,
    inputs,
    outputs,
    net: netOf(inputs, outputs),
  };
}

/** Somersloop-Anzahl für ein Rezept: ganzzahlig, auf 0..sloopSlots begrenzt (fehlende Plätze = 0). */
function sloopCount(recipeId, building, mods) {
  const sloops = mods && typeof mods === "object" ? mods.sloops : null;
  const requested = recipeId != null && hasOwn(sloops, recipeId) ? sloops[recipeId] : 0;
  const slots = building && isPositiveNumber(building.sloopSlots) ? Math.floor(building.sloopSlots) : 0;
  if (!isFiniteNumber(requested) || slots === 0) return 0;
  return Math.min(slots, Math.max(0, Math.floor(requested)));
}

/**
 * Rezept mit Somersloops aus `mods` (SPEC „Version 2 › Gemeinsames Ergebnis“).
 * `recipe`: Rezept-Objekt (mit `id`) oder Rezept-ID aus `data.recipes`.
 * @returns {null | { id, building, duration, inputs: [{item, amount}], outputs: [{item, amount}],
 *   net: Map<itemId, number>, sloops: number, boost: number, power: number }}
 *   outputs und net je Durchlauf inkl. Boost (× (1 + boost)), inputs unverändert,
 *   power = Strom je Maschine bei 100 % × (1 + boost) ^ boostPowerExponent.
 */
export function effectiveRecipe(recipe, data, mods) {
  const recipes = objOr(data && data.recipes);
  const buildings = objOr(data && data.buildings);
  let id = null;
  let src = recipe;
  if (typeof recipe === "string") {
    id = recipe;
    src = hasOwn(recipes, recipe) ? recipes[recipe] : null;
  } else if (recipe && typeof recipe === "object" && typeof recipe.id === "string") {
    id = recipe.id;
  }
  const r = normalizeRecipe(id, src);
  if (!r) return null;
  const b = r.building && hasOwn(buildings, r.building) ? buildings[r.building] : null;
  const n = sloopCount(id, b, mods);
  const perSloop = b && isPositiveNumber(b.sloopBoost) ? b.sloopBoost : 0;
  const boost = n * perSloop;
  const factor = 1 + boost;
  const exponent = b && isFiniteNumber(b.boostPowerExponent) ? b.boostPowerExponent : DEFAULT_BOOST_POWER_EXPONENT;
  const outputs = boost > 0 ? r.outputs.map((o) => ({ item: o.item, amount: o.amount * factor })) : r.outputs;
  return {
    id,
    building: r.building,
    duration: r.duration,
    inputs: r.inputs,
    outputs,
    net: boost > 0 ? netOf(r.inputs, outputs) : r.net,
    sloops: n,
    boost,
    power: machinePower(r, buildings) * (boost > 0 ? Math.pow(factor, exponent) : 1),
  };
}

/**
 * Tiefe je Item = längster Pfad von einem Ziel im Graphen „Item → Eingänge seiner Rezepte“.
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

/** Leeres Ergebnis (keine gültigen Ziele). */
export function emptyResult() {
  return { rows: [], raw: [], surplus: [], power: 0, machineCount: 0, tree: [], sloopsTotal: 0 };
}

/**
 * Prüft Ziele wie der Solver: unbekannte Items und Raten ≤ 0 werden ignoriert, gleiche Items summiert.
 * @returns {{ goals: {item, rate}[], demand: Map<itemId, number> }}
 */
export function normalizeTargets(targets, items) {
  const goals = [];
  const demand = new Map();
  for (const t of Array.isArray(targets) ? targets : []) {
    if (!t || typeof t !== "object" || typeof t.item !== "string" || !hasOwn(items, t.item)) continue;
    if (!isPositiveNumber(t.rate)) continue;
    goals.push({ item: t.item, rate: t.rate });
    demand.set(t.item, (demand.get(t.item) ?? 0) + t.rate);
  }
  return { goals, demand };
}

/** Menge eines Items je Durchlauf in den (geboosteten) Outputs eines Rezepts. */
function outputAmount(r, id) {
  let a = 0;
  for (const o of r.outputs) if (o.item === id) a += o.amount;
  return a;
}

/** Gültige Import-Items aus mods.imports. */
export function importSet(mods) {
  const list = mods && typeof mods === "object" && Array.isArray(mods.imports) ? mods.imports : [];
  return new Set(list.filter((x) => typeof x === "string"));
}

/**
 * Baut das Result (SPEC „Solver“ + „Version 2“) aus Rezeptraten.
 * @param {{
 *   rates: Object<string, number>,           // { recipeId: Durchläufe/min }
 *   targets: {item: string, rate: number}[],
 *   data: object,
 *   mods?: { sloops?: Object<string, number>, imports?: string[] },
 *   rowItems?: Object<string, string>,      // optional: { recipeId: itemId }, für welches Item eine Zeile läuft
 *                                           //   (Standard: erstes Output = Hauptprodukt)
 *   itemRecipes?: Object<string, string>,   // optional: { itemId: recipeId }, gewähltes Rezept je Item; dient im
 *                                           //   Baum und für die Tiefe als Ersatz, wenn das Item keine Zeile hat,
 *                                           //   und verhindert missingRecipe für dieses Item
 * }} args
 * @returns {{ rows, raw, surplus, power, machineCount, tree, sloopsTotal }}
 */
export function buildResult({ rates, targets, data, mods, rowItems, itemRecipes } = {}) {
  const items = data && hasOwn(data, "items") && data.items && typeof data.items === "object" ? data.items : {};
  const rateMap = objOr(rates);
  const rowItemMap = objOr(rowItems);
  const itemRecipeMap = objOr(itemRecipes);
  const imports = importSet(mods);

  const { goals, demand } = normalizeTargets(targets, items);
  if (goals.length === 0) return emptyResult();

  const isRaw = (id) => hasOwn(items, id) && !!items[id] && items[id].raw === true;
  const isLeaf = (id) => isRaw(id) || imports.has(id);

  // 1. Aktive Rezepte (Rate > 0) mit Somersloops; jede Zeile läuft für genau ein Item.
  const active = [];
  for (const rid of Object.keys(rateMap)) {
    const runs = rateMap[rid];
    if (!isFiniteNumber(runs) || !(runs > EPS)) continue;
    const r = effectiveRecipe(rid, data, mods);
    if (!r) continue;
    const hinted = hasOwn(rowItemMap, rid) ? rowItemMap[rid] : null;
    const item = typeof hinted === "string" && outputAmount(r, hinted) > 0 ? hinted : r.outputs[0].item;
    active.push({ r, runs, item });
  }

  // Erzeuger je Item (Zeilen für dieses Item; sonst das gewählte Rezept als Ersatz ohne Rate).
  const producersByItem = new Map();
  for (const a of active) {
    if (!producersByItem.has(a.item)) producersByItem.set(a.item, []);
    producersByItem.get(a.item).push(a);
  }
  const fallbackCache = new Map();
  const producersOf = (id) => {
    if (isLeaf(id)) return [];
    const list = producersByItem.get(id);
    if (list && list.length) return list;
    if (!fallbackCache.has(id)) {
      const rid = hasOwn(itemRecipeMap, id) ? itemRecipeMap[id] : null;
      const r = typeof rid === "string" ? effectiveRecipe(rid, data, mods) : null;
      fallbackCache.set(id, r && outputAmount(r, id) > 0 ? [{ r, runs: 0, item: id }] : []);
    }
    return fallbackCache.get(id);
  };

  // 2. Tiefe (längster Pfad von einem Ziel) über die Eingänge der Erzeuger.
  const roots = [...demand.keys()];
  const edges = new Map();
  const edgeItems = new Set([...producersByItem.keys(), ...Object.keys(itemRecipeMap)]);
  for (const id of edgeItems) {
    const next = [];
    for (const p of producersOf(id)) for (const inp of p.r.inputs) if (!next.includes(inp.item)) next.push(inp.item);
    edges.set(id, next);
  }
  const depth = computeDepths(roots, edges);

  // 3. Zeilen, Strom, Maschinen, Somersloops, Item-Bilanz.
  const balance = new Map();
  let maxFlow = 0;
  for (const v of demand.values()) maxFlow = Math.max(maxFlow, v);
  const rows = [];
  let power = 0;
  let machineCount = 0;
  let sloopsTotal = 0;
  for (const { r, runs, item } of active) {
    for (const [k, c] of r.net) balance.set(k, (balance.get(k) ?? 0) + c * runs);
    const scale = (list) =>
      list.map((e) => {
        maxFlow = Math.max(maxFlow, e.amount * runs);
        return { item: e.item, rate: roundTol(e.amount * runs) };
      });
    const machines = (runs * r.duration) / 60;
    const p = rowPower(machines, r.power);
    const n = ceilMachines(machines);
    power += p;
    machineCount += n;
    const row = {
      recipe: r.id,
      item,
      runsPerMin: roundTol(runs),
      machines: roundTol(machines),
      building: r.building,
      power: roundTol(p),
      inputs: scale(r.inputs),
      outputs: scale(r.outputs),
    };
    if (r.sloops > 0) {
      row.sloops = r.sloops;
      row.sloopsTotal = n * r.sloops;
      sloopsTotal += row.sloopsTotal;
    }
    rows.push(row);
  }
  rows.sort(
    (a, b) =>
      (depth.get(a.item) ?? 0) - (depth.get(b.item) ?? 0) || compareIds(a.item, b.item) || compareIds(a.recipe, b.recipe),
  );

  // 4. Bilanz je Item: Defizit → raw (Lieferung), Überschuss über die Ziele → surplus.
  const tolFlow = EPS * Math.max(1, maxFlow);
  const raw = [];
  const surplus = [];
  const balanceItems = new Set([...balance.keys(), ...demand.keys()]);
  for (const id of [...balanceItems].sort(compareIds)) {
    const net = (balance.get(id) ?? 0) - (demand.get(id) ?? 0);
    if (net < -tolFlow) {
      const entry = { item: id, rate: roundTol(-net) };
      if (imports.has(id)) entry.imported = true;
      else if (!isRaw(id) && !hasOwn(itemRecipeMap, id)) entry.missingRecipe = true;
      raw.push(entry);
    } else if (net > tolFlow) {
      surplus.push({ item: id, rate: roundTol(net) });
    }
  }

  // 5. Baum je Ziel (reine Anzeige, ohne Nebenprodukt-Gutschrift). Mehrere Erzeuger: Bedarf anteilig
  //    nach ihrem Ausstoß des Items, je Rezept ein Erzeuger-Kind { item, rate, recipe, children }.
  const expand = (r, id, rate, path) => {
    const runs = rate / outputAmount(r, id);
    return r.inputs.map((inp) => buildNode(inp.item, inp.amount * runs, path));
  };
  const buildNode = (id, rate, path) => {
    const prods = producersOf(id);
    const node = { item: id, rate: roundTol(rate), recipe: prods.length === 1 ? prods[0].r.id : null, children: [] };
    if (path.has(id)) {
      node.cycle = true;
      return node;
    }
    if (prods.length === 0) return node;
    path.add(id);
    if (prods.length === 1) {
      node.children = expand(prods[0].r, id, rate, path);
    } else {
      const weights = prods.map((p) => p.runs * outputAmount(p.r, id));
      const total = weights.reduce((s, w) => s + w, 0);
      prods.forEach((p, i) => {
        const share = (rate * weights[i]) / total;
        node.children.push({ item: id, rate: roundTol(share), recipe: p.r.id, children: expand(p.r, id, share, path) });
      });
    }
    path.delete(id);
    return node;
  };
  // Erzeuger in Zeilenreihenfolge, damit der Baum deterministisch ist.
  const rowOrder = new Map(rows.map((row, i) => [row.recipe, i]));
  for (const list of producersByItem.values()) list.sort((a, b) => rowOrder.get(a.r.id) - rowOrder.get(b.r.id));
  const tree = goals.map((g) => buildNode(g.item, g.rate, new Set()));

  return { rows, raw, surplus, power: roundTol(power), machineCount, tree, sloopsTotal };
}
