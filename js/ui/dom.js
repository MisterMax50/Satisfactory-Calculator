// dom.js — kleine DOM-Hilfen: h() baut Elemente ohne innerHTML, Fokus bleibt über Neu-Rendern erhalten.

const PROPS = new Set(["value", "checked", "selected", "disabled", "hidden", "open", "readOnly"]);

/**
 * h("button", { class: "btn", onclick: fn, "aria-label": "…" }, "Text", kind, [weitere])
 * Strings werden als Textknoten eingefügt; null/false/undefined werden übersprungen.
 */
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  append(el, children);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === "class") el.className = v;
      else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
      else if (PROPS.has(k)) el[k] = v;
      else el.setAttribute(k, v === true ? "" : String(v));
    }
  }
  return el;
}

export function append(el, children) {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function clear(el) {
  el.replaceChildren();
  return el;
}

// Fokus-Schlüssel: Elemente mit data-fkey bekommen nach dem Neu-Rendern den Fokus zurück.
let pending = null;

/** Nach dem nächsten Rendern dieses Element fokussieren (z. B. nach Entfernen einer Zeile). */
export function setPendingFocus(key) {
  pending = key;
}

export function captureFocus() {
  const el = document.activeElement;
  if (!el || el === document.body) return null;
  const key = el.dataset ? el.dataset.fkey : undefined;
  if (!key) return null;
  let sel = null;
  try {
    if (typeof el.selectionStart === "number") sel = [el.selectionStart, el.selectionEnd];
  } catch {
    sel = null;
  }
  return { el, key, sel };
}

export function focusKey(key) {
  const el = document.querySelector(`[data-fkey="${CSS.escape(key)}"]`);
  if (!el) return false;
  el.focus({ preventScroll: false });
  return true;
}

export function restoreFocus(captured) {
  if (pending) {
    const key = pending;
    pending = null;
    if (focusKey(key)) return;
  }
  if (!captured || document.contains(captured.el)) return;
  const el = document.querySelector(`[data-fkey="${CSS.escape(captured.key)}"]`);
  if (!el) return;
  el.focus({ preventScroll: true });
  if (captured.sel) {
    try {
      el.setSelectionRange(captured.sel[0], captured.sel[1]);
    } catch {
      /* nicht jedes Feld kennt eine Auswahl */
    }
  }
}
