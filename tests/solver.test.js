// solver.test.js — Tests für js/solver.js mit eigenem kleinen Fixture-Datensatz (nicht data/gamedata.js).
import { test, assertEqual, assertClose } from "./runner.js";
import { solve, perMinute, machinePower, rowPower, ceilMachines, POWER_EXPONENT } from "../js/solver.js";

// ---------- Fixture im Datenmodell-Format (SPEC „Datenmodell“) ----------
const SMELTER = "Build_SmelterMk1_C";
const CONSTRUCTOR = "Build_ConstructorMk1_C";
const ASSEMBLER = "Build_AssemblerMk1_C";
const REFINERY = "Build_OilRefinery_C";
const ACCELERATOR = "Build_HadronCollider_C";

const ORE = "Desc_OreIron_C";
const INGOT = "Desc_IronIngot_C";
const PLATE = "Desc_IronPlate_C";
const ROD = "Desc_IronRod_C";
const SCREW = "Desc_IronScrew_C";
const RIP = "Desc_IronPlateReinforced_C";
const OIL = "Desc_LiquidOil_C";
const PLASTIC = "Desc_Plastic_C";
const RUBBER = "Desc_Rubber_C";
const HOR = "Desc_HeavyOilResidue_C";
const RESIN = "Desc_PolymerResin_C";
const FUEL = "Desc_LiquidFuel_C";
const WATER = "Desc_Water_C";
const BAUXITE = "Desc_OreBauxite_C";
const COAL = "Desc_Coal_C";
const QUARTZ = "Desc_RawQuartz_C";
const ALUMINA = "Desc_AluminaSolution_C";
const SCRAP = "Desc_AluminumScrap_C";
const SILICA = "Desc_Silica_C";
const CYC_A = "Test_CycleA_C";
const CYC_B = "Test_CycleB_C";
const LOOP_A = "Test_LoopA_C";
const LOOP_B = "Test_LoopB_C";
const RECYCLED = "Test_Recycled_C";
const ACCEL = "Test_Accelerated_C";
const MISSING = "Test_Missing_C";
const NEEDS = "Test_NeedsMissing_C";
const GEL = "Test_Gel_C";

function item(id, defaultRecipe, { form = "solid", raw = false } = {}) {
  return { id, name: { de: id, en: id }, form, raw, defaultRecipe };
}
const rawItem = (id, form = "solid") => item(id, null, { form, raw: true });

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
  recipe("Recipe_Plastic_C", REFINERY, 6, [[OIL, 3]], [[PLASTIC, 2], [HOR, 1]]),
  recipe("Recipe_Rubber_C", REFINERY, 6, [[OIL, 3]], [[RUBBER, 2], [HOR, 2]]),
  recipe("Recipe_HeavyOilResidue_C", REFINERY, 6, [[OIL, 3]], [[HOR, 4], [RESIN, 2]]),
  recipe("Recipe_PolymerResin_C", REFINERY, 6, [[OIL, 6]], [[RESIN, 13], [HOR, 2]]),
  recipe("Recipe_LiquidFuel_C", REFINERY, 6, [[OIL, 6]], [[FUEL, 4], [RESIN, 3]]),
  recipe("Recipe_ResidualFuel_C", REFINERY, 6, [[HOR, 6]], [[FUEL, 4]]),
  recipe("Recipe_AluminaSolution_C", REFINERY, 6, [[BAUXITE, 12], [WATER, 18]], [[ALUMINA, 12], [SILICA, 5]]),
  recipe("Recipe_AluminumScrap_C", REFINERY, 1, [[ALUMINA, 4], [COAL, 2]], [[SCRAP, 6], [WATER, 2]]),
  recipe("Recipe_Silica_C", CONSTRUCTOR, 8, [[QUARTZ, 3]], [[SILICA, 5]]),
  recipe("Recipe_Test_CycleA_C", CONSTRUCTOR, 6, [[CYC_B, 1]], [[CYC_A, 1]]),
  recipe("Recipe_Test_CycleB_C", CONSTRUCTOR, 6, [[CYC_A, 1]], [[CYC_B, 1]]),
  recipe("Recipe_Test_LoopA_C", CONSTRUCTOR, 6, [[LOOP_B, 1], [ORE, 1]], [[LOOP_A, 2]]),
  recipe("Recipe_Test_LoopB_C", CONSTRUCTOR, 6, [[LOOP_A, 1]], [[LOOP_B, 1]]),
  recipe("Recipe_Test_Recycled_C", CONSTRUCTOR, 6, [[RECYCLED, 1], [ORE, 2]], [[RECYCLED, 3]]),
  recipe("Recipe_Test_Accelerated_C", ACCELERATOR, 60, [[ORE, 1]], [[ACCEL, 1]], { power: 1500 }),
  recipe("Recipe_Test_NeedsMissing_C", CONSTRUCTOR, 6, [[MISSING, 2]], [[NEEDS, 1]]),
  recipe("Recipe_Test_Gel_C", CONSTRUCTOR, 6, [[COAL, 2]], [[GEL, 1], [WATER, 3]]),
];

