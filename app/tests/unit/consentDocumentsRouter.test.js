import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import { createServer } from 'node:http';
import express from 'express';
import { createConsentDocumentsRouter } from '../../routes/admin/consentDocumentsRouter.js';

const SHIPPED_SLUG = 'habconnect-clinical';

/**
 * Hand-rolled Mongo double, matching the repo's convention of not pulling in
 * mongodb-memory-server. Only the operations this router performs are
 * implemented: findOne, distinct, find().toArray() and updateOne/deleteOne
 * keyed on (slug, lang).
 */
function makeDb() {
  const docs = [];
  const studies = [];
  return {
    docs,
    studies,
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
          find(query = {}) {
            const [[key, value]] = Object.entries(query).length
              ? Object.entries(query)
              : [[null, null]];
            return {
              async toArray() {
                if (!key) return studies;
                return studies.filter(
                  (s) =>
                    key
                      .split('.')
                      .reduce((acc, k) => (acc == null ? acc : acc[k]), s) ===
                    value
                );
              },
            };
          },
        };
      }
      assert.strictEqual(name, 'study_consent_documents');
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
        async updateOne(filter, update) {
          const existing = docs.find(
            (d) => d.slug === filter.slug && d.lang === filter.lang
          );
          if (existing) {
            Object.assign(existing, update.$set);
            return { matchedCount: 1 };
          }
          docs.push({ ...update.$setOnInsert, ...update.$set });
          return { upsertedCount: 1 };
        },
        async deleteOne(filter) {
          const i = docs.findIndex(
            (d) => d.slug === filter.slug && d.lang === filter.lang
          );
          if (i === -1) return { deletedCount: 0 };
          docs.splice(i, 1);
          return { deletedCount: 1 };
        },
      };
    },
  };
}

function published(lang, overrides = {}) {
  return {
    slug: 'ready-doc',
    lang,
    body: 'Ein vollständiger Einwilligungstext, lang genug für die Validierung.',
    version: '1.0.0',
    effectiveDate: '2026-09-04',
    bindingLanguage: 'de',
    status: 'published',
    updatedAt: new Date('2026-09-04T00:00:00Z'),
    updatedBy: 'u1',
    ...overrides,
  };
}

let app, server, baseUrl, db, currentRoles;

const url = (p) => `${baseUrl}/api/v1/admin${p}`;

before(async () => {
  db = makeDb();
  currentRoles = ['admin'];
  app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = {
      sub: 'u1',
      preferred_username: 'admin1',
      realm_access: { roles: currentRoles },
    };
    next();
  });
  app.use('/api/v1/admin', createConsentDocumentsRouter({ db }));
  server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.closeAllConnections();
  server.close();
});

beforeEach(() => {
  db.docs.length = 0;
  db.studies.length = 0;
  currentRoles = ['admin'];
});

test('lists the shipped document with its per-language state', async () => {
  const res = await fetch(url('/consent-documents'));
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.deepStrictEqual(body.languages, ['en', 'de', 'ja', 'fr', 'nl']);

  const doc = body.documents.find((d) => d.slug === SHIPPED_SLUG);
  assert.ok(doc, 'the shipped document should be listed');
  assert.strictEqual(doc.languages.length, 5);
  assert.ok(doc.languages.every((l) => l.source === 'file'));
});

test('the shipped document is reported NOT ready — it is still a draft with blanks', async () => {
  const res = await fetch(url(`/consent-documents/${SHIPPED_SLUG}`));
  const body = await res.json();
  assert.strictEqual(body.ready, false);
  assert.ok(body.reasons.some((r) => r.startsWith('placeholders_remain:')));
});

test('surfaces a slug a study points at but nobody has written', async () => {
  db.studies.push({
    _id: { toString: () => 's1' },
    name: 'ICU follow-up',
    identity: { mode: 'verified', consentDocumentSlug: 'ghost' },
  });

  const body = await (await fetch(url('/consent-documents'))).json();
  const ghost = body.documents.find((d) => d.slug === 'ghost');
  assert.ok(ghost, 'a referenced-but-unwritten slug must be visible');
  assert.deepStrictEqual(ghost.reasons, ['document_not_found']);
  assert.deepStrictEqual(
    ghost.studies.map((s) => s.name),
    ['ICU follow-up']
  );
});

