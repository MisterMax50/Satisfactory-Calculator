// tree.js — Baumansicht: verschachtelte <details open> je Knoten aus result.tree.
import { h } from "./dom.js";
import { t } from "../i18n.js";
import { nameNode, qtyNode, recipeName, itemLabel } from "./common.js";

const SEP = " – ";

function nodeView(node, data) {
  const item = data.items[node.item];
  const recipe = node.recipe ? data.recipes[node.recipe] : null;
  const parts = [nameNode(data, node.item), SEP, qtyNode(data, node.item, node.rate)];

  if (node.cycle) {
    return h(
      "div",
      { class: "tree-leaf", title: t("tree.cycle") },
      parts,
      recipe ? [SEP, recipeName(recipe)] : null,
      " ",
      h("span", { class: "cycle-mark", "aria-hidden": "true" }, "↺"),
      h("span", { class: "sr-only" }, t("tree.cycle")),
    );
  }
  if (!item || item.raw) return h("div", { class: "tree-leaf muted" }, parts);
  if (!recipe) {
    return h("div", { class: "tree-leaf muted" }, parts, SEP, t("recipes.missing", { name: itemLabel(data, node.item) }));
  }
  const label = [parts, SEP, h("span", { class: "muted" }, recipeName(recipe))];
  if (!node.children.length) return h("div", { class: "tree-leaf" }, label);
  return h(
    "details",
    { class: "tree-node", open: true },
    h("summary", {}, label),
    h("div", { class: "tree-children" }, node.children.map((c) => nodeView(c, data))),
  );
}

export function treeView(result, data) {
  return h("div", { class: "tree" }, result.tree.map((n) => nodeView(n, data)));
}
