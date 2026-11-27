// recipes.js — Bereich „Rezepte“: Segment Manuell | Optimiert.
// Manuell: je Nicht-Rohstoff-Item im Ergebnis ein Select (Standard zuerst, dann weitere Rezepte alphabetisch);
// Items mit nur einem Rezept zeigen den Rezeptnamen gedämpft.
// Optimiert: Ziel, Alternativrezepte ja/nein, genutzte Rezepte mit „Ausschließen“, ausgeschlossene mit „Wieder erlauben“.
import { h, clear, setPendingFocus } from "./dom.js";
import { t, getLang, formatNumber } from "../i18n.js";
import { update } from "../state.js";
import { itemLabel, recipeName, isUnpackage, unitFor } from "./common.js";

let byItem = null;

/** Rezepte je Item (erster Output), ohne Entpack-Rezepte. */
function recipesByItem(data) {
  if (byItem) return byItem;
  byItem = new Map();
  for (const r of Object.values(data.recipes)) {
    const first = r.outputs && r.outputs[0];
    if (!first || isUnpackage(r.id)) continue;
    if (!byItem.has(first.item)) byItem.set(first.item, []);
    byItem.get(first.item).push(r);
  }
  return byItem;
}

function optionsFor(data, id) {
  const all = recipesByItem(data).get(id) || [];
  const def = data.items[id] ? data.items[id].defaultRecipe : null;
  const lang = getLang();
  const byName = (a, b) => recipeName(a).localeCompare(recipeName(b), lang);
  const head = all.filter((r) => r.id === def);
  const normal = all.filter((r) => r.id !== def && !r.alternate).sort(byName);
  const alt = all.filter((r) => r.id !== def && r.alternate).sort(byName);
  return [...head, ...normal, ...alt];
}

/** Items in rows-Reihenfolge plus missingRecipe; bei Zyklus die gewählten und die betroffenen Items. */
function itemsToShow(state, result, data) {
  const out = [];
  const add = (id) => {
    const it = data.items[id];
    if (it && !it.raw && !out.includes(id)) out.push(id);
  };
  if (result.error) {
    Object.keys(state.recipes).forEach(add);
    (result.items || []).forEach(add);
  } else {
    result.rows.forEach((r) => add(r.item));
    result.raw.filter((r) => r.missingRecipe).forEach((r) => add(r.item));
  }
  return out;
}

function choose(id, recipeId, def) {
  update((st) => {
    const recipes = { ...st.recipes };
    if (recipeId === def) delete recipes[id];
    else recipes[id] = recipeId;
    return { recipes };
  });
}

function manualList(state, result, data) {
  const list = h("ul", { class: "recipe-list" });
  for (const id of itemsToShow(state, result, data)) {
    const name = itemLabel(data, id);
    const opts = optionsFor(data, id);
    const def = data.items[id].defaultRecipe;
    if (opts.length === 0) {
      list.append(
        h("li", { class: "recipe-item" }, h("span", { class: "recipe-label" }, name),
          h("span", { class: "muted small" }, t("recipes.missing", { name }))),
      );
      continue;
    }
    if (opts.length === 1) {
      list.append(
        h("li", { class: "recipe-item" }, h("span", { class: "recipe-label" }, name),
          h("span", { class: "muted small" }, recipeName(opts[0]))),
      );
      continue;
    }
    const chosen = opts.some((r) => r.id === state.recipes[id]) ? state.recipes[id] : def;
    const selId = `recipe-select-${id}`;
    const select = h(
      "select",
      {
        id: selId,
        class: chosen !== def ? "select is-alt" : "select",
        "data-fkey": `recipe-${id}`,
        onchange: (e) => choose(id, e.target.value, def),
      },
      opts.map((r) =>
        h(
          "option",
          { value: r.id, selected: r.id === chosen },
          r.alternate ? `${recipeName(r)} (${t("recipes.alternate")})` : recipeName(r),
        ),
      ),
    );
    list.append(h("li", { class: "recipe-item" }, h("label", { class: "recipe-label", for: selId }, name), select));
  }
  return list;
}

function modeSegment(state) {
  const btn = (mode, key) =>
    h(
      "button",
      {
        type: "button",
        class: "seg-btn",
        "aria-pressed": state.mode === mode ? "true" : "false",
        "data-fkey": `mode-${mode}`,
        onclick: () => {
          // Moduswechsel lässt state.recipes unverändert.
          if (state.mode !== mode) update({ mode });
        },
      },
      t(key),
    );
  return h(
    "div",
    { class: "segment", role: "group", "aria-label": t("mode.label") },
    btn("manual", "mode.manual"),
    btn("optimized", "mode.optimized"),
  );
}

/** Rezeptname mit Alternativ-Badge; id für aria-describedby der Textknöpfe. */
function recipeText(data, rid, id) {
  const r = data.recipes[rid];
  return h(
    "span",
    { class: "recipe-name", id },
    r ? recipeName(r) : rid,
    r && r.alternate ? h("span", { class: "badge" }, t("recipes.alternate")) : null,
  );
}

function exclude(rid) {
  setPendingFocus(`allow-${rid}`);
  update((st) => ({ excluded: st.excluded.includes(rid) ? st.excluded : [...st.excluded, rid] }));
}

