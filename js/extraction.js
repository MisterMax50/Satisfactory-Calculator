// extraction.js — Förderung der Rohstoffe: computeExtraction({ raw, settings, data }) (SPEC „Version 2 › Förderung“).
// Reine Funktionen, kein DOM, kein localStorage, keine globalen Daten-Importe.
import { POWER_EXPONENT, roundTol, ceilMachines, hasOwn } from "./result.js";

/** Faktoren je Reinheit (SPEC: unrein 0,5 / normal 1 / rein 2). */
export const PURITY_FACTORS = { impure: 0.5, normal: 1, pure: 2 };
export const DEFAULT_PURITY = "normal";
/** Max. Takt in Prozent (Einstellung), Bereich 1–250 %. */
export const DEFAULT_MAX_CLOCK = 100;
export const MIN_CLOCK = 1;
export const MAX_CLOCK = 250;
/** Druckerzeuger-Leistung laut SPEC, falls data.pressurizer fehlt. */
const DEFAULT_PRESSURIZER_POWER = 150;
/** Satelliten-Extraktoren je Druckerzeuger für die Standard-Schätzung ceil(count / 4). */
const SATELLITES_PER_PRESSURIZER = 4;

const WATER = "Desc_Water_C";
const KIND_ORDER = { miner: 0, pump: 1, well: 2 };
const PREFERRED_MINER = "Build_MinerMk2_C";

const objOr = (v) => (v && typeof v === "object" ? v : {});
const isFiniteNumber = (v) => typeof v === "number" && Number.isFinite(v);

function extractorMap(data) {
  const ex = data && data.extractors;
  return ex && typeof ex === "object" ? ex : null;
}

/** Passt eine Förderanlage zum Item? `allowed` (Liste) hat Vorrang, sonst `forms`. */
function fits(extractor, item) {
  if (!extractor || typeof extractor !== "object" || !isFiniteNumber(extractor.ratePerMin) || !(extractor.ratePerMin > 0)) return false;
  if (Array.isArray(extractor.allowed)) return extractor.allowed.includes(item.id);
  return Array.isArray(extractor.forms) && extractor.forms.includes(item.form);
}

/** Wasserextraktor (Pumpe nur für Wasser) hat keine Reinheit. */
export function hasPurity(extractor) {
  if (!extractor) return false;
  const a = extractor.allowed;
  return !(extractor.kind === "pump" && Array.isArray(a) && a.length > 0 && a.every((x) => x === WATER));
}

/**
 * Wählbare Förderanlagen für einen Rohstoff (IDs), sortiert nach Art (Miner, Pumpe, Brunnen), Rate, ID.
 * Leer, wenn das Item kein Rohstoff ist oder data.extractors fehlt.
 */
export function extractorsFor(itemId, data) {
  const extractors = extractorMap(data);
  const items = objOr(data && data.items);
  if (!extractors || typeof itemId !== "string" || !hasOwn(items, itemId)) return [];
  const item = items[itemId];
  if (!item || item.raw !== true) return [];
  const probe = { id: itemId, form: item.form };
  return Object.keys(extractors)
    .filter((id) => fits(extractors[id], probe))
    .sort((a, b) => {
      const ea = extractors[a];
      const eb = extractors[b];
      const ka = KIND_ORDER[ea.kind] ?? 9;
      const kb = KIND_ORDER[eb.kind] ?? 9;
      return ka - kb || ea.ratePerMin - eb.ratePerMin || (a < b ? -1 : a > b ? 1 : 0);
    });
}

/**
 * Standard-Förderung je Rohstoff: fest → Miner Mk.2, Fluide mit eigener Pumpe (Wasser, Rohöl) → Pumpe,
 * sonst (Stickstoff) → Ressourcenbrunnen. Reinheit normal, maxClock 100 %.
 * @returns {{ extractor: string, purity: string, maxClock: number } | null}
 */
