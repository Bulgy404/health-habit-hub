/**
 * Study consent documents — resolution, readiness and editing.
 *
 * A study consent document lives in two places, deliberately:
 *
 *   1. `app/language/<lang>/consent-<slug>.md` — shipped with the image, under
 *      version control, gated by scripts/checkLegalDocs.mjs.
 *   2. `study_consent_documents` in Mongo — edited in the admin portal.
 *
 * The database wins where a row exists. That ordering is the point: a wording
 * change agreed with an ethics committee mid-study must not need a redeploy,
 * but a deployment with an empty database must still serve the document that
 * shipped with it.
 */

import { readFile, readdir } from 'fs/promises';
import path from 'path';
import { marked } from 'marked';
import {
  parseFrontMatter,
  SUPPORTED_LANGS,
  STUDY_CONSENT_SLUG,
} from '../utils/markdown.js';
import { COLLECTION } from '../models/studyConsentDocument.js';

/**
 * Marks the things software cannot know — the recruiting institution, the
 * ethics reference, the retention period. A document still carrying them is
 * unfinished, and attaching it to a study is refused.
 */
export const PLACEHOLDER_OPEN = '⟦';

const LANG_DIR = (lang) => path.join('language', lang);

/** @returns {boolean} */
export function isValidSlug(slug) {
  return typeof slug === 'string' && STUDY_CONSENT_SLUG.test(slug);
}

/**
 * Read one shipped document from disk.
 *
 * Validates the slug and the locale HERE rather than trusting the caller.
 * Every current caller already checks, so this is redundant today — which is
 * exactly why it is worth writing down: `describeConsentDocument` is exported,
 * the slug reaches this function from a URL path segment, and the next caller
 * to be added is the one that forgets. A `..` here reads an arbitrary file off
 * the container filesystem.
 *
 * The result is resolved and re-checked against the language directory as
 * well, so the guarantee does not rest on the pattern alone.
 *
 * @returns {Promise<{meta: Record<string,string>, body: string}|null>} null when
 *   the file does not exist — a missing document is an ordinary state here, not
 *   an error, because most slugs exist in only some locales while being written.
 */
async function readFileDocument(lang, slug) {
  if (!isValidSlug(slug) || !SUPPORTED_LANGS.includes(lang)) return null;

  // The path handed to readFile is built from a DIRECTORY LISTING, never from
  // the request. The slug is only ever compared against names the filesystem
  // produced, so no caller-supplied text reaches the path at all — a `..`
  // simply matches nothing.
  //
  // The pattern check above already made traversal impossible; this makes it
  // impossible to *analyse* it as anything else, which matters because the
  // slug arrives from a URL path segment and a reviewer (human or CodeQL)
  // should not have to trace a regex in another function to be sure.
  const dir = path.resolve(LANG_DIR(lang));
  const wanted = `consent-${slug}.md`;

  let entries;
  try {
    entries = await readdir(dir);
  } catch (err) {
    if (err?.code === 'ENOENT') return null;
    throw err;
  }

  const match = entries.find((name) => name === wanted);
  if (!match) return null;

  try {
    return parseFrontMatter(await readFile(path.join(dir, match), 'utf-8'));
  } catch (err) {
    // Still possible: the file was removed between listing and reading.
    if (err?.code === 'ENOENT') return null;
    throw err;
  }
}

/** Read one database override, or null. */
async function readDbDocument(db, lang, slug) {
  if (!db) return null;
  return db.collection(COLLECTION).findOne({ slug, lang });
}

/**
 * Resolve the document a participant should see.
 *
 * @param {{db?: import('mongodb').Db, lang: string, slug: string}} args
 * @returns {Promise<{html: string, meta: object, source: 'db'|'file'}|null>}
 *   null when neither source has it — the caller turns that into the 404 that
 *   says "operator error", not the 500 that looks like an outage.
 */
export async function resolveConsentDocument({ db, lang, slug }) {
  if (!isValidSlug(slug) || !SUPPORTED_LANGS.includes(lang)) return null;

  const row = await readDbDocument(db, lang, slug);
  if (row) {
    return {
      html: marked.parse(row.body),
      meta: {
        version: row.version,
        effectiveDate: row.effectiveDate,
        bindingLanguage: row.bindingLanguage ?? null,
        status: row.status,
      },
      source: 'db',
    };
  }

  const file = await readFileDocument(lang, slug);
  if (!file) return null;
  return { html: marked.parse(file.body), meta: file.meta, source: 'file' };
}

/**
 * Per-language state of one document, for the admin portal and for readiness.
 *
 * @returns {Promise<Array<{lang: string, source: 'db'|'file'|'missing',
 *   version: string|null, effectiveDate: string|null, status: string|null,
 *   hasPlaceholders: boolean, updatedAt: Date|null, updatedBy: string|null}>>}
 */
