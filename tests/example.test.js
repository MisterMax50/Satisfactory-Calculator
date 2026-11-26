// example.test.js — Beispieltest, zeigt die Nutzung des Mini-Runners.
import { test, assertEqual, assertClose, assertThrows } from "./runner.js";

test("Beispiel: Gleichheit und Näherung", () => {
  assertEqual({ a: [1, 2] }, { a: [1, 2] }, "Objekte");
  assertClose(0.1 + 0.2, 0.3, 1e-9, "Fließkomma");
});

test("Beispiel: async Test", async () => {
  const v = await Promise.resolve(42);
  assertEqual(v, 42);
});

test("Beispiel: Exception", () => {
  assertThrows(() => {
    throw new Error("x");
  });
});
