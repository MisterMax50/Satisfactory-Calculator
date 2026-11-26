// recipes.js — Bereich „Rezepte“: je Nicht-Rohstoff-Item im Ergebnis ein Select (Standard zuerst,
// dann weitere Rezepte alphabetisch). Items mit nur einem Rezept zeigen den Rezeptnamen gedämpft.
import { h, clear } from "./dom.js";
import { t, getLang } from "../i18n.js";
import { update } from "../state.js";
import { itemLabel, recipeName, isUnpackage } from "./common.js";

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

export function renderRecipes(root, state, result, data) {
  clear(root);
  root.hidden = state.targets.length === 0;
  if (root.hidden) return;
  root.setAttribute("aria-labelledby", "recipes-title");
  root.append(h("h2", { class: "section-title", id: "recipes-title" }, t("recipes.title")));
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
  root.append(list);
}