export async function describeConsentDocument({ db, slug }) {
  const out = [];
  for (const lang of SUPPORTED_LANGS) {
    const row = await readDbDocument(db, lang, slug);
    if (row) {
      out.push({
        lang,
        source: 'db',
        version: row.version,
        effectiveDate: row.effectiveDate,
        bindingLanguage: row.bindingLanguage ?? null,
        status: row.status,
        hasPlaceholders: row.body.includes(PLACEHOLDER_OPEN),
        updatedAt: row.updatedAt ?? null,
        updatedBy: row.updatedBy ?? null,
      });
      continue;
    }

    const file = await readFileDocument(lang, slug);
    if (!file) {
      out.push({
        lang,
        source: 'missing',
        version: null,
        effectiveDate: null,
        bindingLanguage: null,
        status: null,
        hasPlaceholders: false,
        updatedAt: null,
        updatedBy: null,
      });
      continue;
    }
    out.push({
      lang,
      source: 'file',
      version: file.meta.version ?? null,
      effectiveDate: file.meta.effectiveDate ?? null,
      bindingLanguage: file.meta.bindingLanguage ?? null,
      // A shipped file with no explicit status is treated as published: the
      // platform's own documents predate this field and are live.
      status: file.meta.status ?? 'published',
      hasPlaceholders: file.body.includes(PLACEHOLDER_OPEN),
      updatedAt: null,
      updatedBy: null,
    });
  }
  return out;
}

/**
 * Is this document fit to be attached to a study?
 *
 * This is the check that closes the failure the runbook warns about: a slug
 * configured with no document 404s the participant AFTER they have enrolled,
 * which is the worst possible moment. Blocking at configuration time moves the
 * error to the person who can fix it.
 *
 * @returns {Promise<{ready: boolean, reasons: string[], languages: object[]}>}
 */
export async function checkConsentDocumentReadiness({ db, slug }) {
  if (!isValidSlug(slug)) {
    return { ready: false, reasons: ['invalid_slug'], languages: [] };
  }

  const languages = await describeConsentDocument({ db, slug });
  const reasons = [];

  const missing = languages.filter((l) => l.source === 'missing');
  if (missing.length === SUPPORTED_LANGS.length) {
    reasons.push('document_not_found');
  } else if (missing.length) {
    reasons.push(`missing_languages:${missing.map((l) => l.lang).join(',')}`);
  }

  const present = languages.filter((l) => l.source !== 'missing');
  const drafts = present.filter((l) => l.status !== 'published');
  if (drafts.length) {
    reasons.push(`draft_languages:${drafts.map((l) => l.lang).join(',')}`);
  }

  const withPlaceholders = present.filter((l) => l.hasPlaceholders);
  if (withPlaceholders.length) {
    reasons.push(
      `placeholders_remain:${withPlaceholders.map((l) => l.lang).join(',')}`
    );
  }

  // Versions must agree across locales for the same reason the platform
  // documents must: `consents.consentVersion` is a bare semver, so two locales
  // at different versions make an acceptance record ambiguous about which text
  // the participant actually read.
  const versions = new Set(present.map((l) => l.version));
  if (versions.size > 1) {
    reasons.push(`version_mismatch:${[...versions].join(',')}`);
  }

  return { ready: reasons.length === 0, reasons, languages };
}

/**
 * Should this study update be refused because it attaches a consent document
 * a participant could not actually read?
 *
 * Kept here rather than in the router so it can be tested without standing up
 * an Express app, and so the rule lives next to the readiness check it uses.
 *
 * Applies only when the study is (or is becoming) verified AND names a slug: a
 * verified study with no slug simply has no extra consent gate, which is a
 * legitimate configuration when the platform document already covers it.
 *
 * Re-checks only when the mode or the slug is actually CHANGING. An unrelated
 * edit to a live study must not start failing because someone later flipped
 * that document back to draft — the participants who already accepted it are
 * unaffected, and blocking the edit would help nobody.
 *
 * @param {{db: import('mongodb').Db, study: object|null, identityUpdate: object|undefined}} args
 * @returns {Promise<{error: string, slug: string, reasons: string[]}|null>}
 *   A 409 body, or null to proceed.
 */
export async function consentGateForStudyUpdate({ db, study, identityUpdate }) {
  if (!identityUpdate || typeof identityUpdate !== 'object') return null;

  const currentMode = study?.identity?.mode ?? 'anonymous';
  const currentSlug = study?.identity?.consentDocumentSlug ?? null;

  const mode = identityUpdate.mode ?? currentMode;
  if (mode !== 'verified') return null;

  const slug = Object.hasOwn(identityUpdate, 'consentDocumentSlug')
    ? identityUpdate.consentDocumentSlug
    : currentSlug;
  if (!slug) return null;

  const changingMode =
    identityUpdate.mode != null && identityUpdate.mode !== currentMode;
  const changingSlug =
    Object.hasOwn(identityUpdate, 'consentDocumentSlug') &&
    identityUpdate.consentDocumentSlug !== currentSlug;
  if (!changingMode && !changingSlug) return null;

  const readiness = await checkConsentDocumentReadiness({ db, slug });
  if (readiness.ready) return null;

  return {
    error: 'consent_document_not_ready',
    slug,
    reasons: readiness.reasons,
  };
}

