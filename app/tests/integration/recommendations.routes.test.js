import { test, before, after } from 'node:test';
import assert from 'node:assert';
import { createServer } from 'node:http';
import { generateKeyPairSync, createSign, createHash } from 'node:crypto';
import express from 'express';
import { createApiRouter } from '../../routes/apiRouter.js';

// ── Key material ─────────────────────────────────────────────────────────────

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
});
const pubKeyJwk = publicKey.export({ format: 'jwk' });
pubKeyJwk.kid = 'recs-key-1';
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
  const header = { alg: 'RS256', kid: 'recs-key-1', typ: 'JWT' };
  const h = base64urlEncode(Buffer.from(JSON.stringify(header)));
  const p = base64urlEncode(Buffer.from(JSON.stringify(payload)));
  const signingInput = `${h}.${p}`;
  const sign = createSign('RSA-SHA256');
  sign.update(signingInput);
  return `${signingInput}.${base64urlEncode(sign.sign(privateKey))}`;
}

const USER_ID = 'user-recs-test';

function makeToken(roles = ['user']) {
  const now = Math.floor(Date.now() / 1000);
  return createJwt({
    sub: USER_ID,
    exp: now + 3600,
    iat: now,
    realm_access: { roles },
  });
}

// ── In-memory MongoDB mock ────────────────────────────────────────────────────

function createMockDb() {
  const collections = {};

  function getCollection(name) {
    if (!collections[name]) collections[name] = [];
    return collections[name];
  }

  return {
    collection(name) {
      const col = getCollection(name);
      return {
        async findOne(query, _opts) {
          const keys = Object.keys(query);
          return (
            col.find((doc) => keys.every((k) => doc[k] === query[k])) || null
          );
        },
        async insertOne(doc) {
          col.push(doc);
          return { insertedId: 'mock-id' };
        },
        find(query, _opts) {
          const keys = Object.keys(query);
          let results;
          if (keys.length === 0) {
            results = [...col];
          } else if (
            keys.length === 1 &&
            query[keys[0]] &&
            typeof query[keys[0]] === 'object' &&
            '$in' in query[keys[0]]
          ) {
            const field = keys[0];
            const values = query[field].$in;
            results = col.filter((doc) => values.includes(doc[field]));
          } else {
            results = col.filter((doc) =>
              keys.every((k) => doc[k] === query[k])
            );
          }
          return {
            sort() {
              return this;
            },
            async toArray() {
              return results;
            },
          };
        },
      };
    },
    _raw: collections,
  };
}

// ── Redis mock ────────────────────────────────────────────────────────────────

function createMockRedis() {
  const store = {};
  return {
    store,
    async del(key) {
      delete store[key];
    },
    async get(key) {
      return store[key] || null;
    },
    async setex(key, ttl, value) {
      store[key] = value;
    },
  };
}

// ── Test server ───────────────────────────────────────────────────────────────

let server;
let baseUrl;
let mockDb;
let mockRedis;

before(async () => {
  mockDb = createMockDb();
  mockRedis = createMockRedis();

  // Seed a recommendation in MongoDB
  mockDb.collection('recommendations').insertOne({
    recommendation_id: 'rec-001',
    userId: USER_ID,
    goal: 'exercise more',
    recommendations: [{ title: 'Walk daily', body: 'Take a 30-min walk.' }],
    generated_at: '2026-03-20T10:00:00.000Z',
  });

  // Seed the Redis cache for that recommendation
  const key = `recommend:${createHash('sha256').update(`${USER_ID}||exercise more`).digest('hex')}`;
  mockRedis.store[key] = JSON.stringify({ cached: true });

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
  const apiRouter = createApiRouter({
    jwksUrl: 'http://keycloak/jwks',
    expectedIssuer: null,
    expectedAudience: null,
    serviceChecks: { neo4jCheck: okCheck, mongoCheck: okCheck },
    db: mockDb,
    redisClient: mockRedis,
  });
  testApp.use('/api/v1', apiRouter);

  server = createServer(testApp);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  // Warm up JWKS cache
  await fetch(`${baseUrl}/api/v1/health`);
});

after(() => {
  server.close();
});

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

// ── Auth checks ───────────────────────────────────────────────────────────────

