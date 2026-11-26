// runner.js — Mini-Testrunner (ES-Modul). API: test(name, fn), assertEqual(a, b, msg), assertClose(a, b, eps, msg), assertThrows(fn, msg).
// Setzt window.__testResults = { passed, failed, done } nach Abschluss.

const tests = [];

export function test(name, fn) {
  tests.push({ name, fn });
}

function deepEqual(a, b) {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && deepEqual(a[k], b[k]));
}

export function assertEqual(a, b, msg = "") {
  if (!deepEqual(a, b)) {
    throw new Error(`${msg ? msg + ": " : ""}erwartet ${JSON.stringify(b)}, erhalten ${JSON.stringify(a)}`);
  }
}

export function assertClose(a, b, eps = 1e-6, msg = "") {
  if (!(Math.abs(a - b) <= eps)) {
    throw new Error(`${msg ? msg + ": " : ""}${a} ist nicht ${b} (eps ${eps})`);
  }
}

export function assertThrows(fn, msg = "") {
  let threw = false;
  try {
    fn();
  } catch (e) {
    threw = true;
  }
  if (!threw) throw new Error(`${msg ? msg + ": " : ""}es wurde keine Exception geworfen`);
}

export async function runAll(report) {
  let passed = 0;
  let failed = 0;
  for (const t of tests) {
    try {
      await t.fn();
      passed++;
      report({ name: t.name, ok: true });
    } catch (e) {
      failed++;
      report({ name: t.name, ok: false, error: e && e.message ? e.message : String(e) });
    }
  }
  window.__testResults = { passed, failed, done: true };
  return window.__testResults;
}
