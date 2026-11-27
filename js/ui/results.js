// results.js — Inhaltsbereich: leerer Zustand, Fehler (Zyklus/unlösbar), Kennzahlenleiste, Reiter mit den Ansichten.
// Ansichten bekommen (result, data, ctx) mit ctx = { state, extraction }.
import { h, clear } from "./dom.js";
import { t, formatNumber } from "../i18n.js";
import { itemLabel, flowNode } from "./common.js";
import { productionTable } from "./production.js";
import { treeView } from "./tree.js";
import { rawView } from "./rawview.js";
import { flowTab } from "./flow.js";
import { progressView } from "./progress.js";

const TABS = [
  { id: "list", label: "tabs.list", view: productionTable },
  { id: "tree", label: "tabs.tree", view: treeView },
  { id: "raw", label: "tabs.raw", view: rawView },
  { id: "flow", label: "tabs.flow", view: flowTab },
  // Spielstand ist auch ohne Ergebnis bedienbar und arbeitet auf den vollen Spieldaten.
  { id: "progress", label: "tabs.progress", view: (result, data, ctx) => progressView(ctx.state, ctx.allData), always: true },
];

// Gewählter Reiter lebt nur in der Sitzung (wird nicht gespeichert).
let activeTab = "list";
// Zuletzt angesagter Fehler (Art + Items); nur ein neuer Fehler wird erneut angesagt.
let lastError = null;

const ERROR_KEYS = {
  cycle: "error.cycle",
  infeasible: "error.infeasible",
  insufficient: "error.insufficient",
  unbounded: "error.unbounded",
};

function kpi(label, value, note) {
  return h(
    "div",
    { class: "kpi" },
    h("dt", { class: "kpi-label" }, label),
    h("dd", { class: "kpi-value" }, value),
    note ? h("dd", { class: "kpi-note muted small" }, note) : null,
  );
}

const mw = (v) => `${formatNumber(v, 1)} ${t("unit.power")}`;

function kpiBar(result, extraction, data) {
  const raw = [...result.raw].sort((a, b) => b.rate - a.rate);
  const top = raw.slice(0, 2);
  const rest = raw.length - top.length;
  const rawValue = top.length
    ? [
        top.map((e) => h("span", { class: "kpi-line" }, flowNode(data, e.item, e.rate, "kpi-flow"))),
        rest > 0 ? h("span", { class: "kpi-line muted" }, `+${formatNumber(rest)}`) : null,
      ]
    : "–";
  const surplus = result.surplus.length ? formatNumber(result.surplus.length) : t("kpi.noSurplus");
  return h(
    "dl",
    { class: "kpis", "aria-label": t("kpi.title") },
    kpi(
      t("kpi.power"),
      mw(result.power + extraction.power),
      extraction.power > 0 ? t("kpi.extraction", { power: mw(extraction.power) }) : null,
    ),
    kpi(t("kpi.machines"), formatNumber(result.machineCount)),
    kpi(t("kpi.raw"), rawValue),
    kpi(t("kpi.surplus"), surplus),
    result.sloopsTotal > 0 ? kpi(t("kpi.sloops"), formatNumber(result.sloopsTotal)) : null,
  );
}

function tabs(result, data, ctx) {
  const tabEls = [];
  const panels = [];
  const select = (id, focus) => {
    activeTab = id;
    TABS.forEach((tab, i) => {
      const on = tab.id === id;
      tabEls[i].setAttribute("aria-selected", on ? "true" : "false");
      tabEls[i].tabIndex = on ? 0 : -1;
      panels[i].hidden = !on;
      if (on && focus) tabEls[i].focus();
    });
  };
  const onKey = (e) => {
    const i = TABS.findIndex((tab) => tab.id === activeTab);
    let next = -1;
    if (e.key === "ArrowRight") next = (i + 1) % TABS.length;
    else if (e.key === "ArrowLeft") next = (i - 1 + TABS.length) % TABS.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = TABS.length - 1;
    if (next < 0) return;
    e.preventDefault();
    select(TABS[next].id, true);
  };
  for (const tab of TABS) {
    tabEls.push(
      h(
        "button",
        {
          type: "button",
          role: "tab",
          class: "tab",
          id: `tab-${tab.id}`,
          "aria-controls": `panel-${tab.id}`,
          "data-fkey": `tab-${tab.id}`,
          onclick: () => select(tab.id, false),
          onkeydown: onKey,
        },
        t(tab.label),
      ),
    );
    panels.push(
      h(
        "div",
        { role: "tabpanel", class: "panel", id: `panel-${tab.id}`, "aria-labelledby": `tab-${tab.id}`, tabindex: "0" },
        ctx.message && !tab.always ? null : tab.view(result, data, ctx),
      ),
    );
  }
  const list = h("div", { role: "tablist", class: "tablist", "aria-label": t("tabs.label") }, tabEls);
  select(activeTab, false);
  return [list, ...panels];
}

// data: Spieldaten ohne gesperrte Rezepte; allData: volle Spieldaten (für den Reiter „Spielstand“).
export function renderResults(root, state, result, extraction, data, allData = data) {
  clear(root);
  const ctx = { state, extraction, allData };
  if (!state.targets.length) {
    lastError = null;
    ctx.message = h("div", { class: "empty" }, h("p", {}, t("empty.state")));
  } else if (result.error) {
    const items = (result.items || []).map((id) => itemLabel(data, id)).join(", ");
    const key = `${result.error}:${(result.items || []).join(",")}`;
    // Nur beim ersten Auftreten ansagen, nicht bei jedem Neu-Rendern.
    ctx.message = h("div", { class: "banner", role: lastError === key ? null : "alert" }, t(ERROR_KEYS[result.error] || "error.cycle", { items }));
    lastError = key;
  } else lastError = null;
  // Ohne Ergebnis: Hinweis statt Kennzahlen, Ergebnis-Reiter bleiben leer.
  root.append(ctx.message || kpiBar(result, extraction, data), ...tabs(result, data, ctx));
}