const itemList = [
  rawItem(ORE),
  item(INGOT, "Recipe_IngotIron_C"),
  item(PLATE, "Recipe_IronPlate_C"),
  item(ROD, "Recipe_IronRod_C"),
  item(SCREW, "Recipe_Screw_C"),
  item(RIP, "Recipe_IronPlateReinforced_C"),
  rawItem(OIL, "fluid"),
  item(PLASTIC, "Recipe_Plastic_C"),
  item(RUBBER, "Recipe_Rubber_C"),
  item(HOR, "Recipe_HeavyOilResidue_C", { form: "fluid" }),
  item(RESIN, "Recipe_PolymerResin_C"),
  item(FUEL, "Recipe_LiquidFuel_C", { form: "fluid" }),
  rawItem(WATER, "fluid"),
  rawItem(BAUXITE),
  rawItem(COAL),
  rawItem(QUARTZ),
  item(ALUMINA, "Recipe_AluminaSolution_C", { form: "fluid" }),
  item(SCRAP, "Recipe_AluminumScrap_C"),
  item(SILICA, "Recipe_Silica_C"),
  item(CYC_A, "Recipe_Test_CycleA_C"),
  item(CYC_B, "Recipe_Test_CycleB_C"),
  item(LOOP_A, "Recipe_Test_LoopA_C"),
  item(LOOP_B, "Recipe_Test_LoopB_C"),
  item(RECYCLED, "Recipe_Test_Recycled_C"),
  item(ACCEL, "Recipe_Test_Accelerated_C"),
  item(MISSING, null),
  item(NEEDS, "Recipe_Test_NeedsMissing_C"),
  item(GEL, "Recipe_Test_Gel_C"),
];

const building = (id, power) => ({ id, name: { de: id, en: id }, power });

const DATA = {
  version: "test",
  items: Object.fromEntries(itemList.map((i) => [i.id, i])),
  recipes: Object.fromEntries(recipeList.map((r) => [r.id, r])),
  buildings: Object.fromEntries(
    [
      building(SMELTER, 4),
      building(CONSTRUCTOR, 4),
      building(ASSEMBLER, 15),
      building(REFINERY, 30),
      building(ACCELERATOR, 250),
    ].map((b) => [b.id, b])
  ),
};

const run = (targets, recipeChoice = {}) =>
  solve({ targets: targets.map(([item, rate]) => ({ item, rate })), recipeChoice, data: DATA });
const rowOf = (result, id) => result.rows.find((r) => r.item === id);
const underclocked = (machines, perMachine) => {
  const n = Math.ceil(machines);
  return n * perMachine * Math.pow(machines / n, 1.321928);
};

// ---------- Tests ----------