test('POST /recommendations/:id/feedback returns 401 without token', async () => {
  const res = await post('/api/v1/recommendations/rec-001/feedback', {
    comment: 'good',
  });
  assert.strictEqual(res.status, 401);
});

test('GET /recommendations/me returns 401 without token', async () => {
  const res = await get('/api/v1/recommendations/me');
  assert.strictEqual(res.status, 401);
});

// ── Validation ────────────────────────────────────────────────────────────────

test('POST /recommendations/:id/feedback returns 400 when comment is missing', async () => {
  const token = makeToken(['user']);
  const res = await post('/api/v1/recommendations/rec-001/feedback', {}, token);
  assert.strictEqual(res.status, 400);
  const body = await res.json();
  assert.ok(body.error);
});

test('POST /recommendations/:id/feedback returns 404 for unknown recommendation', async () => {
  const token = makeToken(['user']);
  const res = await post(
    '/api/v1/recommendations/unknown-rec/feedback',
    { comment: 'test' },
    token
  );
  assert.strictEqual(res.status, 404);
});

// ── Feedback storage ──────────────────────────────────────────────────────────

test('POST /recommendations/:id/feedback stores feedback in MongoDB', async () => {
  const token = makeToken(['user']);
  const res = await post(
    '/api/v1/recommendations/rec-001/feedback',
    { comment: 'Very helpful recommendation!' },
    token
  );
  assert.strictEqual(res.status, 201);
  const body = await res.json();
  assert.strictEqual(body.ok, true);

  const stored = mockDb._raw['recommendation_feedback'];
  assert.ok(stored && stored.length > 0);
  const fb = stored.find((f) => f.recommendation_id === 'rec-001');
  assert.ok(fb);
  assert.strictEqual(fb.userId, USER_ID);
  assert.strictEqual(fb.goal, 'exercise more');
  assert.strictEqual(fb.comment, 'Very helpful recommendation!');
  assert.ok(fb.created_at instanceof Date);
});

// ── Redis cache invalidation ──────────────────────────────────────────────────

test('POST /recommendations/:id/feedback invalidates Redis cache for (user_id, goal)', async () => {
  // Seed cache again since prior test may have deleted it
  const key = `recommend:${createHash('sha256').update(`${USER_ID}||exercise more`).digest('hex')}`;
  mockRedis.store[key] = JSON.stringify({ cached: true });

  const token = makeToken(['user']);
  await post(
    '/api/v1/recommendations/rec-001/feedback',
    { comment: 'clear cache' },
    token
  );

  assert.strictEqual(mockRedis.store[key], undefined);
});

// ── GET /recommendations/me ───────────────────────────────────────────────────

test('GET /recommendations/me returns empty array when no recommendations', async () => {
  const freshDb = createMockDb();
  const freshApp = express();
  freshApp.use(express.json());
  const { createApiRouter: createRouter } = await import(
    '../../routes/apiRouter.js'
  );
  const okCheck = async () => ({ status: 'ok', latencyMs: 1 });
  const router = createRouter({
    jwksUrl: 'http://keycloak/jwks',
    expectedIssuer: null,
    expectedAudience: null,
    serviceChecks: { neo4jCheck: okCheck, mongoCheck: okCheck },
    db: freshDb,
    redisClient: null,
  });
  freshApp.use('/api/v1', router);
  const freshServer = createServer(freshApp);
  await new Promise((resolve) => freshServer.listen(0, '127.0.0.1', resolve));
  const freshBase = `http://127.0.0.1:${freshServer.address().port}`;

  const token = makeToken(['user']);
  const res = await fetch(`${freshBase}/api/v1/recommendations/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.deepStrictEqual(body, []);
  freshServer.close();
});

test('GET /recommendations/me returns recommendations with feedback attached', async () => {
  const token = makeToken(['user']);
  const res = await get('/api/v1/recommendations/me', token);
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.ok(Array.isArray(body));
  assert.ok(body.length > 0);
  const rec = body.find((r) => r.recommendation_id === 'rec-001');
  assert.ok(rec);
  assert.strictEqual(rec.goal, 'exercise more');
  assert.ok(Array.isArray(rec.feedback));
  // Feedback from prior tests should be attached
  assert.ok(rec.feedback.length >= 1);
  assert.ok(rec.feedback[0].comment);
  assert.ok(rec.feedback[0].created_at);
});
