// optimizer.test.js — Tests für js/optimizer.js (solveLP, optimize).
// Eigener kleiner Fixture-Datensatz; am Ende Lauf über alle Items mit echten Daten (data/gamedata.js).
import { test, assertEqual, assertClose } from "./runner.js";
import { optimize, solveLP } from "../js/optimizer.js";
import { solve } from "../js/solver.js";
import GAME from "../data/gamedata.js";

// ---------- Fixture ----------
const SMELTER = "Build_SmelterMk1_C";
const CONSTRUCTOR = "Build_ConstructorMk1_C";
const ASSEMBLER = "Build_AssemblerMk1_C";
const REFINERY = "Build_OilRefinery_C";

const ORE = "Desc_OreIron_C";
const WATER = "Desc_Water_C";
const OIL = "Desc_LiquidOil_C";
const INGOT = "Desc_IronIngot_C";
const PLATE = "Desc_IronPlate_C";
const ROD = "Desc_IronRod_C";
const SCREW = "Desc_IronScrew_C";
const RIP = "Desc_IronPlateReinforced_C";
const WIDGET = "Test_Widget_C";
const GADGET = "Test_Gadget_C";
const BOLT = "Test_Bolt_C";
const PLASTIC = "Desc_Plastic_C";
const RUBBER = "Desc_Rubber_C";
const HOR = "Desc_HeavyOilResidue_C";
const LEAVES = "Desc_Leaves_C"; // ohne Rezept, kein Rohstoff
const BIOMASS = "Desc_GenericBiomass_C";

const R_INGOT = "Recipe_IngotIron_C";
const R_PURE = "Recipe_Alternate_PureIronIngot_C";
const R_PLATE = "Recipe_IronPlate_C";
const R_ROD = "Recipe_IronRod_C";
const R_SCREW = "Recipe_Screw_C";
const R_SCREW_ALT = "Recipe_Alternate_Screw_C";
const R_RIP = "Recipe_IronPlateReinforced_C";
const R_WIDGET = "Recipe_Test_Widget_C";
const R_GADGET = "Recipe_Alternate_Test_Gadget_C";
const R_BOLT_WASTE = "Recipe_Alternate_Test_BoltWasteful_C"; // kleinere ID als R_BOLT, aber mehr Erz
const R_BOLT = "Recipe_Test_Bolt_C";
const R_PLASTIC = "Recipe_Plastic_C";
const R_RUBBER = "Recipe_Rubber_C";
const R_RESIDUAL = "Recipe_ResidualRubber_C";
const R_BIOMASS = "Recipe_Biomass_Leaves_C";
const R_BIOMASS_ORE = "Recipe_Alternate_Test_BiomassOre_C";

function item(id, defaultRecipe, { form = "solid", raw = false } = {}) {
  return { id, name: { de: id, en: id }, form, raw, defaultRecipe };
}
function recipe(id, building, duration, inputs, outputs, alternate = false) {
  const io = (list) => list.map(([item, amount]) => ({ item, amount }));
  return { id, name: { de: id, en: id }, alternate, building, duration, inputs: io(inputs), outputs: io(outputs) };
}

