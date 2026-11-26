// flow.js — Reiter „Fluss“: SVG-Darstellung des Fluss-Graphen (js/flowLayout.js) mit Verschieben, Zoom, Einpassen, Hervorhebung.
import { h, clear } from "./dom.js";
import { t, localName, formatNumber, formatRate } from "../i18n.js";
import { itemLabel, isFluid } from "./common.js";
import { ceilMachines } from "../result.js";
import { buildFlow } from "../flowLayout.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 3;
const LABEL_ZOOM = 0.45; // darunter keine Kantenbeschriftung
const READ_ZOOM = 0.85; // Startansicht: mindestens dieser Zoom, damit 12px-Beschriftungen lesbar sind
const FIT_PAD = 24;
const MIN_HEIGHT = 360; // Graph-Bereich: clamp(360px, Inhalt × Einpass-Zoom + 48px, min(70vh, 720px))
const MAX_HEIGHT = 720;
const MAX_HEIGHT_VH = 0.7;
const PAN_STEP = 40;
const ZOOM_STEP = 1.25;
const DRAG_THRESHOLD = 3;
const PAD_X = 10; // Innenabstand Text im Knoten
const MARK = 8; // Fluid-Markierung
const MARK_GAP = 4;
const LABEL_H = 18;
const LABEL_PAD = 6;

// Zoom/Position bleiben über Neu-Rendern erhalten, solange die Knotenmenge gleich bleibt.
let memory = { key: null, view: null, fitted: false, height: null, minK: MIN_ZOOM };

function s(tag, attrs, ...children) {
  const el = document.createElementNS(SVG_NS, tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      el.setAttribute(k, String(v));
    }
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Textbreite über Canvas messen (Schriften aus den CSS-Variablen); Schätzung als Rückfall.
let ctx = null;
const fonts = {};
const fontVar = (name) =>
  (fonts[name] ??= getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "sans-serif");
function textWidth(text, kind) {
  if (ctx === null) {
    try {
      ctx = document.createElement("canvas").getContext("2d") || false;
    } catch {
      ctx = false;
    }
  }
  const size = kind === "title" ? 15 : kind === "label" ? 12 : 13;
  if (!ctx) return text.length * size * 0.55;
  ctx.font = `500 ${size}px ${fontVar(kind === "title" ? "--font-display" : "--font-text")}`;
  return ctx.measureText(text).width;
}

/** Text auf Breite kürzen (mit „…“). */
function fit(text, kind, max) {
  if (textWidth(text, kind) <= max) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (textWidth(text.slice(0, mid) + "…", kind) <= max) lo = mid;
    else hi = mid - 1;
  }
  return text.slice(0, lo).trimEnd() + "…";
}

function rateText(data, id, rate) {
  const item = data.items[id];
  return formatRate(rate, item ? item.form : "solid");
}

/** Zwei Textzeilen eines Knotens. */
function nodeLines(n, data) {
  const name = itemLabel(data, n.item);
  const qty = rateText(data, n.item, n.rate);
  if (n.kind === "machine") {
    const building = data.buildings && data.buildings[n.row.building];
    return [`${formatNumber(ceilMachines(n.row.machines))} × ${localName(building) || n.row.building}`, name, false];
  }
  if (n.kind === "target") return [t("flow.target", { name }), qty, true];
  if (n.kind === "surplus") return [name, `${t("flow.surplus")} · ${qty}`, true];
  return [name, qty, true];
}

function nodeEl(n, data) {
  const [line1, line2, markFirst] = nodeLines(n, data);
  const fluid = isFluid(data.items[n.item]);
  const markLine = markFirst ? 1 : 2;
  const textX = (line) => PAD_X + (fluid && line === markLine ? MARK + MARK_GAP : 0);
  const max = (line) => n.w - PAD_X - textX(line);
  const mark = fluid
    ? s("rect", { class: "flow-mark", x: PAD_X, y: markLine === 1 ? 15 : 35, width: MARK, height: MARK })
    : null;
  return s(
    "g",
    {
      class: `flow-node flow-node--${n.kind}`,
      transform: `translate(${n.x} ${n.y})`,
      tabindex: 0,
      role: "img",
      "aria-label": `${line1}, ${line2}`,
      "data-fkey": `flow-node-${n.id}`,
      "data-id": n.id,
    },
    s("title", {}, `${line1} · ${line2}`),
    s("rect", { class: "flow-ring", x: -3, y: -3, width: n.w + 6, height: n.h + 6, rx: 6 }),
    s("rect", { class: "flow-box", x: 0.5, y: 0.5, width: n.w - 1, height: n.h - 1, rx: 4 }),
    mark,
    s("text", { class: "flow-line1", x: textX(1), y: 23 }, fit(line1, n.kind === "source" ? "sub" : "title", max(1))),
    s("text", { class: "flow-line2", x: textX(2), y: 43 }, fit(line2, n.kind === "machine" ? "sub" : "title", max(2))),
  );
}

