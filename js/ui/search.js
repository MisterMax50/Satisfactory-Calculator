// search.js — Item-Suche als Combobox (ARIA 1.2): Teilstring im Namen der aktuellen Sprache,
// Treffer am Wortanfang zuerst, max. 12 Treffer, ↑/↓/Enter/Escape und Maus.
import { h, clear } from "./dom.js";
import { t, getLang, localName } from "../i18n.js";
import { fluidMark } from "./common.js";

const MAX = 12;

/** Suchbare Items: Rohstoffe und Output irgendeines Rezepts. */
function candidates(data) {
  const ids = new Set();
  for (const r of Object.values(data.recipes)) for (const o of r.outputs || []) ids.add(o.item);
  return Object.values(data.items).filter((it) => it.raw || ids.has(it.id));
}

function rank(name, q) {
  const i = name.indexOf(q);
  if (i < 0) return -1;
  if (i === 0) return 0;
  return /[\s\-–(/]/.test(name[i - 1]) ? 1 : 2;
}

export function createSearch(data, onPick) {
  const pool = candidates(data);
  const label = h("label", { for: "target-search", class: "sr-only" });
  const input = h("input", {
    id: "target-search",
    type: "text",
    class: "text-input",
    role: "combobox",
    autocomplete: "off",
    spellcheck: "false",
    "aria-autocomplete": "list",
    "aria-expanded": "false",
    "aria-controls": "target-search-list",
    "data-fkey": "search",
  });
  const listbox = h("ul", { id: "target-search-list", role: "listbox", class: "combo-list", hidden: true });
  const el = h("div", { class: "combo" }, label, input, listbox);

  let matches = [];
  let active = -1;
  let lang = null;

  function find(query) {
    const q = query.trim().toLocaleLowerCase();
    if (!q) return [];
    const l = getLang();
    const hits = [];
    for (const it of pool) {
      const name = localName(it);
      const r = rank(name.toLocaleLowerCase(), q);
      if (r >= 0) hits.push({ it, name, r });
    }
    hits.sort((a, b) => a.r - b.r || a.name.localeCompare(b.name, l));
    return hits.slice(0, MAX);
  }

  function setActive(i) {
    active = i;
    const opts = listbox.querySelectorAll('[role="option"]:not([aria-disabled])');
    opts.forEach((o, j) => o.setAttribute("aria-selected", j === active ? "true" : "false"));
    if (active >= 0 && opts[active]) {
      input.setAttribute("aria-activedescendant", opts[active].id);
      opts[active].scrollIntoView({ block: "nearest" });
    } else input.removeAttribute("aria-activedescendant");
  }

  function open() {
    matches = find(input.value);
    clear(listbox);
    if (!input.value.trim()) return close();
    if (matches.length === 0) {
      listbox.append(h("li", { role: "option", class: "combo-empty", "aria-disabled": "true" }, t("targets.noResults")));
    }
    matches.forEach((m, i) =>
      listbox.append(
        h(
          "li",
          {
            id: `target-search-opt-${i}`,
            role: "option",
            class: "combo-option",
            "aria-selected": "false",
            onmousedown: (e) => e.preventDefault(),
            onclick: () => pick(i),
          },
          fluidMark(m.it),
          m.name,
        ),
      ),
    );
    listbox.hidden = false;
    input.setAttribute("aria-expanded", "true");
    setActive(matches.length ? 0 : -1);
  }

  function close() {
    listbox.hidden = true;
    clear(listbox);
    matches = [];
    active = -1;
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
  }

  function pick(i) {
    const m = matches[i];
    if (!m) return;
    input.value = "";
    close();
    onPick(m.it.id);
  }

  input.addEventListener("input", open);
  input.addEventListener("focusout", close);
  input.addEventListener("keydown", (e) => {
    const isOpen = !listbox.hidden;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!isOpen) open();
      else if (matches.length) setActive((active + 1) % matches.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (isOpen && matches.length) setActive(active <= 0 ? matches.length - 1 : active - 1);
    } else if (e.key === "Enter") {
      if (isOpen && matches.length) {
        e.preventDefault();
        pick(active >= 0 ? active : 0);
      }
    } else if (e.key === "Escape") {
      if (isOpen) {
        e.preventDefault();
        close();
      } else if (input.value) {
        e.preventDefault();
        input.value = "";
      }
    }
  });

  function refresh() {
    const l = getLang();
    label.textContent = t("targets.add");
    input.placeholder = t("targets.search");
    listbox.setAttribute("aria-label", t("targets.search"));
    if (lang !== null && lang !== l && !listbox.hidden) open();
    lang = l;
  }

  return { el, input, refresh };
}
