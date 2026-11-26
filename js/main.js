// main.js — Einstiegspunkt: Zustand laden → Solver → UI rendern; bei jeder Store-Änderung neu rechnen.
import data from "../data/gamedata.js";
import { solve } from "./solver.js";
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

function render(state) {
  const focus = captureFocus();
  setLang(state.lang);
  document.documentElement.lang = state.lang;
  document.title = t("app.title");
  const result = solve({ targets: state.targets.map(([item, rate]) => ({ item, rate })), recipeChoice: state.recipes, data });
  renderHeader(els.head, state);
  targetsView.render(state);
  renderRecipes(els.recipes, state, result, data);
  plansView.render(state);
  renderResults(els.content, state, result, data);
  restoreFocus(focus);
}

const initial = loadInitialState();
render(initial);
subscribe(render);
if (initial.targets.length === 0) targetsView.focusSearch();
