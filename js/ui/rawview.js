// rawview.js — Reiter „Rohstoffe“: Tabelle Rohstoff | Menge, darunter Überschuss.
import { h } from "./dom.js";
import { t } from "../i18n.js";
import { nameNode, qtyNode, itemLabel } from "./common.js";

function table(firstCol, entries, data, extra) {
  return h(
    "table",
    { class: "data-table small-table" },
    h("thead", {}, h("tr", {}, h("th", { scope: "col" }, firstCol), h("th", { scope: "col", class: "right" }, t("col.amount")))),
    h(
      "tbody",
      {},
      entries.map((e) =>
        h(
          "tr",
          {},
          h("td", {}, nameNode(data, e.item), extra ? extra(e) : null),
          h("td", { class: "right" }, qtyNode(data, e.item, e.rate, true)),
        ),
      ),
    ),
  );
}

export function rawView(result, data) {
  const missing = (e) =>
    e.missingRecipe ? h("div", { class: "muted small" }, t("recipes.missing", { name: itemLabel(data, e.item) })) : null;
  return h(
    "div",
    { class: "raw-view" },
    table(t("col.resource"), result.raw, data, missing),
    h("h3", { class: "sub-title", id: "surplus-title" }, t("kpi.surplus")),
    result.surplus.length ? table(t("col.product"), result.surplus, data) : h("p", { class: "muted" }, t("kpi.noSurplus")),
  );
}
