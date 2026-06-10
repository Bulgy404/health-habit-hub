import { test, before, after } from 'node:test';
import assert from 'node:assert';
import { createServer } from 'node:http';
import express from 'express';
import { createHabitsRouter } from '../../routes/habitsRouter.js';

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
            if (filter.habitId && doc.habitId !== filter.habitId) continue;
            if (filter.createdAt?.$gte && doc.createdAt < filter.createdAt.$gte)
              continue;
            results.push({ ...doc });
          }
          return {
            async toArray() {
              return results;
            },
          };
        },
        async findOne() {
          return null;
        },
        async insertOne(doc) {
          const key = String(Math.random());
          store.set(key, { ...doc });
          return { insertedId: key };
        },
      };
    },
    _seed(name, docs) {
      const store = getStore(name);
      for (const doc of docs) store.set(String(Math.random()), { ...doc });
    },
  };
}

// ── Mock neo4jRun ─────────────────────────────────────────────────────────────

function createMockNeo4jRun() {
  return async (cypher) => {
    if (cypher.includes('count(h) AS total')) {
      return [{ total: { toNumber: () => 5 } }];
    }
    if (cypher.includes('count(h) AS cnt')) {
      return [
        { category: 'hhh__Group1', count: { toNumber: () => 3 } },
        { category: 'hhh__Group2', count: { toNumber: () => 2 } },
      ];
    }
    if (cypher.includes('h.sentence AS name')) {
      return [
        {
          id: 'habit-1',
          name: 'Morning Walk',
          category: null,
          bcioClass: null,
        },
        {
          id: 'habit-2',
          name: 'Drink Water',
          category: null,
          bcioClass: null,
        },
      ];
    }
    return [];
  };
}

// ── HTTP test server ──────────────────────────────────────────────────────────

let server;
let baseUrl;
let mockDb;

before(async () => {
  mockDb = createMockDb();
  mockDb._seed('habit_annotations', [
    { habitId: 'habit-1', type: 'helpful', createdAt: new Date() },
    { habitId: 'habit-1', type: 'iDoThis', createdAt: new Date() },
  ]);

  const app = express();
  app.use(express.json());
  // Inject a mock authenticated user so annotate (IDOR-safe) can read req.user.sub
  app.use((req, _res, next) => {
    req.user = { sub: 'test-user-1' };
    next();
  });
  app.use(
    '/habits',
    createHabitsRouter({ db: mockDb, neo4jRun: createMockNeo4jRun() })
  );

  server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

// ── Tests ─────────────────────────────────────────────────────────────────────

test('GET /habits returns array of donated habits', async () => {
  const res = await fetch(`${baseUrl}/habits`);
  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.ok(Array.isArray(data));
});

test('GET /habits/public returns habit list with annotation counts', async () => {
  const res = await fetch(`${baseUrl}/habits/public`);
  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.ok(Array.isArray(data), 'should return array');
  assert.ok(data.length > 0, 'should return habits');
  const habit = data.find((h) => h.id === 'habit-1');
  assert.ok(habit, 'habit-1 should be in results');
  assert.ok(
    typeof habit.annotationCounts === 'object',
    'should have annotationCounts'
  );
  assert.ok('helpful' in habit.annotationCounts, 'should have helpful count');
  assert.ok('iDoThis' in habit.annotationCounts, 'should have iDoThis count');
});

test('POST /habits/:id/annotate - valid type returns updated counts', async () => {
  const res = await fetch(`${baseUrl}/habits/habit-1/annotate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'helpful' }),
  });
  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.strictEqual(data.habitId, 'habit-1');
  assert.ok(typeof data.annotationCounts === 'object');
  assert.ok(typeof data.annotationCounts.helpful === 'number');
  assert.ok(typeof data.annotationCounts.iDoThis === 'number');
});

test('POST /habits/:id/annotate - invalid type returns 400', async () => {
  const res = await fetch(`${baseUrl}/habits/habit-1/annotate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'invalid' }),
  });
  assert.strictEqual(res.status, 400);
  const data = await res.json();
  assert.ok(data.error.includes('helpful'));
});

test('GET /habits/stats returns total, byCategory, byDay', async () => {
  const res = await fetch(`${baseUrl}/habits/stats`);
  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.ok(typeof data.total === 'number', 'should have total');
  assert.ok(Array.isArray(data.byCategory), 'should have byCategory array');
  assert.ok(Array.isArray(data.byDay), 'should have byDay array');
});
