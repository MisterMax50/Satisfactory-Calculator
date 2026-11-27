// progress.test.js — Tests für js/progress.js (Spielstand filtert Rezepte) mit Fixture und echten Daten.
import { test, assertEqual } from "./runner.js";
import { applyProgress } from "../js/progress.js";
import { solve } from "../js/solver.js";
import GAME from "../data/gamedata.js";

const rec = (id, tier, alternate, out) => ({ id, tier, alternate, building: "B", duration: 60, inputs: [], outputs: [{ item: out, amount: 1 }] });
const DATA = {
  items: {
    A: { id: "A", raw: false, defaultRecipe: "R_A" },
    B: { id: "B", raw: false, defaultRecipe: "R_B" },
  },
  recipes: {
    R_A: rec("R_A", 0, false, "A"),
    R_B: rec("R_B", 5, false, "B"),
    R_B_alt: rec("R_B_alt", 2, true, "B"),
    R_A_alt: rec("R_A_alt", 0, true, "A"),
  },
  buildings: {},
};

test("Spielstand: ohne Einschränkung bleiben die Daten unverändert", () => {
  assertEqual(applyProgress(DATA, { tier: null, alternates: null }) === DATA, true);
  assertEqual(applyProgress(DATA, null) === DATA, true);
});

test("Spielstand: Tier sperrt Rezepte, gesperrtes Standardrezept fällt auf freie Alternative", () => {
  const d = applyProgress(DATA, { tier: 3, alternates: null });
  assertEqual(Object.keys(d.recipes).sort(), ["R_A", "R_A_alt", "R_B_alt"]);
  assertEqual(d.items.B.defaultRecipe, "R_B_alt");
  assertEqual(d.items.A.defaultRecipe, "R_A");
});

test("Spielstand: Liste der Alternativen entscheidet, ohne Rezept bleibt defaultRecipe null", () => {
  const d = applyProgress(DATA, { tier: 3, alternates: ["R_A_alt"] });
  assertEqual(Object.keys(d.recipes).sort(), ["R_A", "R_A_alt"]);
  assertEqual(d.items.B.defaultRecipe, null);
  assertEqual(DATA.items.B.defaultRecipe, "R_B"); // Original unverändert
});

test("Spielstand mit echten Daten: Tier 2 ohne Alternativen hat keinen Kunststoff, Platten gehen", () => {
  const d = applyProgress(GAME, { tier: 2, alternates: [] });
  assertEqual(GAME.recipes.Recipe_Plastic_C.tier, 5);
  assertEqual("Recipe_Plastic_C" in d.recipes, false);
  assertEqual(Object.values(d.recipes).some((r) => r.alternate), false);
  const plates = solve({ targets: [{ item: "Desc_IronPlate_C", rate: 20 }], data: d });
  assertEqual(plates.error, undefined);
  const plastic = solve({ targets: [{ item: "Desc_Plastic_C", rate: 20 }], data: d });
  assertEqual(plastic.raw.some((e) => e.item === "Desc_Plastic_C" && e.missingRecipe), true);
});
