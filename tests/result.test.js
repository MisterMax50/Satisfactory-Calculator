// result.test.js — Tests für js/result.js (buildResult, effectiveRecipe) und solve() mit mods (Somersloops, Importe).
// Eigener kleiner Fixture-Datensatz (nicht data/gamedata.js).
import { test, assertEqual, assertClose } from "./runner.js";
import { buildResult, effectiveRecipe, POWER_EXPONENT } from "../js/result.js";
import { solve } from "../js/solver.js";

const SMELTER = "Build_SmelterMk1_C";
const CONSTRUCTOR = "Build_ConstructorMk1_C";
const ASSEMBLER = "Build_AssemblerMk1_C";
const PLAIN = "Test_NoSloopBuilding_C";

const ORE = "Desc_OreIron_C";
const INGOT = "Desc_IronIngot_C";
const PLATE = "Desc_IronPlate_C";
const ROD = "Desc_IronRod_C";
const SCREW = "Desc_IronScrew_C";
const RIP = "Desc_IronPlateReinforced_C";
const WIDGET = "Test_Widget_C";

function item(id, defaultRecipe, { form = "solid", raw = false } = {}) {
  return { id, name: { de: id, en: id }, form, raw, defaultRecipe };
}
function recipe(id, building, duration, inputs, outputs, extra = {}) {
  const io = (list) => list.map(([item, amount]) => ({ item, amount }));
  return { id, name: { de: id, en: id }, alternate: false, building, duration, inputs: io(inputs), outputs: io(outputs), ...extra };
}

const recipeList = [
  recipe("Recipe_IngotIron_C", SMELTER, 2, [[ORE, 1]], [[INGOT, 1]]),
  recipe("Recipe_IronPlate_C", CONSTRUCTOR, 6, [[INGOT, 3]], [[PLATE, 2]]),
  recipe("Recipe_IronRod_C", CONSTRUCTOR, 4, [[INGOT, 1]], [[ROD, 1]]),
  recipe("Recipe_Screw_C", CONSTRUCTOR, 6, [[ROD, 1]], [[SCREW, 4]]),
  recipe("Recipe_Alternate_Screw_C", CONSTRUCTOR, 24, [[INGOT, 5]], [[SCREW, 20]], { alternate: true }),
  recipe("Recipe_IronPlateReinforced_C", ASSEMBLER, 12, [[PLATE, 6], [SCREW, 12]], [[RIP, 1]]),
  recipe("Recipe_Test_Widget_C", PLAIN, 60, [[ORE, 1]], [[WIDGET, 1]]),
];
const DATA = {
  items: Object.fromEntries(
    [
      item(ORE, null, { raw: true }),
      item(INGOT, "Recipe_IngotIron_C"),
      item(PLATE, "Recipe_IronPlate_C"),
      item(ROD, "Recipe_IronRod_C"),
      item(SCREW, "Recipe_Screw_C"),
      item(RIP, "Recipe_IronPlateReinforced_C"),
      item(WIDGET, "Recipe_Test_Widget_C"),
    ].map((i) => [i.id, i]),
  ),
  recipes: Object.fromEntries(recipeList.map((r) => [r.id, r])),
  buildings: {
    [SMELTER]: { id: SMELTER, name: { de: "S", en: "S" }, power: 4, sloopSlots: 1, sloopBoost: 1, boostPowerExponent: 2 },
    [CONSTRUCTOR]: { id: CONSTRUCTOR, name: { de: "K", en: "K" }, power: 4, sloopSlots: 1, sloopBoost: 1, boostPowerExponent: 2 },
    // ohne boostPowerExponent → Standard 2
    [ASSEMBLER]: { id: ASSEMBLER, name: { de: "M", en: "M" }, power: 15, sloopSlots: 2, sloopBoost: 0.5 },
    // ohne Somersloop-Felder → 0 Plätze
    [PLAIN]: { id: PLAIN, name: { de: "P", en: "P" }, power: 10 },
  },
};

const T = (list) => list.map(([item, rate]) => ({ item, rate }));
const run = (targets, mods, recipeChoice = {}) => solve({ targets: T(targets), recipeChoice, data: DATA, mods });
const rowOf = (result, recipeId) => result.rows.find((r) => r.recipe === recipeId);
const underclocked = (machines, perMachine) => {
  const n = Math.ceil(machines - 1e-9);
  return n * perMachine * Math.pow(machines / n, POWER_EXPONENT);
};

