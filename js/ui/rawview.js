// rawview.js — Reiter „Rohstoffe“: Förder-Tabelle Rohstoff · Menge · Förderanlage · Reinheit · Max. Takt · Ergebnis · Strom
// mit Summenzeile, darunter „Zugeliefert“ (Importe mit „Selbst herstellen“) und Überschuss.
// Einstellungen landen in state.extraction[item]; Standardwerte entfernen den Eintrag.
import { h, setPendingFocus } from "./dom.js";
import { t, localName, formatNumber } from "../i18n.js";
import { getState, update } from "../state.js";
import { defaultExtraction, extractorsFor, hasPurity, MIN_CLOCK, MAX_CLOCK } from "../extraction.js";
import { nameNode, qtyNode, itemLabel } from "./common.js";

const PURITIES = ["impure", "normal", "pure"];

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

function cell(label, cls, ...children) {
  return h("td", { class: cls, "data-label": label }, ...children);
}

const mw = (v) => `${formatNumber(v)} ${t("unit.power")}`;

/** Schreibt state.extraction[item]; gleich Standard (ohne Kompressor-Vorgabe) → Eintrag entfernen. */
function setExtraction(data, item, patch) {
  update((st) => {
    const def = defaultExtraction(item, data);
    if (!def) return {};
    const next = { ...def, ...(st.extraction[item] || {}), ...patch };
    const ex = data.extractors[next.extractor];
    if (!ex) return {};
    if (!hasPurity(ex)) next.purity = def.purity;
    if (ex.kind !== "well" || next.pressurizers === undefined) delete next.pressurizers;
    const extraction = { ...st.extraction };
    const isDefault =
      next.extractor === def.extractor && next.purity === def.purity && next.maxClock === def.maxClock && next.pressurizers === undefined;
    if (isDefault) delete extraction[item];
    else extraction[item] = next;
    return { extraction };
  });
}

function numberField({ value, min, max, label, fkey, unit, onValue, onReset }) {
  const input = h("input", {
    type: "number",
    min: String(min),
    max: max === undefined ? null : String(max),
    step: "1",
    inputmode: "numeric",
    class: "rate-input num",
    "aria-label": label,
    "data-fkey": fkey,
    value: String(value),
  });
  const valid = (v) => Number.isFinite(v) && v >= min && (max === undefined || v <= max);
  input.addEventListener("input", () => {
    const v = input.valueAsNumber;
    if (valid(v)) onValue(v);
  });
  input.addEventListener("change", () => {
    const v = input.valueAsNumber;
    if (!valid(v)) onReset(input);
  });
  return h("span", { class: "rate-field" }, input, unit ? h("span", { class: "rate-unit" }, unit) : null);
}

function extractionRow(e, row, data, labels) {
  const name = itemLabel(data, e.item);
  const ex = data.extractors[row.extractor];
  const exSelect = h(
    "select",
    {
      class: "select",
      "aria-label": t("raw.extractorFor", { name }),
      "data-fkey": `extractor-${e.item}`,
      onchange: (ev) => setExtraction(data, e.item, { extractor: ev.target.value }),
    },
    extractorsFor(e.item, data).map((id) =>
      h("option", { value: id, selected: id === row.extractor }, localName(data.extractors[id]) || id),
    ),
  );
  const purity = hasPurity(ex)
    ? h(
        "select",
        {
          class: "select",
          "aria-label": t("raw.purityFor", { name }),
          "data-fkey": `purity-${e.item}`,
          onchange: (ev) => setExtraction(data, e.item, { purity: ev.target.value }),
        },
        PURITIES.map((p) => h("option", { value: p, selected: p === row.purity }, t(`purity.${p}`))),
      )
    : null;
  const clock = numberField({
    value: Math.round(row.clock * 10000) / 100,
    min: MIN_CLOCK,
    max: MAX_CLOCK,
    label: t("raw.maxClockFor", { name }),
    fkey: `clock-${e.item}`,
    unit: "%",
    onValue: (v) => setExtraction(data, e.item, { maxClock: v }),
    onReset: (input) => {
      input.value = String(Math.round(row.clock * 10000) / 100);
    },
  });
  const resultText = t("raw.resultText", {
    count: formatNumber(row.count),
    name: localName(ex) || row.extractor,
    clock: formatNumber(row.clockEffective * 100, 2),
  });
  const pressurizers =
    ex.kind === "well"
      ? h(
          "div",
          { class: "press-field" },
          h("span", { class: "muted small" }, t("raw.pressurizers")),
          numberField({
            value: row.pressurizers,
            min: 0,
            label: t("raw.pressurizersFor", { name }),
            fkey: `press-${e.item}`,
            onValue: (v) => setExtraction(data, e.item, { pressurizers: Math.floor(v) }),
            // Leeres oder ungültiges Feld beim Verlassen: zurück zur Schätzung.
            onReset: () => setExtraction(data, e.item, { pressurizers: undefined }),
          }),
          row.pressurizersEstimate ? h("span", { class: "muted small" }, t("raw.estimate")) : null,
        )
      : null;
  return h(
    "tr",
    {},
    cell(labels.item, "col-product", nameNode(data, e.item)),
    cell(labels.amount, "right", qtyNode(data, e.item, e.rate, true)),
    cell(labels.extractor, "col-select", exSelect),
    cell(labels.purity, "col-select", purity),
    cell(labels.maxClock, "", clock),
    cell(labels.result, "", h("div", { class: "num" }, resultText), pressurizers),
    cell(labels.power, "right", h("span", { class: "num" }, mw(row.power))),
  );
}

