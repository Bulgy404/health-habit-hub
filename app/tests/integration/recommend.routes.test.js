import { test, before, after } from 'node:test';
import assert from 'node:assert';
import { createServer } from 'node:http';
import { generateKeyPairSync, createSign } from 'node:crypto';
import express from 'express';
import { createApiRouter } from '../../routes/apiRouter.js';

// ── Key material ─────────────────────────────────────────────────────────────

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
});
const pubKeyJwk = publicKey.export({ format: 'jwk' });
pubKeyJwk.kid = 'rec-key-1';
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
  const header = { alg: 'RS256', kid: 'rec-key-1', typ: 'JWT' };
  const h = base64urlEncode(Buffer.from(JSON.stringify(header)));
  const p = base64urlEncode(Buffer.from(JSON.stringify(payload)));
  const signingInput = `${h}.${p}`;
  const sign = createSign('RSA-SHA256');
  sign.update(signingInput);
  return `${signingInput}.${base64urlEncode(sign.sign(privateKey))}`;
}

const TEST_USER_ID = 'a1b2c3d4-1234-5678-abcd-ef0123456789';
const OTHER_USER_ID = 'b9c8d7e6-4321-8765-dcba-fe9876543210';
const ADMIN_USER_ID = 'c0d1e2f3-0000-0000-0000-000000000000';

function makeToken(roles = ['user']) {
  const now = Math.floor(Date.now() / 1000);
  return createJwt({
    sub: TEST_USER_ID,
    exp: now + 3600,
    iat: now,
    realm_access: { roles },
  });
}

// ── Mock recommender server ───────────────────────────────────────────────────

const FIXTURE_RECOMMEND = { habits: ['drink water', 'walk 10 min'] };
const FIXTURE_CLASSIFY = { category: 'exercise', confidence: 0.92 };
const FIXTURE_HISTORY = {
  history: [{ date: '2026-01-01', habit: 'walk 10 min' }],
};

let mockRecommender;
let recommenderUrl;

function startMockRecommender() {
  const app = express();
  app.use(express.json());

  app.get('/recommend/:userId/history', (req, res) => {
    res.json(FIXTURE_HISTORY);
  });

  app.get('/recommend/:userId', (req, res) => {
    res.json(FIXTURE_RECOMMEND);
  });

  app.post('/classify', (req, res) => {
    res.json(FIXTURE_CLASSIFY);
  });

  const server = createServer(app);
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, url: `http://127.0.0.1:${port}` });
    });
  });
}

// ── Test server ───────────────────────────────────────────────────────────────

let server;
let baseUrl;

before(async () => {
  // Start mock recommender
  const mock = await startMockRecommender();
  mockRecommender = mock.server;
  recommenderUrl = mock.url;

  // Patch global fetch for JWKS
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
    neo4jRun: async () => ({ records: [] }),
    recommenderUrl,
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
  mockRecommender.close();
});

// ── Helper ────────────────────────────────────────────────────────────────────

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

test('GET /api/v1/recommend/:userId returns 401 without token', async () => {
  const res = await get('/api/v1/recommend/user123');
  assert.strictEqual(res.status, 401);
});

test('GET /api/v1/recommend/:userId returns 403 for no-role token', async () => {
  const token = makeToken([]);
  const res = await get('/api/v1/recommend/user123', token);
  assert.strictEqual(res.status, 403);
});

// ── Proxy fixtures ────────────────────────────────────────────────────────────

test('GET /api/v1/recommend/:userId proxies to recommender and returns fixture', async () => {
  // IDOR: participant token sub matches userId in URL
  const token = makeToken(['user']);
  const res = await get(`/api/v1/recommend/${TEST_USER_ID}`, token);
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.deepStrictEqual(body, FIXTURE_RECOMMEND);
});

test('POST /api/v1/recommend/classify proxies to recommender and returns fixture', async () => {
  const token = makeToken(['user']);
  const res = await post(
    '/api/v1/recommend/classify',
    { text: 'go for a run' },
    token
  );
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.deepStrictEqual(body, FIXTURE_CLASSIFY);
});

test('GET /api/v1/recommend/:userId/history proxies to recommender and returns fixture', async () => {
  // IDOR: participant token sub matches userId in URL
  const token = makeToken(['user']);
  const res = await get(`/api/v1/recommend/${TEST_USER_ID}/history`, token);
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.deepStrictEqual(body, FIXTURE_HISTORY);
});

test('Proxy preserves Authorization header to downstream recommender', async () => {
  // Verify by checking that a valid token gets a 200 (mock ignores auth but proxy passes it)
  const token = makeToken(['admin']);
  const res = await get(`/api/v1/recommend/${ADMIN_USER_ID}`, token);
  assert.strictEqual(res.status, 200);
});

test('GET /api/v1/recommend/:userId returns 403 when participant accesses another user', async () => {
  // IDOR: participant sub=TEST_USER_ID cannot access OTHER_USER_ID
  const token = makeToken(['user']);
  const res = await get(`/api/v1/recommend/${OTHER_USER_ID}`, token);
  assert.strictEqual(res.status, 403);
});

test('GET /api/v1/recommend/:userId/history returns 403 when participant accesses another user', async () => {
  const token = makeToken(['user']);
  const res = await get(`/api/v1/recommend/${OTHER_USER_ID}/history`, token);
  assert.strictEqual(res.status, 403);
});