// ---------- Somersloops ----------

test("Result: Somersloops verdoppeln Ausstoß, Inputs unverändert, Strom × (1+boost)^2", () => {
  const r = run([[PLATE, 20]], { sloops: { Recipe_IronPlate_C: 1 } });
  const plate = rowOf(r, "Recipe_IronPlate_C");
  assertEqual(plate.runsPerMin, 5, "4 Platten je Lauf statt 2");
  assertEqual(plate.machines, 0.5);
  assertEqual(plate.outputs, [{ item: PLATE, rate: 20 }]);
  assertEqual(plate.inputs, [{ item: INGOT, rate: 15 }], "Inputs nicht geboostet");
  assertEqual(plate.sloops, 1);
  assertEqual(plate.sloopsTotal, 1, "ceil(0,5) × 1");
  assertClose(plate.power, underclocked(0.5, 4 * 4), 1e-9, "4 MW × 2² untertaktet");
  assertEqual(r.raw, [{ item: ORE, rate: 15 }]);
  assertEqual(r.sloopsTotal, 1);
  // Zeile ohne Somersloops bleibt im alten Format
  assertEqual("sloops" in rowOf(r, "Recipe_IngotIron_C"), false);
  // Baum: Eingänge über geboosteten Ausstoß skaliert
  assertEqual(r.tree[0].children[0], { item: INGOT, rate: 15, recipe: "Recipe_IngotIron_C", children: [{ item: ORE, rate: 15, recipe: null, children: [] }] });
});

test("Result: ohne Somersloops ist sloopsTotal 0 und Zeilen haben keine sloops-Felder", () => {
  const r = run([[PLATE, 20]]);
  assertEqual(r.sloopsTotal, 0);
  assertEqual(r.rows.some((x) => "sloops" in x || "sloopsTotal" in x), false);
  assertEqual(run([[PLATE, 20]], { sloops: { Recipe_IronPlate_C: 0 } }), r, "0 Somersloops = keine mods");
});

test("Result: Somersloop-Begrenzung auf 0..sloopSlots, fehlende Felder = 0 Plätze", () => {
  const ref = run([[PLATE, 20]], { sloops: { Recipe_IronPlate_C: 1 } });
  assertEqual(run([[PLATE, 20]], { sloops: { Recipe_IronPlate_C: 5 } }), ref, "über sloopSlots → 1");
  const none = run([[PLATE, 20]]);
  assertEqual(run([[PLATE, 20]], { sloops: { Recipe_IronPlate_C: -2 } }), none, "negativ → 0");
  assertEqual(run([[PLATE, 20]], { sloops: { Recipe_IronPlate_C: "1" } }), none, "kein Zahlwert → 0");
  assertEqual(run([[PLATE, 20]], { sloops: { Recipe_IronPlate_C: NaN } }), none, "NaN → 0");
  // Gebäude ohne Somersloop-Felder: keine Wirkung
  const w = run([[WIDGET, 2]], { sloops: { Recipe_Test_Widget_C: 2 } });
  assertEqual(w, run([[WIDGET, 2]]), "0 Plätze");
  // Assembler: 2 Plätze à 0,5; 1,7 → 1 (ganzzahlig); Exponent fehlt → 2
  const a = run([[RIP, 3]], { sloops: { Recipe_IronPlateReinforced_C: 1.7 } });
  const rip = rowOf(a, "Recipe_IronPlateReinforced_C");
  assertEqual(rip.sloops, 1);
  assertEqual(rip.runsPerMin, 2, "1,5 RIP je Lauf");
  assertEqual(rip.machines, 0.4);
  assertEqual(rip.inputs, [{ item: PLATE, rate: 12 }, { item: SCREW, rate: 24 }]);
  assertClose(rip.power, underclocked(0.4, 15 * 1.5 * 1.5), 1e-9, "Standard-Exponent 2");
  const full = rowOf(run([[RIP, 3]], { sloops: { Recipe_IronPlateReinforced_C: 9 } }), "Recipe_IronPlateReinforced_C");
  assertEqual(full.sloops, 2, "auf 2 Plätze begrenzt");
  assertEqual(full.outputs, [{ item: RIP, rate: 3 }]);
  assertEqual(full.runsPerMin, 1.5);
});

