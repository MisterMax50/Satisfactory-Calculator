// flow.test.js — Tests für js/flowLayout.js (buildFlow): Kantenaufteilung, Knotenarten, Spalten, Zyklen, Determinismus.
// Eigene kleine Result-Fixtures (Format von js/result.js), keine echten Spieldaten.
import { test, assertEqual, assertClose } from "./runner.js";
import { buildFlow, moveNodes, NODE_W, NODE_H, COL_GAP, ROW_GAP } from "../js/flowLayout.js";

const items = (...ids) => ({ items: Object.fromEntries(ids.map((id) => [id, { id, form: id === "Water" ? "fluid" : "solid" }])) });
const row = (recipe, item, inputs, outputs) => ({
  recipe,
  item,
  runsPerMin: 1,
  machines: 1,
  building: "B",
  power: 1,
  inputs: inputs.map(([i, r]) => ({ item: i, rate: r })),
  outputs: outputs.map(([i, r]) => ({ item: i, rate: r })),
});
const sum = (edges, pred) => edges.filter(pred).reduce((s, e) => s + e.rate, 0);
const node = (flow, id) => flow.nodes.find((n) => n.id === id);

test("flow: zwei Erzeuger, zwei Verbraucher – Anteile und Summen je Item", () => {
  // Ingot: P1 30 + P2 10 = 40; C1 braucht 24, C2 braucht 16.
  const result = {
    rows: [
      row("C1", "Plate", [["Ingot", 24]], [["Plate", 16]]),
      row("C2", "Rod", [["Ingot", 16]], [["Rod", 16]]),
      row("P1", "Ingot", [["Ore", 30]], [["Ingot", 30]]),
      row("P2", "Ingot", [["Ore", 10]], [["Ingot", 10]]),
    ],
    raw: [{ item: "Ore", rate: 40 }],
    surplus: [],
  };
  const f = buildFlow(result, [{ item: "Plate", rate: 16 }, { item: "Rod", rate: 16 }], items("Ore", "Ingot", "Plate", "Rod"));
  const ingot = f.edges.filter((e) => e.item === "Ingot");
  assertEqual(ingot.length, 4, "vier Ingot-Kanten");
  const rate = (from, to) => f.edges.find((e) => e.from === from && e.to === to && e.item === "Ingot").rate;
  assertClose(rate("m:P1", "m:C1"), 18);
  assertClose(rate("m:P1", "m:C2"), 12);
  assertClose(rate("m:P2", "m:C1"), 6);
  assertClose(rate("m:P2", "m:C2"), 4);
  assertClose(sum(ingot, (e) => e.to === "m:C1"), 24, 1e-6, "Eingang C1");
  assertClose(sum(ingot, (e) => e.to === "m:C2"), 16, 1e-6, "Eingang C2");
  assertClose(sum(ingot, (e) => e.from === "m:P1"), 30, 1e-6, "Ausgang P1");
  assertClose(sum(ingot, (e) => e.from === "m:P2"), 10, 1e-6, "Ausgang P2");
  assertClose(sum(f.edges, (e) => e.item === "Ore"), 40, 1e-6, "Ore gesamt");
  for (const e of f.edges) assertEqual(typeof e.path, "string", "Pfad vorhanden");
});

test("flow: Rohstoffquelle → Maschine, Fluid-Form an der Kante", () => {
  const result = {
    rows: [row("R", "Mix", [["Ore", 10], ["Water", 20]], [["Mix", 5]])],
    raw: [{ item: "Ore", rate: 10 }, { item: "Water", rate: 20 }],
    surplus: [],
  };
  const f = buildFlow(result, [{ item: "Mix", rate: 5 }], items("Ore", "Water", "Mix"));
  const src = node(f, "s:Ore");
  assertEqual(src.kind, "source");
  assertClose(src.rate, 10);
  const e = f.edges.find((x) => x.from === "s:Water");
  assertEqual(e.to, "m:R");
  assertEqual(e.form, "fluid");
  assertClose(e.rate, 20);
  assertEqual(f.edges.find((x) => x.from === "s:Ore").form, "solid");
});

