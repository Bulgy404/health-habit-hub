import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveConsentDocument,
  describeConsentDocument,
  checkConsentDocumentReadiness,
  listConsentDocumentSlugs,
  getConsentDocumentForEdit,
  validateConsentDocumentInput,
  consentGateForStudyUpdate,
  isValidSlug,
} from '../../services/consentDocumentService.js';

/**
 * The one document that actually ships, used here as the file-backed fixture so
 * these tests fail if it is ever deleted or renamed without the callers being
 * updated.
 */
const SHIPPED_SLUG = 'habconnect-clinical';

/**
 * Minimal Mongo fake — the repo does not use mongodb-memory-server, and these
 * queries are simple enough that a hand-rolled double is clearer than a real
 * database would be.
 */
function makeDb({ docs = [], studies = [] } = {}) {
  return {
    collection(name) {
      if (name === 'studies') {
        return {
          async distinct(field) {
            return studies
              .map((s) =>
                field
                  .split('.')
                  .reduce((acc, k) => (acc == null ? acc : acc[k]), s)
              )
              .filter((v) => v != null);
          },
          find() {
            return {
              async toArray() {
                return studies;
              },
            };
          },
        };
      }
      return {
        async findOne(filter) {
          return (
            docs.find(
              (d) => d.slug === filter.slug && d.lang === filter.lang
            ) ?? null
          );
        },
        async distinct() {
          return [...new Set(docs.map((d) => d.slug))];
        },
      };
    },
  };
}

function dbRow(overrides = {}) {
  return {
    slug: SHIPPED_SLUG,
    lang: 'de',
    body: '# Aus der Datenbank\n\nEin ausreichend langer Text für die Prüfung.',
    version: '2.0.0',
    effectiveDate: '2026-10-01',
    bindingLanguage: 'de',
    status: 'published',
    updatedAt: new Date('2026-10-01T00:00:00Z'),
    updatedBy: 'admin-1',
    ...overrides,
  };
}

describe('consentDocumentService — resolution', () => {
  it('falls back to the shipped file when the database has no override', async () => {
    const doc = await resolveConsentDocument({
      db: makeDb(),
      lang: 'de',
      slug: SHIPPED_SLUG,
    });
    assert.equal(doc.source, 'file');
    assert.match(doc.html, /<h1/);
    assert.equal(doc.meta.version, '1.0.0');
  });

  it('works with no database at all — an unreachable Mongo must not take the shipped document down', async () => {
    const doc = await resolveConsentDocument({
      db: null,
      lang: 'en',
      slug: SHIPPED_SLUG,
    });
    assert.equal(doc.source, 'file');
  });

  it('prefers the database override over the file', async () => {
    const doc = await resolveConsentDocument({
      db: makeDb({ docs: [dbRow()] }),
      lang: 'de',
      slug: SHIPPED_SLUG,
    });
    assert.equal(doc.source, 'db');
    assert.equal(doc.meta.version, '2.0.0');
    assert.match(doc.html, /Aus der Datenbank/);
  });

  it('overrides one language without affecting the others', async () => {
    const db = makeDb({ docs: [dbRow()] });
    assert.equal(
      (await resolveConsentDocument({ db, lang: 'de', slug: SHIPPED_SLUG }))
        .source,
      'db'
    );
    assert.equal(
      (await resolveConsentDocument({ db, lang: 'nl', slug: SHIPPED_SLUG }))
        .source,
      'file'
    );
  });

  it('returns null for a slug nothing has written, so the caller can 404', async () => {
    const doc = await resolveConsentDocument({
      db: makeDb(),
      lang: 'de',
      slug: 'no-such-document',
    });
    assert.equal(doc, null);
  });

  it('refuses a path-traversal slug rather than reading an arbitrary file', async () => {
    // Two independent barriers: the slug pattern, and the fact that the path
    // handed to readFile is assembled from a directory listing rather than
    // from the request — so caller text never reaches the filesystem call and
    // a traversal attempt simply matches no entry.
    for (const slug of [
      '../privacy',
      'a/../../etc/passwd',
      '../../package',
      'Consent',
      '',
    ]) {
      assert.equal(
        await resolveConsentDocument({ db: makeDb(), lang: 'de', slug }),
        null,
        `slug ${JSON.stringify(slug)} must not resolve`
      );
    }
  });

  it('refuses an unsupported language', async () => {
    assert.equal(
      await resolveConsentDocument({
        db: makeDb(),
        lang: 'es',
        slug: SHIPPED_SLUG,
      }),
      null
    );
  });

  it('falls back to the English DATABASE override when the requested language has none', async () => {
    // A slug that has no shipped file at all in any language — the only
    // thing serving it is a database override in English.
    const db = makeDb({
      docs: [dbRow({ slug: 'db-english-only', lang: 'en' })],
    });
    const doc = await resolveConsentDocument({
      db,
      lang: 'nl',
      slug: 'db-english-only',
    });
    assert.equal(doc.source, 'db');
    assert.match(doc.html, /Aus der Datenbank/);
  });

  it('falls back to the shipped English FILE when neither the requested language nor an English override exists in the database', async () => {
    // `verified-template` ships as a file only in en and de.
    const doc = await resolveConsentDocument({
      db: makeDb(),
      lang: 'nl',
      slug: 'verified-template',
    });
    assert.equal(doc.source, 'file');
    assert.match(doc.html, /Additional consent/);
  });

  it('prefers the shipped file in the requested language over falling back to English', async () => {
    // 'de' has its own shipped file for verified-template — must not fall
    // back to English when the requested language's own file exists.
    const doc = await resolveConsentDocument({
      db: makeDb(),
      lang: 'de',
      slug: 'verified-template',
    });
    assert.equal(doc.source, 'file');
  });
});

