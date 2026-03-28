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
pubKeyJwk.kid = 'settings-key-1';
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
  const header = { alg: 'RS256', kid: 'settings-key-1', typ: 'JWT' };
  const h = base64urlEncode(Buffer.from(JSON.stringify(header)));
  const p = base64urlEncode(Buffer.from(JSON.stringify(payload)));
  const signingInput = `${h}.${p}`;
  const sign = createSign('RSA-SHA256');
  sign.update(signingInput);
  return `${signingInput}.${base64urlEncode(sign.sign(privateKey))}`;
}

function makeToken(roles = ['admin'], sub = 'admin-user-settings') {
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
  const collections = {};

  function getStore(name) {
    if (!collections[name]) collections[name] = new Map();
    return collections[name];
  }

  return {
    collection(name) {
      const store = getStore(name);
      return {
        find(_query) {
          const results = [];
          for (const [, doc] of store) {
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
            if (query.key !== undefined && doc.key !== query.key) continue;
            if (query.userId !== undefined && doc.userId !== query.userId)
              continue;
            return { ...doc };
          }
          return null;
        },
        async insertOne(doc) {
          const key = doc.key || doc.userId || Math.random().toString(36);
          store.set(key, { ...doc });
          return { insertedId: key };
        },
        async updateOne(filter, update, options = {}) {
          let matched = null;
          let storeKey = null;
          for (const [k, doc] of store) {
            if (filter.key !== undefined && doc.key !== filter.key) continue;
            if (filter.userId !== undefined && doc.userId !== filter.userId)
              continue;
            matched = doc;
            storeKey = k;
            break;
          }
          if (!matched) {
            if (options.upsert) {
              const newDoc = {
                ...(filter.key !== undefined ? { key: filter.key } : {}),
                ...(filter.userId !== undefined
                  ? { userId: filter.userId }
                  : {}),
                ...update.$set,
              };
              const k =
                newDoc.key || newDoc.userId || Math.random().toString(36);
              store.set(k, newDoc);
              return { matchedCount: 0, modifiedCount: 0, upsertedCount: 1 };
            }
            return { matchedCount: 0, modifiedCount: 0 };
          }
          store.set(storeKey, { ...matched, ...update.$set });
          return { matchedCount: 1, modifiedCount: 1 };
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
  const v1Router = createV1Router({
    jwksUrl: 'http://keycloak/jwks',
    expectedIssuer: null,
    expectedAudience: null,
    serviceChecks: { neo4jCheck: okCheck, mongoCheck: okCheck },
    db: mockDb,
  });
  testApp.use('/api/v1', v1Router);

  server = createServer(testApp);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  // Wait briefly so the router seeds defaults
  await new Promise((resolve) => setTimeout(resolve, 50));
});

after(() => {
  server.close();
});

// ── HTTP helpers ──────────────────────────────────────────────────────────────

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

// ── Tests ─────────────────────────────────────────────────────────────────────

test('GET /api/v1/admin/settings - 401 without token', async () => {
  const res = await get('/api/v1/admin/settings');
  assert.strictEqual(res.status, 401);
});

test('GET /api/v1/admin/settings - 403 for participant role', async () => {
  const token = makeToken(['participant']);
  const res = await get('/api/v1/admin/settings', token);
  assert.strictEqual(res.status, 403);
});

test('GET /api/v1/admin/settings - returns default settings', async () => {
  const token = makeToken(['admin']);
  const res = await get('/api/v1/admin/settings', token);
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.strictEqual(typeof body, 'object');
  assert.strictEqual(body.token_card_format, 'both');
});

test('PUT /api/v1/admin/settings/:key - 401 without token', async () => {
  const res = await put('/api/v1/admin/settings/token_card_format', {
    value: 'qr',
  });
  assert.strictEqual(res.status, 401);
});

test('PUT /api/v1/admin/settings/:key - 403 for participant role', async () => {
  const token = makeToken(['participant']);
  const res = await put(
    '/api/v1/admin/settings/token_card_format',
    { value: 'qr' },
    token
  );
  assert.strictEqual(res.status, 403);
});

test('PUT /api/v1/admin/settings/:key - updates existing setting', async () => {
  const token = makeToken(['admin']);
  const res = await put(
    '/api/v1/admin/settings/token_card_format',
    { value: 'qr' },
    token
  );
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.strictEqual(body.ok, true);
  assert.strictEqual(body.key, 'token_card_format');
  assert.strictEqual(body.value, 'qr');
});

test('GET /api/v1/admin/settings - reflects updated value', async () => {
  const token = makeToken(['admin']);
  // Set to 'print'
  await put(
    '/api/v1/admin/settings/token_card_format',
    { value: 'print' },
    token
  );
  const res = await get('/api/v1/admin/settings', token);
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.strictEqual(body.token_card_format, 'print');
});

test('PUT /api/v1/admin/settings/:key - upserts new key', async () => {
  const token = makeToken(['admin']);
  const res = await put(
    '/api/v1/admin/settings/study_phase',
    { value: '2' },
    token
  );
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.strictEqual(body.ok, true);
  assert.strictEqual(body.key, 'study_phase');
  assert.strictEqual(body.value, '2');
});

test('GET /api/v1/admin/settings - includes upserted key', async () => {
  const token = makeToken(['admin']);
  const res = await get('/api/v1/admin/settings', token);
  const body = await res.json();
  assert.strictEqual(body.study_phase, '2');
});

test('PUT /api/v1/admin/settings/:key - 400 for missing value', async () => {
  const token = makeToken(['admin']);
  const res = await put('/api/v1/admin/settings/token_card_format', {}, token);
  assert.strictEqual(res.status, 400);
});

test('GET /api/v1/admin/settings - researcher role allowed', async () => {
  const token = makeToken(['researcher']);
  const res = await get('/api/v1/admin/settings', token);
  assert.strictEqual(res.status, 200);
});