function plainRow(e, data, labels) {
  return h(
    "tr",
    {},
    cell(
      labels.item,
      "col-product",
      nameNode(data, e.item),
      e.missingRecipe ? h("div", { class: "muted small" }, t("recipes.missing", { name: itemLabel(data, e.item) })) : null,
    ),
    cell(labels.amount, "right", qtyNode(data, e.item, e.rate, true)),
    cell(labels.extractor, ""),
    cell(labels.purity, ""),
    cell(labels.maxClock, ""),
    cell(labels.result, ""),
    cell(labels.power, "right"),
  );
}

function extractionTable(entries, extraction, data) {
  const labels = {
    item: t("raw.item"),
    amount: t("raw.amount"),
    extractor: t("raw.extractor"),
    purity: t("raw.purity"),
    maxClock: t("raw.maxClock"),
    result: t("raw.result"),
    power: t("raw.power"),
  };
  const byItem = new Map(extraction.rows.map((r) => [r.item, r]));
  const th = (text, cls) => h("th", { scope: "col", class: cls }, text);
  return h(
    "table",
    { class: "data-table raw-table" },
    h(
      "thead",
      {},
      h(
        "tr",
        {},
        th(labels.item),
        th(labels.amount, "right"),
        th(labels.extractor),
        th(labels.purity),
        th(labels.maxClock),
        th(labels.result),
        th(labels.power, "right"),
      ),
    ),
    h(
      "tbody",
      {},
      entries.map((e) => (byItem.has(e.item) ? extractionRow(e, byItem.get(e.item), data, labels) : plainRow(e, data, labels))),
    ),
    h(
      "tfoot",
      {},
      h(
        "tr",
        { class: "sum-row" },
        h("th", { scope: "row", class: "col-product" }, t("raw.sum")),
        cell(labels.amount, "right"),
        cell(labels.extractor, ""),
        cell(labels.purity, ""),
        cell(labels.maxClock, ""),
        cell(labels.result, ""),
        cell(labels.power, "right", h("span", { class: "num" }, mw(extraction.power))),
      ),
    ),
  );
}

function removeImport(item) {
  setPendingFocus("tab-raw");
  update((st) => ({ imports: st.imports.filter((x) => x !== item) }));
}

export function rawView(result, data, ctx) {
  const state = (ctx && ctx.state) || getState();
  const extraction = (ctx && ctx.extraction) || { rows: [], power: 0 };
  const own = result.raw.filter((e) => !e.imported);
  const rawRate = new Map(result.raw.map((e) => [e.item, e.rate]));
  const imports = state.imports.map((item) => ({ item, rate: rawRate.get(item) || 0 }));
  const removeBtn = (e) =>
    h(
      "div",
      {},
      h(
        "button",
        {
          type: "button",
          class: "text-btn",
          "aria-label": t("import.removeFor", { name: itemLabel(data, e.item) }),
          "data-fkey": `unimport-${e.item}`,
          onclick: () => removeImport(e.item),
        },
        t("import.remove"),
      ),
    );
  return h(
    "div",
    { class: "raw-view" },
    own.length ? extractionTable(own, extraction, data) : null,
    imports.length ? [h("h3", { class: "sub-title" }, t("import.title")), table(t("col.product"), imports, data, removeBtn)] : null,
    h("h3", { class: "sub-title", id: "surplus-title" }, t("kpi.surplus")),
    result.surplus.length ? table(t("col.product"), result.surplus, data) : h("p", { class: "muted" }, t("kpi.noSurplus")),
  );
}