describe('consentDocumentService — describe', () => {
  it('reports every supported language, with its source', async () => {
    const rows = await describeConsentDocument({
      db: makeDb({ docs: [dbRow()] }),
      slug: SHIPPED_SLUG,
    });
    assert.deepEqual(rows.map((r) => r.lang).sort(), [
      'de',
      'en',
      'fr',
      'ja',
      'nl',
    ]);
    assert.equal(rows.find((r) => r.lang === 'de').source, 'db');
    assert.equal(rows.find((r) => r.lang === 'en').source, 'file');
  });

  it('marks a slug written nowhere as missing in every language', async () => {
    const rows = await describeConsentDocument({
      db: makeDb(),
      slug: 'not-written-yet',
    });
    assert.ok(rows.every((r) => r.source === 'missing'));
  });
});

describe('consentDocumentService — readiness', () => {
  it('refuses the shipped draft: it still carries ⟦…⟧ placeholders', async () => {
    const r = await checkConsentDocumentReadiness({
      db: makeDb(),
      slug: SHIPPED_SLUG,
    });
    assert.equal(r.ready, false);
    assert.ok(r.reasons.some((x) => x.startsWith('draft_languages:')));
    assert.ok(r.reasons.some((x) => x.startsWith('placeholders_remain:')));
  });

  it('refuses a slug that does not exist', async () => {
    const r = await checkConsentDocumentReadiness({
      db: makeDb(),
      slug: 'nothing-here',
    });
    assert.deepEqual(r.reasons, ['document_not_found']);
  });

  it('refuses an invalid slug without touching the filesystem', async () => {
    const r = await checkConsentDocumentReadiness({
      db: makeDb(),
      slug: '../escape',
    });
    assert.deepEqual(r.reasons, ['invalid_slug']);
  });

  it('blocks on a missing ENGLISH document even though another language is authored', async () => {
    // Only 'de' is present here — English itself has never been written.
    // English is the one hard requirement, so this must still block.
    const r = await checkConsentDocumentReadiness({
      db: makeDb({ docs: [dbRow({ slug: 'partial' })] }),
      slug: 'partial',
    });
    assert.equal(r.ready, false);
    assert.ok(r.reasons.includes('missing_languages:en'));
    // The other, still-unauthored languages (ja, fr, nl) must NOT be named as
    // blocking reasons — their absence is fine, only English's isn't.
    assert.ok(
      !r.reasons.some((x) => x.startsWith('missing_languages:') && x !== 'missing_languages:en')
    );
  });

  it('accepts a document published in every language at one version', async () => {
    const docs = ['en', 'de', 'ja', 'fr', 'nl'].map((lang) =>
      dbRow({ slug: 'ready-doc', lang })
    );
    const r = await checkConsentDocumentReadiness({
      db: makeDb({ docs }),
      slug: 'ready-doc',
    });
    assert.deepEqual(r.reasons, []);
    assert.equal(r.ready, true);
  });

  it('is ready with ONLY English authored — the other four languages are optional', async () => {
    const r = await checkConsentDocumentReadiness({
      db: makeDb({ docs: [dbRow({ slug: 'english-only', lang: 'en' })] }),
      slug: 'english-only',
    });
    assert.deepEqual(r.reasons, []);
    assert.equal(r.ready, true);
  });

  it('still blocks when English itself is a draft, even if other languages are published', async () => {
    const docs = [
      dbRow({ slug: 'en-draft', lang: 'en', status: 'draft' }),
      dbRow({ slug: 'en-draft', lang: 'de', status: 'published' }),
    ];
    const r = await checkConsentDocumentReadiness({
      db: makeDb({ docs }),
      slug: 'en-draft',
    });
    assert.equal(r.ready, false);
    assert.ok(r.reasons.some((x) => x.startsWith('draft_languages:') && x.includes('en')));
  });

  it('still blocks when English has placeholders remaining', async () => {
    const docs = [
      dbRow({
        slug: 'en-placeholder',
        lang: 'en',
        body: 'A text with ⟦Placeholder⟧ that is long enough for the check.',
      }),
    ];
    const r = await checkConsentDocumentReadiness({
      db: makeDb({ docs }),
      slug: 'en-placeholder',
    });
    assert.equal(r.ready, false);
    assert.ok(r.reasons.some((x) => x.startsWith('placeholders_remain:') && x.includes('en')));
  });

  it('still blocks on a half-written, optional non-English draft when it IS authored', async () => {
    // English alone would be ready, but a German draft has been started and
    // must not silently go live just because German isn't the required one.
    const docs = [
      dbRow({ slug: 'de-draft', lang: 'en', status: 'published' }),
      dbRow({ slug: 'de-draft', lang: 'de', status: 'draft' }),
    ];
    const r = await checkConsentDocumentReadiness({
      db: makeDb({ docs }),
      slug: 'de-draft',
    });
    assert.equal(r.ready, false);
    assert.ok(r.reasons.some((x) => x.startsWith('draft_languages:') && x.includes('de')));
  });

  it('refuses when locales sit at different versions — an acceptance record would be ambiguous', async () => {
    const docs = ['en', 'de', 'ja', 'fr', 'nl'].map((lang, i) =>
      dbRow({ slug: 'skewed', lang, version: i === 0 ? '2.0.1' : '2.0.0' })
    );
    const r = await checkConsentDocumentReadiness({
      db: makeDb({ docs }),
      slug: 'skewed',
    });
    assert.equal(r.ready, false);
    assert.ok(r.reasons.some((x) => x.startsWith('version_mismatch:')));
  });

  it('refuses a published document that still contains a placeholder', async () => {
    const docs = ['en', 'de', 'ja', 'fr', 'nl'].map((lang) =>
      dbRow({
        slug: 'blanks',
        lang,
        body: 'Ein Text mit ⟦Platzhalter⟧, der lang genug für die Prüfung ist.',
      })
    );
    const r = await checkConsentDocumentReadiness({
      db: makeDb({ docs }),
      slug: 'blanks',
    });
    assert.equal(r.ready, false);
    assert.ok(r.reasons.some((x) => x.startsWith('placeholders_remain:')));
  });
});

