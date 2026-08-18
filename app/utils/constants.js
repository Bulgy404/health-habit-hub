/**
 * Shared application constants used across multiple modules.
 * Import from here rather than duplicating in individual files.
 */

/** ISO 639-1 language codes supported by the LibreTranslate integration. */
export const SUPPORTED_LANGUAGES = [
  'en',
  'de',
  'ja',
  'fr',
  'es',
  'it',
  'pt',
  'nl',
  'pl',
  'ru',
  'zh',
];

/**
 * BCIO context dimension keys used by the habit classification API.
 * Mirrors the response shape of POST /api/v1/llm/classify-context.
 */
export const DIMENSIONS = [
  'TIME',
  'PHYSICAL_SETTING',
  'PRIOR_BEHAVIOR',
  'OTHER_PEOPLE',
  'INTERNAL_STATE',
  'BEHAVIOR',
  'REASONING',
];

/** Matches the lowercase-hex format `node:crypto`'s randomUUID() produces. */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * True when `value` is a well-formed UUID string.
 *
 * Every `uuid` this app hands to a caller (habit donation ids, etc.) is
 * always server-generated via `randomUUID()` — this checks the *shape*
 * before a caller-supplied uuid is trusted for anything sensitive, e.g.
 * used in a filesystem path or as a MongoDB query value. A DB lookup that
 * only succeeds for pre-generated values is not a substitute for this: it
 * still means an arbitrary string was passed to `path.join`/a Mongo filter
 * before that lookup runs.
 * @param {unknown} value
 * @returns {boolean}
 */
export function isValidUuid(value) {
  return typeof value === 'string' && UUID_RE.test(value);
}
