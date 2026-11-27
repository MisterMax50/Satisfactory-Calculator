// flowLayout.js — Fluss-Graph aus einem Result (rein, kein DOM): Knoten, anteilige Kanten, Spalten-Layout.
// buildFlow(result, targets, data) → { nodes, edges, width, height }

export const NODE_W = 200;
export const NODE_H = 56;
export const COL_GAP = 200;
export const ROW_GAP = 28;

const MIN_EDGE = 1e-6;
const PASSES = 4;
const PORT_SPREAD = 40; // maximale vertikale Spreizung der Anschlüsse an einer Knotenseite
const PORT_STEP = 8;
const BACK_GAP = 28; // Abstand der Rückkanten-Bögen unter den Knoten
const BACK_MARGIN = 16;

const hasOwn = (obj, key) => !!obj && Object.prototype.hasOwnProperty.call(obj, key);
const isPos = (v) => typeof v === "number" && Number.isFinite(v) && v > 0;

function emptyFlow() {
  return { nodes: [], edges: [], width: 0, height: 0, bounds: { x: 0, y: 0, width: 0, height: 0 } };
}

function formOf(data, id) {
  const items = data && data.items;
  const item = hasOwn(items, id) ? items[id] : null;
  return item && typeof item.form === "string" ? item.form : "solid";
}

/** Ziele prüfen und gleiche Items zusammenfassen (Reihenfolge des ersten Auftretens). */
function normalizeTargets(targets, data) {
  const items = data && data.items;
  const map = new Map();
  for (const t of Array.isArray(targets) ? targets : []) {
    if (!t || typeof t !== "object" || typeof t.item !== "string" || !isPos(t.rate)) continue;
    if (items && !hasOwn(items, t.item)) continue;
    map.set(t.item, (map.get(t.item) ?? 0) + t.rate);
  }
  return [...map].map(([item, rate]) => ({ item, rate }));
}

const list = (v) => (Array.isArray(v) ? v : []);

/** Summe je Item einer Liste [{item, rate}]. */
function sumByItem(entries) {
  const m = new Map();
  for (const e of list(entries)) {
    if (!e || typeof e.item !== "string" || !isPos(e.rate)) continue;
    m.set(e.item, (m.get(e.item) ?? 0) + e.rate);
  }
  return m;
}

/**
 * @param {{ rows, raw, surplus }} result  Result aus js/result.js
 * @param {{item: string, rate: number}[]} targets
 * @param {{ items }} data
 */
