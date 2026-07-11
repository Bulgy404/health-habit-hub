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
pubKeyJwk.kid = 'profile-key-1';
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
  const header = { alg: 'RS256', kid: 'profile-key-1', typ: 'JWT' };
  const h = base64urlEncode(Buffer.from(JSON.stringify(header)));
  const p = base64urlEncode(Buffer.from(JSON.stringify(payload)));
  const signingInput = `${h}.${p}`;
  const sign = createSign('RSA-SHA256');
  sign.update(signingInput);
  return `${signingInput}.${base64urlEncode(sign.sign(privateKey))}`;
}

function makeToken(roles = ['user'], sub = 'user-profile-test') {
  const now = Math.floor(Date.now() / 1000);
  return createJwt({
    sub,
    exp: now + 3600,
    iat: now,
    realm_access: { roles },
  });
}

// ── In-memory mock MongoDB db ─────────────────────────────────────────────────

function createMockDb() {
  const store = new Map();
  return {
    collection(_name) {
      return {
        async findOne(query) {
          for (const [, doc] of store) {
            if (doc.userId === query.userId) return { ...doc };
          }
          return null;
        },
        async updateOne(filter, update, opts) {
          let existing = null;
          let key = null;
          for (const [k, doc] of store) {
            if (doc.userId === filter.userId) {
              existing = doc;
              key = k;
              break;
            }
          }
          if (existing) {
            store.set(key, { ...existing, ...update.$set });
          } else if (opts && opts.upsert) {
            const newKey = Math.random().toString(36);
            store.set(newKey, { ...update.$set });
          }
        },
      };
    },
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
  const apiRouter = createApiRouter({
    jwksUrl: 'http://keycloak/jwks',
    expectedIssuer: null,
    expectedAudience: null,
    serviceChecks: { neo4jCheck: okCheck, mongoCheck: okCheck },
    neo4jRun: async () => ({ records: [] }),
    db: mockDb,
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

test('GET /api/v1/profile returns 401 without token', async () => {
  const res = await get('/api/v1/profile');
  assert.strictEqual(res.status, 401);
});

test('POST /api/v1/profile returns 401 without token', async () => {
  const res = await post('/api/v1/profile', {});
  assert.strictEqual(res.status, 401);
});

test('GET /api/v1/profile returns 403 for token with no roles', async () => {
  const token = makeToken([]);
  const res = await get('/api/v1/profile', token);
  assert.strictEqual(res.status, 403);
});

// ── 404 when profile not set ──────────────────────────────────────────────────

test('GET /api/v1/profile returns 404 when no profile exists', async () => {
  const token = makeToken(['user'], 'user-no-profile');
  const res = await get('/api/v1/profile', token);
  assert.strictEqual(res.status, 404);
  const body = await res.json();
  assert.ok(body.error);
});

// ── POST creates / updates profile ────────────────────────────────────────────

test('POST /api/v1/profile upserts and returns profile', async () => {
  const token = makeToken(['user'], 'user-upsert-test');
  const answers = { q1: 'yes', q2: 'no' };
  const completedAt = '2026-03-15T10:00:00.000Z';

  const res = await post('/api/v1/profile', { answers, completedAt }, token);
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.strictEqual(body.userId, 'user-upsert-test');
  assert.deepStrictEqual(body.answers, answers);
  assert.ok(body.updatedAt);
});

// ── GET returns previously stored profile ─────────────────────────────────────

test('GET /api/v1/profile returns stored profile after POST', async () => {
  const token = makeToken(['user'], 'user-get-after-post');
  const answers = { mood: 'good' };

  // Create profile
  await post('/api/v1/profile', { answers }, token);

  // Retrieve profile
  const res = await get('/api/v1/profile', token);
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.strictEqual(body.userId, 'user-get-after-post');
  assert.deepStrictEqual(body.answers, answers);
});

// ── POST is idempotent (upsert) ───────────────────────────────────────────────

test('POST /api/v1/profile overwrites existing profile on repeat call', async () => {
  const token = makeToken(['user'], 'user-repeat-post');

  await post('/api/v1/profile', { answers: { q1: 'first' } }, token);
  const res = await post(
    '/api/v1/profile',
    { answers: { q1: 'second' } },
    token
  );
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.strictEqual(body.answers.q1, 'second');
});