const recipeList = [
  recipe(R_INGOT, SMELTER, 2, [[ORE, 1]], [[INGOT, 1]]),
  recipe(R_PURE, REFINERY, 12, [[ORE, 7], [WATER, 4]], [[INGOT, 13]], true),
  recipe(R_PLATE, CONSTRUCTOR, 6, [[INGOT, 3]], [[PLATE, 2]]),
  recipe(R_ROD, CONSTRUCTOR, 4, [[INGOT, 1]], [[ROD, 1]]),
  recipe(R_SCREW, CONSTRUCTOR, 6, [[ROD, 1]], [[SCREW, 4]]),
  recipe(R_SCREW_ALT, CONSTRUCTOR, 24, [[INGOT, 5]], [[SCREW, 20]], true),
  recipe(R_RIP, ASSEMBLER, 12, [[PLATE, 6], [SCREW, 12]], [[RIP, 1]]),
  recipe(R_WIDGET, CONSTRUCTOR, 60, [[ORE, 1]], [[WIDGET, 1]]),
  recipe(R_GADGET, CONSTRUCTOR, 60, [[INGOT, 2]], [[GADGET, 1]], true),
  recipe(R_BOLT_WASTE, CONSTRUCTOR, 6, [[ORE, 2]], [[BOLT, 1]], true),
  recipe(R_BOLT, CONSTRUCTOR, 6, [[ORE, 1]], [[BOLT, 1]]),
  recipe(R_PLASTIC, REFINERY, 6, [[OIL, 3]], [[PLASTIC, 2], [HOR, 1]]),
  recipe(R_RUBBER, REFINERY, 6, [[OIL, 2]], [[RUBBER, 1]]),
  recipe(R_RESIDUAL, REFINERY, 6, [[HOR, 1]], [[RUBBER, 1]]),
  recipe(R_BIOMASS, CONSTRUCTOR, 5, [[LEAVES, 10]], [[BIOMASS, 5]]),
  recipe(R_BIOMASS_ORE, CONSTRUCTOR, 5, [[ORE, 100]], [[BIOMASS, 1]], true),
];
const DATA = {
  items: Object.fromEntries(
    [
      item(ORE, null, { raw: true }),
      item(WATER, null, { raw: true, form: "fluid" }),
      item(OIL, null, { raw: true, form: "fluid" }),
      item(INGOT, R_INGOT),
      item(PLATE, R_PLATE),
      item(ROD, R_ROD),
      item(SCREW, R_SCREW),
      item(RIP, R_RIP),
      item(WIDGET, R_WIDGET),
      item(GADGET, R_GADGET),
      item(BOLT, R_BOLT),
      item(PLASTIC, R_PLASTIC),
      item(RUBBER, R_RUBBER),
      item(HOR, null, { form: "fluid" }),
      item(LEAVES, null),
      item(BIOMASS, R_BIOMASS),
    ].map((i) => [i.id, i]),
  ),
  recipes: Object.fromEntries(recipeList.map((r) => [r.id, r])),
  buildings: {
    [SMELTER]: { id: SMELTER, name: { de: "S", en: "S" }, power: 4, sloopSlots: 1, sloopBoost: 1, boostPowerExponent: 2 },
    [CONSTRUCTOR]: { id: CONSTRUCTOR, name: { de: "K", en: "K" }, power: 4, sloopSlots: 1, sloopBoost: 1, boostPowerExponent: 2 },
    [ASSEMBLER]: { id: ASSEMBLER, name: { de: "M", en: "M" }, power: 15, sloopSlots: 2, sloopBoost: 0.5, boostPowerExponent: 2 },
    [REFINERY]: { id: REFINERY, name: { de: "R", en: "R" }, power: 30, sloopSlots: 2, sloopBoost: 0.5, boostPowerExponent: 2 },
  },
};
const LIMITS = { [ORE]: 1000, [OIL]: 500, [WATER]: Infinity };

const T = (list) => list.map(([item, rate]) => ({ item, rate }));
const opt = (targets, extra = {}) => optimize({ targets: T(targets), data: DATA, limits: LIMITS, ...extra });
const rowOf = (result, recipeId) => result.rows.find((r) => r.recipe === recipeId);
const rawOf = (result, itemId) => result.raw.find((r) => r.item === itemId);
const recipesOf = (result) => result.rows.map((r) => r.recipe).sort();

// ---------- Simplex ----------

test("solveLP: kleines LP mit bekannter Lösung (min 2x+3y, x+y≥4, x+3y≥6 → x=3, y=1)", () => {
  const lp = solveLP(
    2,
    [
      { cols: [0, 1], vals: [1, 1], rhs: 4 },
      { cols: [0, 1], vals: [1, 3], rhs: 6 },
    ],
    [[2, 3]],
  );
  assertEqual(lp.status, "optimal");
  assertClose(lp.x[0], 3, 1e-9, "x");
  assertClose(lp.x[1], 1, 1e-9, "y");
});

