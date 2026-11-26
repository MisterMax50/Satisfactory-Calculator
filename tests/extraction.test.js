// extraction.test.js — Tests für js/extraction.js mit eigenem Fixture (Förderanlagen laut SPEC „Version 2 › Daten“).
import { test, assertEqual, assertClose } from "./runner.js";
import { computeExtraction, defaultExtraction, extractorsFor } from "../js/extraction.js";

const ORE = "Desc_OreIron_C";
const COAL = "Desc_Coal_C";
const WATER = "Desc_Water_C";
const OIL = "Desc_LiquidOil_C";
const NITROGEN = "Desc_NitrogenGas_C";
const INGOT = "Desc_IronIngot_C";

const MK1 = "Build_MinerMk1_C";
const MK2 = "Build_MinerMk2_C";
const MK3 = "Build_MinerMk3_C";
const WATER_PUMP = "Build_WaterPump_C";
const OIL_PUMP = "Build_OilPump_C";
const WELL = "Build_FrackingExtractor_C";

const item = (id, form, raw = true) => ({ id, name: { de: id, en: id }, form, raw, defaultRecipe: raw ? null : "R" });
const extractor = (id, kind, ratePerMin, power, allowed, forms) => ({ id, name: { de: id, en: id }, kind, ratePerMin, power, allowed, forms });

const DATA = {
  items: Object.fromEntries(
    [item(ORE, "solid"), item(COAL, "solid"), item(WATER, "fluid"), item(OIL, "fluid"), item(NITROGEN, "gas"), item(INGOT, "solid", false)].map(
      (i) => [i.id, i],
    ),
  ),
  recipes: {},
  buildings: {},
  extractors: Object.fromEntries(
    [
      extractor(MK1, "miner", 60, 5, null, ["solid"]),
      extractor(MK2, "miner", 120, 15, null, ["solid"]),
      extractor(MK3, "miner", 240, 45, null, ["solid"]),
      extractor(WATER_PUMP, "pump", 120, 20, [WATER], ["fluid"]),
      extractor(OIL_PUMP, "pump", 120, 40, [OIL], ["fluid"]),
      extractor(WELL, "well", 60, 0, [OIL, NITROGEN, WATER], ["fluid", "gas"]),
    ].map((e) => [e.id, e]),
  ),
  pressurizer: { id: "Build_FrackingSmasher_C", name: { de: "D", en: "D" }, power: 150 },
};

const P = 1.321928;
const one = (item, rate, setting) => {
  const r = computeExtraction({ raw: [{ item, rate }], settings: setting ? { [item]: setting } : {}, data: DATA });
  assertEqual(r.rows.length, 1, "eine Zeile");
  return r.rows[0];
};

test("Förderung: Reinheit unrein / normal / rein", () => {
  const normal = one(ORE, 300);
  assertEqual([normal.extractor, normal.purity, normal.count], [MK2, "normal", 3]);
  assertClose(normal.clockEffective, 300 / 360, 1e-9);
  assertClose(normal.power, 3 * 15 * Math.pow(300 / 360, P), 1e-9);
  const impure = one(ORE, 300, { extractor: MK2, purity: "impure", maxClock: 100 });
  assertEqual([impure.purity, impure.count, impure.clockEffective, impure.power], ["impure", 5, 1, 75]);
  const pure = one(ORE, 300, { extractor: MK2, purity: "pure", maxClock: 100 });
  assertEqual([pure.purity, pure.count, pure.clockEffective], ["pure", 2, 0.625]);
  assertClose(pure.power, 2 * 15 * Math.pow(0.625, P), 1e-9);
  // unbekannte Reinheit → normal
  assertEqual(one(ORE, 300, { purity: "golden" }), normal);
});

test("Förderung: maxClock bis 250 % (Übertaktung) und Begrenzung 1–250 %", () => {
  const r = one(ORE, 600, { extractor: MK2, purity: "normal", maxClock: 250 });
  assertEqual([r.count, r.clock, r.clockEffective], [2, 2.5, 2.5]);
  assertClose(r.power, 2 * 15 * Math.pow(2.5, P), 1e-9);
  assertEqual(one(ORE, 600, { maxClock: 400 }), r, "über 250 % → 250 %");
  const low = one(ORE, 3, { maxClock: 0 });
  assertEqual([low.clock, low.count], [0.01, 3], "unter 1 % → 1 %: 1,2 /min je Miner");
  assertEqual(one(ORE, 300, { maxClock: "100" }).clock, 1, "kein Zahlwert → 100 %");
});

test("Förderung: Untertaktung – clockEffective = rate / (count × Rate × Reinheit)", () => {
  const r = one(ORE, 200, { extractor: MK3, purity: "normal", maxClock: 100 });
  assertEqual(r.count, 1);
  assertClose(r.clockEffective, 200 / 240, 1e-9);
  assertClose(r.power, 45 * Math.pow(200 / 240, P), 1e-9);
  const m = one(ORE, 100, { extractor: MK1, purity: "normal", maxClock: 100 });
  assertEqual(m.count, 2);
  assertClose(m.clockEffective, 100 / 120, 1e-9);
  assertEqual(m.pressurizers, 0);
  assertEqual(m.pressurizersEstimate, false);
  // genau ausgelastet: keine zusätzliche Anlage durch Fließkomma
  assertEqual(one(ORE, 360).count, 3);
});

