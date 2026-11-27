// map.js — Reiter „Karte“: Weltkarte (Kartenbild aus data/maptiles) mit allen Rohstoffknoten aus data/mapnodes.js,
// Filter nach Rohstoff und Reinheit, Zoom/Verschieben, Details mit Förderraten beim Anklicken.
import mapData from "../../data/mapnodes.js";
import { h, clear } from "./dom.js";
import { t, formatNumber, formatRate, localName } from "../i18n.js";
import { itemLabel, iconUrl } from "./common.js";
import { extractorsFor, PURITY_FACTORS } from "../extraction.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const GEYSER = "Desc_GeothermalEnergy_C";
const PURITIES = ["impure", "normal", "pure"];
const RADIUS = { impure: 7, normal: 9, pure: 12 }; // Bildschirm-px, unabhängig vom Zoom
const ICON = 1.5; // Icon-Kantenlänge = ICON × Radius
const GRID = 500; // Gitterweite in m
const MIN_ZOOM = 0.02;
const MAX_ZOOM = 2;
const ZOOM_STEP = 1.4;
const PAN_STEP = 60;
const DRAG_THRESHOLD = 3;
const NODES = mapData.nodes.map(([res, pur, x, y, kind], i) => ({ i, res, pur, x, y, kind }));
const RESOURCES = [...new Set(NODES.map((n) => n.res))];

// Sitzungszustand der Karte (nicht gespeichert): Filter (null = folgt dem Plan), Ansicht, gewählter Knoten.
let filter = null;
let view = null;
let picked = null;

// Kartenbild: Kacheln aus data/maptiles (tools/fetch_maptiles.py), deckungsgleich mit bounds.
// Einmal gebaut und bei jedem Neu-Rendern wiederverwendet, damit die Bilder nicht neu laden.
const TILE_ZOOM = 4;
let tileLayer = null;
function tiles() {
  if (tileLayer) return tileLayer;
  const b = mapData.bounds;
  const n = 2 ** TILE_ZOOM;
  const size = b.width / n;
  const imgs = [];
  for (let x = 0; x < n; x++)
    for (let y = 0; y < n; y++)
      imgs.push(
        s("image", {
          href: new URL(`../../data/maptiles/${TILE_ZOOM}/${x}/${y}.webp`, import.meta.url).href,
          x: b.x + x * size,
          y: b.y + y * size,
          // Ein Hauch Überlappung gegen Haarlinien zwischen den Kacheln.
          width: size + 0.5,
          height: size + 0.5,
          preserveAspectRatio: "none",
        }),
      );
  tileLayer = s("g", { class: "map-tiles", "aria-hidden": "true" }, imgs);
  return tileLayer;
}

function s(tag, attrs = {}, ...children) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined) el.setAttribute(k, String(v));
  for (const c of children.flat()) if (c !== null && c !== undefined) el.append(typeof c === "string" ? document.createTextNode(c) : c);
  return el;
}

const resName = (data, id) => (id === GEYSER ? t("map.geyser") : itemLabel(data, id));
const kindName = (kind) => t(`map.kind.${kind}`);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** Standardfilter: Rohstoffe des aktuellen Plans, sonst alle; alle Reinheiten. */
function defaultFilter(result) {
  const used = new Set((result && Array.isArray(result.raw) ? result.raw : []).map((r) => r.item));
  const res = RESOURCES.filter((id) => used.has(id));
  return { res: new Set(res.length ? res : RESOURCES), pur: new Set(PURITIES), auto: true };
}

/** Förderraten je passender Anlage bei 100 % Takt für einen Knoten (Geysire: keine). */
function rates(n, data) {
  if (n.kind === "geyser") return [];
  const kinds = n.kind === "well" ? ["well"] : ["miner", "pump"];
  return extractorsFor(n.res, data)
    .map((id) => data.extractors[id])
    .filter((ex) => kinds.includes(ex.kind))
    .map((ex) => [localName(ex) || ex.id, ex.ratePerMin * PURITY_FACTORS[n.pur]]);
}

function details(n, data, close) {
  const form = data.items[n.res] ? data.items[n.res].form : "solid";
  const facts = [
    [t("map.kind"), kindName(n.kind)],
    [t("raw.purity"), t(`purity.${n.pur}`)],
    [t("map.coords"), `x ${formatNumber(n.x)} m · y ${formatNumber(n.y)} m`],
    ...rates(n, data).map(([name, rate]) => [name, formatRate(rate, form)]),
  ];
  return [
    h(
      "div",
      { class: "flow-details-head" },
      h("h3", { class: "flow-details-title" }, resName(data, n.res)),
      h("button", { type: "button", class: "btn flow-btn", onclick: close }, t("flow.close")),
    ),
    h("dl", { class: "flow-details-facts" }, facts.flatMap(([k, v]) => [h("dt", {}, k), h("dd", {}, v)])),
  ];
}