export function buildFlow(result, targets, data) {
  if (!result || typeof result !== "object" || result.error) return emptyFlow();

  // 1. Knoten.
  const nodes = [];
  const byId = new Map();
  const add = (n) => {
    if (byId.has(n.id)) return byId.get(n.id);
    const node = { ...n, x: 0, y: 0, w: NODE_W, h: NODE_H, layer: 0 };
    nodes.push(node);
    byId.set(node.id, node);
    return node;
  };

  const supply = new Map(); // item → [{ node, rate }]
  const demand = new Map(); // item → [{ node, rate }]
  const itemOrder = [];
  const push = (map, item, node, rate) => {
    if (!isPos(rate)) return;
    if (!supply.has(item) && !demand.has(item)) itemOrder.push(item);
    if (!map.has(item)) map.set(item, []);
    map.get(item).push({ node, rate });
  };

  for (const row of list(result.rows)) {
    if (!row || typeof row.recipe !== "string") continue;
    const outs = sumByItem(row.outputs);
    const node = add({ id: `m:${row.recipe}`, kind: "machine", item: row.item, row, rate: outs.get(row.item) ?? 0 });
    for (const [item, rate] of outs) push(supply, item, node, rate);
    for (const [item, rate] of sumByItem(row.inputs)) push(demand, item, node, rate);
  }
  for (const [item, rate] of sumByItem(result.raw)) {
    push(supply, item, add({ id: `s:${item}`, kind: "source", item, rate }), rate);
  }
  for (const { item, rate } of normalizeTargets(targets, data)) {
    push(demand, item, add({ id: `t:${item}`, kind: "target", item, rate }), rate);
  }
  for (const [item, rate] of sumByItem(result.surplus)) {
    push(demand, item, add({ id: `x:${item}`, kind: "surplus", item, rate }), rate);
  }
  if (!nodes.length) return emptyFlow();

  // 2. Kanten: jedes Angebot anteilig auf jede Nachfrage, gleiche (von, nach, Item) zusammengefasst.
  const edges = [];
  const edgeById = new Map();
  for (const item of itemOrder) {
    const sup = supply.get(item) || [];
    const dem = demand.get(item) || [];
    const total = sup.reduce((s, e) => s + e.rate, 0);
    if (!(total > 0)) continue;
    const form = formOf(data, item);
    for (const s of sup) {
      for (const d of dem) {
        const rate = (s.rate * d.rate) / total;
        if (!(rate >= MIN_EDGE)) continue;
        const id = `e:${s.node.id}>${d.node.id}:${item}`;
        const prev = edgeById.get(id);
        if (prev) prev.rate += rate;
        else {
          const e = { id, from: s.node.id, to: d.node.id, item, rate, form };
          edges.push(e);
          edgeById.set(id, e);
        }
      }
    }
  }

  // 3. Rückkanten per DFS (Quellen zuerst, dann Knotenreihenfolge) finden.
  const out = new Map(nodes.map((n) => [n.id, []]));
  for (const e of edges) out.get(e.from).push(e);
  const state = new Map(); // 1 = auf dem Stapel, 2 = fertig
  const back = new Set();
  const order = [...nodes.filter((n) => n.kind === "source"), ...nodes.filter((n) => n.kind !== "source")];
  for (const start of order) {
    if (state.has(start.id)) continue;
    // Iterative DFS: Stapel aus [Knoten, nächster Kantenindex].
    const stack = [[start.id, 0]];
    state.set(start.id, 1);
    while (stack.length) {
      const top = stack[stack.length - 1];
      const outs = out.get(top[0]);
      if (top[1] >= outs.length) {
        state.set(top[0], 2);
        stack.pop();
        continue;
      }
      const e = outs[top[1]++];
      const st = state.get(e.to);
      if (st === 1) back.add(e.id);
      else if (st === undefined) {
        state.set(e.to, 1);
        stack.push([e.to, 0]);
      }
    }
  }

  // 4. Spalten: Quellen 0, Maschinen längster Pfad (ohne Rückkanten), Ziele/Überschuss ganz rechts.
  const fwd = edges.filter((e) => !back.has(e.id));
  const indeg = new Map(nodes.map((n) => [n.id, 0]));
  const fwdOut = new Map(nodes.map((n) => [n.id, []]));
  for (const e of fwd) {
    indeg.set(e.to, indeg.get(e.to) + 1);
    fwdOut.get(e.from).push(e.to);
  }
  const layer = new Map(nodes.map((n) => [n.id, n.kind === "source" ? 0 : 1]));
  const queue = nodes.filter((n) => indeg.get(n.id) === 0).map((n) => n.id);
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i];
    for (const to of fwdOut.get(id)) {
      layer.set(to, Math.max(layer.get(to), layer.get(id) + 1));
      indeg.set(to, indeg.get(to) - 1);
      if (indeg.get(to) === 0) queue.push(to);
    }
  }
  let maxMachine = 0;
  for (const n of nodes) if (n.kind === "machine") maxMachine = Math.max(maxMachine, layer.get(n.id));
  for (const n of nodes) if (n.kind === "target" || n.kind === "surplus") layer.set(n.id, maxMachine + 1);
  // Leere Spalten entfernen.
  const used = [...new Set(layer.values())].sort((a, b) => a - b);
  const remap = new Map(used.map((l, i) => [l, i]));
  for (const n of nodes) n.layer = remap.get(layer.get(n.id));
  const cols = used.map(() => []);
  for (const n of nodes) cols[n.layer].push(n); // Startreihenfolge: Eingabereihenfolge

  // 5. Reihenfolge je Spalte per Baryzentrum (abwechselnd vorwärts/rückwärts).
  const pos = new Map();
  const updatePos = (col) => col.forEach((n, i) => pos.set(n.id, i - (col.length - 1) / 2));
  cols.forEach(updatePos);
  const preds = new Map(nodes.map((n) => [n.id, []]));
  const succs = new Map(nodes.map((n) => [n.id, []]));
  for (const e of fwd) {
    if (e.from === e.to) continue;
    preds.get(e.to).push(e.from);
    succs.get(e.from).push(e.to);
  }
  for (let pass = 0; pass < PASSES; pass++) {
    const forward = pass % 2 === 0;
    const range = forward ? cols.map((_, i) => i).slice(1) : cols.map((_, i) => i).reverse().slice(1);
    for (const l of range) {
      const col = cols[l];
      const keyed = col.map((n, i) => {
        const nb = (forward ? preds : succs).get(n.id);
        const bc = nb.length ? nb.reduce((s, id) => s + pos.get(id), 0) / nb.length : pos.get(n.id);
        return { n, bc, i };
      });
      keyed.sort((a, b) => a.bc - b.bc || a.i - b.i);
      cols[l] = keyed.map((k) => k.n);
      updatePos(cols[l]);
    }
  }

  // 6. Koordinaten: Spalten vertikal zentriert.
  const colH = (c) => (c.length ? c.length * NODE_H + (c.length - 1) * ROW_GAP : 0);
  const nodesH = Math.max(...cols.map(colH));
  cols.forEach((col, l) => {
    const top = (nodesH - colH(col)) / 2;
    col.forEach((n, i) => {
      n.x = l * (NODE_W + COL_GAP);
      n.y = top + i * (NODE_H + ROW_GAP);
    });
  });
  const width = cols.length * NODE_W + (cols.length - 1) * COL_GAP;

  // 7. Kantenpfade: Anschlüsse je Knotenseite vertikal gespreizt, Rückkanten als Bogen unter den Knoten.
  const isBack = (e) => byId.get(e.to).layer <= byId.get(e.from).layer;
  const cy = (n) => n.y + n.h / 2;
  const outSide = new Map(nodes.map((n) => [n.id, []]));
  const inSide = new Map(nodes.map((n) => [n.id, []]));
  for (const e of edges) {
    outSide.get(e.from).push(e);
    inSide.get(e.to).push(e);
  }
  const portY = new Map(); // `${edgeId}|out` / `${edgeId}|in` → y
  const spread = (side, other, tag) => {
    for (const [id, list] of side) {
      const sorted = list
        .map((e) => ({ e, key: isBack(e) ? Infinity : cy(byId.get(other(e))) }))
        .sort((a, b) => a.key - b.key || (a.e.id < b.e.id ? -1 : a.e.id > b.e.id ? 1 : 0));
      const k = sorted.length;
      const step = k > 1 ? Math.min(PORT_STEP, PORT_SPREAD / (k - 1)) : 0;
      const c = cy(byId.get(id));
      sorted.forEach(({ e }, i) => portY.set(`${e.id}|${tag}`, c + (i - (k - 1) / 2) * step));
    }
  };
  spread(outSide, (e) => e.to, "out");
  spread(inSide, (e) => e.from, "in");

  let backIndex = 0;
  let minX = 0;
  let maxX = width;
  for (const e of edges) {
    const a = byId.get(e.from);
    const b = byId.get(e.to);
    const x1 = a.x + a.w;
    const y1 = portY.get(`${e.id}|out`);
    const x2 = b.x;
    const y2 = portY.get(`${e.id}|in`);
    e.ends = [x1, y1, x2, y2];
    if (isBack(e)) {
      const yb = nodesH + BACK_GAP * (backIndex + 1);
      backIndex++;
      const c = 40;
      // Größte Ausdehnung der Bögen: 3/4 des Kontrollpunkt-Abstands.
      minX = Math.min(minX, x2 - 0.75 * c);
      maxX = Math.max(maxX, x1 + 0.75 * c);
      e.back = true;
      e.path =
        `M ${r(x1)} ${r(y1)} C ${r(x1 + c)} ${r(y1)} ${r(x1 + c)} ${r(yb)} ${r(x1)} ${r(yb)} ` +
        `L ${r(x2)} ${r(yb)} C ${r(x2 - c)} ${r(yb)} ${r(x2 - c)} ${r(y2)} ${r(x2)} ${r(y2)}`;
      e.labelX = r((x1 + x2) / 2);
      e.labelY = r(yb);
    } else {
      e.path = edgeCurve(x1, y1, x2, y2);
      e.labelX = r((x1 + x2) / 2);
      e.labelY = r((y1 + y2) / 2);
    }
  }
  const height = backIndex ? nodesH + BACK_GAP * backIndex + BACK_MARGIN : nodesH;

  // bounds: alles Gezeichnete inkl. Rückkanten-Bögen (für „Einpassen“).
  const bounds = { x: r(minX), y: 0, width: r(maxX - minX), height };
  return { nodes, edges, width, height, bounds };
}