test("solveLP: Beale-Beispiel (kreist ohne Bland-Regel) endet im Optimum −1,25", () => {
  // min −3/4 x4 + 20 x5 − 1/2 x6 + 6 x7 unter
  //   1/4 x4 − 8 x5 − x6 + 9 x7 ≤ 0,  1/2 x4 − 12 x5 − 1/2 x6 + 3 x7 ≤ 0,  x6 ≤ 1  (als ≥ mit −1 multipliziert)
  const c = [-0.75, 20, -0.5, 6];
  const lp = solveLP(
    4,
    [
      { cols: [0, 1, 2, 3], vals: [-0.25, 8, 1, -9], rhs: 0 },
      { cols: [0, 1, 2, 3], vals: [-0.5, 12, 0.5, -3], rhs: 0 },
      { cols: [2], vals: [-1], rhs: -1 },
    ],
    [c],
  );
  assertEqual(lp.status, "optimal");
  const value = c.reduce((s, cj, j) => s + cj * lp.x[j], 0);
  assertClose(value, -1.25, 1e-9, "Zielwert");
  assertClose(lp.x[0], 1, 1e-9, "x4");
  assertClose(lp.x[2], 1, 1e-9, "x6");
});

test("solveLP: zweites Ziel entscheidet nur bei Gleichstand des ersten", () => {
  const row = [{ cols: [0, 1], vals: [1, 1], rhs: 1 }];
  const tie = solveLP(2, row, [[1, 1], [2, 1]]);
  assertEqual(Array.from(tie.x), [0, 1]);
  const noTie = solveLP(2, row, [[1, 2], [5, 0]]);
  assertEqual(Array.from(noTie.x), [1, 0]);
});

test("solveLP: unzulässig wird erkannt, unbeschränkt wird abgefangen", () => {
  assertEqual(solveLP(1, [{ cols: [0], vals: [-1], rhs: 1 }], [[1]]).status, "infeasible");
  const ub = solveLP(1, [{ cols: [0], vals: [1], rhs: 1 }], [[-1]]);
  assertEqual(ub.status, "unbounded");
  assertEqual(ub.x[0] >= 1 - 1e-9, true, "Lösung bleibt zulässig");
});

// ---------- optimize: Fixture ----------

test("optimize: kleine Kette mit bekannter Lösung (20 Platten/min, nur Standard)", () => {
  const res = opt([[PLATE, 20]], { allowAlternates: false });
  assertEqual(res.rows.map((r) => [r.recipe, r.item, r.runsPerMin, r.machines]), [
    [R_PLATE, PLATE, 10, 1],
    [R_INGOT, INGOT, 30, 1],
  ]);
  assertEqual(res.raw, [{ item: ORE, rate: 30 }]);
  assertEqual(res.surplus, []);
  // 30 Erz / 1000 + 1e-6 × (1 + 1) Maschinen
  assertClose(res.objectiveValue, 0.03 + 2e-6, 1e-12, "objectiveValue");
  assertEqual(res.usedRecipes, { [INGOT]: [R_INGOT], [PLATE]: [R_PLATE] });
});

test("optimize resources: sparsameres Alternativrezept wird gewählt (Reiner Eisenbarren)", () => {
  const res = opt([[PLATE, 26]]);
  assertEqual(recipesOf(res), [R_PURE, R_PLATE].sort());
  assertClose(rowOf(res, R_PURE).runsPerMin, 3, 1e-9, "3 Durchläufe × 13 = 39 Barren");
  assertEqual(res.raw, [{ item: ORE, rate: 21 }, { item: WATER, rate: 12 }]);
  assertEqual(res.usedRecipes[INGOT], [R_PURE]);
});