describe('consentDocumentService — listing', () => {
  it('lists shipped documents but never the *-template pattern files', async () => {
    const slugs = await listConsentDocumentSlugs({ db: makeDb() });
    assert.ok(slugs.includes(SHIPPED_SLUG));
    assert.ok(!slugs.some((s) => s.endsWith('-template')));
  });

  it('includes a slug a study references but nobody has written', async () => {
    const slugs = await listConsentDocumentSlugs({
      db: makeDb({
        studies: [{ identity: { consentDocumentSlug: 'ghost-slug' } }],
      }),
    });
    assert.ok(slugs.includes('ghost-slug'));
  });

  it('de-duplicates a slug that exists as a file, a row and a reference', async () => {
    const slugs = await listConsentDocumentSlugs({
      db: makeDb({
        docs: [dbRow()],
        studies: [{ identity: { consentDocumentSlug: SHIPPED_SLUG } }],
      }),
    });
    assert.equal(slugs.filter((s) => s === SHIPPED_SLUG).length, 1);
  });
});

describe('consentDocumentService — editing', () => {
  it('offers the shipped text alongside the override so an admin sees what they replaced', async () => {
    const doc = await getConsentDocumentForEdit({
      db: makeDb({ docs: [dbRow()] }),
      slug: SHIPPED_SLUG,
      lang: 'de',
    });
    assert.equal(doc.source, 'db');
    assert.match(doc.body, /Aus der Datenbank/);
    assert.equal(doc.fileAvailable, true);
    assert.match(doc.fileBody, /Zusätzliche Einwilligung/);
  });

  it('seeds a new language from nothing without throwing', async () => {
    const doc = await getConsentDocumentForEdit({
      db: makeDb(),
      slug: 'brand-new',
      lang: 'nl',
    });
    assert.equal(doc.source, 'missing');
    assert.equal(doc.body, '');
    assert.equal(doc.status, 'draft');
    assert.equal(doc.fileAvailable, false);
  });
});

