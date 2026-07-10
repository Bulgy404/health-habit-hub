/**
 * Shared per-language text handling for questionnaires and cue pools.
 *
 * A "locale text" value is a map of language code -> string, e.g.
 * `{ en: 'Hello', de: 'Hallo' }`. Not every field needs every language —
 * an admin can mark a questionnaire/cue "available" in a subset of
 * languages while still drafting the rest.
 */

/** The 5 participant-facing languages, matching mobile/lib/l10n/ exactly. */
export const SUPPORTED_LANGS = ['en', 'de', 'fr', 'ja', 'nl'];

/**
 * Resolves a locale-text map to a single string for [lang].
 *
 * Fallback order: the requested language (if present in
 * [availableLanguages] and non-empty) -> English -> the first non-empty
 * entry in [availableLanguages] order -> ''.
 *
 * @param {Record<string, string>|null|undefined} map
 * @param {string} lang
 * @param {string[]} availableLanguages
 * @returns {string}
 */
export function resolveLocaleText(map, lang, availableLanguages = []) {
  if (!map) return '';
  if (availableLanguages.includes(lang) && map[lang]) return map[lang];
  if (map.en) return map.en;
  for (const l of availableLanguages) {
    if (map[l]) return map[l];
  }
  return '';
}

/**
 * Whether a locale-text map has no non-empty entries.
 * @param {Record<string, string>|null|undefined} map
 * @returns {boolean}
 */
export function isLocaleTextEmpty(map) {
  if (!map) return true;
  return !Object.values(map).some((v) => typeof v === 'string' && v.trim());
}