test("optimize power: anderes Ergebnis, weil das Alternativrezept mehr Strom braucht", () => {
  const res = opt([[PLATE, 26]], { objective: "power" });
  assertEqual(recipesOf(res), [R_INGOT, R_PLATE].sort());
  assertEqual(res.raw, [{ item: ORE, rate: 39 }]);
  // Strom linear: Barren 39 × 2/60 × 4 + Platten 13 × 6/60 × 4 = 5,2 + 5,2; Nebenziel 1e-6 × 39/1000
  assertClose(res.objectiveValue, 10.4 + 1e-6 * 0.039, 1e-9, "objectiveValue");
  const resources = opt([[PLATE, 26]]);
  assertEqual(res.power > resources.power, false, "power-Ziel braucht nicht mehr Strom");
});

test("optimize: ausgeschlossenes Rezept wird nicht verwendet", () => {
  const res = opt([[PLATE, 26]], { excluded: [R_PURE] });
  assertEqual(recipesOf(res), [R_INGOT, R_PLATE].sort());
  assertEqual(res.raw, [{ item: ORE, rate: 39 }]);
});

test("optimize: allowAlternates=false nutzt keine Alternativrezepte", () => {
  const res = opt([[PLATE, 26], [SCREW, 40]], { allowAlternates: false });
  assertEqual(recipesOf(res), [R_INGOT, R_PLATE, R_ROD, R_SCREW].sort());
  for (const row of res.rows) assertEqual(DATA.recipes[row.recipe].alternate, false, row.recipe);
});

test("optimize: infeasible, wenn ein Ziel nur über ausgeschlossene/alternative Rezepte geht", () => {
  assertEqual(opt([[WIDGET, 5]], { excluded: [R_WIDGET] }), { error: "infeasible", items: [WIDGET] });
  assertEqual(opt([[PLATE, 10], [WIDGET, 5]], { excluded: [R_WIDGET] }), { error: "infeasible", items: [WIDGET] });
  assertEqual(opt([[GADGET, 1], [WIDGET, 1]], { allowAlternates: false }), { error: "infeasible", items: [GADGET] });
  // Zwischenprodukt gesperrt → Ziel nicht herstellbar
  assertEqual(opt([[PLATE, 10]], { excluded: [R_INGOT, R_PURE] }), { error: "infeasible", items: [PLATE] });
});

test("optimize: Nebenprodukt wird verwertet statt Rohstoff (Rückstand → Gummi)", () => {
  const res = opt([[PLASTIC, 10], [RUBBER, 10]]);
  assertClose(rowOf(res, R_PLASTIC).runsPerMin, 5, 1e-9, "Kunststoff");
  assertClose(rowOf(res, R_RESIDUAL).runsPerMin, 5, 1e-9, "Rückstandsgummi aus 5 Rückstand");
  assertClose(rowOf(res, R_RUBBER).runsPerMin, 5, 1e-9, "Rest-Gummi aus Öl");
  assertEqual(rowOf(res, R_RESIDUAL).item, RUBBER);
  assertEqual(res.raw, [{ item: OIL, rate: 25 }]); // statt 15 + 20 = 35
  assertEqual(res.surplus, []);
  assertEqual(res.usedRecipes[RUBBER], [R_RESIDUAL, R_RUBBER]);
});

test("optimize: Gleichstand bei Rohstoffen → weniger Maschinen; bei Strom → weniger Rohstoffe", () => {
  // Schrauben: beide Wege 10 Erz; Standard 2 Maschinen, Alternativ 0,8 + 1/3.
  const screws = opt([[SCREW, 40]], { excluded: [R_PURE] });
  assertEqual(recipesOf(screws), [R_INGOT, R_SCREW_ALT].sort());
  assertEqual(screws.raw, [{ item: ORE, rate: 10 }]);
  // Bolzen: gleicher Strom; Nebenziel 1e-6 × Erz/92100 (Standard-Limits) liegt unter der Toleranz,
  // die zweite Stufe wählt trotzdem das Rezept mit weniger Erz.
  const bolts = optimize({ targets: T([[BOLT, 10]]), objective: "power", data: DATA });
  assertEqual(recipesOf(bolts), [R_BOLT]);
  assertEqual(bolts.raw, [{ item: ORE, rate: 10 }]);
});