test("Solver: Einzelkette Erz → Barren → Platte (Maschinen, Strom, Rohstoffe)", () => {
  const r = run([[PLATE, 20]]);
  assertEqual(r.rows, [
    {
      recipe: "Recipe_IronPlate_C", item: PLATE, runsPerMin: 10, machines: 1, building: CONSTRUCTOR, power: 4,
      inputs: [{ item: INGOT, rate: 30 }], outputs: [{ item: PLATE, rate: 20 }],
    },
    {
      recipe: "Recipe_IngotIron_C", item: INGOT, runsPerMin: 30, machines: 1, building: SMELTER, power: 4,
      inputs: [{ item: ORE, rate: 30 }], outputs: [{ item: INGOT, rate: 30 }],
    },
  ], "rows");
  assertEqual(r.raw, [{ item: ORE, rate: 30 }], "raw");
  assertEqual(r.surplus, [], "surplus");
  assertEqual(r.power, 8, "power");
  assertEqual(r.machineCount, 2, "machineCount");
});

test("Solver: Diamant – gemeinsames Zwischenprodukt wird summiert", () => {
  const r = run([[PLATE, 20], [ROD, 15]]);
  assertEqual(r.rows.map((x) => x.item), [PLATE, ROD, INGOT], "Reihenfolge");
  assertEqual(r.rows.filter((x) => x.item === INGOT).length, 1, "nur eine Barren-Zeile");
  assertEqual(rowOf(r, INGOT).runsPerMin, 45, "30 (Platte) + 15 (Stange)");
  assertEqual(rowOf(r, INGOT).machines, 1.5);
  assertEqual(r.raw, [{ item: ORE, rate: 45 }]);
  assertEqual(r.machineCount, 1 + 1 + 2);
});

test("Solver: rows-Reihenfolge nach Tiefe (längster Pfad), dann Item-ID", () => {
  // RIP → Platte → Barren (Tiefe 2) und RIP → Schraube → Stange → Barren (Tiefe 3): längster Pfad zählt.
  const r = run([[RIP, 5]]);
  assertEqual(r.rows.map((x) => x.item), [RIP, PLATE, SCREW, ROD, INGOT], "Reihenfolge");
  assertEqual(rowOf(r, INGOT).runsPerMin, 60, "45 + 15 Barren");
  assertEqual(rowOf(r, SCREW).runsPerMin, 15);
  assertEqual(r.raw, [{ item: ORE, rate: 60 }]);
  assertEqual(r.machineCount, 1 + 2 + 2 + 1 + 2, "RIP 1, Platte 1.5, Schraube 1.5, Stange 1, Barren 2");
  // Zielreihenfolge spielt keine Rolle, Gleichstand wird über die ID entschieden
  assertEqual(run([[ROD, 15], [PLATE, 20]]).rows.map((x) => x.item), [PLATE, ROD, INGOT], "ID-Gleichstand");
  // Ziel, das zugleich Zwischenprodukt eines anderen Ziels ist, steht nach Tiefe
  assertEqual(run([[PLATE, 10], [RIP, 5]]).rows.map((x) => x.item), [RIP, PLATE, SCREW, ROD, INGOT]);
});

test("Solver: Nebenprodukt wird angerechnet (Kunststoff/Gummi → Schweröl-Rückstand)", () => {
  // Kunststoff 20 → 10 HOR, Gummi 20 → 20 HOR; Restbrennstoff 40 braucht 60 HOR → HOR-Rezept nur für 30.
  const r = run([[FUEL, 40], [PLASTIC, 20], [RUBBER, 20]], { [FUEL]: "Recipe_ResidualFuel_C" });
  assertEqual(r.rows.map((x) => x.item), [FUEL, PLASTIC, RUBBER, HOR], "Reihenfolge");
  const hor = rowOf(r, HOR);
  assertEqual(hor.recipe, "Recipe_HeavyOilResidue_C");
  assertEqual(hor.runsPerMin, 7.5, "30 / 4 pro Lauf");
  assertEqual(hor.machines, 0.75);
  assertEqual(hor.outputs, [{ item: HOR, rate: 30 }, { item: RESIN, rate: 15 }]);
  assertEqual(rowOf(r, FUEL).inputs, [{ item: HOR, rate: 60 }]);
  assertEqual(r.raw, [{ item: OIL, rate: 82.5 }], "30 + 30 + 22,5 Rohöl");
  assertEqual(r.surplus, [{ item: RESIN, rate: 15 }], "Harz aus dem HOR-Rezept bleibt übrig");
  assertClose(hor.power, underclocked(0.75, 30), 1e-9, "HOR-Strom");
  assertClose(r.power, 30 * 3 + underclocked(0.75, 30), 1e-9, "Gesamtstrom");
  assertEqual(r.machineCount, 4);
});