test("flow: Ziel- und Überschussknoten bekommen ihren Anteil", () => {
  // Maschine erzeugt 10 A und 4 B; Ziel A 10, B ist Überschuss.
  const result = {
    rows: [row("R", "A", [["Ore", 5]], [["A", 10], ["B", 4]])],
    raw: [{ item: "Ore", rate: 5 }],
    surplus: [{ item: "B", rate: 4 }],
  };
  const f = buildFlow(result, [{ item: "A", rate: 6 }, { item: "A", rate: 4 }, { item: "Nope", rate: 1 }], items("Ore", "A", "B"));
  assertEqual(f.nodes.filter((n) => n.kind === "target").map((n) => n.id), ["t:A"], "gleiche Ziele zusammengefasst, unbekannte ignoriert");
  assertClose(node(f, "t:A").rate, 10);
  assertEqual(node(f, "x:B").kind, "surplus");
  assertClose(f.edges.find((e) => e.to === "t:A").rate, 10);
  assertClose(f.edges.find((e) => e.to === "x:B").rate, 4);
  assertClose(node(f, "m:R").rate, 10, 1e-6, "Maschinenrate = Ausstoß des Zeilen-Items");
});

test("flow: Spaltenzuordnung und Knotenmaße", () => {
  // Ore → Ingot → Plate → Ziel; Ingot-Kette mit Abkürzung Ore → Plate-Maschine.
  const result = {
    rows: [
      row("Plate", "Plate", [["Ingot", 3], ["Ore", 1]], [["Plate", 2]]),
      row("Ingot", "Ingot", [["Ore", 3]], [["Ingot", 3]]),
    ],
    raw: [{ item: "Ore", rate: 4 }],
    surplus: [],
  };
  const f = buildFlow(result, [{ item: "Plate", rate: 2 }], items("Ore", "Ingot", "Plate"));
  assertEqual(node(f, "s:Ore").layer, 0);
  assertEqual(node(f, "m:Ingot").layer, 1);
  assertEqual(node(f, "m:Plate").layer, 2, "längster Pfad");
  assertEqual(node(f, "t:Plate").layer, 3);
  const n = node(f, "m:Plate");
  assertEqual([n.w, n.h, n.x], [NODE_W, NODE_H, 2 * (NODE_W + COL_GAP)]);
  assertEqual(f.width, 4 * NODE_W + 3 * COL_GAP);
  assertEqual(f.height, NODE_H);
  assertEqual(f.bounds, { x: 0, y: 0, width: f.width, height: f.height }, "ohne Rückkanten = Knotenfläche");
  // Mehrere Kanten am selben Knoten: Anschlüsse vertikal versetzt.
  const into = f.edges.filter((e) => e.to === "m:Plate").map((e) => e.path.split(" ").slice(-1)[0]);
  assertEqual(into.length, 2);
  assertEqual(into[0] !== into[1], true, "Anschlüsse versetzt");
});

test("flow: Zeilenabstand bei mehreren Knoten in einer Spalte", () => {
  const result = {
    rows: [row("A", "A", [["Ore", 1]], [["A", 1]]), row("B", "B", [["Ore", 1]], [["B", 1]])],
    raw: [{ item: "Ore", rate: 2 }],
    surplus: [],
  };
  const f = buildFlow(result, [{ item: "A", rate: 1 }, { item: "B", rate: 1 }], items("Ore", "A", "B"));
  const ys = f.nodes.filter((n) => n.kind === "machine").map((n) => n.y).sort((a, b) => a - b);
  assertEqual(ys[1] - ys[0], NODE_H + ROW_GAP);
  assertEqual(f.height, 2 * NODE_H + ROW_GAP);
});

test("flow: Zyklus ohne Endlosschleife, Rückkante als Bogen", () => {
  // A braucht B, B braucht A (plus Ore).
  const result = {
    rows: [
      row("RA", "A", [["B", 2], ["Ore", 1]], [["A", 4]]),
      row("RB", "B", [["A", 2]], [["B", 2]]),
    ],
    raw: [{ item: "Ore", rate: 1 }],
    surplus: [],
  };
  const f = buildFlow(result, [{ item: "A", rate: 2 }], items("Ore", "A", "B"));
  assertEqual(node(f, "m:RA").layer, 1);
  assertEqual(node(f, "m:RB").layer, 2);
  const back = f.edges.filter((e) => e.back);
  assertEqual(back.map((e) => e.id), ["e:m:RB>m:RA:B"]);
  assertEqual(f.height > NODE_H, true, "Platz für den Bogen unter den Knoten");
  assertEqual(f.bounds.x <= 0 && f.bounds.x + f.bounds.width >= f.width, true, "bounds umfasst Knoten");
  assertEqual(f.bounds.height, f.height);
  assertClose(sum(f.edges, (e) => e.item === "A"), 4);
});

