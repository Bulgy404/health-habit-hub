import { readFile } from 'fs/promises';
import path from 'path';
import { marked } from 'marked';

const ALLOWED_LANGS = new Set(['en', 'de', 'ja', 'fr', 'nl']);
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
export async function loadMarkdown(lang, name) {
  if (!ALLOWED_LANGS.has(lang) || !ALLOWED_NAMES.has(name)) {
    throw new Error(`Invalid markdown request: lang=${lang} name=${name}`);
  }
  const filePath = path.join('language', lang, `${name}.md`);
  const raw = await readFile(filePath, 'utf-8');
  const { meta, body } = parseFrontMatter(raw);
  return { html: marked.parse(body), meta };
}
