import { test, before, after } from 'node:test';
import assert from 'node:assert';
import { createServer } from 'node:http';
import { generateKeyPairSync, createSign } from 'node:crypto';
import express from 'express';
import { createV1Router } from '../../routes/v1Router.js';

// ── Key material ──────────────────────────────────────────────────────────────

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
});
const pubKeyJwk = publicKey.export({ format: 'jwk' });
pubKeyJwk.kid = 'users-key-1';
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
  const header = { alg: 'RS256', kid: 'users-key-1', typ: 'JWT' };
  const h = base64urlEncode(Buffer.from(JSON.stringify(header)));
  const p = base64urlEncode(Buffer.from(JSON.stringify(payload)));
  const signingInput = `${h}.${p}`;
  const sign = createSign('RSA-SHA256');
  sign.update(signingInput);
  return `${signingInput}.${base64urlEncode(sign.sign(privateKey))}`;
}

function makeToken(roles = ['participant'], sub = 'user-test') {
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
  const stores = {};
  return {
    collection(name) {
      if (!stores[name]) stores[name] = new Map();
      const store = stores[name];
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

before(async () => {
  const mockDb = createMockDb();

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
    serviceChecks: { neo4jCheck: okCheck, mongoCheck: okCheck },
    db: mockDb,
  });
  testApp.use('/api/v1', v1Router);

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

async function put(path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return fetch(`${baseUrl}${path}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(body),
  });
}

// ── Auth enforcement ──────────────────────────────────────────────────────────

test('GET /api/v1/users/me returns 401 without token', async () => {
  const res = await get('/api/v1/users/me');
  assert.strictEqual(res.status, 401);
});

test('PUT /api/v1/users/me returns 401 without token', async () => {
  const res = await put('/api/v1/users/me', {});
  assert.strictEqual(res.status, 401);
});

test('GET /api/v1/users/me returns 403 for token with no roles', async () => {
  const token = makeToken([]);
  const res = await get('/api/v1/users/me', token);
  assert.strictEqual(res.status, 403);
});

// ── GET returns default preferredLanguage ─────────────────────────────────────

test('GET /api/v1/users/me returns default preferredLanguage en when no record exists', async () => {
  const token = makeToken(['participant'], 'user-get-default');
  const res = await get('/api/v1/users/me', token);
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.strictEqual(body.userId, 'user-get-default');
  assert.strictEqual(body.preferredLanguage, 'en');
});

// ── PUT updates preferredLanguage ─────────────────────────────────────────────

test('PUT /api/v1/users/me updates preferredLanguage to de', async () => {
  const token = makeToken(['participant'], 'user-put-de');
  const res = await put('/api/v1/users/me', { preferredLanguage: 'de' }, token);
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.strictEqual(body.preferredLanguage, 'de');
});

test('PUT /api/v1/users/me updates preferredLanguage to en', async () => {
  const token = makeToken(['participant'], 'user-put-en');
  const res = await put('/api/v1/users/me', { preferredLanguage: 'en' }, token);
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.strictEqual(body.preferredLanguage, 'en');
});

test('GET /api/v1/users/me returns updated preferredLanguage after PUT', async () => {
  const token = makeToken(['participant'], 'user-get-after-put');
  await put('/api/v1/users/me', { preferredLanguage: 'de' }, token);
  const res = await get('/api/v1/users/me', token);
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.strictEqual(body.preferredLanguage, 'de');
});

// ── PUT rejects unsupported values ────────────────────────────────────────────

test('PUT /api/v1/users/me returns 400 for unsupported preferredLanguage', async () => {
  const token = makeToken(['participant'], 'user-put-invalid');
  const res = await put('/api/v1/users/me', { preferredLanguage: 'fr' }, token);
  assert.strictEqual(res.status, 400);
  const body = await res.json();
  assert.ok(body.error);
});

test('PUT /api/v1/users/me returns 400 for empty string preferredLanguage', async () => {
  const token = makeToken(['participant'], 'user-put-empty');
  const res = await put('/api/v1/users/me', { preferredLanguage: '' }, token);
  assert.strictEqual(res.status, 400);
  const body = await res.json();
  assert.ok(body.error);
});
