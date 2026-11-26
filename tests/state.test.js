// state.test.js — Tests für js/state.js und js/i18n.js (mit Fake-Storage/-Location).
import { test, assertEqual, assertClose } from "./runner.js";
import { encodeState, decodeState, defaultState, createStore } from "../js/state.js";
import { setLang, getLang, t, localName, formatNumber, formatRate, dictKeys } from "../js/i18n.js";

function fakeStorage(opts = {}) {
  const m = new Map();
  return {
    m,
    getItem: (k) => {
      if (opts.throwGet) throw new Error("gesperrt");
      return m.has(k) ? m.get(k) : null;
    },
    setItem: (k, v) => {
      if (opts.throwSet) throw new Error("voll");
      m.set(k, String(v));
    },
  };
}

function fakeEnv(hash = "") {
  const loc = { href: "http://x.test/app/?a=1" + hash, pathname: "/app/", search: "?a=1", hash };
  const calls = [];
  const hist = {
    replaceState: (_s, _t, url) => {
      calls.push(url);
      const i = url.indexOf("#");
      loc.hash = i >= 0 ? url.slice(i) : "";
      loc.href = "http://x.test" + url;
    },
  };
  return { loc, hist, calls };
}

function mk(hash = "", storage = fakeStorage()) {
  const env = fakeEnv(hash);
  const s = createStore({ storage, location: env.loc, history: env.hist });
  return { s, storage, ...env };
}

const sampleV1 = { v: 1, targets: [["Desc_IronPlate_C", 30]], recipes: { Desc_X_C: "Recipe_Y_C" }, lang: "de" };
const sample = {
  ...sampleV1,
  v: 2,
  mode: "manual",
  objective: "resources",
  allowAlternates: true,
  excluded: [],
  sloops: {},
  imports: [],
  extraction: {},
};
const full = {
  v: 2,
  targets: [["Desc_IronPlate_C", 30]],
  recipes: { Desc_X_C: "Recipe_Y_C" },
  lang: "en",
  mode: "optimized",
  objective: "power",
  allowAlternates: false,
  excluded: ["Recipe_A_C", "Recipe_B_C"],
  sloops: { Recipe_C_C: 2, Recipe_D_C: 0 },
  imports: ["Desc_IronIngot_C"],
  extraction: {
    Desc_OreIron_C: { extractor: "miner2", purity: "pure", maxClock: 250 },
    Desc_NitrogenGas_C: { extractor: "well", purity: "impure", maxClock: 1, pressurizers: 3 },
  },
};

test("encode/decode Roundtrip mit Umlauten und Emoji", () => {
  const st = { ...sample, recipes: { "Süß_ß_😀": "Rezept_ä" } };
  const enc = encodeState(st);
  assertEqual(/^[A-Za-z0-9_-]+$/.test(enc), true, "base64url ohne Padding");
  assertEqual(decodeState(enc), st);
});

test("decodeState: kaputt oder falsche Typen -> null", () => {
  assertEqual(decodeState("!!!"), null);
  assertEqual(decodeState(""), null);
  assertEqual(decodeState(null), null);
  assertEqual(decodeState("abc"), null);
  const bad = [
    { ...sample, v: 3 },
    { ...sample, v: 0 },
    { ...sample, targets: "x" },
    { ...sample, targets: [["a", 0]] },
    { ...sample, targets: [["a", -1]] },
    { ...sample, targets: [[1, 5]] },
    { ...sample, targets: [["a", "5"]] },
    { ...sample, recipes: [] },
    { ...sample, recipes: { a: 1 } },
    { ...sample, lang: "fr" },
  ];
  for (const b of bad) assertEqual(decodeState(encodeState(b)), null, JSON.stringify(b));
});

test("defaultState: Struktur", () => {
  const d = defaultState();
  assertEqual(d.v, 2);
  assertEqual(d.targets, []);
  assertEqual(d.recipes, {});
  assertEqual(d.lang === "de" || d.lang === "en", true);
});

test("loadInitialState: Hash hat Vorrang vor sfcalc.last", () => {
  const storage = fakeStorage();
  storage.m.set("sfcalc.last", JSON.stringify({ ...sample, targets: [["Last", 1]] }));
  const { s } = mk("#p=" + encodeState(sample), storage);
  assertEqual(s.loadInitialState(), sample);
});

test("loadInitialState: ohne Hash sfcalc.last, sonst Default, kaputtes JSON ok", () => {
  const storage = fakeStorage();
  storage.m.set("sfcalc.last", JSON.stringify(sample));
  assertEqual(mk("", storage).s.loadInitialState(), sample);
  storage.m.set("sfcalc.last", "{kaputt");
  assertEqual(mk("", storage).s.loadInitialState().targets, []);
  assertEqual(mk("#p=zzz", fakeStorage()).s.loadInitialState().targets, []);
});

