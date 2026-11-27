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
  return {
    v: 2,
    targets: [],
    recipes: {},
    lang: detectLang(),
    mode: "manual",
    objective: "resources",
    allowAlternates: true,
    excluded: [],
    sloops: {},
    imports: [],
    extraction: {},
    available: {},
  };
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

const isObj = (o) => !!o && typeof o === "object" && !Array.isArray(o);
const isStrArray = (a) => Array.isArray(a) && a.every((x) => typeof x === "string");
const PURITIES = ["impure", "normal", "pure"];

function validExtraction(e) {
  if (!isObj(e)) return false;
  for (const k of Object.keys(e)) {
    const x = e[k];
    if (!isObj(x)) return false;
    if (typeof x.extractor !== "string") return false;
    if (!PURITIES.includes(x.purity)) return false;
    if (typeof x.maxClock !== "number" || !Number.isFinite(x.maxClock) || x.maxClock < 1 || x.maxClock > 250) return false;
    if (x.pressurizers !== undefined && !(Number.isInteger(x.pressurizers) && x.pressurizers >= 0)) return false;
  }
  return true;
}

// Prüft die v1-Kernfelder.
function validCore(s) {
  if (!Array.isArray(s.targets)) return false;
  for (const t of s.targets) {
    if (!Array.isArray(t) || t.length !== 2) return false;
    if (typeof t[0] !== "string") return false;
    if (typeof t[1] !== "number" || !Number.isFinite(t[1]) || !(t[1] > 0)) return false;
  }
  if (!isObj(s.recipes)) return false;
  for (const k of Object.keys(s.recipes)) if (typeof s.recipes[k] !== "string") return false;
  return s.lang === "de" || s.lang === "en";
}

// Liefert einen vollständigen, tief kopierten v2-Zustand (v1 wird migriert, fehlende v2-Felder
// werden aufgefüllt) oder null bei ungültiger Eingabe.
function migrate(s) {
  if (!isObj(s) || (s.v !== 1 && s.v !== 2) || !validCore(s)) return null;
  const d = defaultState();
  const out = {
    ...d,
    targets: s.targets.map((t) => [t[0], t[1]]),
    recipes: { ...s.recipes },
    lang: s.lang,
  };
  if (s.v === 1) return out;
  if (s.mode !== undefined) {
    if (s.mode !== "manual" && s.mode !== "optimized") return null;
    out.mode = s.mode;
  }
  if (s.objective !== undefined) {
    if (s.objective !== "resources" && s.objective !== "power" && s.objective !== "max") return null;
    out.objective = s.objective;
  }
  if (s.allowAlternates !== undefined) {
    if (typeof s.allowAlternates !== "boolean") return null;
    out.allowAlternates = s.allowAlternates;
  }
  if (s.excluded !== undefined) {
    if (!isStrArray(s.excluded)) return null;
    out.excluded = [...s.excluded];
  }
  if (s.sloops !== undefined) {
    if (!isObj(s.sloops)) return null;
    for (const k of Object.keys(s.sloops)) {
      const n = s.sloops[k];
      if (!Number.isInteger(n) || n < 0 || n > 4) return null;
    }
    out.sloops = { ...s.sloops };
  }
  if (s.imports !== undefined) {
    if (!isStrArray(s.imports)) return null;
    out.imports = [...s.imports];
  }
  if (s.extraction !== undefined) {
    if (!validExtraction(s.extraction)) return null;
    out.extraction = {};
    for (const k of Object.keys(s.extraction)) out.extraction[k] = { ...s.extraction[k] };
  }
  if (s.available !== undefined) {
    if (!isObj(s.available)) return null;
    for (const k of Object.keys(s.available)) {
      const n = s.available[k];
      if (typeof n !== "number" || !Number.isFinite(n) || n < 0) return null;
    }
    out.available = { ...s.available };
  }
  return out;
}

export function isValidState(s) {
  return migrate(s) !== null;
}

function normalizeState(s) {
  return migrate(s);
}

// Kompakte Kodierung: Felder mit Standardwert entfallen und werden beim Decodieren aufgefüllt.
export function encodeState(state) {
  const full = migrate(state);
  if (!full) return toBase64Url(JSON.stringify(state));
  const out = { v: 2, targets: full.targets, recipes: full.recipes, lang: full.lang };
  if (full.mode && full.mode !== "manual") out.mode = full.mode;
  if (full.objective && full.objective !== "resources") out.objective = full.objective;
  if (full.allowAlternates === false) out.allowAlternates = false;
  if (full.excluded && full.excluded.length) out.excluded = full.excluded;
  if (full.sloops && Object.keys(full.sloops).length) out.sloops = full.sloops;
  if (full.imports && full.imports.length) out.imports = full.imports;
  if (full.extraction && Object.keys(full.extraction).length) out.extraction = full.extraction;
  if (full.available && Object.keys(full.available).length) out.available = full.available;
  return toBase64Url(JSON.stringify(out));
}

export function decodeState(str) {
  try {
    if (typeof str !== "string" || !/^[A-Za-z0-9_-]+$/.test(str)) return null;
    return migrate(JSON.parse(fromBase64Url(str)));
  } catch {
    return null;
  }
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
    commit(normalizeState(merged) || state);
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
      found = normalizeState(readJson(KEY_LAST));
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
