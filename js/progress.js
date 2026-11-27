// progress.js — Spielstand: entfernt gesperrte Rezepte (Tier zu hoch, Alternativrezept nicht freigeschaltet) aus den Spieldaten. Rein.

/**
 * @param {object} data Spieldaten
 * @param {{ tier: number|null, alternates: string[]|null }} progress null = keine Einschränkung
 * @returns data selbst ohne Einschränkung, sonst eine Kopie mit gefilterten recipes und angepasstem defaultRecipe
 */
export function applyProgress(data, progress) {
  const tier = progress ? progress.tier : null;
  const alts = progress && progress.alternates ? new Set(progress.alternates) : null;
  if (tier == null && !alts) return data;
  // Alternativen: Liste entscheidet; ohne Liste gilt das Tier der Festplatten-Freischaltung.
  const unlocked = (r) => (r.alternate && alts ? alts.has(r.id) : tier == null || (r.tier ?? 0) <= tier);
  const recipes = {};
  for (const [id, r] of Object.entries(data.recipes)) if (unlocked(r)) recipes[id] = r;
  // Gesperrtes Standardrezept: erstes freies Rezept mit dem Item als Hauptprodukt, Standardrezepte vor Alternativen.
  const byItem = {};
  for (const r of Object.values(recipes)) (byItem[r.outputs[0].item] ||= []).push(r);
  const items = {};
  for (const [id, it] of Object.entries(data.items)) {
    if (!it.defaultRecipe || recipes[it.defaultRecipe]) items[id] = it;
    else {
      const cands = (byItem[id] || []).sort((a, b) => a.alternate - b.alternate || (a.id < b.id ? -1 : 1));
      items[id] = { ...it, defaultRecipe: cands.length ? cands[0].id : null };
    }
  }
  return { ...data, items, recipes };
}
