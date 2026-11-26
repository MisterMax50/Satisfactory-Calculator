// production.js — Produktionsliste als Tabelle: Produkt · Maschine · Menge · Eingänge · Ausgänge · Strom.
import { h } from "./dom.js";
import { t, localName, formatNumber } from "../i18n.js";
import { ceilMachines } from "../solver.js";
import { nameNode, qtyNode, recipeName } from "./common.js";

const CLOCK_EPS = 1e-9;

function cell(label, cls, ...children) {
  return h("td", { class: cls, "data-label": label }, ...children);
}

function flowList(data, entries, mainItem) {
  return h(
    "ul",
    { class: "flow-list" },
    entries.map((e) =>
      h("li", { class: e.item === mainItem || mainItem === undefined ? "flow-row" : "flow-row muted" }, nameNode(data, e.item), qtyNode(data, e.item, e.rate)),
    ),
  );
}

function machineCell(row, data) {
  const n = ceilMachines(row.machines);
  const clock = n ? (row.machines / n) * 100 : 0;
  const building = data.buildings[row.building];
  return [
    h(
      "span",
      { class: "plate", title: t("machine.exact", { count: formatNumber(row.machines, 4) }) },
      `${formatNumber(n)} × ${localName(building) || row.building}`,
    ),
    clock < 100 - CLOCK_EPS ? h("div", { class: "muted small num" }, t("machine.clock", { clock: formatNumber(clock) })) : null,
  ];
}

export function productionTable(result, data) {
  const labels = {
    product: t("col.product"),
    machine: t("col.machine"),
    amount: t("col.amount"),
    inputs: t("col.inputs"),
    outputs: t("col.outputs"),
    power: t("col.power"),
  };
  const head = h(
    "thead",
    {},
    h(
      "tr",
      {},
      h("th", { scope: "col" }, labels.product),
      h("th", { scope: "col" }, labels.machine),
      h("th", { scope: "col", class: "right" }, labels.amount),
      h("th", { scope: "col" }, labels.inputs),
      h("th", { scope: "col" }, labels.outputs),
      h("th", { scope: "col", class: "right" }, labels.power),
    ),
  );
  const body = h("tbody");
  for (const row of result.rows) {
    const recipe = data.recipes[row.recipe];
    const main = row.outputs.filter((o) => o.item === row.item).reduce((s, o) => s + o.rate, 0);
    body.append(
      h(
        "tr",
        {},
        cell(
          labels.product,
          "col-product",
          h("div", { class: "prod-name" }, nameNode(data, row.item)),
          // Rezeptname nur zeigen, wenn er mehr sagt als der Itemname.
          recipe && !recipe.alternate && recipeName(recipe) === localName(data.items[row.item])
            ? null
            : h(
                "div",
                { class: "prod-recipe muted small" },
                recipe ? recipeName(recipe) : row.recipe,
                recipe && recipe.alternate ? h("span", { class: "badge" }, t("recipes.alternate")) : null,
              ),
        ),
        cell(labels.machine, "col-machine", machineCell(row, data)),
        cell(labels.amount, "right", qtyNode(data, row.item, main, true)),
        cell(labels.inputs, "col-flow", row.inputs.length ? flowList(data, row.inputs) : null),
        cell(labels.outputs, "col-flow", flowList(data, row.outputs, row.item)),
        cell(labels.power, "right", h("span", { class: "num" }, `${formatNumber(row.power)} ${t("unit.power")}`)),
      ),
    );
  }
  return h("table", { class: "data-table prod-table" }, head, body);
}