test("flow: Rückkante an der ersten Spalte – bounds umfasst den Bogen", () => {
  // Zyklus ohne Rohstoff: RA landet in Spalte 0, der Bogen nach RA ragt links über x = 0 hinaus.
  const result = {
    rows: [row("RA", "A", [["B", 2]], [["A", 4]]), row("RB", "B", [["A", 2]], [["B", 2]])],
    raw: [],
    surplus: [],
  };
  const f = buildFlow(result, [{ item: "A", rate: 2 }], items("A", "B"));
  assertEqual(node(f, "m:RA").layer, 0);
  assertEqual(f.bounds.x < 0, true, "Bogen links von Spalte 0");
  assertEqual(f.bounds.x + f.bounds.width >= f.width, true);
});

test("flow: Maschine, die sich selbst beliefert", () => {
  const result = {
    rows: [row("R", "A", [["A", 1], ["Ore", 1]], [["A", 3]])],
    raw: [{ item: "Ore", rate: 1 }],
    surplus: [],
  };
  const f = buildFlow(result, [{ item: "A", rate: 2 }], items("Ore", "A"));
  const self = f.edges.find((e) => e.from === "m:R" && e.to === "m:R");
  assertEqual(self.back, true);
  assertClose(self.rate, 1);
});

test("flow: deterministisch (zweimal gleiches Layout)", () => {
  const mk = () => ({
    rows: [
      row("C1", "Plate", [["Ingot", 24]], [["Plate", 16]]),
      row("C2", "Rod", [["Ingot", 16]], [["Rod", 16]]),
      row("P1", "Ingot", [["Ore", 30]], [["Ingot", 30]]),
      row("P2", "Ingot", [["Ore", 10]], [["Ingot", 10]]),
    ],
    raw: [{ item: "Ore", rate: 40 }],
    surplus: [],
  });
  const t = [{ item: "Plate", rate: 16 }, { item: "Rod", rate: 16 }];
  const d = items("Ore", "Ingot", "Plate", "Rod");
  assertEqual(JSON.stringify(buildFlow(mk(), t, d)), JSON.stringify(buildFlow(mk(), t, d)));
});

test("flow: leeres Ergebnis und Fehler", () => {
  const empty = { nodes: [], edges: [], width: 0, height: 0, bounds: { x: 0, y: 0, width: 0, height: 0 } };
  assertEqual(buildFlow({ rows: [], raw: [], surplus: [] }, [], items()), empty);
  assertEqual(buildFlow(null, null, null), empty);
  assertEqual(buildFlow({ error: "cycle", items: ["A"] }, [{ item: "A", rate: 1 }], items("A")), empty);
});

test("flow: moveNodes – Kanten folgen dem verschobenen Knoten, Box wächst mit", () => {
  const result = { rows: [row("R", "Plate", [["Ore", 10]], [["Plate", 5]])], raw: [{ item: "Ore", rate: 10 }], surplus: [] };
  const f = buildFlow(result, [{ item: "Plate", rate: 5 }], items("Ore", "Plate"));
  const m = node(f, "m:R");
  const into = f.edges.find((e) => e.to === "m:R");
  const [x1, y1, x2, y2] = into.ends;
  const changed = moveNodes(f, new Map([["m:R", { x: m.x + 50, y: m.y + 500 }]]));
  assertEqual(changed.includes(into.id), true, "Eingangskante geändert");
  assertEqual(into.ends.join(), [x1, y1, x2 + 50, y2 + 500].join(), "nur das Zielende wandert");
  assertClose(into.labelY, (y1 + y2 + 500) / 2);
  assertEqual(f.bounds.y + f.bounds.height >= m.y + m.h, true, "Box enthält Knoten");
  assertEqual(moveNodes(f, new Map([["m:R", { x: m.x, y: m.y }]])).length, 0, "ohne Änderung nichts zu tun");
});