test("Solver: Nebenprodukt ohne Abnehmer → Überschuss (auch wenn es ein Rezept hätte)", () => {
  const r = run([[PLASTIC, 20]]);
  assertEqual(r.rows.map((x) => x.item), [PLASTIC]);
  assertEqual(r.raw, [{ item: OIL, rate: 30 }]);
  assertEqual(r.surplus, [{ item: HOR, rate: 10 }]);
});

test("Solver: Überschuss bei negativer Rate (Nebenprodukt deckt mehr als den Bedarf)", () => {
  // 30 HOR aus Kunststoff + Gummi, Restbrennstoff 10 braucht nur 15 → HOR-Rezept wäre −3,75 → 0.
  const r = run([[FUEL, 10], [PLASTIC, 20], [RUBBER, 20]], { [FUEL]: "Recipe_ResidualFuel_C" });
  assertEqual(r.rows.map((x) => x.item), [FUEL, PLASTIC, RUBBER], "kein HOR-Rezept");
  assertEqual(rowOf(r, FUEL).runsPerMin, 2.5);
  assertEqual(r.surplus, [{ item: HOR, rate: 15 }]);
  assertEqual(r.raw, [{ item: OIL, rate: 60 }]);
  // Ziel-Item, das als Nebenprodukt schon übererfüllt wird
  const t = run([[HOR, 4], [RUBBER, 20]]);
  assertEqual(t.rows.map((x) => x.item), [RUBBER]);
  assertEqual(t.surplus, [{ item: HOR, rate: 16 }]);
});

test("Solver: Alternativrezept über recipeChoice", () => {
  const def = run([[SCREW, 40]]);
  assertEqual(def.rows.map((x) => [x.item, x.recipe]), [[SCREW, "Recipe_Screw_C"], [ROD, "Recipe_IronRod_C"], [INGOT, "Recipe_IngotIron_C"]]);
  const alt = run([[SCREW, 40]], { [SCREW]: "Recipe_Alternate_Screw_C" });
  assertEqual(alt.rows.map((x) => [x.item, x.recipe]), [[SCREW, "Recipe_Alternate_Screw_C"], [INGOT, "Recipe_IngotIron_C"]]);
  assertEqual(rowOf(alt, SCREW).runsPerMin, 2);
  assertEqual(rowOf(alt, SCREW).machines, 0.8, "2 Läufe × 24 s / 60");
  assertEqual(rowOf(alt, INGOT).runsPerMin, 10);
  assertEqual(alt.raw, [{ item: ORE, rate: 10 }]);
  assertEqual(alt.tree[0].recipe, "Recipe_Alternate_Screw_C");
  // ungültige Wahl (unbekannt / erzeugt das Item nicht) → defaultRecipe
  const bad1 = run([[SCREW, 40]], { [SCREW]: "Recipe_Gibts_Nicht_C" });
  const bad2 = run([[SCREW, 40]], { [SCREW]: "Recipe_IronPlate_C" });
  assertEqual(bad1.rows, def.rows, "unbekannte Rezept-ID");
  assertEqual(bad2.rows, def.rows, "Rezept ohne das Item");
});

test("Solver: Zyklus ohne Lösung → { error: \"cycle\", items }", () => {
  assertEqual(run([[CYC_A, 10]]), { error: "cycle", items: [CYC_A, CYC_B] });
  // lösbare Teile im selben Plan werden nicht mitgemeldet
  assertEqual(run([[PLATE, 20], [CYC_A, 10]]), { error: "cycle", items: [CYC_A, CYC_B] });
});