const r = (v) => Math.round(v * 100) / 100;

/** Kante als Bézier von Ausgang (x1, y1) zu Eingang (x2, y2); läuft sie nach links (verschobene Knoten), holt sie weiter aus. */
export function edgeCurve(x1, y1, x2, y2) {
  const dx = x2 >= x1 ? Math.max(40, (x2 - x1) / 2) : Math.max(80, (x1 - x2) / 2);
  return `M ${r(x1)} ${r(y1)} C ${r(x1 + dx)} ${r(y1)} ${r(x2 - dx)} ${r(y2)} ${r(x2)} ${r(y2)}`;
}

/**
 * Verschiebt Knoten (moved: Map id → {x, y}) in flow: Kanten folgen mit ihren Ports, Beschriftung zur Mitte,
 * Bounding-Box neu. Ändert flow und gibt die IDs der geänderten Kanten zurück.
 */
export function moveNodes(flow, moved) {
  const delta = new Map();
  for (const n of flow.nodes) {
    const p = moved.get(n.id);
    if (!p || (p.x === n.x && p.y === n.y)) continue;
    delta.set(n.id, { dx: p.x - n.x, dy: p.y - n.y });
    n.x = p.x;
    n.y = p.y;
  }
  const changed = [];
  if (!delta.size) return changed;
  const zero = { dx: 0, dy: 0 };
  for (const e of flow.edges) {
    const a = delta.get(e.from);
    const b = delta.get(e.to);
    if (!a && !b) continue;
    const [x1, y1, x2, y2] = e.ends;
    const d1 = a || zero;
    const d2 = b || zero;
    e.ends = [x1 + d1.dx, y1 + d1.dy, x2 + d2.dx, y2 + d2.dy];
    e.path = edgeCurve(...e.ends);
    e.back = false;
    e.labelX = r((e.ends[0] + e.ends[2]) / 2);
    e.labelY = r((e.ends[1] + e.ends[3]) / 2);
    changed.push(e.id);
  }
  // shortcut: Box nur aus Knoten und Kantenmitten (Bögen ragen etwas hinaus), reicht fürs Einpassen.
  const xs = [...flow.nodes.flatMap((n) => [n.x, n.x + n.w]), ...flow.edges.map((e) => e.labelX)];
  const ys = [...flow.nodes.flatMap((n) => [n.y, n.y + n.h]), ...flow.edges.map((e) => e.labelY)];
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  flow.bounds = { x: r(minX), y: r(minY), width: r(Math.max(...xs) - minX), height: r(Math.max(...ys) - minY) };
  return changed;
}
