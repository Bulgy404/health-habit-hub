import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import { createServer } from 'node:http';
import express from 'express';
import { ObjectId } from 'mongodb';
import { createCuePoolRouter } from '../../routes/cuePoolRouter.js';

function makeDb() {
  const store = [];
  return {
    store,
    collection(name) {
      assert.strictEqual(name, 'cue_pools');
      return {
        async insertOne(doc) {
          const saved = { ...doc, _id: new ObjectId() };
          store.push(saved);
          return { insertedId: saved._id };
        },
        async insertMany(docs) {
          const saved = docs.map((d) => ({ ...d, _id: new ObjectId() }));
          store.push(...saved);
          return { insertedCount: saved.length };
        },
        find(filter = {}) {
          const results = store.filter((d) => {
            if (filter.quality && d.quality !== filter.quality) return false;
            if (filter.languages && !d.languages?.includes(filter.languages))
              return false;
            return true;
          });
          return {
            skip(n) {
              return {
                limit(m) {
                  return { async toArray() { return results.slice(n, n + m); } };
                },
              };
            },
          };
        },
        async countDocuments() {
          return store.length;
        },
        async deleteOne(filter) {
          const idx = store.findIndex(
            (d) => d._id?.toString() === filter._id?.toString()
          );
          if (idx >= 0) store.splice(idx, 1);
          return { deletedCount: idx >= 0 ? 1 : 0 };
        },
      };
    },
  };
}

let app, server, baseUrl, db;

before(async () => {
  db = makeDb();
  app = express();
  app.use(express.json());
  app.use('/api/v1/admin/cue-pools', createCuePoolRouter({ db }));
  server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

beforeEach(() => {
  db.store.length = 0;
});

test('POST / creates a cue with the locale-map shape', async () => {
  const res = await fetch(`${baseUrl}/api/v1/admin/cue-pools`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: { en: 'Walk after lunch', de: 'Nach dem Mittagessen spazieren' },
      languages: ['en', 'de'],
      quality: 'high',
      dimensions: { stability: 3, salience: 4, specificity: 3 },
      domain: 'physical_activity',
    }),
  });
  assert.strictEqual(res.status, 201);
  const body = await res.json();
  assert.deepStrictEqual(body.text, {
    en: 'Walk after lunch',
    de: 'Nach dem Mittagessen spazieren',
  });
  assert.deepStrictEqual(body.languages, ['en', 'de']);
});

test('POST / rejects a request with the old single-language shape', async () => {
  const res = await fetch(`${baseUrl}/api/v1/admin/cue-pools`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: 'Walk after lunch',
      language: 'en',
      quality: 'high',
      dimensions: { stability: 3, salience: 4, specificity: 3 },
      domain: 'physical_activity',
    }),
  });
  assert.strictEqual(res.status, 400);
});

test('GET / filters by language (array-contains)', async () => {
  await fetch(`${baseUrl}/api/v1/admin/cue-pools`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: { en: 'English only' },
      languages: ['en'],
      quality: 'high',
      dimensions: { stability: 3, salience: 3, specificity: 3 },
      domain: 'd',
    }),
  });
  await fetch(`${baseUrl}/api/v1/admin/cue-pools`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: { en: 'Bilingual', de: 'Zweisprachig' },
      languages: ['en', 'de'],
      quality: 'high',
      dimensions: { stability: 3, salience: 3, specificity: 3 },
      domain: 'd',
    }),
  });

  const res = await fetch(`${baseUrl}/api/v1/admin/cue-pools?language=de`);
  const body = await res.json();
  assert.strictEqual(body.cues.length, 1);
  assert.deepStrictEqual(body.cues[0].languages, ['en', 'de']);
});

test('POST /import accepts wide-format CSV rows and skips invalid ones', async () => {
  const res = await fetch(`${baseUrl}/api/v1/admin/cue-pools/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      cues: [
        {
          text_en: 'Row one',
          quality: 'high',
          stability: '3',
          salience: '3',
          specificity: '3',
          domain: 'd',
        },
        {
          // no text_* column — invalid, should be skipped
          quality: 'high',
          stability: '3',
          salience: '3',
          specificity: '3',
          domain: 'd',
        },
      ],
    }),
  });
  assert.strictEqual(res.status, 201);
  const body = await res.json();
  assert.strictEqual(body.inserted, 1);
  assert.strictEqual(body.skipped, 1);
});

test('DELETE /:id removes a cue', async () => {
  const createRes = await fetch(`${baseUrl}/api/v1/admin/cue-pools`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: { en: 'To delete' },
      languages: ['en'],
      quality: 'high',
      dimensions: { stability: 3, salience: 3, specificity: 3 },
      domain: 'd',
    }),
  });
  const { id } = await createRes.json();

  const res = await fetch(`${baseUrl}/api/v1/admin/cue-pools/${id}`, {
    method: 'DELETE',
  });
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.strictEqual(body.deleted, true);
});