function allow(rid) {
  setPendingFocus(`exclude-${rid}`);
  update((st) => ({ excluded: st.excluded.filter((x) => x !== rid) }));
}

function recipeLine(data, rid, idPrefix, label, fkey, onclick) {
  const nameId = `${idPrefix}-${rid}`;
  return h(
    "li",
    { class: "recipe-line" },
    recipeText(data, rid, nameId),
    h("button", { type: "button", class: "text-btn", "aria-describedby": nameId, "data-fkey": fkey, onclick }, label),
  );
}

/** Genutzte Rezepte je Item in Zeilenreihenfolge (mehrere Rezepte pro Item möglich). */
function usedByItem(result) {
  const out = new Map();
  if (result.error) return out;
  for (const row of result.rows) {
    if (!out.has(row.item)) out.set(row.item, []);
    if (!out.get(row.item).includes(row.recipe)) out.get(row.item).push(row.recipe);
  }
  return out;
}

function optimizedControls(state, result, data) {
  const objective = h(
    "select",
    {
      id: "objective-select",
      class: "select",
      "data-fkey": "objective",
      onchange: (e) => update({ objective: e.target.value }),
    },
    h("option", { value: "resources", selected: state.objective === "resources" }, t("objective.resources")),
    h("option", { value: "power", selected: state.objective === "power" }, t("objective.power")),
    h("option", { value: "max", selected: state.objective === "max" }, t("objective.max")),
  );
  const alternates = h("input", {
    type: "checkbox",
    id: "allow-alternates",
    class: "check",
    checked: state.allowAlternates,
    "data-fkey": "allow-alternates",
    onchange: (e) => update({ allowAlternates: e.target.checked }),
  });
  const parts = [
    h("div", { class: "recipe-item" }, h("label", { class: "recipe-label", for: "objective-select" }, t("objective.label")), objective),
    h("label", { class: "check-row", for: "allow-alternates" }, alternates, t("recipes.allowAlternates")),
  ];
  if (state.objective === "max") parts.push(...availableInputs(state, result, data));

  const used = usedByItem(result);
  if (used.size) {
    const list = h("ul", { class: "recipe-list" });
    for (const [id, rids] of used) {
      list.append(
        h(
          "li",
          { class: "recipe-item" },
          h("span", { class: "recipe-label" }, itemLabel(data, id)),
          h(
            "ul",
            { class: "recipe-lines" },
            rids.map((rid) => recipeLine(data, rid, "used", t("recipes.exclude"), `exclude-${rid}`, () => exclude(rid))),
          ),
        ),
      );
    }
    parts.push(h("h3", { class: "sub-title" }, t("recipes.used")), list);
  }

  if (state.excluded.length) {
    parts.push(
      h("h3", { class: "sub-title" }, t("recipes.excluded")),
      h(
        "ul",
        { class: "recipe-lines" },
        state.excluded.map((rid) => recipeLine(data, rid, "excluded", t("recipes.allow"), `allow-${rid}`, () => allow(rid))),
      ),
    );
  }
  return parts;
}

/** Eingabe der vorhandenen Rohstoffe (/min) für das Ziel "max". */
function availableInputs(state, result, data) {
  const ids = Object.keys(data.items)
    .filter((id) => data.items[id].raw)
    .sort((a, b) => itemLabel(data, a).localeCompare(itemLabel(data, b), getLang()));
  const list = h("ul", { class: "target-list" });
  for (const id of ids) {
    const name = itemLabel(data, id);
    const cur = state.available[id];
    const input = h("input", {
      type: "number",
      min: "0",
      step: "any",
      inputmode: "decimal",
      class: "rate-input num",
      "aria-label": t("available.for", { name }),
      "data-fkey": `avail-${id}`,
      value: cur === undefined ? "" : String(cur),
      onchange: (e) => {
        const v = e.target.valueAsNumber;
        update((st) => {
          const available = { ...st.available };
          if (Number.isFinite(v) && v > 0) available[id] = v;
          else delete available[id];
          return { available };
        });
      },
    });
    list.append(
      h(
        "li",
        { class: "target-row" },
        h("span", { class: "target-name", title: name }, name),
        h("span", { class: "rate-field" }, input, h("span", { class: "rate-unit" }, unitFor(data.items[id]))),
      ),
    );
  }
  const parts = [h("h3", { class: "sub-title" }, t("available.title")), h("p", { class: "muted small" }, t("available.hint")), list];
  if (!result.error && typeof result.scale === "number") {
    parts.push(h("p", { class: "small" }, t("available.scale", { pct: `${formatNumber(result.scale * 100, 1)} %` })));
  }
  return parts;
}

export function renderRecipes(root, state, result, data) {
  clear(root);
  root.hidden = state.targets.length === 0;
  if (root.hidden) return;
  root.setAttribute("aria-labelledby", "recipes-title");
  root.append(
    h("div", { class: "section-head" }, h("h2", { class: "section-title", id: "recipes-title" }, t("recipes.title")), modeSegment(state)),
  );
  if (state.mode === "optimized") root.append(...optimizedControls(state, result, data));
  else root.append(manualList(state, result, data));
}