test("optimize: Somersloops – Inputs je Durchlauf gleich, halbe Maschinen, Rohstoff nur über weniger Durchläufe", () => {
  const plain = opt([[PLATE, 20]], { allowAlternates: false });
  const mods = { sloops: { [R_PLATE]: 1 } };
  const res = opt([[PLATE, 20]], { allowAlternates: false, mods });
  const row = rowOf(res, R_PLATE);
  assertEqual(row.sloops, 1);
  assertEqual(row.runsPerMin, 5);
  assertEqual(row.machines, rowOf(plain, R_PLATE).machines / 2);
  assertEqual(row.inputs, [{ item: INGOT, rate: 15 }]); // 5 × 3, je Durchlauf unverändert
  assertEqual(row.outputs, [{ item: PLATE, rate: 20 }]);
  assertEqual(res.raw, [{ item: ORE, rate: 15 }]);
  const ref = solve({ targets: T([[PLATE, 20]]), recipeChoice: {}, data: DATA, mods });
  assertEqual(res.rows, ref.rows, "wie solve() mit denselben mods");
  assertEqual(res.raw, ref.raw);
  assertClose(res.power, ref.power, 1e-9);
});

test("optimize: Somersloop macht Standard-Barren sparsamer als das Alternativrezept", () => {
  const res = opt([[PLATE, 26]], { mods: { sloops: { [R_INGOT]: 1 } } });
  assertEqual(recipesOf(res), [R_INGOT, R_PLATE].sort());
  assertClose(rowOf(res, R_INGOT).runsPerMin, 19.5, 1e-9);
  assertEqual(res.raw, [{ item: ORE, rate: 19.5 }]); // < 21 mit Reinem Eisenbarren
});

test("optimize: Importe werden geliefert, nicht hergestellt (Gewicht 0)", () => {
  const rip = opt([[RIP, 1]], { allowAlternates: false, mods: { imports: [PLATE] } });
  assertEqual(rowOf(rip, R_PLATE), undefined);
  assertEqual(rawOf(rip, PLATE), { item: PLATE, rate: 6, imported: true });
  assertEqual(rawOf(rip, ORE), { item: ORE, rate: 3 });
  // 3 Erz / 1000 + 1e-6 × (0,2 + 0,3 + 0,2 + 0,1) Maschinen
  assertClose(rip.objectiveValue, 0.003 + 0.8e-6, 1e-12, "objectiveValue");

  // Rezept mit importiertem Nebenprodukt bleibt erlaubt; Import ersetzt den Öl-Weg für Gummi.
  const bp = opt([[PLASTIC, 10], [RUBBER, 10]], { mods: { imports: [HOR] } });
  assertClose(rowOf(bp, R_PLASTIC).runsPerMin, 5, 1e-9);
  assertClose(rowOf(bp, R_RESIDUAL).runsPerMin, 10, 1e-9);
  assertEqual(rowOf(bp, R_RUBBER), undefined);
  assertEqual(bp.raw, [{ item: HOR, rate: 5, imported: true }, { item: OIL, rate: 15 }]);

  const direct = opt([[PLATE, 20]], { mods: { imports: [PLATE] } });
  assertEqual(direct.rows, []);
  assertEqual(direct.raw, [{ item: PLATE, rate: 20, imported: true }]);
  assertEqual(direct.objectiveValue, 0);
});

test("optimize mit allowAlternates=false und nur Standardrezepten ≈ solve()", () => {
  const targets = T([[RIP, 2], [PLATE, 5]]);
  const res = optimize({ targets, allowAlternates: false, data: DATA, limits: LIMITS });
  const ref = solve({ targets, recipeChoice: {}, data: DATA });
  assertEqual(res.rows, ref.rows, "rows");
  assertEqual(res.raw, ref.raw, "raw");
  assertEqual(res.surplus, ref.surplus, "surplus");
  assertEqual(res.machineCount, ref.machineCount, "machineCount");
  assertClose(res.power, ref.power, 1e-9, "power");
  assertEqual(res.tree, ref.tree, "tree");
});

