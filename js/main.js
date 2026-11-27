// main.js — Einstiegspunkt: Zustand laden → Solver/Optimierer → Förderung → UI rendern; bei jeder Store-Änderung neu rechnen.
import data from "../data/gamedata.js";
import { solve } from "./solver.js";
import { optimize } from "./optimizer.js";
import { computeExtraction } from "./extraction.js";
import { loadInitialState, subscribe } from "./state.js";
import { setLang, t } from "./i18n.js";
import { captureFocus, restoreFocus } from "./ui/dom.js";
import { renderHeader } from "./ui/header.js";
import { createTargets } from "./ui/targets.js";
import { renderRecipes } from "./ui/recipes.js";
import { createPlans } from "./ui/plans.js";
import { renderResults } from "./ui/results.js";

const $ = (id) => document.getElementById(id);
const els = { head: $("app-head"), targets: $("targets"), recipes: $("recipes"), plans: $("plans"), content: $("content") };

const targetsView = createTargets(els.targets, data);
const plansView = createPlans(els.plans);

// Letztes Rechenergebnis; Sprache oder Förder-Einstellungen allein rechnen Solver/Optimierer nicht neu.
let lastKey = null;
let lastResult = null;

function compute(state) {
  const targets = state.targets.map(([item, rate]) => ({ item, rate }));
  const mods = { sloops: state.sloops, imports: state.imports };
  const optimized = state.mode === "optimized";
  const key = JSON.stringify(
    optimized
      ? [state.mode, targets, state.objective, state.allowAlternates, state.excluded, mods, state.available]
      : [state.mode, targets, state.recipes, mods],
  );
  if (key === lastKey) return lastResult;
  const result = optimized
    ? optimize({ targets, objective: state.objective, allowAlternates: state.allowAlternates, excluded: state.excluded, mods, data, available: state.available })
    : solve({ targets, recipeChoice: state.recipes, data, mods });
  lastKey = key;
  lastResult = result;
  return result;
}

function extractionFor(state, result) {
  if (result.error) return { rows: [], power: 0 };
  const raw = result.raw.filter((e) => !e.imported && !e.missingRecipe);
  return computeExtraction({ raw, settings: state.extraction, data });
}

function render(state) {
  const focus = captureFocus();
  setLang(state.lang);
  document.documentElement.lang = state.lang;
  document.title = t("app.title");
  const result = compute(state);
  const extraction = extractionFor(state, result);
  renderHeader(els.head, state);
  targetsView.render(state);
  renderRecipes(els.recipes, state, result, data);
  plansView.render(state);
  renderResults(els.content, state, result, extraction, data);
  restoreFocus(focus);
}

const initial = loadInitialState();
render(initial);
subscribe(render);
if (initial.targets.length === 0) targetsView.focusSearch();