test("Result: sloopsTotal = Σ ceil(machines) × n", () => {
  // 50 Platten mit Somersloop: 12,5 Läufe → 1,25 Maschinen → 2 × 1; 37,5 Barren mit Somersloop → 0,625 Schmelzöfen → 1 × 1
  const r = run([[PLATE, 50]], { sloops: { Recipe_IronPlate_C: 1, Recipe_IngotIron_C: 1 } });
  const plate = rowOf(r, "Recipe_IronPlate_C");
  const ingot = rowOf(r, "Recipe_IngotIron_C");
  assertEqual(plate.machines, 1.25);
  assertEqual(plate.sloopsTotal, 2);
  assertEqual(ingot.runsPerMin, 18.75, "37,5 Barren / 2 je Lauf");
  assertEqual(ingot.machines, 0.625);
  assertEqual(ingot.sloopsTotal, 1);
  assertEqual(r.raw, [{ item: ORE, rate: 18.75 }], "Erz bleibt je Lauf 1");
  assertEqual(r.sloopsTotal, 3);
  assertEqual(r.machineCount, 3);
});

test("Result: effectiveRecipe liefert geboostete Outputs und Strom je Maschine", () => {
  const e = effectiveRecipe("Recipe_IronPlateReinforced_C", DATA, { sloops: { Recipe_IronPlateReinforced_C: 2 } });
  assertEqual(e.sloops, 2);
  assertEqual(e.boost, 1);
  assertEqual(e.outputs, [{ item: RIP, amount: 2 }]);
  assertEqual(e.inputs, [{ item: PLATE, amount: 6 }, { item: SCREW, amount: 12 }]);
  assertEqual(e.power, 60, "15 MW × 2²");
  assertEqual(e.net.get(RIP), 2);
  assertEqual(e.net.get(PLATE), -6);
  const plain = effectiveRecipe(DATA.recipes.Recipe_IronPlate_C, DATA);
  assertEqual([plain.sloops, plain.boost, plain.power], [0, 0, 4]);
  assertEqual(effectiveRecipe("Recipe_Gibts_Nicht_C", DATA, {}), null);
});

// ---------- Importe ----------

test("Result: Importe werden nie produziert und erscheinen in raw mit imported", () => {
  const r = run([[PLATE, 20]], { imports: [INGOT] });
  assertEqual(r.rows.map((x) => x.recipe), ["Recipe_IronPlate_C"], "kein Barren-Rezept");
  assertEqual(r.raw, [{ item: INGOT, rate: 30, imported: true }]);
  assertEqual(r.tree, [
    { item: PLATE, rate: 20, recipe: "Recipe_IronPlate_C", children: [{ item: INGOT, rate: 30, recipe: null, children: [] }] },
  ]);
  // Ziel selbst importiert; recipeChoice wird ignoriert
  const t = run([[SCREW, 40]], { imports: [SCREW] }, { [SCREW]: "Recipe_Alternate_Screw_C" });
  assertEqual(t.rows, []);
  assertEqual(t.raw, [{ item: SCREW, rate: 40, imported: true }]);
  assertEqual(t.power, 0);
  // Import mitten in der Kette: Stangen zugeliefert, Barren nur noch für Platten
  const m = run([[RIP, 1]], { imports: [ROD] });
  assertEqual(m.rows.map((x) => x.recipe), ["Recipe_IronPlateReinforced_C", "Recipe_IronPlate_C", "Recipe_Screw_C", "Recipe_IngotIron_C"]);
  assertEqual(m.raw, [{ item: ROD, rate: 3, imported: true }, { item: ORE, rate: 9 }], "nach Item-ID");
  // ungültige imports werden ignoriert
  assertEqual(run([[PLATE, 20]], { imports: "x" }), run([[PLATE, 20]]));
});

// ---------- Mehrfach-Erzeuger (buildResult direkt) ----------

test("Result: mehrere Erzeuger je Item – eine Zeile je Rezept, Bilanz über alle", () => {
  // 20 Schrauben aus Standard (5 Läufe) + 20 aus Alternativ (1 Lauf)
  const rates = { Recipe_Screw_C: 5, Recipe_Alternate_Screw_C: 1, Recipe_IronRod_C: 5, Recipe_IngotIron_C: 10 };
  const r = buildResult({ rates, targets: T([[SCREW, 40]]), data: DATA });
  assertEqual(
    r.rows.map((x) => [x.item, x.recipe]),
    [[SCREW, "Recipe_Alternate_Screw_C"], [SCREW, "Recipe_Screw_C"], [ROD, "Recipe_IronRod_C"], [INGOT, "Recipe_IngotIron_C"]],
  );
  assertEqual(rowOf(r, "Recipe_Alternate_Screw_C").outputs, [{ item: SCREW, rate: 20 }]);
  assertEqual(r.raw, [{ item: ORE, rate: 10 }]);
  assertEqual(r.surplus, []);
  assertEqual(r.machineCount, 4);
  assertEqual(r.sloopsTotal, 0);
});