/** Kantenbeschriftungen ohne Überlappung (größte Mengen zuerst); übrige nur bei Hervorhebung. */
function placeLabels(flow, data) {
  const boxes = flow.nodes.map((n) => ({ x1: n.x - 2, y1: n.y - 2, x2: n.x + n.w + 2, y2: n.y + n.h + 2 }));
  const out = new Map();
  const order = [...flow.edges].sort((a, b) => b.rate - a.rate || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const e of order) {
    const text = `${itemLabel(data, e.item)} ${rateText(data, e.item, e.rate)}`;
    const fluid = e.form === "fluid" || e.form === "gas";
    const w = Math.ceil(textWidth(text, "label")) + 2 * LABEL_PAD + (fluid ? MARK + MARK_GAP : 0);
    const box = { x1: e.labelX - w / 2, y1: e.labelY - LABEL_H / 2, x2: e.labelX + w / 2, y2: e.labelY + LABEL_H / 2 };
    const hit = boxes.some((b) => box.x1 < b.x2 && box.x2 > b.x1 && box.y1 < b.y2 && box.y2 > b.y1);
    if (!hit) boxes.push({ x1: box.x1 - 2, y1: box.y1 - 2, x2: box.x2 + 2, y2: box.y2 + 2 });
    out.set(e.id, { text, w, fluid, culled: hit });
  }
  return out;
}

function labelEl(e, info) {
  const x = e.labelX - info.w / 2;
  const textX = x + LABEL_PAD + (info.fluid ? MARK + MARK_GAP : 0);
  return s(
    "g",
    { class: `flow-label${info.culled ? " is-culled" : ""}`, "data-edge": e.id },
    s("rect", { class: "flow-pill", x, y: e.labelY - LABEL_H / 2, width: info.w, height: LABEL_H, rx: 3 }),
    info.fluid ? s("rect", { class: "flow-mark", x: x + LABEL_PAD, y: e.labelY - MARK / 2, width: MARK, height: MARK }) : null,
    s("text", { class: "flow-label-text", x: textX, y: e.labelY + 4 }, info.text),
  );
}

/**
 * Zeichnet den Fluss-Graphen in container (ersetzt dessen Inhalt).
 * @param {HTMLElement} container
 * @param {object} result  Result aus js/result.js
 * @param {{ targets }} state
 * @param {object} data
 */
