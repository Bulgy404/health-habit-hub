/**
 * Integration tests for GET /questionnaire-responses/service/:userId
 *
 * This endpoint is used by the API-service to fetch all questionnaire responses
 * for a user based on their enrolled study's questionnaire configuration, without
 * hardcoding which slugs to fetch.
 *
 * The endpoint resolves: enrollment → studyId → questionnaire ObjectIds → slugs →
 * latest form_response per slug, returning {[slug]: responseOrNull}.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert';
import { createServer } from 'node:http';
import express from 'express';
import { createV1Router } from '../../routes/v1Router.js';

// ── Extended mock MongoDB ─────────────────────────────────────────────────────
// Supports $in queries, .project(), and the $match/$sort/$group aggregate pipeline
// used by the new all-responses service endpoint.

function createMockDb() {
  const collections = {};

  function getCol(name) {
    if (!collections[name]) collections[name] = [];
    return collections[name];
  }

  function matchesQuery(doc, query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== null && typeof v === 'object' && '$in' in v) {
        if (!v['$in'].some((item) => String(item) === String(doc[k]))) {
          return false;
        }
      } else {
        if (doc[k] !== v) return false;
      }
    }
    return true;
  }

  return {
    collection(name) {
      return {
        async createIndex() {},

        async insertOne(doc) {
          // Preserve _id when explicitly provided (unlike MongoDB mock default)
          const stored = { ...doc };
          if (stored._id == null) stored._id = String(Math.random());
          getCol(name).push(stored);
          return { insertedId: stored._id };
        },

        find(query) {
          let results = [...getCol(name)];
          if (query) results = results.filter((d) => matchesQuery(d, query));
          let limitCount = null;
          let projectSpec = null;
          return {
            sort(spec) {
              const [field, dir] = Object.entries(spec)[0];
              results = [...results].sort((a, b) => {
                const av =
                  a[field] instanceof Date ? a[field].getTime() : a[field];
                const bv =
                  b[field] instanceof Date ? b[field].getTime() : b[field];
                return dir === -1 ? bv - av : av - bv;
              });
              return this;
            },
            limit(n) {
              limitCount = n;
              return this;
            },
            project(spec) {
              projectSpec = spec;
              return this;
            },
            async toArray() {
              const res =
                limitCount !== null ? results.slice(0, limitCount) : results;
              if (!projectSpec) return res;
              return res.map((doc) => {
                const out = {};
                for (const [k, include] of Object.entries(projectSpec)) {
                  if (k !== '_id' && include) out[k] = doc[k];
                }
                return out;
              });
            },
          };
        },

        async findOne(query) {
          const results = getCol(name).filter((d) => matchesQuery(d, query));
          return results[0] || null;
        },

        aggregate(pipeline) {
          let results = [...getCol(name)];
          for (const stage of pipeline) {
            if ('$match' in stage) {
              results = results.filter((d) => matchesQuery(d, stage['$match']));
            } else if ('$sort' in stage) {
              const [field, dir] = Object.entries(stage['$sort'])[0];
              results = [...results].sort((a, b) => {
                const av =
                  a[field] instanceof Date ? a[field].getTime() : a[field];
                const bv =
                  b[field] instanceof Date ? b[field].getTime() : b[field];
                return dir === -1 ? bv - av : av - bv;
              });
            } else if ('$group' in stage) {
              const groupSpec = stage['$group'];
              const rawKey = groupSpec['_id'];
              const groupField =
                typeof rawKey === 'string' && rawKey.startsWith('$')
                  ? rawKey.slice(1)
                  : rawKey;
              const seen = new Map();
              for (const doc of results) {
                const key = doc[groupField];
                if (!seen.has(key)) seen.set(key, { _id: key, doc });
              }
              results = [...seen.values()];
            }
          }
          return {
            async toArray() {
              return results;
            },
          };
        },
      };
    },
  };
}

// ── Test server setup ─────────────────────────────────────────────────────────

const SERVICE_SECRET = 'test-service-secret-123';
let server;
let port;
let db;
const realFetch = global.fetch;
const originalSecret = process.env.API_SERVICE_SECRET;

before(async () => {
  process.env.API_SERVICE_SECRET = SERVICE_SECRET;

  db = createMockDb();
  const app = express();
  app.use(express.json());
  app.use(
    '/api/v1',
    createV1Router({
      jwksUrl: 'http://127.0.0.1:9999/unreachable',
      expectedIssuer: null,
      expectedAudience: null,
      db,
      neo4jRun: async () => [],
    })
  );

  server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = server.address().port;

  // Block all unexpected fetch calls
  global.fetch = async (url) => {
    throw new Error(`Unexpected fetch: ${url}`);
  };
});

after(async () => {
  process.env.API_SERVICE_SECRET = originalSecret;
  global.fetch = realFetch;
  await new Promise((resolve) => server.close(resolve));
});

function serviceRequest(userId) {
  return realFetch(
    `http://127.0.0.1:${port}/api/v1/questionnaire-responses/service/${userId}`,
    {
      method: 'GET',
      headers: { 'X-Service-Auth-Token': SERVICE_SECRET },
    }
  );
}

function serviceRequestNoAuth(userId) {
  return realFetch(
    `http://127.0.0.1:${port}/api/v1/questionnaire-responses/service/${userId}`,
    { method: 'GET' }
  );
}

// Helper: seed study + enrollment + questionnaires for a user
async function seedStudy(userId, slugs, responses = []) {
  const studyId = `study-${userId}`;
  const questIds = slugs.map((s) => `qid-${s}`);

  await db
    .collection('studies')
    .insertOne({ _id: studyId, questionnaires: questIds });

  for (let i = 0; i < slugs.length; i++) {
    await db
      .collection('questionnaires')
      .insertOne({ _id: questIds[i], slug: slugs[i] });
  }

  await db.collection('enrollments').insertOne({ userId, studyId });

  for (const { slug, answers, submittedAt } of responses) {
    await db.collection('form_responses').insertOne({
      userId,
      questionnaireSlug: slug,
      answers,
      submittedAt: submittedAt ?? new Date(),
    });
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test('GET /questionnaire-responses/service/:userId — rejects missing service token', async () => {
  const res = await serviceRequestNoAuth('user-noauth');
  assert.strictEqual(res.status, 401);
});

test('GET /questionnaire-responses/service/:userId — returns {} when user not enrolled', async () => {
  const res = await serviceRequest('user-not-enrolled');
  assert.strictEqual(res.status, 200);
  assert.deepStrictEqual(await res.json(), {});
});

test('GET /questionnaire-responses/service/:userId — returns {} when study has no questionnaires', async () => {
  const userId = 'user-empty-study';
  await db
    .collection('studies')
    .insertOne({ _id: `study-${userId}`, questionnaires: [] });
  await db
    .collection('enrollments')
    .insertOne({ userId, studyId: `study-${userId}` });

  const res = await serviceRequest(userId);
  assert.strictEqual(res.status, 200);
  assert.deepStrictEqual(await res.json(), {});
});

test('GET /questionnaire-responses/service/:userId — returns null per slug when no responses submitted', async () => {
  const userId = 'user-no-responses';
  await seedStudy(userId, ['sliq', 'rand-36']);

  const res = await serviceRequest(userId);
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.deepStrictEqual(Object.keys(body).sort(), ['rand-36', 'sliq']);
  assert.strictEqual(body['sliq'], null);
  assert.strictEqual(body['rand-36'], null);
});

test('GET /questionnaire-responses/service/:userId — returns latest responses for enrolled study questionnaires', async () => {
  const userId = 'user-with-responses';
  await seedStudy(
    userId,
    ['sliq', 'rand-36'],
    [
      {
        slug: 'sliq',
        answers: { sliq_sleep_quality: '3', sliq_sleep_duration: '7' },
      },
      { slug: 'rand-36', answers: { rand36_energy: '4' } },
    ]
  );

  const res = await serviceRequest(userId);
  assert.strictEqual(res.status, 200);
  const body = await res.json();

  assert.ok(body['sliq'], 'sliq response should be present');
  assert.deepStrictEqual(body['sliq'].answers, {
    sliq_sleep_quality: '3',
    sliq_sleep_duration: '7',
  });
  assert.ok(body['rand-36'], 'rand-36 response should be present');
  assert.deepStrictEqual(body['rand-36'].answers, { rand36_energy: '4' });
});

test('GET /questionnaire-responses/service/:userId — returns most recent response when multiple submitted', async () => {
  const userId = 'user-multiple-submissions';
  const older = new Date(Date.now() - 10_000);
  const newer = new Date();

  await seedStudy(
    userId,
    ['sliq'],
    [
      {
        slug: 'sliq',
        answers: { sliq_sleep_quality: '2' },
        submittedAt: older,
      },
      {
        slug: 'sliq',
        answers: { sliq_sleep_quality: '5' },
        submittedAt: newer,
      },
    ]
  );

  const res = await serviceRequest(userId);
  assert.strictEqual(res.status, 200);
  const body = await res.json();

  assert.strictEqual(
    body['sliq'].answers.sliq_sleep_quality,
    '5',
    'should return the most recent (newer) response'
  );
});

test('GET /questionnaire-responses/service/:userId — only includes slugs from enrolled study', async () => {
  const userId = 'user-study-scope';
  // Study only has sliq, not phq-9
  await seedStudy(
    userId,
    ['sliq'],
    [{ slug: 'sliq', answers: { sliq_sleep_quality: '4' } }]
  );
  // Insert a phq-9 response manually — should NOT appear in output
  await db.collection('form_responses').insertOne({
    userId,
    questionnaireSlug: 'phq-9',
    answers: { phq9_q1: '2' },
    submittedAt: new Date(),
  });

  const res = await serviceRequest(userId);
  assert.strictEqual(res.status, 200);
  const body = await res.json();

  assert.ok('sliq' in body, 'sliq should be in response');
  assert.ok(
    !('phq-9' in body),
    'phq-9 should not be in response (not in study)'
  );
});

test('GET /questionnaire-responses/service/:userId — partial submission: some slugs answered, some null', async () => {
  const userId = 'user-partial';
  await seedStudy(
    userId,
    ['sliq', 'rand-36', 'phq-9'],
    [
      { slug: 'rand-36', answers: { rand36_energy: '3' } },
      // sliq and phq-9 not submitted
    ]
  );

  const res = await serviceRequest(userId);
  assert.strictEqual(res.status, 200);
  const body = await res.json();

  assert.strictEqual(body['sliq'], null, 'unsubmitted sliq should be null');
  assert.ok(body['rand-36'], 'submitted rand-36 should have data');
  assert.strictEqual(body['phq-9'], null, 'unsubmitted phq-9 should be null');
});