describe('consentDocumentService — input validation', () => {
  const valid = {
    body: 'x'.repeat(60),
    version: '1.0.0',
    effectiveDate: '2026-09-04',
    status: 'published',
  };

  it('accepts a well-formed published document', () => {
    assert.deepEqual(validateConsentDocumentInput(valid), []);
  });

  it('rejects a stub — an empty consent form must not be savable', () => {
    assert.ok(
      validateConsentDocumentInput({ ...valid, body: 'too short' }).includes(
        'body_too_short'
      )
    );
  });

  it('rejects a non-semver version, which acceptance records depend on', () => {
    assert.ok(
      validateConsentDocumentInput({ ...valid, version: 'v1' }).includes(
        'invalid_version'
      )
    );
  });

  it('rejects a malformed effective date', () => {
    assert.ok(
      validateConsentDocumentInput({
        ...valid,
        effectiveDate: '04.09.2026',
      }).includes('invalid_effective_date')
    );
  });

  it('blocks PUBLISHING text with placeholders left in it', () => {
    assert.ok(
      validateConsentDocumentInput({
        ...valid,
        body: `${'x'.repeat(60)} ⟦Ethikvotum⟧`,
      }).includes('placeholders_remain')
    );
  });

  it('allows SAVING A DRAFT with placeholders — that is what a draft is for', () => {
    assert.deepEqual(
      validateConsentDocumentInput({
        ...valid,
        status: 'draft',
        body: `${'x'.repeat(60)} ⟦Ethikvotum⟧`,
      }),
      []
    );
  });
});

describe('consentDocumentService — slug validation', () => {
  it('accepts lowercase slugs and rejects anything that could escape the directory', () => {
    assert.ok(isValidSlug('habconnect-clinical'));
    assert.ok(isValidSlug('a'));
    for (const bad of [
      '',
      '-leading',
      'UPPER',
      'has space',
      '../etc',
      'a/b',
      'a'.repeat(65),
      null,
      undefined,
    ]) {
      assert.equal(isValidSlug(bad), false, `${JSON.stringify(bad)}`);
    }
  });
});

describe('consentDocumentService — study configuration gate', () => {
  const readyDocs = ['en', 'de', 'ja', 'fr', 'nl'].map((lang) =>
    dbRow({ slug: 'ready-doc', lang })
  );

  it('lets an anonymous study through untouched', async () => {
    const blocked = await consentGateForStudyUpdate({
      db: makeDb(),
      study: { identity: { mode: 'anonymous' } },
      identityUpdate: { mode: 'anonymous', consentDocumentSlug: SHIPPED_SLUG },
    });
    assert.equal(blocked, null);
  });

  it('lets a study update with no identity block through — the common case', async () => {
    assert.equal(
      await consentGateForStudyUpdate({
        db: makeDb(),
        study: { identity: { mode: 'verified' } },
        identityUpdate: undefined,
      }),
      null
    );
  });

  it('refuses to turn on verified mode with a document that is not ready', async () => {
    const blocked = await consentGateForStudyUpdate({
      db: makeDb(),
      study: { identity: { mode: 'anonymous' } },
      identityUpdate: { mode: 'verified', consentDocumentSlug: SHIPPED_SLUG },
    });
    assert.equal(blocked.error, 'consent_document_not_ready');
    assert.equal(blocked.slug, SHIPPED_SLUG);
    assert.ok(blocked.reasons.length > 0);
  });

  it('allows verified mode with a document published in every language', async () => {
    assert.equal(
      await consentGateForStudyUpdate({
        db: makeDb({ docs: readyDocs }),
        study: { identity: { mode: 'anonymous' } },
        identityUpdate: { mode: 'verified', consentDocumentSlug: 'ready-doc' },
      }),
      null
    );
  });

  it('allows verified mode with no slug at all — no extra consent gate is a valid choice', async () => {
    assert.equal(
      await consentGateForStudyUpdate({
        db: makeDb(),
        study: { identity: { mode: 'anonymous' } },
        identityUpdate: { mode: 'verified', consentDocumentSlug: null },
      }),
      null
    );
  });

  it('refuses switching a live verified study to an unready document', async () => {
    const blocked = await consentGateForStudyUpdate({
      db: makeDb({ docs: readyDocs }),
      study: {
        identity: { mode: 'verified', consentDocumentSlug: 'ready-doc' },
      },
      identityUpdate: { consentDocumentSlug: SHIPPED_SLUG },
    });
    assert.equal(blocked.error, 'consent_document_not_ready');
  });

  it('does NOT re-check when neither mode nor slug changes — a later draft flip must not block unrelated edits', async () => {
    const blocked = await consentGateForStudyUpdate({
      db: makeDb(),
      study: {
        identity: { mode: 'verified', consentDocumentSlug: SHIPPED_SLUG },
      },
      identityUpdate: { revealTtlMinutes: 30 },
    });
    assert.equal(blocked, null);
  });

  it('does not re-check when the slug is re-sent unchanged', async () => {
    assert.equal(
      await consentGateForStudyUpdate({
        db: makeDb(),
        study: {
          identity: { mode: 'verified', consentDocumentSlug: SHIPPED_SLUG },
        },
        identityUpdate: {
          mode: 'verified',
          consentDocumentSlug: SHIPPED_SLUG,
        },
      }),
      null
    );
  });
});