test("Solver: lösbarer Zyklus (Rezept recycelt eigenes Produkt) → korrekte Raten", () => {
  // 1 X + 2 Erz → 3 X: netto 2 X je Lauf → 5 Läufe für 10 X
  const r = run([[RECYCLED, 10]]);
  assertEqual(r.rows, [
    {
      recipe: "Recipe_Test_Recycled_C", item: RECYCLED, runsPerMin: 5, machines: 0.5, building: CONSTRUCTOR,
      power: Math.round(underclocked(0.5, 4) * 1e9) / 1e9,
      inputs: [{ item: RECYCLED, rate: 5 }, { item: ORE, rate: 10 }], outputs: [{ item: RECYCLED, rate: 15 }],
    },
  ]);
  assertEqual(r.raw, [{ item: ORE, rate: 10 }]);
  assertEqual(r.surplus, []);
  // Zwei-Item-Zyklus: A = 1 B + 1 Erz → 2 A, B = 1 A → 1 B
  const l = run([[LOOP_A, 10]]);
  assertEqual(l.rows.map((x) => [x.item, x.runsPerMin]), [[LOOP_A, 10], [LOOP_B, 10]]);
  assertEqual(l.raw, [{ item: ORE, rate: 10 }]);
  assertEqual(l.surplus, []);
});

test("Solver: Fluid-Mengen in m³ (Wasser als Nebenprodukt senkt Rohstoffbedarf)", () => {
  // Aluminiumschrott 360/min: 60 Läufe/min (1 s) → 240 m³ Tonerde, 120 Kohle, +120 m³ Wasser
  // Tonerdelösung 240 m³: 20 Läufe/min (6 s) → 240 Bauxit, 360 m³ Wasser, +100 Silica
  const r = run([[SCRAP, 360]]);
  assertEqual(r.rows, [
    {
      recipe: "Recipe_AluminumScrap_C", item: SCRAP, runsPerMin: 60, machines: 1, building: REFINERY, power: 30,
      inputs: [{ item: ALUMINA, rate: 240 }, { item: COAL, rate: 120 }],
      outputs: [{ item: SCRAP, rate: 360 }, { item: WATER, rate: 120 }],
    },
    {
      recipe: "Recipe_AluminaSolution_C", item: ALUMINA, runsPerMin: 20, machines: 2, building: REFINERY, power: 60,
      inputs: [{ item: BAUXITE, rate: 240 }, { item: WATER, rate: 360 }],
      outputs: [{ item: ALUMINA, rate: 240 }, { item: SILICA, rate: 100 }],
    },
  ]);
  assertEqual(r.raw, [{ item: COAL, rate: 120 }, { item: BAUXITE, rate: 240 }, { item: WATER, rate: 240 }], "360 − 120 m³ Wasser");
  assertEqual(r.surplus, [{ item: SILICA, rate: 100 }]);
  assertEqual(r.power, 90);
  // Rohstoff als Nebenprodukt ohne Verbrauch → Überschuss
  const g = run([[GEL, 10]]);
  assertEqual(g.raw, [{ item: COAL, rate: 20 }]);
  assertEqual(g.surplus, [{ item: WATER, rate: 30 }]);
  // Kombiniert: 30 m³ Wasser aus Gel senken den Wasserbedarf von 240 auf 210
  const c = run([[SCRAP, 360], [GEL, 10]]);
  assertEqual(c.raw.find((x) => x.item === WATER), { item: WATER, rate: 210 });
  assertEqual(c.surplus, [{ item: SILICA, rate: 100 }]);
});

test("Solver: Leistung mit Untertaktung (2,5 Maschinen → 3 bei 83,33 %)", () => {
  const r = run([[PLATE, 50]]);
  const plate = rowOf(r, PLATE);
  const ingot = rowOf(r, INGOT);
  assertEqual(plate.machines, 2.5);
  assertEqual(ingot.machines, 2.5);
  const expected = 3 * 4 * Math.pow(2.5 / 3, 1.321928);
  assertClose(plate.power, expected, 1e-9, "Platte");
  assertClose(plate.power, 9.43, 1e-3, "≈ 9,43 MW");
  assertClose(ingot.power, expected, 1e-9, "Barren");
  assertClose(r.power, 2 * expected, 1e-9, "Summe");
  assertEqual(r.machineCount, 6);
  // Hilfsfunktionen
  assertEqual(POWER_EXPONENT, 1.321928);
  assertEqual(ceilMachines(3.0000000001), 3, "Toleranz beim Aufrunden");
  assertEqual(ceilMachines(2.5), 3);
  assertEqual(ceilMachines(0), 0);
  assertClose(rowPower(3, 4), 12, 1e-12, "volle Taktung");
  assertClose(rowPower(2.5, 4), expected, 1e-12);
});