export function defaultExtraction(itemId, data) {
  const ids = extractorsFor(itemId, data);
  if (ids.length === 0) return null;
  const extractors = extractorMap(data);
  const item = data.items[itemId];
  let pick = null;
  if (item.form === "solid") {
    pick = ids.includes(PREFERRED_MINER) ? PREFERRED_MINER : ids.find((id) => extractors[id].kind === "miner") ?? null;
  }
  if (!pick) {
    pick =
      ids.find((id) => extractors[id].kind === "pump" && Array.isArray(extractors[id].allowed)) ??
      ids.find((id) => extractors[id].kind === "well") ??
      ids[0];
  }
  return { extractor: pick, purity: DEFAULT_PURITY, maxClock: DEFAULT_MAX_CLOCK };
}

/**
 * Förderanlagen für die Rohstoffliste eines Results.
 * @param {{ raw: {item, rate, imported?, missingRecipe?}[], settings?: Object<string, {extractor?, purity?, maxClock?, pressurizers?}>, data: object }} args
 *   settings je Item wie Zustand v2 `extraction` (maxClock in Prozent 1–250; purity "impure" | "normal" | "pure").
 * @returns {{ rows: { item, rate, extractor, purity, clock, count, clockEffective, power, pressurizers, pressurizersEstimate }[], power: number }}
 *   purity: Reinheits-Schlüssel (null beim Wasserextraktor); clock = verwendeter Max. Takt und clockEffective = tatsächlicher
 *   Takt, beide als Anteil (1 = 100 %); pressurizers nur beim Brunnen > 0, pressurizersEstimate = Standard ceil(count / 4).
 */
export function computeExtraction({ raw, settings, data } = {}) {
  const extractors = extractorMap(data);
  if (!extractors || !Array.isArray(raw)) return { rows: [], power: 0 };
  const conf = objOr(settings);
  const pressurizer = data && data.pressurizer && typeof data.pressurizer === "object" ? data.pressurizer : null;
  const pressurizerPower = pressurizer && isFiniteNumber(pressurizer.power) ? pressurizer.power : DEFAULT_PRESSURIZER_POWER;

  const rows = [];
  let total = 0;
  for (const entry of raw) {
    if (!entry || typeof entry !== "object" || entry.imported || entry.missingRecipe) continue;
    const { item, rate } = entry;
    if (!isFiniteNumber(rate) || !(rate > 0)) continue;
    const def = defaultExtraction(item, data);
    if (!def) continue;
    const s = hasOwn(conf, item) && conf[item] && typeof conf[item] === "object" ? conf[item] : {};

    const allowed = extractorsFor(item, data);
    const exId = typeof s.extractor === "string" && allowed.includes(s.extractor) ? s.extractor : def.extractor;
    const ex = extractors[exId];
    const purity = hasPurity(ex) ? (hasOwn(PURITY_FACTORS, s.purity) ? s.purity : DEFAULT_PURITY) : null;
    const factor = purity ? PURITY_FACTORS[purity] : 1;
    const maxClock = isFiniteNumber(s.maxClock) ? Math.min(MAX_CLOCK, Math.max(MIN_CLOCK, s.maxClock)) : DEFAULT_MAX_CLOCK;
    const clock = maxClock / 100;

    const perUnit = ex.ratePerMin * factor; // je Anlage bei 100 %
    const count = ceilMachines(rate / (perUnit * clock));
    const clockEffective = rate / (count * perUnit);
    const unitPower = isFiniteNumber(ex.power) ? ex.power : 0;
    let power = count * unitPower * Math.pow(clockEffective, POWER_EXPONENT);

    let pressurizers = 0;
    let pressurizersEstimate = false;
    if (ex.kind === "well") {
      const override = s.pressurizers;
      if (isFiniteNumber(override) && override >= 0) pressurizers = Math.floor(override);
      else {
        pressurizers = Math.ceil(count / SATELLITES_PER_PRESSURIZER);
        pressurizersEstimate = true;
      }
      power += pressurizers * pressurizerPower; // Druckerzeuger nicht getaktet
    }
    total += power;
    rows.push({
      item,
      rate: roundTol(rate),
      extractor: exId,
      purity,
      clock: roundTol(clock),
      count,
      clockEffective: roundTol(clockEffective),
      power: roundTol(power),
      pressurizers,
      pressurizersEstimate,
    });
  }
  return { rows, power: roundTol(total) };
}