test("optimize: Item ohne Rezept wird wie bei solve() mit missingRecipe geliefert, nicht infeasible", () => {
  const res = opt([[BIOMASS, 10]], { allowAlternates: false });
  assertEqual(res.error, undefined);
  assertEqual(res.rows.map((r) => [r.recipe, r.runsPerMin]), [[R_BIOMASS, 2]]);
  assertEqual(res.raw, [{ item: LEAVES, rate: 20, missingRecipe: true }]);
  // Gewicht 1 je Blatt + 1e-6 × 2 × 5/60 Maschinen
  assertClose(res.objectiveValue, 20 + 1e-6 * (10 / 60), 1e-9, "objectiveValue");
  const ref = solve({ targets: T([[BIOMASS, 10]]), recipeChoice: {}, data: DATA });
  assertEqual(res.rows, ref.rows, "rows wie solve()");
  assertEqual(res.raw, ref.raw, "raw wie solve()");

  // Gewicht 1 ist teuer: lieber 100 Erz je Biomasse (Gewicht 0,1) als 2 Blätter (Gewicht 2).
  const alt = opt([[BIOMASS, 10]]);
  assertEqual(recipesOf(alt), [R_BIOMASS_ORE]);
  assertEqual(alt.raw, [{ item: ORE, rate: 1000 }]);

  // Vorhandenes Rezept gesperrt → weiterhin infeasible.
  assertEqual(opt([[BIOMASS, 10]], { allowAlternates: false, excluded: [R_BIOMASS] }), {
    error: "infeasible",
    items: [BIOMASS],
  });
  // Importiert: Gewicht 0, imported statt missingRecipe; Ziel ohne Rezept direkt geliefert.
  const imp = opt([[BIOMASS, 10]], { allowAlternates: false, mods: { imports: [LEAVES] } });
  assertEqual(imp.raw, [{ item: LEAVES, rate: 20, imported: true }]);
  assertClose(imp.objectiveValue, 1e-6 * (10 / 60), 1e-12, "objectiveValue mit Import");
  const direct = opt([[LEAVES, 3]]);
  assertEqual(direct.rows, []);
  assertEqual(direct.raw, [{ item: LEAVES, rate: 3, missingRecipe: true }]);
});

test("optimize: leere/ungültige Ziele → leeres Ergebnis", () => {
  const res = opt([]);
  assertEqual(res.rows, []);
  assertEqual(res.objectiveValue, 0);
  assertEqual(res.usedRecipes, {});
  assertEqual(opt([["Unbekannt_C", 5], [PLATE, 0]]).rows, []);
});

// ---------- Echte Daten ----------

const producedItems = (() => {
  const set = new Set();
  for (const r of Object.values(GAME.recipes)) for (const o of r.outputs) set.add(o.item);
  return [...set].filter((id) => GAME.items[id]).sort();
})();
/** Nicht-Rohstoffe, die kein Rezept als Output hat (Blätter, Überreste, Abfälle …). */
const noRecipeItems = new Set(
  Object.keys(GAME.items).filter((id) => GAME.items[id].raw !== true && !producedItems.includes(id)),
);

function assertFiniteDeep(v, path) {
  if (typeof v === "number") {
    if (!Number.isFinite(v)) throw new Error(`${path} = ${v}`);
  } else if (Array.isArray(v)) {
    v.forEach((e, i) => assertFiniteDeep(e, `${path}[${i}]`));
  } else if (v && typeof v === "object") {
    for (const k of Object.keys(v)) assertFiniteDeep(v[k], `${path}.${k}`);
  }
}

/**
 * Nettoproduktion (aus den Zeilen) + Lieferung ≥ Ziel − 1e-6. Geliefert werden nur Rohstoffe und Items
 * ohne Rezept (diese mit missingRecipe: true).
 */
