// common.js — gemeinsame Anzeige-Bausteine: Itemnamen, Mengen mit Fluid-Markierung, Rezeptnamen.
import { h } from "./dom.js";
import { t, localName, formatRate } from "../i18n.js";

export const isFluid = (item) => !!item && (item.form === "fluid" || item.form === "gas");

export function itemLabel(data, id) {
  return localName(data.items[id]) || id;
}

export function unitFor(item) {
  return isFluid(item) ? t("unit.m3PerMin") : t("unit.perMin");
}

/** 8px-Quadrat in Rohrblau vor Fluid-Namen/-Mengen, bei Stückgut nichts. */
export function fluidMark(item) {
  return isFluid(item) ? h("span", { class: "fluid-mark", "aria-hidden": "true" }) : null;
}

/** URL des Spiel-Icons (data/icons, tools/fetch_icons.py); vorhanden für alle Rohstoffe und den Geysir. */
export const iconUrl = (id) => new URL(`../../data/icons/${id}.png`, import.meta.url).href;

/** Icon vor Rohstoffnamen (dekorativ, der Name folgt), sonst nichts. */
export function iconNode(item) {
  return item && item.raw ? h("img", { class: "item-icon", src: iconUrl(item.id), alt: "", width: 20, height: 20, loading: "lazy" }) : null;
}

/** Itemname, bei Rohstoffen mit Icon, bei Fluiden mit Markierung. */
export function nameNode(data, id) {
  const item = data.items[id];
  return h("span", { class: "item-name" }, iconNode(item), fluidMark(item), itemLabel(data, id));
}

/** Menge mit Einheit („120 /min“ bzw. „30 m³/min“), optional mit Fluid-Markierung. */
export function qtyNode(data, id, rate, withMark = false) {
  const item = data.items[id];
  return h("span", { class: "num" }, withMark ? fluidMark(item) : null, formatRate(rate, item ? item.form : "solid"));
}

/** Name + Menge in einer Zeile (Eingänge/Ausgänge, Rohstoff-Kachel). */
export function flowNode(data, id, rate, cls = "flow") {
  return h("span", { class: cls }, nameNode(data, id), " ", qtyNode(data, id, rate));
}

/** Rezeptname ohne Präfix „Alternate: “ / „Alternativ: “. */
export function recipeName(recipe) {
  return localName(recipe).replace(/^\s*(Alternate|Alternativ)\s*:\s*/i, "");
}

/** Fehlende Rohstoffe für 100 % der Ziele (Optimierung „max“); null, wenn nichts fehlt. */
export function missingNode(data, missing) {
  if (!missing || !missing.length) return null;
  return h(
    "div",
    { class: "missing small" },
    h("p", {}, t("available.missing")),
    h("ul", { class: "missing-list" }, missing.map((m) => h("li", {}, flowNode(data, m.item, m.rate)))),
  );
}

export function isUnpackage(recipeId) {
  return recipeId.startsWith("Recipe_Unpackage");
}