test("update: patch, fn, immutabel, Benachrichtigung, Persistenz, Hash", () => {
  const { s, storage, loc, calls } = mk();
  s.loadInitialState();
  const before = s.getState();
  let n = 0;
  const unsub = s.subscribe(() => n++);
  s.update({ targets: [["A", 10]] });
  assertEqual(n, 1);
  assertEqual(before.targets, [], "alter Zustand unverändert");
  assertEqual(s.getState().targets, [["A", 10]]);
  assertEqual(JSON.parse(storage.m.get("sfcalc.last")).targets, [["A", 10]]);
  assertEqual(loc.hash.startsWith("#p="), true);
  assertEqual(decodeState(loc.hash.slice(3)).targets, [["A", 10]]);
  s.update((st) => ({ targets: [...st.targets, ["B", 5]] }));
  assertEqual(s.getState().targets.length, 2);
  unsub();
  s.update({ lang: "en" });
  assertEqual(n, 2, "nach unsubscribe keine Benachrichtigung");
  s.update({ targets: [] });
  assertEqual(loc.hash, "", "leerer Plan entfernt Hash");
  assertEqual(calls[calls.length - 1].includes("#"), false);
});

test("Pläne: speichern, überschreiben, laden, löschen", () => {
  const { s } = mk();
  s.loadInitialState();
  s.update({ targets: [["A", 10]] });
  assertEqual(s.savePlan("Mein Plan ä😀"), true);
  s.update({ targets: [["B", 20]] });
  s.savePlan("Mein Plan ä😀");
  s.savePlan("Zweiter");
  const plans = s.listPlans();
  assertEqual(plans.length, 2);
  assertEqual(plans[0].state.targets, [["B", 20]]);
  assertEqual(typeof plans[0].savedAt, "number");
  s.update({ targets: [] });
  assertEqual(s.loadPlan("Zweiter").targets, [["B", 20]]);
  assertEqual(s.getState().targets, [["B", 20]]);
  assertEqual(s.loadPlan("gibt es nicht"), null);
  assertEqual(s.deletePlan("Zweiter"), true);
  assertEqual(s.listPlans().map((p) => p.name), ["Mein Plan ä😀"]);
  assertEqual(s.deletePlan("Zweiter"), false);
});

test("shareUrl: vollständige URL mit Hash", () => {
  const { s } = mk();
  s.loadInitialState();
  s.update({ targets: [["A", 10]] });
  const u = s.shareUrl();
  assertEqual(u.startsWith("http://x.test/app/?a=1#p="), true);
  assertEqual(decodeState(u.split("#p=")[1]).targets, [["A", 10]]);
});

test("Storage wirft -> kein Absturz", () => {
  const { s } = mk("", fakeStorage({ throwGet: true, throwSet: true }));
  assertEqual(s.loadInitialState().targets, []);
  s.update({ targets: [["A", 1]] });
  assertEqual(s.getState().targets, [["A", 1]]);
  assertEqual(s.listPlans(), []);
  assertEqual(s.savePlan("x"), false);
  assertEqual(s.loadPlan("x"), null);
  const noStore = createStore({ storage: null, location: null, history: null });
  noStore.update({ targets: [["A", 1]] });
  assertEqual(noStore.listPlans(), []);
});

test("kaputte Pläne-Einträge werden ignoriert", () => {
  const storage = fakeStorage();
  storage.m.set("sfcalc.plans", JSON.stringify([{ name: "ok", state: sampleV1, savedAt: 1 }, { name: 5 }, null, { name: "x", state: { v: 9 } }]));
  assertEqual(mk("", storage).s.listPlans().map((p) => p.name), ["ok"]);
  storage.m.set("sfcalc.plans", "kaputt");
  assertEqual(mk("", storage).s.listPlans(), []);
});

test("v2: Roundtrip mit allen Feldern", () => {
  assertEqual(decodeState(encodeState(full)), full);
  const { s, loc } = mk();
  s.loadInitialState();
  s.update(full);
  assertEqual(s.getState(), full);
  assertEqual(decodeState(loc.hash.slice(3)), full);
  assertEqual(mk(loc.hash).s.loadInitialState(), full);
});

test("v2: Standardfelder fehlen im Hash und werden beim Decodieren aufgefüllt", () => {
  const enc = encodeState(sample);
  const raw = JSON.parse(atob(enc.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (enc.length % 4)) % 4)));
  assertEqual(Object.keys(raw).sort(), ["lang", "recipes", "targets", "v"]);
  const d = decodeState(enc);
  assertEqual(d, sample);
  for (const k of ["mode", "objective", "allowAlternates", "excluded", "sloops", "imports", "extraction"]) {
    assertEqual(k in d, true, k);
  }
});

