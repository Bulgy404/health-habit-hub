import { test, before, after } from 'node:test';
import assert from 'node:assert';
import { createServer } from 'node:http';
import { generateKeyPairSync, createSign } from 'node:crypto';
import express from 'express';
import { createV1Router } from '../../routes/v1Router.js';

// ── Key material ─────────────────────────────────────────────────────────────

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
});
const pubKeyJwk = publicKey.export({ format: 'jwk' });
pubKeyJwk.kid = 'habits-key-1';
pubKeyJwk.use = 'sig';
const mockJwks = { keys: [pubKeyJwk] };

// ── JWT helpers ───────────────────────────────────────────────────────────────

function base64urlEncode(buf) {
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

function createJwt(payload) {
  const header = { alg: 'RS256', kid: 'habits-key-1', typ: 'JWT' };
  const h = base64urlEncode(Buffer.from(JSON.stringify(header)));
  const p = base64urlEncode(Buffer.from(JSON.stringify(payload)));
  const signingInput = `${h}.${p}`;
  const sign = createSign('RSA-SHA256');
  sign.update(signingInput);
  return `${signingInput}.${base64urlEncode(sign.sign(privateKey))}`;
}

function makeToken(roles = ['participant']) {
  const now = Math.floor(Date.now() / 1000);
  return createJwt({
    sub: 'test-user',
    exp: now + 3600,
    iat: now,
    realm_access: { roles },
  });
}

// ── In-memory mock MongoDB ────────────────────────────────────────────────────

function createMockDb() {
  const annotations = [];
  return {
    collection(name) {
      if (name !== 'habit_annotations')
        throw new Error(`unexpected collection: ${name}`);
      return {
        async insertOne(doc) {
          annotations.push({ ...doc });
        },
        find(query = {}) {
          return {
            toArray: () => {
              const items = annotations
                .filter((a) => {
                  if (query.habitId === undefined) return true;
                  if (
                    query.habitId !== null &&
                    typeof query.habitId === 'object' &&
                    Array.isArray(query.habitId.$in)
                  ) {
                    return query.habitId.$in.includes(a.habitId);
                  }
                  return a.habitId === query.habitId;
                })
                .filter((a) => {
                  if (query.createdAt && query.createdAt.$gte) {
                    return a.createdAt >= query.createdAt.$gte;
                  }
                  return true;
                });
              return Promise.resolve(items);
            },
          };
        },
      };
    },
  };
}

// ── Mock Neo4j run ────────────────────────────────────────────────────────────

const FIXTURE_HABITS = [
  {
    id: 'habit-1',
    name: 'Morning run',
    category: 'hhh__Group1',
    bcioClass: null,
  },
  {
    id: 'habit-2',
    name: 'Evening yoga',
    category: 'hhh__Group2',
    bcioClass: null,
  },
];

const FIXTURE_DONATED_HABITS = [
  {
    uuid: 'uuid-1',
    original: 'I go for a run every morning',
    language: 'en',
    translationEN: null,
    translationDE: 'Ich gehe jeden Morgen laufen',
  },
  {
    uuid: 'uuid-2',
    original: 'Ich meditiere täglich',
    language: 'de',
    translationEN: 'I meditate daily',
    translationDE: null,
  },
];

const FIXTURE_GRAPH_ROWS = [
  {
    habitId: 'uuid-1',
    habitLabel: 'Drink water daily',
    originalText: 'Drink water daily',
    language: 'en',
    conceptId: 'bcio_001',
    conceptLabel: 'Self-monitoring',
  },
  {
    habitId: 'uuid-2',
    habitLabel: 'I meditate daily',
    originalText: 'Ich meditiere täglich',
    language: 'de',
    conceptId: 'bcio_001',
    conceptLabel: 'Self-monitoring',
  },
  // Duplicate row (same habit+concept via different Context) — must be deduped
  {
    habitId: 'uuid-1',
    habitLabel: 'Drink water daily',
    originalText: 'Drink water daily',
    language: 'en',
    conceptId: 'bcio_001',
    conceptLabel: 'Self-monitoring',
  },
];

function createMockNeo4jRun() {
  return async (cypher) => {
    if (cypher.includes('count(h) AS total')) {
      return [{ total: 2 }];
    }
    if (cypher.includes('AS category, cnt AS count')) {
      return [
        { category: 'hhh__Group1', count: 1 },
        { category: 'hhh__Group2', count: 1 },
      ];
    }
    if (cypher.includes('AS conceptId')) {
      return FIXTURE_GRAPH_ROWS;
    }
    if (cypher.includes('h.sentence AS original')) {
      return FIXTURE_DONATED_HABITS;
    }
    // default: return public habits
    return FIXTURE_HABITS;
  };
}

// ── Test server ───────────────────────────────────────────────────────────────

let server;
let baseUrl;
let mockDb;

before(async () => {
  mockDb = createMockDb();

  const realFetch = global.fetch;
  global.fetch = async (url, options) => {
    if (typeof url === 'string' && url.includes('/jwks')) {
      return { ok: true, json: async () => mockJwks };
    }
    return realFetch(url, options);
  };

  const testApp = express();
  testApp.use(express.json());
  const okCheck = async () => ({ status: 'ok', latencyMs: 1 });
  const v1Router = createV1Router({
    jwksUrl: 'http://keycloak/jwks',
    expectedIssuer: null,
    expectedAudience: null,
    serviceChecks: { neo4jCheck: okCheck, mongoCheck: okCheck },
    db: mockDb,
    neo4jRun: createMockNeo4jRun(),
  });
  testApp.use('/api/v1', v1Router);

  server = createServer(testApp);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  await fetch(`${baseUrl}/api/v1/health`);
});

after(() => {
  server.close();
});

// ── Helpers ───────────────────────────────────────────────────────────────────

async function get(path, token) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  return fetch(`${baseUrl}${path}`, { headers });
}

