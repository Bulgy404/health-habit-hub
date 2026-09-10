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
 * Study-specific consent documents (`consent-<slug>.md`, selected by a study's
 * identity.consentDocumentSlug) get the same treatment plus two rules of their
 * own — see checkStudyConsentDocuments below.
 *
 * Usage: node scripts/checkLegalDocs.mjs   (run from app/)
 * Exit code 1 on any violation.
 */
import { readFileSync, readdirSync } from 'fs';
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

/**
 * Study-specific consent documents — `consent-<slug>.md`, chosen per study via
 * `identity.consentDocumentSlug`.
 *
 * These get the cross-locale checks above plus two of their own, both of which
 * exist because the failure mode is the same and it is bad: the participant
 * has already enrolled by the time they are shown this document, so a missing
 * or half-finished one hits them at the worst possible moment.
 *
 *   - Every locale must be present. `req.lang` decides which file is served,
 *     so a document written only in German 404s a Dutch participant.
 *   - `⟦…⟧` placeholders are allowed ONLY while `status: draft`. They mark
 *     the things software cannot know — the recruiting institution, the ethics
 *     reference, the retention period — and publishing with them still in place
 *     ships a consent form with blanks in it.
 *
 * `*-template.md` files are patterns to copy, not documents to serve, and are
 * skipped entirely.
 */
function checkStudyConsentDocuments() {
  const slugs = new Set();
  for (const lang of LANGS) {
    let entries = [];
    try {
      entries = readdirSync(path.join('language', lang));
    } catch {
      continue; // a missing locale directory is already reported above
    }
    for (const file of entries) {
      const m = /^(consent-[a-z0-9][a-z0-9-]*)\.md$/.exec(file);
      if (m && !m[1].endsWith('-template')) slugs.add(m[1]);
    }
  }

  for (const doc of [...slugs].sort()) {
    const metas = {};
    for (const lang of LANGS) {
      const file = path.join('language', lang, `${doc}.md`);
      let raw;
      try {
        raw = readFileSync(file, 'utf-8');
      } catch {
        fail(
          `${file}: missing — a study consent document must exist in every ` +
            `locale, or participants in that language get a 404 after enrolling`
        );
        continue;
      }
      const { meta, body } = parseFrontMatter(raw);
      for (const key of REQUIRED_KEYS) {
        if (!meta[key]) fail(`${file}: missing front matter key "${key}"`);
      }
      if (meta.version && !/^\d+\.\d+\.\d+$/.test(meta.version)) {
        fail(`${file}: version "${meta.version}" is not x.y.z`);
      }
      if (
        meta.effectiveDate &&
        !/^\d{4}-\d{2}-\d{2}$/.test(meta.effectiveDate)
      ) {
        fail(
          `${file}: effectiveDate "${meta.effectiveDate}" is not YYYY-MM-DD`
        );
      }
      if (meta.status && !['draft', 'published'].includes(meta.status)) {
        fail(`${file}: status "${meta.status}" is not draft|published`);
      }
      if (body.includes('⟦') && meta.status !== 'draft') {
        fail(
          `${file}: contains ⟦…⟧ placeholders but is not marked ` +
            `"status: draft" — fill them in, or mark the document as a draft ` +
            `(a draft cannot be attached to a study)`
        );
      }
      metas[lang] = meta;
    }

    const langs = Object.keys(metas);
    for (const key of ['version', 'effectiveDate', 'status']) {
      const values = new Set(langs.map((l) => metas[l]?.[key]));
      if (values.size > 1) {
        fail(
          `${doc}: ${key} differs across locales — ` +
            langs
              .map((l) => `${l}=${metas[l]?.[key] ?? '(unset)'}`)
              .join(', ') +
            ` (change all locales together)`
        );
      }
    }
    studyConsentDocs.push(doc);
  }
}

const studyConsentDocs = [];
checkStudyConsentDocuments();

if (failures) {
  console.error(`\n${failures} legal-document check(s) failed.`);
  process.exit(1);
}
console.log(
  `✓ Legal documents consistent: ${DOCS.length} documents × ${LANGS.length} locales` +
    (studyConsentDocs.length
      ? `, plus ${studyConsentDocs.length} study consent document(s): ${studyConsentDocs.join(', ')}`
      : '')
);
