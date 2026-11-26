// state.js — App-Zustand, URL-Hash-Kodierung (#p=), localStorage-Pläne.
// Speicher, Location und History sind injizierbar (createStore), Default: window.

const KEY_LAST = "sfcalc.last";
const KEY_PLANS = "sfcalc.plans";
const HASH_PREFIX = "#p=";

function detectLang() {
  const nav = typeof navigator !== "undefined" ? navigator.language : "";
  return String(nav || "").toLowerCase().startsWith("de") ? "de" : "en";
}

export function defaultState() {
  return { v: 1, targets: [], recipes: {}, lang: detectLang() };
}

function toBase64Url(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s) {
  let b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  while (b64.length % 4) b64 += "=";
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

export function isValidState(s) {
  if (!s || typeof s !== "object" || Array.isArray(s)) return false;
  if (s.v !== 1) return false;
  if (!Array.isArray(s.targets)) return false;
  for (const t of s.targets) {
    if (!Array.isArray(t) || t.length !== 2) return false;
    if (typeof t[0] !== "string") return false;
    if (typeof t[1] !== "number" || !Number.isFinite(t[1]) || !(t[1] > 0)) return false;
  }
  if (!s.recipes || typeof s.recipes !== "object" || Array.isArray(s.recipes)) return false;
  for (const k of Object.keys(s.recipes)) if (typeof s.recipes[k] !== "string") return false;
  if (s.lang !== "de" && s.lang !== "en") return false;
  return true;
}

export function encodeState(state) {
  return toBase64Url(JSON.stringify(state));
}

export function decodeState(str) {
  try {
    if (typeof str !== "string" || !/^[A-Za-z0-9_-]+$/.test(str)) return null;
    const obj = JSON.parse(fromBase64Url(str));
    return isValidState(obj) ? obj : null;
  } catch {
    return null;
  }
}

function normalizeState(s) {
  return { v: 1, targets: s.targets.map((t) => [t[0], t[1]]), recipes: { ...s.recipes }, lang: s.lang };
}

export function createStore({ storage, location, history } = {}) {
  const hasWindow = typeof window !== "undefined";
  const getStorage = () => {
    if (storage !== undefined) return storage;
    try {
      return hasWindow ? window.localStorage : null;
    } catch {
      return null;
    }
  };
  const loc = location !== undefined ? location : hasWindow ? window.location : null;
  const hist = history !== undefined ? history : hasWindow ? window.history : null;

  let state = defaultState();
  const listeners = new Set();

  function readJson(key) {
    try {
      const st = getStorage();
      const raw = st ? st.getItem(key) : null;
      return raw == null ? null : JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function writeJson(key, value) {
    try {
      const st = getStorage();
      if (!st) return false;
      st.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }

  function baseUrl() {
    if (!loc) return "";
    if (typeof loc.href === "string") return loc.href.split("#")[0];
    return `${loc.origin || ""}${loc.pathname || ""}${loc.search || ""}`;
  }

  function persist() {
    writeJson(KEY_LAST, state);
    try {
      if (hist && typeof hist.replaceState === "function" && loc) {
        const path = `${loc.pathname || ""}${loc.search || ""}`;
        const url = state.targets.length ? `${path}${HASH_PREFIX}${encodeState(state)}` : path || baseUrl();
        hist.replaceState(null, "", url);
      }
    } catch {
      /* Hash-Update ist optional */
    }
  }

  function commit(next) {
    state = next;
    persist();
    for (const fn of [...listeners]) {
      try {
        fn(state);
      } catch (e) {
        console.error(e);
      }
    }
  }

  function getState() {
    return state;
  }

  function update(patchOrFn) {
    const patch = typeof patchOrFn === "function" ? patchOrFn(state) : patchOrFn;
    const merged = { ...state, ...(patch || {}) };
    commit(isValidState(merged) ? normalizeState(merged) : state);
  }

  function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  function loadInitialState() {
    let found = null;
    const hash = loc && typeof loc.hash === "string" ? loc.hash : "";
    if (hash.startsWith(HASH_PREFIX)) found = decodeState(hash.slice(HASH_PREFIX.length));
    if (!found) {
      const last = readJson(KEY_LAST);
      if (isValidState(last)) found = normalizeState(last);
    }
    state = found || defaultState();
    return state;
  }

  function listPlans() {
    const raw = readJson(KEY_PLANS);
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((p) => p && typeof p.name === "string" && isValidState(p.state))
      .map((p) => ({ name: p.name, state: normalizeState(p.state), savedAt: Number(p.savedAt) || 0 }));
  }

  function savePlan(name) {
    const n = String(name ?? "").trim();
    if (!n) return false;
    const plans = listPlans().filter((p) => p.name !== n);
    plans.push({ name: n, state: normalizeState(state), savedAt: Date.now() });
    return writeJson(KEY_PLANS, plans);
  }

  function loadPlan(name) {
    const plan = listPlans().find((p) => p.name === name);
    if (!plan) return null;
    commit(plan.state);
    return state;
  }

  function deletePlan(name) {
    const plans = listPlans();
    const rest = plans.filter((p) => p.name !== name);
    if (rest.length === plans.length) return false;
    return writeJson(KEY_PLANS, rest);
  }

  function shareUrl() {
    return `${baseUrl()}${HASH_PREFIX}${encodeState(state)}`;
  }

  return { getState, update, subscribe, loadInitialState, listPlans, savePlan, loadPlan, deletePlan, shareUrl };
}

// Standard-Store auf window (lazy, damit Import ohne DOM nicht scheitert).
let defaultStore = null;
function store() {
  if (!defaultStore) defaultStore = createStore();
  return defaultStore;
}

export const getState = () => store().getState();
export const update = (p) => store().update(p);
export const subscribe = (fn) => store().subscribe(fn);
export const loadInitialState = () => store().loadInitialState();
export const listPlans = () => store().listPlans();
export const savePlan = (name) => store().savePlan(name);
export const loadPlan = (name) => store().loadPlan(name);
export const deletePlan = (name) => store().deletePlan(name);
export const shareUrl = () => store().shareUrl();
