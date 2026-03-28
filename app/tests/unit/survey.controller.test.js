import { test, before, after } from 'node:test';
import assert from 'node:assert';
import { createServer } from 'node:http';
import express from 'express';
import { createSurveyRouter } from '../../routes/surveyRouter.js';

// ── In-memory mock DB ─────────────────────────────────────────────────────────

function createMockDb() {
  const stores = {};

  function getStore(name) {
    if (!stores[name]) stores[name] = new Map();
    return stores[name];
  }

  return {
    collection(name) {
      const store = getStore(name);
      return {
        find(filter = {}) {
          const results = [];
          for (const [, doc] of store) {
            if (filter.status && doc.status !== filter.status) continue;
            if (filter.type && doc.type !== filter.type) continue;
            if (
              filter.assignedGroups &&
              !doc.assignedGroups?.includes(filter.assignedGroups)
            )
              continue;
            results.push({ ...doc });
          }
          return {
            async toArray() {
              return results;
            },
          };
        },
        async findOne(query) {
          for (const [, doc] of store) {
            if (query.id && doc.id !== query.id) continue;
            if (query.userId && doc.userId !== query.userId) continue;
            if (
              query.deletedAt?.$exists === false &&
              doc.deletedAt !== undefined
            )
              continue;
            return { ...doc };
          }
          return null;
        },
        async insertOne(doc) {
          const key = doc.id || String(Math.random());
          store.set(key, { ...doc });
          return { insertedId: key };
        },
        async updateOne() {
          return { matchedCount: 1, modifiedCount: 1 };
        },
      };
    },
    _seed(name, docs) {
      const store = getStore(name);
      for (const doc of docs)
        store.set(doc.id || String(Math.random()), { ...doc });
    },
  };
}

// ── HTTP test server ──────────────────────────────────────────────────────────

let server;
let baseUrl;
let mockDb;

before(async () => {
  mockDb = createMockDb();
  mockDb._seed('surveys', [
    {
      id: 'survey-1',
      title: 'Baseline Survey',
      type: 'questionnaire',
      status: 'published',
      assignedGroups: ['G1', 'G2'],
    },
    {
      id: 'survey-2',
      title: 'Follow-up Survey',
      type: 'questionnaire',
      status: 'draft',
      assignedGroups: [],
    },
  ]);
  mockDb._seed('participants', [
    { userId: 'user-p1', username: 'p-user-p1', group: 'G1' },
  ]);

  const app = express();
  app.use(express.json());

  // Inject req.user from X-Test-User header for testing
  app.use((req, _, next) => {
    const header = req.headers['x-test-user'];
    if (header) req.user = JSON.parse(header);
    next();
  });

  app.use('/surveys', createSurveyRouter({ db: mockDb }));

  server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

function adminUser() {
  return JSON.stringify({ sub: 'admin-1', realm_access: { roles: ['admin'] } });
}

function participantUser(sub = 'user-p1') {
  return JSON.stringify({ sub, realm_access: { roles: ['participant'] } });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test('GET /surveys - admin gets all surveys', async () => {
  const res = await fetch(`${baseUrl}/surveys`, {
    headers: { 'x-test-user': adminUser() },
  });
  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.strictEqual(data.length, 2);
});

test('GET /surveys - participant sees only published surveys for their group', async () => {
  const res = await fetch(`${baseUrl}/surveys`, {
    headers: { 'x-test-user': participantUser('user-p1') },
  });
  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.ok(data.every((s) => s.status === 'published'));
});

test('GET /surveys/:id - returns survey when found', async () => {
  const res = await fetch(`${baseUrl}/surveys/survey-1`, {
    headers: { 'x-test-user': adminUser() },
  });
  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.strictEqual(data.id, 'survey-1');
  assert.strictEqual(data.title, 'Baseline Survey');
});

test('GET /surveys/:id - returns 404 when survey not found', async () => {
  const res = await fetch(`${baseUrl}/surveys/nonexistent`, {
    headers: { 'x-test-user': adminUser() },
  });
  assert.strictEqual(res.status, 404);
  const data = await res.json();
  assert.deepStrictEqual(data, { error: 'Survey not found' });
});

test('POST /surveys/:id/results - stores survey response and returns 201', async () => {
  const res = await fetch(`${baseUrl}/surveys/survey-1/results`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-test-user': participantUser('user-p1'),
    },
    body: JSON.stringify({ answers: { q1: 'yes' } }),
  });
  assert.strictEqual(res.status, 201);
  const data = await res.json();
  assert.strictEqual(data.ok, true);
  assert.strictEqual(data.surveyId, 'survey-1');
});

test('POST /surveys/:id/results - returns 404 when survey not found', async () => {
  const res = await fetch(`${baseUrl}/surveys/nonexistent/results`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-test-user': participantUser(),
    },
    body: JSON.stringify({ answers: {} }),
  });
  assert.strictEqual(res.status, 404);
  const data = await res.json();
  assert.deepStrictEqual(data, { error: 'Survey not found' });
});
