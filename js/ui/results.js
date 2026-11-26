// results.js — Inhaltsbereich: leerer Zustand, Zyklus-Fehler, Kennzahlenleiste, Reiter mit den drei Ansichten.
import { h, clear } from "./dom.js";
import { t, formatNumber } from "../i18n.js";
import { itemLabel, flowNode } from "./common.js";
import { productionTable } from "./production.js";
import { treeView } from "./tree.js";
import { rawView } from "./rawview.js";

const TABS = [
  { id: "list", label: "tabs.list", view: productionTable },
  { id: "tree", label: "tabs.tree", view: treeView },
  { id: "raw", label: "tabs.raw", view: rawView },
];

// Gewählter Reiter lebt nur in der Sitzung (wird nicht gespeichert).
let activeTab = "list";
let hadError = false;

function kpi(label, value) {
  return h("div", { class: "kpi" }, h("dt", { class: "kpi-label" }, label), h("dd", { class: "kpi-value" }, value));
}

function kpiBar(result, data) {
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
    kpi(t("kpi.power"), `${formatNumber(result.power, 1)} ${t("unit.power")}`),
    kpi(t("kpi.machines"), formatNumber(result.machineCount)),
    kpi(t("kpi.raw"), rawValue),
    kpi(t("kpi.surplus"), surplus),
  );
}

function tabs(result, data) {
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
      h("div", { role: "tabpanel", class: "panel", id: `panel-${tab.id}`, "aria-labelledby": `tab-${tab.id}`, tabindex: "0" }, tab.view(result, data)),
    );
  }
  const list = h("div", { role: "tablist", class: "tablist", "aria-label": t("tabs.label") }, tabEls);
  select(activeTab, false);
  return [list, ...panels];
}

export function renderResults(root, state, result, data) {
  clear(root);
  if (!state.targets.length) {
    hadError = false;
    root.append(h("div", { class: "empty" }, h("p", {}, t("empty.state"))));
    return;
  }
  if (result.error) {
    const items = (result.items || []).map((id) => itemLabel(data, id)).join(", ");
    // Nur beim ersten Auftreten ansagen, nicht bei jedem Neu-Rendern.
    root.append(h("div", { class: "banner", role: hadError ? null : "alert" }, t("error.cycle", { items })));
    hadError = true;
    return;
  }
  hadError = false;
  root.append(kpiBar(result, data), ...tabs(result, data));
}