test("Förderung: Wasserextraktor ohne Reinheit", () => {
  const r = one(WATER, 300, { extractor: WATER_PUMP, purity: "pure", maxClock: 100 });
  assertEqual([r.extractor, r.purity, r.count], [WATER_PUMP, null, 3]);
  assertClose(r.clockEffective, 300 / 360, 1e-9);
  assertClose(r.power, 3 * 20 * Math.pow(300 / 360, P), 1e-9);
  // Ölextraktor hat Reinheit
  const o = one(OIL, 240, { extractor: OIL_PUMP, purity: "pure", maxClock: 100 });
  assertEqual([o.purity, o.count, o.clockEffective, o.power], ["pure", 1, 1, 40]);
});

test("Förderung: Ressourcenbrunnen mit Druckerzeugern (Standard ceil(count/4), Override)", () => {
  const r = one(NITROGEN, 500);
  assertEqual([r.extractor, r.purity, r.count], [WELL, "normal", 9]);
  assertClose(r.clockEffective, 500 / 540, 1e-9);
  assertEqual([r.pressurizers, r.pressurizersEstimate], [3, true]);
  assertEqual(r.power, 450, "Satelliten 0 MW + 3 × 150 MW, nicht getaktet");
  const o = one(NITROGEN, 500, { extractor: WELL, purity: "normal", maxClock: 100, pressurizers: 2 });
  assertEqual([o.pressurizers, o.pressurizersEstimate, o.power], [2, false, 300]);
  assertEqual(one(NITROGEN, 500, { pressurizers: 0 }).power, 0, "Override 0");
  // Wasser per Brunnen, mit Reinheit
  const w = one(WATER, 120, { extractor: WELL, purity: "pure", maxClock: 100 });
  assertEqual([w.extractor, w.purity, w.count, w.clockEffective, w.pressurizers, w.power], [WELL, "pure", 1, 1, 1, 150]);
  // Summe über alle Zeilen
  const all = computeExtraction({ raw: [{ item: NITROGEN, rate: 500 }, { item: ORE, rate: 120 }], data: DATA });
  assertEqual(all.power, 450 + 15);
});

test("Förderung: Standardwahl je Rohstoff und wählbare Anlagen", () => {
  assertEqual(defaultExtraction(ORE, DATA), { extractor: MK2, purity: "normal", maxClock: 100 });
  assertEqual(defaultExtraction(COAL, DATA).extractor, MK2);
  assertEqual(defaultExtraction(WATER, DATA).extractor, WATER_PUMP);
  assertEqual(defaultExtraction(OIL, DATA).extractor, OIL_PUMP);
  assertEqual(defaultExtraction(NITROGEN, DATA).extractor, WELL);
  assertEqual(defaultExtraction(INGOT, DATA), null, "kein Rohstoff");
  assertEqual(defaultExtraction("Desc_Gibts_Nicht_C", DATA), null);
  assertEqual(extractorsFor(ORE, DATA), [MK1, MK2, MK3]);
  assertEqual(extractorsFor(WATER, DATA), [WATER_PUMP, WELL]);
  assertEqual(extractorsFor(OIL, DATA), [OIL_PUMP, WELL]);
  assertEqual(extractorsFor(NITROGEN, DATA), [WELL]);
  assertEqual(extractorsFor(INGOT, DATA), []);
  // unpassende Anlage in den Einstellungen → Standard
  assertEqual(one(ORE, 120, { extractor: OIL_PUMP, purity: "normal", maxClock: 100 }).extractor, MK2);
  assertEqual(one(NITROGEN, 60, { extractor: WATER_PUMP }).extractor, WELL);
});

test("Förderung: Importe und fehlende Rezepte ohne Förderung", () => {
  const r = computeExtraction({
    raw: [
      { item: INGOT, rate: 30, imported: true },
      { item: ORE, rate: 30, imported: true },
      { item: "Test_Missing_C", rate: 10, missingRecipe: true },
      { item: COAL, rate: 60 },
      { item: ORE, rate: 0 },
      null,
    ],
    data: DATA,
  });
  assertEqual(r.rows.map((x) => x.item), [COAL]);
  assertClose(r.power, 15 * Math.pow(0.5, P), 1e-9);
});

test("Förderung: fehlende extractors-Daten → leeres Ergebnis, kein Throw", () => {
  const empty = { rows: [], power: 0 };
  const noEx = { items: DATA.items, recipes: {}, buildings: {} };
  assertEqual(computeExtraction({ raw: [{ item: ORE, rate: 60 }], settings: {}, data: noEx }), empty);
  assertEqual(computeExtraction(), empty);
  assertEqual(computeExtraction({ raw: null, data: DATA }), empty);
  assertEqual(extractorsFor(ORE, noEx), []);
  assertEqual(defaultExtraction(ORE, noEx), null);
  assertEqual(extractorsFor(ORE, undefined), []);
});