/** Reiter-Ansicht: Filter, Karte, Details. data: volle Spieldaten (Itemnamen, Förderanlagen). */
export function mapView(result, data) {
  if (!filter || filter.auto) filter = defaultFilter(result);
  const b = mapData.bounds;

  // Karte: Rand, Gitter, Knoten (große zuerst, damit kleine obenauf und klickbar bleiben).
  const grid = [];
  for (let x = Math.ceil(b.x / GRID) * GRID; x <= b.x + b.width; x += GRID)
    grid.push(s("line", { class: "map-grid", x1: x, y1: b.y, x2: x, y2: b.y + b.height }));
  for (let y = Math.ceil(b.y / GRID) * GRID; y <= b.y + b.height; y += GRID)
    grid.push(s("line", { class: "map-grid", x1: b.x, y1: y, x2: b.x + b.width, y2: y }));
  const order = [...NODES].sort((a, c) => RADIUS[c.pur] - RADIUS[a.pur]);
  const dots = order.map((n) =>
    s(
      "circle",
      { class: `map-node map-node--${n.kind}`, cx: n.x, cy: n.y, "data-res": n.res, "data-i": n.i },
      s("title", {}, `${resName(data, n.res)} · ${t(`purity.${n.pur}`)} · ${kindName(n.kind)}`),
    ),
  );
  // Spiel-Icon über dem farbigen Kreis; Klicks gehen an den Kreis (data-i).
  const icons = order.map((n) => s("image", { class: "map-icon", href: iconUrl(n.res) }));
  const scene = s(
    "g",
    {},
    s("rect", { class: "map-world", x: b.x, y: b.y, width: b.width, height: b.height }),
    tiles(),
    grid,
    s("g", {}, dots.flatMap((c, j) => [c, icons[j]])),
  );
  const svg = s("svg", { class: "flow-svg", width: "100%", height: "100%" }, scene);
  const viewport = h("div", { class: "flow-viewport", tabindex: "0", role: "group", "aria-label": t("map.label"), "data-fkey": "map-graph" });
  viewport.append(svg);

  const btn = (label, text, fn) => h("button", { type: "button", class: "btn flow-btn", "aria-label": label, title: label, onclick: fn }, text);
  const root = h(
    "div",
    { class: "flow map" },
    viewport,
    h(
      "div",
      { class: "flow-controls" },
      btn(t("flow.zoomIn"), "+", () => zoomCenter(ZOOM_STEP)),
      btn(t("flow.zoomOut"), "−", () => zoomCenter(1 / ZOOM_STEP)),
      h("button", { type: "button", class: "btn flow-btn", onclick: () => fit() }, t("flow.fit")),
    ),
  );
  const count = h("p", { class: "muted small", "aria-live": "polite" });
  const panel = h("section", { class: "flow-details", "aria-live": "polite" });

  // Sichtbarkeit nach Filter, Zähler.
  const visible = (n) => filter.res.has(n.res) && filter.pur.has(n.pur);
  const applyFilter = () => {
    let shown = 0;
    dots.forEach((c, j) => {
      const on = visible(order[j]);
      c.style.display = on ? "" : "none";
      icons[j].style.display = c.style.display;
      if (on) shown++;
    });
    count.textContent = t("map.count", { shown: formatNumber(shown), total: formatNumber(NODES.length) });
  };
  const toggle = (set, id, on) => {
    if (on) set.add(id);
    else set.delete(id);
    filter.auto = false;
    applyFilter();
  };
  const resBoxes = new Map();
  const resList = [...RESOURCES]
    .sort((a, c) => resName(data, a).localeCompare(resName(data, c)))
    .map((id) => {
      const box = h("input", { type: "checkbox", checked: filter.res.has(id), "data-fkey": `map-res-${id}`, onchange: (e) => toggle(filter.res, id, e.target.checked) });
      resBoxes.set(id, box);
      const n = NODES.filter((x) => x.res === id).length;
      return h("label", { class: "map-check" }, box, h("img", { class: "item-icon", src: iconUrl(id), alt: "", width: 20, height: 20 }), `${resName(data, id)} (${formatNumber(n)})`);
    });
  const setAll = (ids) => {
    filter.res = new Set(ids);
    filter.auto = false;
    for (const [id, box] of resBoxes) box.checked = filter.res.has(id);
    applyFilter();
  };
  const purList = PURITIES.map((p) =>
    h(
      "label",
      { class: "map-check" },
      h("input", { type: "checkbox", checked: filter.pur.has(p), "data-fkey": `map-pur-${p}`, onchange: (e) => toggle(filter.pur, p, e.target.checked) }),
      h("span", { class: `map-size map-size--${p}` }),
      `${t(`purity.${p}`)} (${formatNumber(NODES.filter((x) => x.pur === p).length)})`,
    ),
  );
  const filters = h(
    "div",
    { class: "map-filters" },
    h(
      "fieldset",
      { class: "map-fieldset" },
      h("legend", {}, t("map.resources")),
      h(
        "div",
        { class: "map-actions" },
        h("button", { type: "button", class: "btn flow-btn", onclick: () => setAll(RESOURCES) }, t("map.all")),
        h("button", { type: "button", class: "btn flow-btn", onclick: () => setAll([]) }, t("map.none")),
        h("button", { type: "button", class: "btn flow-btn", onclick: () => setAll(defaultFilter(result).res) }, t("map.plan")),
      ),
      h("div", { class: "map-checks" }, resList),
    ),
    h("fieldset", { class: "map-fieldset" }, h("legend", {}, t("raw.purity")), h("div", { class: "map-checks" }, purList)),
  );

  // Ansicht: Szene = translate(tx, ty) scale(k); Punktgröße bleibt in Bildschirm-px.
  let v = view ? { ...view } : null;
  const apply = () => {
    scene.setAttribute("transform", `translate(${v.tx} ${v.ty}) scale(${v.k})`);
    dots.forEach((c, j) => {
      const r = RADIUS[order[j].pur] / v.k;
      c.setAttribute("r", r);
      const im = icons[j];
      im.setAttribute("x", order[j].x - (ICON * r) / 2);
      im.setAttribute("y", order[j].y - (ICON * r) / 2);
      im.setAttribute("width", ICON * r);
      im.setAttribute("height", ICON * r);
    });
    view = { ...v };
  };
  const size = () => viewport.getBoundingClientRect();
  const fit = () => {
    const r = size();
    if (!(r.width > 0 && r.height > 0)) return false;
    const k = Math.min(r.width / b.width, r.height / b.height);
    v = { k, tx: (r.width - b.width * k) / 2 - b.x * k, ty: (r.height - b.height * k) / 2 - b.y * k };
    apply();
    return true;
  };
  const zoomAt = (factor, cx, cy) => {
    const k = clamp(v.k * factor, MIN_ZOOM, MAX_ZOOM);
    v.tx = cx - ((cx - v.tx) * k) / v.k;
    v.ty = cy - ((cy - v.ty) * k) / v.k;
    v.k = k;
    apply();
  };
  const zoomCenter = (factor) => {
    const r = size();
    zoomAt(factor, r.width / 2, r.height / 2);
  };
  if (v) apply();
  else if (typeof ResizeObserver === "function") {
    // Reiter kann beim Aufbau verborgen sein: einpassen, sobald er eine Größe hat.
    const ro = new ResizeObserver(() => {
      if (!viewport.isConnected || (!v && fit())) ro.disconnect();
    });
    ro.observe(viewport);
  } else requestAnimationFrame(() => fit());

  viewport.addEventListener(
    "wheel",
    (e) => {
      if (!v) return;
      e.preventDefault();
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? size().height : 1;
      const r = size();
      zoomAt(Math.exp(-e.deltaY * unit * 0.0015), e.clientX - r.left, e.clientY - r.top);
    },
    { passive: false },
  );
  const pick = (i) => {
    picked = i;
    dots.forEach((c, j) => c.classList.toggle("is-selected", order[j].i === i));
    clear(panel);
    if (i !== null) panel.append(...details(NODES[i], data, () => pick(null)));
  };
  let drag = null;
  viewport.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || !v) return;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, tx: v.tx, ty: v.ty, moving: false, target: e.target };
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
    v.tx = drag.tx + dx;
    v.ty = drag.ty + dy;
    apply();
  });
  const endDrag = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (drag.moving) {
      if (viewport.hasPointerCapture(e.pointerId)) viewport.releasePointerCapture(e.pointerId);
    } else if (e.type === "pointerup") {
      const i = drag.target.getAttribute && drag.target.getAttribute("data-i");
      pick(i === null || i === undefined ? null : Number(i));
    }
    drag = null;
    root.classList.remove("is-dragging");
  };
  viewport.addEventListener("pointerup", endDrag);
  viewport.addEventListener("pointercancel", endDrag);
  viewport.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || !v) return;
    let handled = true;
    if (e.key === "+" || e.key === "=" || e.key === "Add") zoomCenter(ZOOM_STEP);
    else if (e.key === "-" || e.key === "_" || e.key === "−" || e.key === "Subtract") zoomCenter(1 / ZOOM_STEP);
    else if (e.key === "0") fit();
    else if (e.key === "ArrowLeft") v.tx += PAN_STEP;
    else if (e.key === "ArrowRight") v.tx -= PAN_STEP;
    else if (e.key === "ArrowUp") v.ty += PAN_STEP;
    else if (e.key === "ArrowDown") v.ty -= PAN_STEP;
    else if (e.key === "Escape" && picked !== null) pick(null);
    else handled = false;
    if (!handled) return;
    e.preventDefault();
    if (e.key.startsWith("Arrow")) apply();
  });

  applyFilter();
  pick(picked);
  return h(
    "div",
    { class: "map-host" },
    filters,
    count,
    root,
    panel,
    h("p", { class: "muted small" }, t("map.note"), " ", h("a", { href: "https://github.com/Hirashi3630/satisfactory_node_heatmap", rel: "noopener" }, mapData.source)),
  );
}