function assertBalance(res, item, rate) {
  const net = new Map();
  const add = (k, v) => net.set(k, (net.get(k) ?? 0) + v);
  for (const row of res.rows) {
    for (const o of row.outputs) add(o.item, o.rate);
    for (const i of row.inputs) add(i.item, -i.rate);
  }
  const supply = new Map();
  for (const r of res.raw) {
    const isRaw = GAME.items[r.item] && GAME.items[r.item].raw === true;
    if (!isRaw && !noRecipeItems.has(r.item)) throw new Error(`${item}: ${r.item} geliefert, ist kein Rohstoff`);
    if ((r.missingRecipe === true) !== noRecipeItems.has(r.item)) throw new Error(`${item}: missingRecipe bei ${r.item}`);
    supply.set(r.item, r.rate);
  }
  for (const id of new Set([...net.keys(), item])) {
    const need = id === item ? rate : 0;
    const have = (net.get(id) ?? 0) + (supply.get(id) ?? 0);
    if (have < need - 1e-6 * Math.max(1, need)) throw new Error(`${item}: Bilanz ${id} ${have} < ${need}`);
  }
}

const realCache = new Map();
function realRuns(objective) {
  if (!realCache.has(objective)) {
    const runs = producedItems.map((id) => {
      const t0 = performance.now();
      const res = optimize({ targets: [{ item: id, rate: 10 }], objective, data: GAME });
      return { id, res, ms: performance.now() - t0 };
    });
    realCache.set(objective, runs);
  }
  return realCache.get(objective);
}

function checkRealRuns(objective) {
  for (const { id, res, ms } of realRuns(objective)) {
    if (ms >= 500) throw new Error(`${id}: ${ms.toFixed(0)} ms`);
    assertEqual(res.error, undefined, id);
    assertFiniteDeep(res, id);
    assertBalance(res, id, 10);
  }
}

test("echte Daten: jedes Item einzeln 10/min, resources – nie infeasible, kein NaN, Bilanz erfüllt, je < 500 ms", () => {
  checkRealRuns("resources");
});

test("echte Daten: jedes Item einzeln 10/min, power – nie infeasible, kein NaN, Bilanz erfüllt, je < 500 ms", () => {
  checkRealRuns("power");
});

test("echte Daten (resources): Items ohne Rezept nur geliefert, wenn es keinen Weg ohne sie gibt", () => {
  // Fixpunkt: aus Rohstoffen herstellbar = Rohstoff oder Output eines Rezepts, dessen Inputs alle herstellbar sind.
  const ok = new Set(Object.keys(GAME.items).filter((id) => GAME.items[id].raw === true));
  for (let changed = true; changed; ) {
    changed = false;
    for (const r of Object.values(GAME.recipes)) {
      if (!r.inputs.every((i) => ok.has(i.item))) continue;
      for (const o of r.outputs) {
        if (ok.has(o.item)) continue;
        ok.add(o.item);
        changed = true;
      }
    }
  }
  const needsMissing = producedItems.filter((id) => !ok.has(id));
  assertEqual(needsMissing.length > 0, true, "Daten enthalten Items, die nur über Items ohne Rezept gehen");
  const usesMissing = realRuns("resources")
    .filter((r) => r.res.raw.some((e) => e.missingRecipe))
    .map((r) => r.id);
  assertEqual(usesMissing, needsMissing);
});

test("echte Daten: 5 Modulare Rahmen/min (resources) brauchen höchstens 120 Eisenerz", () => {
  const res = optimize({ targets: [{ item: "Desc_ModularFrame_C", rate: 5 }], objective: "resources", data: GAME });
  assertEqual(res.error, undefined);
  const ore = res.raw.find((r) => r.item === ORE);
  assertEqual((ore ? ore.rate : 0) <= 120 + 1e-9, true, `Eisenerz ${ore && ore.rate}`);
  assertBalance(res, "Desc_ModularFrame_C", 5);
});
