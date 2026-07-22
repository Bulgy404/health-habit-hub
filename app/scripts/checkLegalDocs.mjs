/**
 * Legal-document consistency check (CI gate).
 *
 * Asserts for every legal document (privacy, imprint, accessibility):
 *   1. every locale file (en, de, ja) exists and has a front matter block
 *   2. front matter contains version, effectiveDate, bindingLanguage
 *   3. version and effectiveDate are IDENTICAL across all locales of a
 *      document — a change to one translation must bump all of them,
 *      so translations cannot silently drift apart
 *   4. version is semver-ish (x.y.z) and effectiveDate is YYYY-MM-DD
 *
 * Usage: node scripts/checkLegalDocs.mjs   (run from app/)
 * Exit code 1 on any violation.
 */
import { readFileSync } from 'fs';
import path from 'path';
import { parseFrontMatter } from '../utils/markdown.js';

// Must cover every locale actually served at /:lng/{doc} (see app/language/*).
// fr and nl were previously missing here, so those two could silently drift out
// of sync with the binding German version without CI noticing.
const LANGS = ['en', 'de', 'ja', 'fr', 'nl'];
const DOCS = ['privacy', 'imprint', 'accessibility', 'consent'];
const REQUIRED_KEYS = ['version', 'effectiveDate', 'bindingLanguage'];

let failures = 0;
const fail = (msg) => {
  failures += 1;
  console.error(`✗ ${msg}`);
};

for (const doc of DOCS) {
  const metas = {};

  for (const lang of LANGS) {
    const file = path.join('language', lang, `${doc}.md`);
    let raw;
    try {
      raw = readFileSync(file, 'utf-8');
    } catch {
      fail(`${file}: file missing`);
      continue;
    }
    const { meta } = parseFrontMatter(raw);
    if (Object.keys(meta).length === 0) {
      fail(`${file}: no front matter block`);
      continue;
    }
    for (const key of REQUIRED_KEYS) {
      if (!meta[key]) fail(`${file}: missing front matter key "${key}"`);
    }
    if (meta.version && !/^\d+\.\d+\.\d+$/.test(meta.version)) {
      fail(`${file}: version "${meta.version}" is not x.y.z`);
    }
    if (meta.effectiveDate && !/^\d{4}-\d{2}-\d{2}$/.test(meta.effectiveDate)) {
      fail(`${file}: effectiveDate "${meta.effectiveDate}" is not YYYY-MM-DD`);
    }
    metas[lang] = meta;
  }

  // Cross-locale consistency
  const langs = Object.keys(metas);
  for (const key of ['version', 'effectiveDate']) {
    const values = new Set(langs.map((l) => metas[l]?.[key]));
    if (values.size > 1) {
      fail(
        `${doc}: ${key} differs across locales — ` +
          langs.map((l) => `${l}=${metas[l]?.[key]}`).join(', ') +
          ` (bump all locales together)`
      );
    }
  }
}

if (failures) {
  console.error(`\n${failures} legal-document check(s) failed.`);
  process.exit(1);
}
console.log(
  `✓ Legal documents consistent: ${DOCS.length} documents × ${LANGS.length} locales`
);
