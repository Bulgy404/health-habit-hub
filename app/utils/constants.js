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