test("Migration v1 -> v2: Hash, sfcalc.last, Pläne", () => {
  const fromHash = decodeState(btoa(JSON.stringify(sampleV1)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""));
  assertEqual(fromHash, sample);
  const v1hash = "#p=" + btoa(JSON.stringify(sampleV1)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  assertEqual(mk(v1hash).s.loadInitialState(), sample);
  const storage = fakeStorage();
  storage.m.set("sfcalc.last", JSON.stringify(sampleV1));
  assertEqual(mk("", storage).s.loadInitialState(), sample);
  storage.m.set("sfcalc.plans", JSON.stringify([{ name: "alt", state: sampleV1, savedAt: 5 }, { name: "neu", state: full, savedAt: 6 }]));
  const plans = mk("", storage).s.listPlans();
  assertEqual(plans.map((p) => p.name), ["alt", "neu"]);
  assertEqual(plans[0].state, sample);
  assertEqual(plans[1].state, full);
  assertEqual(decodeState(encodeState(sampleV1)), sample);
});

test("v2: ungültige sloops/extraction/Felder -> null", () => {
  const ex = (o) => ({ ...full, extraction: { A: { extractor: "m", purity: "normal", maxClock: 100, ...o } } });
  const bad = [
    { ...full, sloops: { a: 5 } },
    { ...full, sloops: { a: -1 } },
    { ...full, sloops: { a: 1.5 } },
    { ...full, sloops: { a: "1" } },
    { ...full, sloops: [] },
    ex({ purity: "gold" }),
    ex({ maxClock: 0 }),
    ex({ maxClock: 251 }),
    ex({ maxClock: "100" }),
    ex({ extractor: 3 }),
    ex({ pressurizers: -1 }),
    ex({ pressurizers: 1.5 }),
    { ...full, extraction: { A: "x" } },
    { ...full, mode: "auto" },
    { ...full, objective: "x" },
    { ...full, allowAlternates: "yes" },
    { ...full, excluded: [1] },
    { ...full, imports: "a" },
  ];
  for (const b of bad) {
    assertEqual(decodeState(btoa(JSON.stringify(b)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_")), null, JSON.stringify(b));
  }
  const { s } = mk();
  s.loadInitialState();
  s.update({ sloops: { a: 9 } });
  assertEqual(s.getState().sloops, {}, "update verwirft ungültigen Patch");
  const storage = fakeStorage();
  storage.m.set("sfcalc.last", JSON.stringify({ ...full, sloops: { a: 9 } }));
  assertEqual(mk("", storage).s.loadInitialState().targets, []);
});

test("i18n: de und en haben dieselben Keys", () => {
  const de = dictKeys("de");
  const en = dictKeys("en");
  assertEqual(de.filter((k) => !en.includes(k)), [], "nur in de");
  assertEqual(en.filter((k) => !de.includes(k)), [], "nur in en");
  assertEqual(de.length > 0, true);
});

test("i18n: t mit Parametern, Fallback, Sprache", () => {
  setLang("de");
  assertEqual(getLang(), "de");
  assertEqual(t("machine.clock", { clock: "83,3" }), "bei 83,3 %");
  assertEqual(t("empty.state"), "Füge ein Produkt hinzu, um deine Fabrik zu planen.");
  assertEqual(t("error.cycle", { items: "A, B" }).includes("A, B"), true);
  assertEqual(t("gibt.es.nicht"), "gibt.es.nicht");
  setLang("en");
  assertEqual(t("empty.state"), "Add a product to start planning your factory.");
  assertEqual(t("machine.clock", { clock: "50" }), "at 50 %");
  setLang("xx");
  assertEqual(getLang(), "en");
});

test("i18n: localName mit Fallbacks", () => {
  setLang("de");
  assertEqual(localName({ id: "i", name: { de: "Eisen", en: "Iron" } }), "Eisen");
  assertEqual(localName({ id: "i", name: { en: "Iron" } }), "Iron");
  assertEqual(localName({ id: "i", name: {} }), "i");
  assertEqual(localName({ id: "i" }), "i");
  setLang("en");
  assertEqual(localName({ id: "i", name: { de: "Eisen", en: "Iron" } }), "Iron");
});

test("i18n: formatNumber und formatRate", () => {
  setLang("de");
  assertEqual(formatNumber(1234.5), "1.234,5");
  assertEqual(formatNumber(83.3333), "83,33");
  assertEqual(formatRate(30, "solid"), "30 /min");
  assertEqual(formatRate(240, "fluid"), "240 m³/min");
  setLang("en");
  assertEqual(formatNumber(1234.5), "1,234.5");
  assertClose(Number(formatNumber(2.456).replace(",", ".")), 2.46, 1e-9);
  assertEqual(formatRate(1.5, "gas"), "1.5 m³/min");
  setLang("de");
});