async function post(path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

// ── Auth enforcement ──────────────────────────────────────────────────────────

test('GET /api/v1/habits/public returns 401 without token', async () => {
  const res = await get('/api/v1/habits/public');
  assert.strictEqual(res.status, 401);
});

test('GET /api/v1/habits/public returns 403 for no-role token', async () => {
  const res = await get('/api/v1/habits/public', makeToken([]));
  assert.strictEqual(res.status, 403);
});

test('POST /api/v1/habits/h1/annotate returns 401 without token', async () => {
  const res = await post('/api/v1/habits/h1/annotate', { type: 'helpful' });
  assert.strictEqual(res.status, 401);
});

test('GET /api/v1/habits/stats returns 401 without token', async () => {
  const res = await get('/api/v1/habits/stats');
  assert.strictEqual(res.status, 401);
});

// ── GET /public ───────────────────────────────────────────────────────────────

test('GET /api/v1/habits/public returns anonymized habit list', async () => {
  const res = await get('/api/v1/habits/public', makeToken());
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.ok(Array.isArray(body));
  assert.strictEqual(body.length, 2);
  const h = body[0];
  assert.ok('id' in h);
  assert.ok('name' in h);
  assert.ok('category' in h);
  assert.ok('bcioClass' in h);
  assert.ok('annotationCounts' in h);
  assert.ok('helpful' in h.annotationCounts);
  assert.ok('iDoThis' in h.annotationCounts);
  // userId must NOT be present
  assert.ok(!('userId' in h));
  assert.ok(!('source' in h));
});

// ── POST /:id/annotate ────────────────────────────────────────────────────────

test('POST /:id/annotate returns 400 for invalid type', async () => {
  const res = await post(
    '/api/v1/habits/habit-1/annotate',
    { type: 'invalid' },
    makeToken()
  );
  assert.strictEqual(res.status, 400);
  const body = await res.json();
  assert.ok(body.error);
});

test('POST /:id/annotate stores annotation and returns updated counts', async () => {
  const res = await post(
    '/api/v1/habits/habit-1/annotate',
    { type: 'helpful' },
    makeToken()
  );
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.strictEqual(body.habitId, 'habit-1');
  assert.ok('annotationCounts' in body);
  assert.ok(body.annotationCounts.helpful >= 1);
  assert.strictEqual(body.annotationCounts.iDoThis, 0);
});

test('POST /:id/annotate works with iDoThis type', async () => {
  const res = await post(
    '/api/v1/habits/habit-2/annotate',
    { type: 'iDoThis' },
    makeToken()
  );
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.strictEqual(body.habitId, 'habit-2');
  assert.ok(body.annotationCounts.iDoThis >= 1);
});

// ── GET /stats ────────────────────────────────────────────────────────────────

test('GET /api/v1/habits/stats returns total, byCategory, byDay', async () => {
  const res = await get('/api/v1/habits/stats', makeToken());
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.ok('total' in body);
  assert.strictEqual(body.total, 2);
  assert.ok(Array.isArray(body.byCategory));
  assert.ok(body.byCategory.length > 0);
  assert.ok('category' in body.byCategory[0]);
  assert.ok('count' in body.byCategory[0]);
  assert.ok(Array.isArray(body.byDay));
});

// ── GET /habits ───────────────────────────────────────────────────────────────

test('GET /api/v1/habits returns 401 without token', async () => {
  const res = await get('/api/v1/habits');
  assert.strictEqual(res.status, 401);
});

test('GET /api/v1/habits returns habits with original, translationEN, translationDE', async () => {
  const res = await get('/api/v1/habits', makeToken());
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.ok(Array.isArray(body));
  assert.strictEqual(body.length, 2);
  const h = body[0];
  assert.ok('uuid' in h);
  assert.ok('original' in h);
  assert.ok('language' in h);
  assert.ok('translationEN' in h);
  assert.ok('translationDE' in h);
  assert.ok(!('displayText' in h));
});

test('GET /api/v1/habits?lang=de adds displayText from translationDE', async () => {
  const res = await get('/api/v1/habits?lang=de', makeToken());
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.ok(Array.isArray(body));
  // First habit: English original, has translationDE
  assert.strictEqual(body[0].displayText, 'Ich gehe jeden Morgen laufen');
  // Second habit: German original, no translationDE — falls back to original
  assert.strictEqual(body[1].displayText, 'Ich meditiere täglich');
});

test('GET /api/v1/habits?lang=en adds displayText from translationEN', async () => {
  const res = await get('/api/v1/habits?lang=en', makeToken());
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  // First habit: English original, no translationEN — falls back to original
  assert.strictEqual(body[0].displayText, 'I go for a run every morning');
  // Second habit: German original, has translationEN
  assert.strictEqual(body[1].displayText, 'I meditate daily');
});

// ── GET /habits/graph ─────────────────────────────────────────────────────────

test('GET /api/v1/habits/graph returns 401 without token', async () => {
  const res = await get('/api/v1/habits/graph');
  assert.strictEqual(res.status, 401);
});

test('GET /api/v1/habits/graph returns graph with nodes and edges', async () => {
  // Seed annotation for uuid-1 so the annotation join is exercised
  await post(
    '/api/v1/habits/uuid-1/annotate',
    { type: 'helpful' },
    makeToken()
  );

  const res = await get('/api/v1/habits/graph', makeToken());
  assert.strictEqual(res.status, 200);
  const body = await res.json();

  assert.ok(Array.isArray(body.nodes));
  assert.ok(Array.isArray(body.edges));

  const habitNodes = body.nodes.filter((n) => n.type === 'habit');
  const conceptNodes = body.nodes.filter((n) => n.type === 'concept');

  // 2 unique habits, 1 unique concept
  assert.strictEqual(habitNodes.length, 2);
  assert.strictEqual(conceptNodes.length, 1);

  // Habit node shape
  const h = habitNodes[0];
  assert.ok(h.id.startsWith('h:'));
  assert.strictEqual(h.type, 'habit');
  assert.ok(typeof h.label === 'string');
  assert.ok(typeof h.habitId === 'string');
  assert.ok(typeof h.originalText === 'string');
  assert.ok(typeof h.language === 'string');
  assert.ok(typeof h.annotationCounts === 'object');
  assert.ok('helpful' in h.annotationCounts);
  assert.ok('iDoThis' in h.annotationCounts);

  // Verify annotation join: uuid-1 should have helpful count of 1
  const uuid1Node = habitNodes.find((n) => n.habitId === 'uuid-1');
  assert.strictEqual(uuid1Node.annotationCounts.helpful, 1);

  // uuid-2 should have no annotations
  const uuid2Node = habitNodes.find((n) => n.habitId === 'uuid-2');
  assert.strictEqual(uuid2Node.annotationCounts.helpful, 0);

  // Concept node shape
  const c = conceptNodes[0];
  assert.ok(c.id.startsWith('c:'));
  assert.strictEqual(c.type, 'concept');
  assert.ok(typeof c.label === 'string');

  // Edges: 2 habits × 1 concept = 2 edges (duplicate deduped)
  assert.strictEqual(body.edges.length, 2);
  const edge = body.edges[0];
  assert.ok(edge.source.startsWith('h:'));
  assert.ok(edge.target.startsWith('c:'));
});