export function renderFlow(container, result, state, data) {
  clear(container);
  const flow = buildFlow(result, state && state.targets, data);

  const key = flow.nodes.map((n) => n.id).sort().join("|");
  let view;
  let needsFit;
  if (memory.key === key && memory.fitted && memory.view) {
    view = { ...memory.view };
    needsFit = false;
  } else {
    memory = { key, view: null, fitted: false, height: null, minK: MIN_ZOOM };
    view = { k: 1, tx: FIT_PAD, ty: FIT_PAD };
    needsFit = true;
  }

  // Kanten, Beschriftungen, Knoten.
  const labels = placeLabels(flow, data);
  const edgeEls = new Map();
  const edgesOf = new Map(flow.nodes.map((n) => [n.id, []]));
  const edgeGroup = s("g", { class: "flow-edges" });
  const labelGroup = s("g", { class: "flow-labels" });
  for (const e of flow.edges) {
    const fluid = e.form === "fluid" || e.form === "gas";
    const path = s("path", { class: `flow-edge${fluid ? " is-fluid" : ""}`, d: e.path });
    const label = labelEl(e, labels.get(e.id));
    edgeGroup.append(path);
    labelGroup.append(label);
    edgeEls.set(e.id, { path, label });
    edgesOf.get(e.from).push(e.id);
    if (e.to !== e.from) edgesOf.get(e.to).push(e.id);
  }
  // Tab-Reihenfolge wie sichtbar: Spalte für Spalte, von oben nach unten.
  const visual = [...flow.nodes].sort((a, b) => a.layer - b.layer || a.y - b.y);
  const nodeGroup = s("g", { class: "flow-nodes" }, visual.map((n) => nodeEl(n, data)));
  const scene = s("g", { class: "flow-scene" }, edgeGroup, labelGroup, nodeGroup);
  const svg = s("svg", { class: "flow-svg", width: "100%", height: "100%" }, scene);

  const viewport = h("div", {
    class: "flow-viewport",
    tabindex: "0",
    role: "group",
    "aria-label": t("tabs.flow"),
    "data-fkey": "flow-graph",
  });
  viewport.append(svg);

  const zoomIn = h("button", { type: "button", class: "btn flow-btn", "aria-label": t("flow.zoomIn"), title: t("flow.zoomIn") }, "+");
  const zoomOut = h("button", { type: "button", class: "btn flow-btn", "aria-label": t("flow.zoomOut"), title: t("flow.zoomOut") }, "−");
  const fitBtn = h("button", { type: "button", class: "btn flow-btn", "aria-label": t("flow.fit") }, t("flow.fit"));
  const root = h("div", { class: "flow" }, viewport, h("div", { class: "flow-controls" }, zoomIn, zoomOut, fitBtn));
  if (!needsFit && memory.height) root.style.height = `${memory.height}px`;
  container.append(root);

  // Ansicht.
  const apply = () => {
    scene.setAttribute("transform", `translate(${view.tx} ${view.ty}) scale(${view.k})`);
    root.classList.toggle("is-far", view.k < LABEL_ZOOM);
    memory.view = { ...view };
  };
  const size = () => {
    const r = viewport.getBoundingClientRect();
    return { w: r.width, h: r.height, left: r.left, top: r.top };
  };
  const zoomAt = (factor, cx, cy) => {
    const k = clamp(view.k * factor, memory.minK, MAX_ZOOM);
    if (k === view.k) return;
    view.tx = cx - ((cx - view.tx) * k) / view.k;
    view.ty = cy - ((cy - view.ty) * k) / view.k;
    view.k = k;
    apply();
  };
  const zoomCenter = (factor) => {
    const { w, h: hh } = size();
    zoomAt(factor, w / 2, hh / 2);
  };
  // Einpassen: ganze Bounding-Box (Knoten, Kanten, Bögen) + Rand, zentriert, höchstens Zoom 1.
  // Die Höhe des Bereichs folgt dem Inhalt; ist der Graph breiter als bei Mindestzoom, darf der Zoom darunter gehen.
  // readable: Startansicht – nie kleiner als READ_ZOOM, damit Beschriftungen lesbar bleiben;
  // ist der Graph dann breiter als der Bereich, beginnt er links (Quellen sichtbar) und wird seitlich verschoben.
  const fitView = (readable = false) => {
    const { w, h: hh } = size();
    if (!(w > 0 && hh > 0)) return false;
    const b = flow.bounds;
    const maxH = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT_VH * window.innerHeight, MAX_HEIGHT));
    if (b.width > 0 && b.height > 0) {
      const fitK = Math.max(0.01, Math.min((w - 2 * FIT_PAD) / b.width, (maxH - 2 * FIT_PAD) / b.height, 1));
      const k = readable ? Math.max(fitK, Math.min(READ_ZOOM, 1)) : fitK;
      const height = Math.round(Math.max(MIN_HEIGHT, Math.min(b.height * k + 2 * FIT_PAD, maxH)));
      root.style.height = `${height}px`;
      memory.height = height;
      memory.minK = Math.min(MIN_ZOOM, fitK);
      const wide = b.width * k + 2 * FIT_PAD > w;
      const tall = b.height * k + 2 * FIT_PAD > height;
      view = {
        k,
        tx: wide ? FIT_PAD - b.x * k : (w - b.width * k) / 2 - b.x * k,
        ty: tall ? FIT_PAD - b.y * k : (height - b.height * k) / 2 - b.y * k,
      };
    }
    memory.fitted = true;
    apply();
    return true;
  };
  apply();

  zoomIn.addEventListener("click", () => zoomCenter(ZOOM_STEP));
  zoomOut.addEventListener("click", () => zoomCenter(1 / ZOOM_STEP));
  fitBtn.addEventListener("click", () => fitView());

  // Beim ersten Anzeigen einpassen (Reiter kann beim Aufbau noch verborgen sein).
  if (typeof ResizeObserver === "function") {
    const ro = new ResizeObserver(() => {
      if (!viewport.isConnected) {
        ro.disconnect();
        return;
      }
      if (needsFit && fitView(true)) needsFit = false;
    });
    ro.observe(viewport);
  } else {
    requestAnimationFrame(() => {
      if (needsFit && fitView(true)) needsFit = false;
    });
  }

  // Mausrad: Zoom zum Cursor.
  viewport.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? size().h : 1;
      const { left, top } = size();
      zoomAt(Math.exp(-e.deltaY * unit * 0.0015), e.clientX - left, e.clientY - top);
    },
    { passive: false },
  );

  // Ziehen: verschieben (Pointer-Capture erst ab kleiner Bewegung, damit Klicks Knoten fokussieren).
  let drag = null;
  viewport.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty, moving: false };
  });
  viewport.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (!drag.moving) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      drag.moving = true;
      viewport.setPointerCapture(e.pointerId);
      root.classList.add("is-dragging");
    }
    view.tx = drag.tx + dx;
    view.ty = drag.ty + dy;
    apply();
  });
  const endDrag = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (drag.moving && viewport.hasPointerCapture(e.pointerId)) viewport.releasePointerCapture(e.pointerId);
    drag = null;
    root.classList.remove("is-dragging");
  };
  viewport.addEventListener("pointerup", endDrag);
  viewport.addEventListener("pointercancel", endDrag);

  // Tastatur: +/− zoomen, Pfeile verschieben, 0 einpassen.
  viewport.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    let handled = true;
    if (e.key === "+" || e.key === "=" || e.key === "Add") zoomCenter(ZOOM_STEP);
    else if (e.key === "-" || e.key === "_" || e.key === "−" || e.key === "Subtract") zoomCenter(1 / ZOOM_STEP);
    else if (e.key === "0") fitView();
    else if (e.key === "ArrowLeft") view.tx += PAN_STEP;
    else if (e.key === "ArrowRight") view.tx -= PAN_STEP;
    else if (e.key === "ArrowUp") view.ty += PAN_STEP;
    else if (e.key === "ArrowDown") view.ty -= PAN_STEP;
    else handled = false;
    if (!handled) return;
    e.preventDefault();
    if (e.key.startsWith("Arrow")) apply();
  });

  // Hover/Fokus auf Knoten: eigene Kanten in Akzent, übrige abgeschwächt.
  let hoverId = null;
  let focusId = null;
  let activeId = null;
  const nodeEls = new Map([...nodeGroup.children].map((g) => [g.getAttribute("data-id"), g]));
  const highlight = () => {
    const id = hoverId ?? focusId;
    if (id === activeId) return;
    if (activeId !== null) {
      nodeEls.get(activeId)?.classList.remove("is-active");
      for (const eid of edgesOf.get(activeId) || []) {
        const el = edgeEls.get(eid);
        el.path.classList.remove("is-hl");
        el.label.classList.remove("is-hl");
      }
    }
    activeId = id;
    root.classList.toggle("has-active", id !== null);
    if (id === null) return;
    nodeEls.get(id)?.classList.add("is-active");
    for (const eid of edgesOf.get(id) || []) {
      const el = edgeEls.get(eid);
      el.path.classList.add("is-hl");
      el.label.classList.add("is-hl");
      edgeGroup.append(el.path); // nach oben legen
      labelGroup.append(el.label);
    }
  };
  for (const [id, g] of nodeEls) {
    g.addEventListener("pointerenter", () => {
      hoverId = id;
      highlight();
    });
    g.addEventListener("pointerleave", () => {
      if (hoverId === id) hoverId = null;
      highlight();
    });
    g.addEventListener("focus", () => {
      focusId = id;
      highlight();
    });
    g.addEventListener("blur", () => {
      if (focusId === id) focusId = null;
      highlight();
    });
  }
}

/** Reiter-Ansicht (result, data): Ziele aus den Wurzeln von result.tree. */
export function flowTab(result, data) {
  const host = h("div", { class: "flow-host" });
  const targets = (result && Array.isArray(result.tree) ? result.tree : []).map((n) => ({ item: n.item, rate: n.rate }));
  renderFlow(host, result, { targets }, data);
  return host;
}
