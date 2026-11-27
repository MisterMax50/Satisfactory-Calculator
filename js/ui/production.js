// production.js — Produktionsliste als Tabelle: Produkt · Maschine · Menge · Eingänge · Ausgänge · Strom.
// Maschinenspalte mit Somersloop-Auswahl (wenn das Gebäude Plätze hat), Produktspalte mit „Zuliefern“.
import { h, setPendingFocus } from "./dom.js";
import { t, localName, formatNumber } from "../i18n.js";
import { ceilMachines } from "../solver.js";
import { update } from "../state.js";
import { nameNode, qtyNode, recipeName, itemLabel } from "./common.js";

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

function setSloops(recipeId, n) {
  update((st) => {
    const sloops = { ...st.sloops };
    if (n > 0) sloops[recipeId] = n;
    else delete sloops[recipeId];
    return { sloops };
  });
}

function addImport(item) {
  setPendingFocus("tab-list");
  update((st) => ({ imports: st.imports.includes(item) ? st.imports : [...st.imports, item] }));
}

function sloopControl(row, data, building) {
  const slots = building && Number.isInteger(building.sloopSlots) ? building.sloopSlots : 0;
  if (slots <= 0) return null;
  const current = row.sloops || 0;
  const options = [];
  for (let i = 0; i <= slots; i++) options.push(h("option", { value: String(i), selected: i === current }, formatNumber(i)));
  const select = h(
    "select",
    {
      class: "select sloop-select",
      "aria-label": t("sloops.select", { name: itemLabel(data, row.item) }),
      "data-fkey": `sloops-${row.recipe}`,
      onchange: (e) => setSloops(row.recipe, Number(e.target.value)),
    },
    options,
  );
  const boost = current > 0 ? current * (building.sloopBoost || 0) * 100 : 0;
  return [
    h("label", { class: "sloop-field muted small" }, h("span", { "aria-hidden": "true" }, t("sloops.title")), select),
    current > 0
      ? h(
          "div",
          { class: "sloop-note small num" },
          `${t("sloops.boost", { pct: formatNumber(boost) })} · ${t("sloops.count", { n: formatNumber(row.sloopsTotal || 0) })}`,
        )
      : null,
  ];
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
    sloopControl(row, data, building),
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
          h("div", { class: "prod-name", id: `prod-${row.recipe}` }, nameNode(data, row.item)),
          // Rezeptname nur zeigen, wenn er mehr sagt als der Itemname.
          recipe && !recipe.alternate && recipeName(recipe) === localName(data.items[row.item])
            ? null
            : h(
                "div",
                { class: "prod-recipe muted small" },
                recipe ? recipeName(recipe) : row.recipe,
                recipe && recipe.alternate ? h("span", { class: "badge" }, t("recipes.alternate")) : null,
              ),
          h(
            "button",
            {
              type: "button",
              class: "text-btn import-btn",
              "aria-describedby": `prod-${row.recipe}`,
              "data-fkey": `import-${row.recipe}`,
              onclick: () => addImport(row.item),
            },
            t("import.add"),
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
