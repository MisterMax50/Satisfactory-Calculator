// i18n.js — UI-Texte de/en, Sprachumschaltung, Zahlenformat. Jeder sichtbare Text kommt von hier.

const dict = {
  de: {
    "app.title": "Satisfactory-Rechner",
    "targets.title": "Ziele",
    "targets.add": "Ziel hinzufügen",
    "targets.search": "Produkt suchen",
    "targets.noResults": "Kein Produkt gefunden",
    "targets.rate": "Menge pro Minute",
    "targets.remove": "Entfernen",
    "recipes.title": "Rezepte",
    "recipes.default": "Standard",
    "recipes.alternate": "Alternativ",
    "recipes.select": "Rezept für {name}",
    "recipes.missing": "Kein Rezept für {name} gefunden.",
    "kpi.power": "Strom",
    "kpi.machines": "Maschinen",
    "kpi.raw": "Rohstoffe",
    "kpi.surplus": "Überschuss",
    "kpi.noSurplus": "kein Überschuss",
    "tabs.list": "Produktionsliste",
    "tabs.tree": "Baum",
    "tabs.raw": "Rohstoffe",
    "col.product": "Produkt",
    "col.machine": "Maschine",
    "col.amount": "Menge",
    "col.inputs": "Eingänge",
    "col.outputs": "Ausgänge",
    "machine.clock": "bei {clock} %",
    "unit.perMin": "/min",
    "unit.m3PerMin": "m³/min",
    "unit.power": "MW",
    "lang.label": "Sprache",
    "lang.de": "Deutsch",
    "lang.en": "English",
    "share.copy": "Link kopieren",
    "share.copied": "Link kopiert",
    "plans.save": "Plan speichern",
    "plans.name": "Planname",
    "plans.saved": "Gespeicherte Pläne",
    "plans.load": "Laden",
    "plans.delete": "Löschen",
    "plans.none": "Noch keine Pläne gespeichert.",
    "empty.state": "Füge ein Produkt hinzu, um deine Fabrik zu planen.",
    "error.cycle": "Diese Rezeptkombination lässt sich nicht ausgleichen: {items}. Wähle für eines davon ein anderes Rezept.",
    "targets.rateFor": "Menge pro Minute für {name}",
    "lang.deShort": "DE",
    "lang.enShort": "EN",
    "kpi.title": "Kennzahlen",
    "tabs.label": "Ansicht",
    "col.power": "Strom",
    "col.resource": "Rohstoff",
    "machine.exact": "Genau {count} Maschinen",
    "tree.cycle": "Wiederholt sich, weiter oben bereits aufgeführt",
    "share.link": "Link zum Plan",
    "share.manual": "Link markiert, jetzt kopieren.",
    "plans.title": "Pläne",
  },
  en: {
    "app.title": "Satisfactory calculator",
    "targets.title": "Targets",
    "targets.add": "Add target",
    "targets.search": "Search product",
    "targets.noResults": "No product found",
    "targets.rate": "Amount per minute",
    "targets.remove": "Remove",
    "recipes.title": "Recipes",
    "recipes.default": "Default",
    "recipes.alternate": "Alternate",
    "recipes.select": "Recipe for {name}",
    "recipes.missing": "No recipe found for {name}.",
    "kpi.power": "Power",
    "kpi.machines": "Machines",
    "kpi.raw": "Raw resources",
    "kpi.surplus": "Surplus",
    "kpi.noSurplus": "no surplus",
    "tabs.list": "Production list",
    "tabs.tree": "Tree",
    "tabs.raw": "Raw resources",
    "col.product": "Product",
    "col.machine": "Machine",
    "col.amount": "Amount",
    "col.inputs": "Inputs",
    "col.outputs": "Outputs",
    "machine.clock": "at {clock} %",
    "unit.perMin": "/min",
    "unit.m3PerMin": "m³/min",
    "unit.power": "MW",
    "lang.label": "Language",
    "lang.de": "Deutsch",
    "lang.en": "English",
    "share.copy": "Copy link",
    "share.copied": "Link copied",
    "plans.save": "Save plan",
    "plans.name": "Plan name",
    "plans.saved": "Saved plans",
    "plans.load": "Load",
    "plans.delete": "Delete",
    "plans.none": "No plans saved yet.",
    "empty.state": "Add a product to start planning your factory.",
    "error.cycle": "This recipe combination cannot be balanced: {items}. Pick a different recipe for one of them.",
    "targets.rateFor": "Amount per minute for {name}",
    "lang.deShort": "DE",
    "lang.enShort": "EN",
    "kpi.title": "Key figures",
    "tabs.label": "View",
    "col.power": "Power",
    "col.resource": "Resource",
    "machine.exact": "Exactly {count} machines",
    "tree.cycle": "Repeats, already listed above",
    "share.link": "Plan link",
    "share.manual": "Link selected, copy it now.",
    "plans.title": "Plans",
  },
};

let lang = "de";
const warned = new Set();
const formatters = new Map();

export function setLang(l) {
  if (l === "de" || l === "en") lang = l;
}

export function getLang() {
  return lang;
}

export function t(key, params) {
  let s = dict[lang] && dict[lang][key];
  if (s === undefined) s = dict.en[key];
  if (s === undefined) {
    if (!warned.has(key)) {
      warned.add(key);
      console.warn(`i18n: fehlender Key "${key}"`);
    }
    return key;
  }
  if (params) s = s.replace(/\{(\w+)\}/g, (m, k) => (k in params ? String(params[k]) : m));
  return s;
}

export function localName(obj) {
  if (!obj) return "";
  const n = obj.name;
  if (n && typeof n === "object") return n[lang] || n.en || obj.id || "";
  if (typeof n === "string") return n;
  return obj.id || "";
}

export const itemName = localName;

export function formatNumber(n, maxFrac = 2) {
  const key = `${lang}:${maxFrac}`;
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat(lang === "de" ? "de-DE" : "en-US", { maximumFractionDigits: maxFrac });
    formatters.set(key, f);
  }
  return f.format(n);
}

export function formatRate(n, form) {
  const unit = form === "fluid" || form === "gas" ? t("unit.m3PerMin") : t("unit.perMin");
  return `${formatNumber(n)} ${unit}`;
}