/**
 * Every slug known to the deployment: shipped as a file, stored in the
 * database, or referenced by a study. The third source matters — a study
 * pointing at a slug nobody has written yet is exactly what the portal needs
 * to surface.
 *
 * @returns {Promise<string[]>} sorted, de-duplicated
 */
export async function listConsentDocumentSlugs({ db }) {
  const slugs = new Set();

  for (const lang of SUPPORTED_LANGS) {
    let entries = [];
    try {
      entries = await readdir(LANG_DIR(lang));
    } catch {
      continue;
    }
    for (const file of entries) {
      const m = /^consent-([a-z0-9][a-z0-9-]*)\.md$/.exec(file);
      // `*-template` files are patterns to copy, not documents to serve.
      if (m && !m[1].endsWith('-template')) slugs.add(m[1]);
    }
  }

  if (db) {
    for (const s of await db.collection(COLLECTION).distinct('slug')) {
      if (isValidSlug(s)) slugs.add(s);
    }
    const referenced = await db
      .collection('studies')
      .distinct('identity.consentDocumentSlug');
    for (const s of referenced) {
      if (isValidSlug(s)) slugs.add(s);
    }
  }

  return [...slugs].sort();
}

/**
 * Which studies point at a slug — shown next to it in the portal, so nobody
 * edits a live document thinking it is a spare.
 */
export async function studiesUsingSlug({ db, slug }) {
  if (!db) return [];
  const rows = await db
    .collection('studies')
    .find(
      { 'identity.consentDocumentSlug': slug },
      { projection: { name: 1, 'identity.mode': 1 } }
    )
    .toArray();
  return rows.map((s) => ({
    id: s._id.toString(),
    name: s.name ?? null,
    mode: s.identity?.mode ?? 'anonymous',
  }));
}

/**
 * Load one language for editing. Returns the live text plus, separately, the
 * shipped text — so the editor can offer "restore the shipped wording" without
 * a second round trip, and so an admin can see what they are overriding.
 */
export async function getConsentDocumentForEdit({ db, slug, lang }) {
  if (!isValidSlug(slug) || !SUPPORTED_LANGS.includes(lang)) return null;

  const row = await readDbDocument(db, lang, slug);
  const file = await readFileDocument(lang, slug);

  return {
    slug,
    lang,
    source: row ? 'db' : file ? 'file' : 'missing',
    body: row?.body ?? file?.body ?? '',
    version: row?.version ?? file?.meta?.version ?? '1.0.0',
    effectiveDate:
      row?.effectiveDate ??
      file?.meta?.effectiveDate ??
      new Date().toISOString().slice(0, 10),
    bindingLanguage:
      row?.bindingLanguage ?? file?.meta?.bindingLanguage ?? 'de',
    status: row?.status ?? file?.meta?.status ?? 'draft',
    updatedAt: row?.updatedAt ?? null,
    updatedBy: row?.updatedBy ?? null,
    fileAvailable: Boolean(file),
    fileBody: file?.body ?? null,
    hasPlaceholders: (row?.body ?? file?.body ?? '').includes(PLACEHOLDER_OPEN),
  };
}

/** Validation shared by save; returns an array of problems, empty when fine. */
export function validateConsentDocumentInput({
  body,
  version,
  effectiveDate,
  status,
}) {
  const problems = [];
  if (typeof body !== 'string' || body.trim().length < 50) {
    problems.push('body_too_short');
  }
  if (!/^\d+\.\d+\.\d+$/.test(String(version ?? ''))) {
    problems.push('invalid_version');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(effectiveDate ?? ''))) {
    problems.push('invalid_effective_date');
  }
  if (!['draft', 'published'].includes(String(status ?? ''))) {
    problems.push('invalid_status');
  }
  // Publishing with blanks still in the text is the one thing this must not
  // allow. Saving a draft with them is normal and expected.
  if (status === 'published' && String(body ?? '').includes(PLACEHOLDER_OPEN)) {
    problems.push('placeholders_remain');
  }
  return problems;
}

/**
 * Create or replace one language of one document.
 *
 * @returns {Promise<{slug: string, lang: string, updatedAt: Date}>}
 */
export async function saveConsentDocument({
  db,
  slug,
  lang,
  body,
  version,
  effectiveDate,
  bindingLanguage,
  status,
  updatedBy,
}) {
  const updatedAt = new Date();
  await db.collection(COLLECTION).updateOne(
    { slug, lang },
    {
      $set: {
        body,
        version: String(version),
        effectiveDate: String(effectiveDate),
        bindingLanguage: bindingLanguage ? String(bindingLanguage) : null,
        status: String(status),
        updatedAt,
        updatedBy: updatedBy ?? null,
      },
      $setOnInsert: { slug, lang },
    },
    { upsert: true }
  );
  return { slug, lang, updatedAt };
}

/**
 * Drop the database override for one language. The shipped file, if any,
 * becomes live again — which is why this is "revert", not "delete", in the UI.
 */
export async function deleteConsentDocumentOverride({ db, slug, lang }) {
  const res = await db.collection(COLLECTION).deleteOne({ slug, lang });
  return res.deletedCount > 0;
}
