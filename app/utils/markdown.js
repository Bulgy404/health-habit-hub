import { readFile } from 'fs/promises';
import path from 'path';
import { marked } from 'marked';

/**
 * Every locale the participant app serves legal documents in.
 *
 * Exported because a study consent document has to exist in ALL of them —
 * `req.lang` decides which file is read, so a document written only in German
 * 404s a Dutch participant *after* they have already enrolled. The admin
 * portal and scripts/checkLegalDocs.mjs both check completeness against this
 * list; neither should keep its own copy of it.
 */
export const SUPPORTED_LANGS = Object.freeze(['en', 'de', 'ja', 'fr', 'nl']);

const ALLOWED_LANGS = new Set(SUPPORTED_LANGS);
const ALLOWED_NAMES = new Set([
  'accessibility',
  'imprint',
  'privacy',
  'consent',
]);

/**
 * Parse a simple `key: value` YAML front matter block delimited by `---` lines.
 * Only flat string values are supported — sufficient for legal-document
 * metadata (version, effectiveDate, bindingLanguage) without adding a YAML
 * dependency.
 *
 * @param {string} raw Raw markdown file content.
 * @returns {{ meta: Record<string, string>, body: string }} Parsed metadata
 *   and the markdown body with the front matter stripped. `meta` is empty if
 *   no front matter block is present.
 */
export function parseFrontMatter(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return { meta: {}, body: raw };

  const meta = {};
  for (const line of match[1].split(/\r?\n/)) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (key) meta[key] = value;
  }
  return { meta, body: raw.slice(match[0].length) };
}

/**
 * Load a legal markdown document, strip and parse its front matter, and
 * render the body to HTML.
 *
 * @param {string} lang Locale code (`en` | `de` | `ja` | `fr` | `nl`).
 * @param {string} name Document name (`accessibility` | `imprint` | `privacy`).
 * @returns {Promise<{ html: string, meta: Record<string, string> }>} Rendered
 *   HTML and document metadata (version, effectiveDate, bindingLanguage).
 * @throws {Error} If lang or name is not in the allow-list.
 */
/**
 * Study-specific consent documents, e.g. `consent-dfg-verified`.
 *
 * These cannot be enumerated in ALLOWED_NAMES because a slug is chosen per
 * study at configuration time. The pattern is strict — lowercase alphanumerics
 * and dashes only — so a slug can never contain `/`, `.` or `..` and therefore
 * cannot escape the language directory, which is the only thing the allow-list
 * was protecting against here.
 */
export const STUDY_CONSENT_NAME = /^consent-[a-z0-9][a-z0-9-]{0,63}$/;

/** The slug alone, without the `consent-` prefix. Shared with the API layer. */
export const STUDY_CONSENT_SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;

export async function loadMarkdown(lang, name) {
  const nameAllowed = ALLOWED_NAMES.has(name) || STUDY_CONSENT_NAME.test(name);
  if (!ALLOWED_LANGS.has(lang) || !nameAllowed) {
    throw new Error(`Invalid markdown request: lang=${lang} name=${name}`);
  }
  const filePath = path.join('language', lang, `${name}.md`);
  const raw = await readFile(filePath, 'utf-8');
  const { meta, body } = parseFrontMatter(raw);
  return { html: marked.parse(body), meta };
}