test("Solver: recipe.power überschreibt Gebäudeleistung", () => {
  const r = run([[ACCEL, 2]]);
  assertEqual(rowOf(r, ACCEL).machines, 2);
  assertEqual(rowOf(r, ACCEL).power, 3000, "2 × 1500 statt 2 × 250");
  assertEqual(r.power, 3000);
  const u = run([[ACCEL, 1.5]]);
  assertClose(u.power, underclocked(1.5, 1500), 1e-9, "untertaktet mit recipe.power");
  assertEqual(machinePower(DATA.recipes["Recipe_Test_Accelerated_C"], DATA.buildings), 1500);
  assertEqual(machinePower(DATA.recipes["Recipe_IronPlate_C"], DATA.buildings), 4);
});

test("Solver: Baumstruktur (Eingänge skaliert, ohne Nebenprodukt-Gutschrift)", () => {
  const r = run([[RIP, 5]]);
  const ore = (rate) => ({ item: ORE, rate, recipe: null, children: [] });
  assertEqual(r.tree, [
    {
      item: RIP, rate: 5, recipe: "Recipe_IronPlateReinforced_C", children: [
        {
          item: PLATE, rate: 30, recipe: "Recipe_IronPlate_C", children: [
            { item: INGOT, rate: 45, recipe: "Recipe_IngotIron_C", children: [ore(45)] },
          ],
        },
        {
          item: SCREW, rate: 60, recipe: "Recipe_Screw_C", children: [
            {
              item: ROD, rate: 15, recipe: "Recipe_IronRod_C", children: [
                { item: INGOT, rate: 15, recipe: "Recipe_IngotIron_C", children: [ore(15)] },
              ],
            },
          ],
        },
      ],
    },
  ]);
  // Baum zeigt Bedarf ohne Gutschrift: HOR-Knoten mit vollem Bedarf, obwohl Nebenprodukte ihn decken
  const b = run([[FUEL, 10], [PLASTIC, 20], [RUBBER, 20]], { [FUEL]: "Recipe_ResidualFuel_C" });
  assertEqual(b.tree.map((n) => n.item), [FUEL, PLASTIC, RUBBER], "je Ziel ein Knoten");
  assertEqual(b.tree[0].children[0].item, HOR);
  assertEqual(b.tree[0].children[0].rate, 15);
  assertEqual(b.tree[0].children[0].children, [{ item: OIL, rate: 11.25, recipe: null, children: [] }]);
});

test("Solver: Baum markiert Zyklen (cycle: true, nicht weiter aufgeklappt)", () => {
  const l = run([[LOOP_A, 10]]);
  assertEqual(l.tree, [
    {
      item: LOOP_A, rate: 10, recipe: "Recipe_Test_LoopA_C", children: [
        {
          item: LOOP_B, rate: 5, recipe: "Recipe_Test_LoopB_C", children: [
            { item: LOOP_A, rate: 5, recipe: "Recipe_Test_LoopA_C", children: [], cycle: true },
          ],
        },
        { item: ORE, rate: 5, recipe: null, children: [] },
      ],
    },
  ]);
  const s = run([[RECYCLED, 10]]).tree[0];
  assertEqual(s.children.length, 2);
  assertEqual(s.children[0].item, RECYCLED);
  assertEqual(s.children[0].cycle, true);
  assertEqual(s.children[0].children, []);
  assertClose(s.children[0].rate, 10 / 3, 1e-8);
  assertClose(s.children[1].rate, 20 / 3, 1e-8);
  assertEqual("cycle" in s, false, "nur wiederholte Items tragen cycle");
});