test("Result: Baum verteilt den Bedarf anteilig auf die Erzeuger (ein Kind je Rezept)", () => {
  // Alternativ 2 Läufe = 40 Schrauben, Standard 5 Läufe = 20 Schrauben → Anteile 2/3 und 1/3
  const rates = { Recipe_Screw_C: 5, Recipe_Alternate_Screw_C: 2, Recipe_IronRod_C: 5, Recipe_IngotIron_C: 15 };
  const r = buildResult({ rates, targets: T([[SCREW, 60]]), data: DATA });
  const ore = (rate) => ({ item: ORE, rate, recipe: null, children: [] });
  assertEqual(r.tree, [
    {
      item: SCREW, rate: 60, recipe: null, children: [
        {
          item: SCREW, rate: 40, recipe: "Recipe_Alternate_Screw_C", children: [
            { item: INGOT, rate: 10, recipe: "Recipe_IngotIron_C", children: [ore(10)] },
          ],
        },
        {
          item: SCREW, rate: 20, recipe: "Recipe_Screw_C", children: [
            { item: ROD, rate: 5, recipe: "Recipe_IronRod_C", children: [{ item: INGOT, rate: 5, recipe: "Recipe_IngotIron_C", children: [ore(5)] }] },
          ],
        },
      ],
    },
  ]);
  // Bedarf im Baum ist der Bedarf des Elternknotens, nicht die Gesamtproduktion: RIP 1 braucht 12 Schrauben
  const rip = buildResult({
    rates: { ...rates, Recipe_IronPlateReinforced_C: 1, Recipe_IronPlate_C: 3, Recipe_IngotIron_C: 24 },
    targets: T([[RIP, 1], [SCREW, 48]]),
    data: DATA,
  });
  const screwNode = rip.tree[0].children.find((c) => c.item === SCREW);
  assertEqual(screwNode.recipe, null);
  assertEqual(screwNode.children.map((c) => [c.recipe, c.rate]), [["Recipe_Alternate_Screw_C", 8], ["Recipe_Screw_C", 4]]);
});

test("Result: buildResult mit Somersloops, leeren und ungültigen Eingaben", () => {
  const r = buildResult({
    rates: { Recipe_IronPlate_C: 5, Recipe_IngotIron_C: 15, Recipe_Gibts_Nicht_C: 3, Recipe_IronRod_C: 0, Recipe_Screw_C: -1 },
    targets: T([[PLATE, 20]]),
    data: DATA,
    mods: { sloops: { Recipe_IronPlate_C: 1 } },
  });
  assertEqual(r.rows.map((x) => x.recipe), ["Recipe_IronPlate_C", "Recipe_IngotIron_C"], "unbekannte/≤ 0 ignoriert");
  assertEqual(r.surplus, []);
  assertEqual(r.raw, [{ item: ORE, rate: 15 }]);
  assertEqual(r.sloopsTotal, 1);
  const empty = { rows: [], raw: [], surplus: [], power: 0, machineCount: 0, tree: [], sloopsTotal: 0 };
  assertEqual(buildResult(), empty);
  assertEqual(buildResult({ rates: { Recipe_IronPlate_C: 1 }, targets: [], data: DATA }), empty);
  // Unterproduktion eines Zwischenprodukts ohne Rezept-Hinweis → raw mit missingRecipe
  const u = buildResult({ rates: { Recipe_IronPlate_C: 10 }, targets: T([[PLATE, 20]]), data: DATA });
  assertEqual(u.raw, [{ item: INGOT, rate: 30, missingRecipe: true }]);
  // Überproduktion → surplus
  const o = buildResult({ rates: { Recipe_IronPlate_C: 10, Recipe_IngotIron_C: 40 }, targets: T([[PLATE, 20]]), data: DATA });
  assertEqual(o.surplus, [{ item: INGOT, rate: 10 }]);
  assertEqual(o.raw, [{ item: ORE, rate: 40 }]);
});
