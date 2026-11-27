// progress.js (UI) — Reiter „Spielstand“: erreichtes Tier und freigeschaltete Alternativrezepte. Arbeitet auf den vollen Spieldaten.
import { h } from "./dom.js";
import { t, getLang, formatNumber } from "../i18n.js";
import { update } from "../state.js";
import { itemLabel, recipeName } from "./common.js";

const setProgress = (patch) => update((st) => ({ progress: { ...st.progress, ...patch } }));

export function progressView(state, data) {
  const { tier, alternates } = state.progress;
  const tierSelect = h(
    "select",
    {
      id: "progress-tier",
      class: "select progress-tier",
      "data-fkey": "progress-tier",
      onchange: (e) => setProgress({ tier: e.target.value === "" ? null : Number(e.target.value) }),
    },
    h("option", { value: "", selected: tier == null }, t("progress.allTiers")),
    Array.from({ length: 10 }, (_, n) => h("option", { value: String(n), selected: tier === n }, t("progress.tier", { n }))),
  );
  const alts = Object.values(data.recipes)
    .filter((r) => r.alternate)
    .map((r) => ({ r, label: `${recipeName(r)} (${itemLabel(data, r.outputs[0].item)})` }))
    .sort((a, b) => a.label.localeCompare(b.label, getLang()));
  const owned = new Set(alternates || []);
  const allToggle = h(
    "label",
    { class: "check-row" },
    h("input", {
      type: "checkbox",
      class: "check",
      checked: alternates == null,
      "data-fkey": "progress-allalts",
      onchange: (e) => setProgress({ alternates: e.target.checked ? null : [] }),
    }),
    t("progress.allAlternates"),
  );
  const list =
    alternates == null
      ? null
      : h(
          "ul",
          { class: "check-list" },
          alts.map(({ r, label }) =>
            h(
              "li",
              {},
              h(
                "label",
                { class: "check-row" },
                h("input", {
                  type: "checkbox",
                  class: "check",
                  checked: owned.has(r.id),
                  "data-fkey": `alt-${r.id}`,
                  onchange: (e) =>
                    update((st) => {
                      const set = new Set(st.progress.alternates || []);
                      if (e.target.checked) set.add(r.id);
                      else set.delete(r.id);
                      return { progress: { ...st.progress, alternates: [...set].sort() } };
                    }),
                }),
                label,
              ),
            ),
          ),
        );
  return h(
    "div",
    { class: "progress-view" },
    h("p", { class: "muted small" }, t("progress.hint")),
    h("label", { class: "sub-title progress-label", for: "progress-tier" }, t("progress.tierLabel")),
    h("div", {}, tierSelect),
    h("h3", { class: "sub-title" }, t("progress.alternates")),
    allToggle,
    alternates == null ? null : h("p", { class: "muted small" }, t("progress.count", { n: formatNumber(owned.size), total: formatNumber(alts.length) })),
    list,
  );
}