test("Solver: Rohstoff als Ziel erscheint nur in raw", () => {
  const r = run([[ORE, 60]]);
  assertEqual(r.rows, []);
  assertEqual(r.raw, [{ item: ORE, rate: 60 }]);
  assertEqual(r.surplus, []);
  assertEqual(r.power, 0);
  assertEqual(r.machineCount, 0);
  assertEqual(r.tree, [{ item: ORE, rate: 60, recipe: null, children: [] }]);
  // recipeChoice für Rohstoffe wird ignoriert; Rohstoffziel + Verbrauch werden addiert
  const m = run([[ORE, 60], [PLATE, 20]], { [ORE]: "Recipe_IngotIron_C" });
  assertEqual(m.raw, [{ item: ORE, rate: 90 }]);
  assertEqual(m.rows.map((x) => x.item), [PLATE, INGOT]);
});

test("Solver: fehlendes Rezept → raw mit missingRecipe", () => {
  const r = run([[NEEDS, 5]]);
  assertEqual(r.rows.map((x) => x.item), [NEEDS]);
  assertEqual(r.raw, [{ item: MISSING, rate: 10, missingRecipe: true }]);
  const d = run([[MISSING, 7]]);
  assertEqual(d.rows, []);
  assertEqual(d.raw, [{ item: MISSING, rate: 7, missingRecipe: true }]);
  assertEqual(d.tree, [{ item: MISSING, rate: 7, recipe: null, children: [] }]);
});

test("Solver: leere Ziele → leeres Ergebnis", () => {
  const empty = { rows: [], raw: [], surplus: [], power: 0, machineCount: 0, tree: [] };
  assertEqual(run([]), empty);
  assertEqual(solve(), empty, "ohne Argumente");
  assertEqual(solve({ targets: null, recipeChoice: null, data: null }), empty, "null-Werte");
  assertEqual(solve({ targets: [{ item: PLATE, rate: 10 }], data: {} }), empty, "leere Daten");
});

test("Solver: ungültige Eingaben werden ignoriert (kein Throw)", () => {
  const r = solve({
    targets: [
      { item: "Desc_Unbekannt_C", rate: 10 },
      { item: PLATE, rate: 0 },
      { item: PLATE, rate: -5 },
      { item: PLATE, rate: NaN },
      { item: PLATE, rate: Infinity },
      { item: PLATE, rate: "10" },
      null,
      "x",
      { rate: 3 },
      { item: PLATE, rate: 20 },
    ],
    recipeChoice: "kaputt",
    data: DATA,
  });
  const ref = run([[PLATE, 20]]);
  assertEqual(r, ref);
});

test("Solver: Werte mit Toleranz 1e-9 gerundet, gleiche Ziele summiert", () => {
  const r = run([[PLATE, 0.3]]);
  assertEqual(r.raw, [{ item: ORE, rate: 0.45 }], "keine Fließkomma-Artefakte");
  assertEqual(rowOf(r, INGOT).runsPerMin, 0.45);
  const d = run([[PLATE, 10], [PLATE, 10]]);
  assertEqual(d.rows, run([[PLATE, 20]]).rows, "Bedarf summiert");
  assertEqual(d.tree.length, 2, "Baum je Zieleintrag");
});

test("Solver: perMinute rechnet je Maschine bei 100 %", () => {
  assertEqual(perMinute(DATA.recipes["Recipe_IronPlate_C"]), {
    inputs: [{ item: INGOT, rate: 30 }],
    outputs: [{ item: PLATE, rate: 20 }],
  });
  assertEqual(perMinute(DATA.recipes["Recipe_AluminumScrap_C"]), {
    inputs: [{ item: ALUMINA, rate: 240 }, { item: COAL, rate: 120 }],
    outputs: [{ item: SCRAP, rate: 360 }, { item: WATER, rate: 120 }],
  });
  assertEqual(perMinute(null), { inputs: [], outputs: [] });
});
