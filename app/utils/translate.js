import { logger } from './logger.js';
import fetch from 'node-fetch';

/**
 * Escape a string for safe embedding inside a SPARQL/Turtle string literal.
 * Handles backslashes, double quotes, and newlines in the correct order.
 * @param {string|null} str
 * @returns {string}
 */
const log = logger.child({ module: 'translate' });

export function escapeStringLiteral(str) {
  if (str == null) return '';
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');
}

/**
 * Translate text using the LibreTranslate API with exponential backoff retry.
 * Returns the translated text on success, or the original text if the service
 * is unavailable after all retries.
 *
 * @param {string} text - Text to translate
 * @param {string} from - Source ISO 639-1 language code
 * @param {string} to - Target ISO 639-1 language code
 * @param {string} endpoint - LibreTranslate API endpoint URL
 * @param {number} [retries=3] - Number of retry attempts
 * @returns {Promise<string>}
 */
// ---------------------------------------------------------------------------
// Habit donation translation pipeline (LibreTranslate → LLM tone refinement)
// ---------------------------------------------------------------------------

async function _fetchLibreTranslation(sentence, sourceLang, targetLang, translateUrl) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    let res;
    try {
      res = await globalThis.fetch(translateUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: sentence, source: sourceLang, target: targetLang, format: 'text' }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
    if (!res.ok) {
      log.warn(`[translate] LibreTranslate returned ${res.status} — skipping translation to ${targetLang.toUpperCase()}`);
      return null;
    }
    const data = await res.json();
    return data.translatedText;
  } catch (err) {
    log.warn(`[translate] LibreTranslate error: ${err.message} — skipping translation to ${targetLang.toUpperCase()}`);
    return null;
  }
}

async function _refineLLMTranslation(draft, sentence, sourceLang, llmEndpoint, apiBase) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    let res;
    try {
      res = await globalThis.fetch(`${apiBase}${llmEndpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ original: sentence, raw_translation: draft, language: sourceLang }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
    if (!res.ok) {
      log.warn(`[translate] LLM ${llmEndpoint} returned ${res.status} — using raw LibreTranslate output`);
      return draft;
    }
    const data = await res.json();
    return data.refined_translation || draft;
  } catch (err) {
    log.warn(`[translate] LLM refinement error/timeout: ${err.message} — using raw LibreTranslate output`);
    return draft;
  }
}

/**
 * Translate a habit sentence via LibreTranslate then refine with an LLM tone endpoint.
 * Returns the refined string, the raw translation if LLM fails, or null if LibreTranslate fails.
 */
export async function translateHabit(sentence, sourceLang, targetLang, llmEndpoint, apiBase, translateUrl) {
  const draft = await _fetchLibreTranslation(sentence, sourceLang, targetLang, translateUrl);
  if (!draft) return null;
  return _refineLLMTranslation(draft, sentence, sourceLang, llmEndpoint, apiBase);
}

// ---------------------------------------------------------------------------

export async function translateText(text, from, to, endpoint, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          q: text,
          source: from,
          target: to,
          format: 'text',
          alternatives: 0,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (response.ok) {
        const translation = await response.json();
        return translation.translatedText;
      }

      throw new Error(
        `Translation failed: ${response.status} ${response.statusText}`
      );
    } catch (error) {
      console.warn(
        `Translation attempt ${attempt}/${retries} failed:`,
        error.message
      );

      if (attempt === retries || !error.message.includes('ECONNREFUSED')) {
        log.error(
          `Translation service unavailable after ${retries} attempts. Returning original text.`
        );
        return text;
      }

      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}