test('saves a language and reports it as a database override afterwards', async () => {
  const res = await fetch(url('/consent-documents/ready-doc/de'), {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(published('de')),
  });
  assert.strictEqual(res.status, 200);

  const doc = await (
    await fetch(url('/consent-documents/ready-doc/de'))
  ).json();
  assert.strictEqual(doc.source, 'db');
  assert.strictEqual(doc.updatedBy, 'u1');
  assert.strictEqual(doc.fileAvailable, false);
});

test('a document becomes ready only once every language is published', async () => {
  for (const lang of ['en', 'de', 'ja', 'fr']) {
    await fetch(url(`/consent-documents/ready-doc/${lang}`), {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(published(lang)),
    });
  }
  let body = await (await fetch(url('/consent-documents/ready-doc'))).json();
  assert.strictEqual(body.ready, false, 'four of five languages is not ready');
  assert.ok(body.reasons.some((r) => r === 'missing_languages:nl'));

  const last = await fetch(url('/consent-documents/ready-doc/nl'), {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(published('nl')),
  });
  assert.strictEqual((await last.json()).ready, true);

  body = await (await fetch(url('/consent-documents/ready-doc'))).json();
  assert.strictEqual(body.ready, true);
});

test('refuses to PUBLISH a text that still contains ⟦…⟧ placeholders', async () => {
  const res = await fetch(url('/consent-documents/ready-doc/de'), {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(
      published('de', {
        body: `Ein langer Einwilligungstext mit ⟦Ethikvotum⟧ darin, mehr als fünfzig Zeichen.`,
      })
    ),
  });
  assert.strictEqual(res.status, 400);
  const body = await res.json();
  assert.ok(body.problems.includes('placeholders_remain'));
  assert.strictEqual(db.docs.length, 0, 'nothing should have been written');
});

test('accepts the same text saved as a draft', async () => {
  const res = await fetch(url('/consent-documents/ready-doc/de'), {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(
      published('de', {
        status: 'draft',
        body: `Ein langer Einwilligungstext mit ⟦Ethikvotum⟧ darin, mehr als fünfzig Zeichen.`,
      })
    ),
  });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(db.docs.length, 1);
});

test('rejects a stub body, a bad version and a bad date together', async () => {
  const res = await fetch(url('/consent-documents/ready-doc/de'), {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      body: 'short',
      version: 'v1',
      effectiveDate: '04.09.2026',
      status: 'published',
    }),
  });
  assert.strictEqual(res.status, 400);
  const { problems } = await res.json();
  assert.deepStrictEqual(problems.sort(), [
    'body_too_short',
    'invalid_effective_date',
    'invalid_version',
  ]);
});

test('reverting an override restores the shipped file rather than deleting the document', async () => {
  await fetch(url(`/consent-documents/${SHIPPED_SLUG}/de`), {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(
      published('de', {
        slug: SHIPPED_SLUG,
        body: 'Überschriebener Einwilligungstext, deutlich länger als fünfzig Zeichen.',
      })
    ),
  });

  const res = await fetch(url(`/consent-documents/${SHIPPED_SLUG}/de`), {
    method: 'DELETE',
  });
  const body = await res.json();
  assert.strictEqual(body.removed, true);
  assert.strictEqual(body.document.source, 'file');
  assert.match(body.document.body, /Zusätzliche Einwilligung/);
});

test('rejects a path-traversal slug', async () => {
  const res = await fetch(url('/consent-documents/..%2F..%2Fprivacy/de'));
  assert.strictEqual(res.status, 400);
});

test('rejects an unsupported language', async () => {
  const res = await fetch(url(`/consent-documents/${SHIPPED_SLUG}/es`));
  assert.strictEqual(res.status, 400);
});

test('a researcher is refused — authoring consent text is an admin act', async () => {
  currentRoles = ['researcher'];
  for (const [path, init] of [
    ['/consent-documents', {}],
    [`/consent-documents/${SHIPPED_SLUG}`, {}],
    [`/consent-documents/${SHIPPED_SLUG}/de`, {}],
    [
      `/consent-documents/${SHIPPED_SLUG}/de`,
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(published('de')),
      },
    ],
    [`/consent-documents/${SHIPPED_SLUG}/de`, { method: 'DELETE' }],
  ]) {
    const res = await fetch(url(path), init);
    assert.strictEqual(res.status, 403, `${init.method ?? 'GET'} ${path}`);
  }
});
