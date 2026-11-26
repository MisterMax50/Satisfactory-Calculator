// targets.js — Bereich „Ziele“: Zielzeilen (Name, Menge, Entfernen) und Item-Suche.
// Zeilen werden nur neu erzeugt, wenn sich Ziel-Liste oder Sprache ändern; beim Tippen bleiben Feld und Caret.
import { h, clear, setPendingFocus, focusKey } from "./dom.js";
import { t } from "../i18n.js";
import { getState, update } from "../state.js";
import { itemLabel, unitFor } from "./common.js";
import { createSearch } from "./search.js";

const DEFAULT_RATE = 10;

export function createTargets(root, data) {
  const title = h("h2", { class: "section-title", id: "targets-title" });
  const list = h("ul", { class: "target-list" });
  const search = createSearch(data, pick);
  root.setAttribute("aria-labelledby", "targets-title");
  root.append(title, list, search.el);

  const inputs = new Map();
  let key = null;

  function pick(id) {
    const st = getState();
    if (st.targets.some(([i]) => i === id)) {
      focusRate(id);
      return;
    }
    update({ targets: [...st.targets, [id, DEFAULT_RATE]] });
  }

  function focusRate(id) {
    const el = inputs.get(id);
    if (!el) return;
    el.focus();
    try {
      el.select();
    } catch {
      /* number-Felder ohne Auswahl */
    }
  }

  function setRate(id, rate) {
    update((st) => ({ targets: st.targets.map(([i, r]) => (i === id ? [i, rate] : [i, r])) }));
  }

  function remove(id) {
    const ids = getState().targets.map(([i]) => i);
    const idx = ids.indexOf(id);
    const rest = ids.filter((i) => i !== id);
    setPendingFocus(rest.length ? `remove-${rest[Math.min(idx, rest.length - 1)]}` : "search");
    update((st) => ({ targets: st.targets.filter(([i]) => i !== id) }));
  }

  function row(id, rate) {
    const name = itemLabel(data, id);
    const nameId = `target-name-${id}`;
    const input = h("input", {
      type: "number",
      min: "0",
      step: "any",
      inputmode: "decimal",
      class: "rate-input num",
      "aria-label": t("targets.rateFor", { name }),
      "data-fkey": `rate-${id}`,
      value: String(rate),
    });
    input.addEventListener("input", () => {
      const v = input.valueAsNumber;
      if (Number.isFinite(v) && v > 0) setRate(id, v);
    });
    input.addEventListener("change", () => {
      const v = input.valueAsNumber;
      if (!(Number.isFinite(v) && v > 0)) {
        const cur = getState().targets.find(([i]) => i === id);
        if (cur) input.value = String(cur[1]);
      }
    });
    inputs.set(id, input);
    return h(
      "li",
      { class: "target-row" },
      h("span", { class: "target-name", id: nameId, title: name }, name),
      h("span", { class: "rate-field" }, input, h("span", { class: "rate-unit" }, unitFor(data.items[id]))),
      h(
        "button",
        {
          type: "button",
          class: "icon-btn",
          "aria-label": t("targets.remove"),
          "aria-describedby": nameId,
          "data-fkey": `remove-${id}`,
          onclick: () => remove(id),
        },
        "×",
      ),
    );
  }

  function render(state) {
    title.textContent = t("targets.title");
    search.refresh();
    const k = `${state.lang}|${state.targets.map(([i]) => i).join(",")}`;
    if (k !== key) {
      key = k;
      inputs.clear();
      clear(list);
      for (const [id, rate] of state.targets) list.append(row(id, rate));
      list.hidden = state.targets.length === 0;
      return;
    }
    // Gleiche Ziele: nur Werte nachziehen (z. B. nach Plan laden), nie das Feld unter dem Cursor.
    for (const [id, rate] of state.targets) {
      const input = inputs.get(id);
      if (input && input !== document.activeElement && input.valueAsNumber !== rate) input.value = String(rate);
    }
  }

  return { render, focusRate, focusSearch: () => focusKey("search") };
}
