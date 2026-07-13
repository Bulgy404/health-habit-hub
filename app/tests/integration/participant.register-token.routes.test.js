// UC-15 — Register FCM device token (POST /api/v1/participant/register-token)
import { test, before, after } from 'node:test';
import assert from 'node:assert';
import { createServer } from 'node:http';
import { generateKeyPairSync, createSign } from 'node:crypto';
import express from 'express';
import { createApiRouter } from '../../routes/apiRouter.js';

// ── Key material ──────────────────────────────────────────────────────────────

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
});
const pubKeyJwk = publicKey.export({ format: 'jwk' });
pubKeyJwk.kid = 'rt-key-1';
pubKeyJwk.use = 'sig';
const mockJwks = { keys: [pubKeyJwk] };

function base64urlEncode(buf) {
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

function createJwt(payload) {
  const header = { alg: 'RS256', kid: 'rt-key-1', typ: 'JWT' };
  const h = base64urlEncode(Buffer.from(JSON.stringify(header)));
  const p = base64urlEncode(Buffer.from(JSON.stringify(payload)));
  const signingInput = `${h}.${p}`;
  const sign = createSign('RSA-SHA256');
  sign.update(signingInput);
  return `${signingInput}.${base64urlEncode(sign.sign(privateKey))}`;
}

function makeToken(roles = ['user'], sub = 'rt-user') {
  const now = Math.floor(Date.now() / 1000);
  return createJwt({ sub, exp: now + 3600, iat: now, realm_access: { roles } });
}

// ── In-memory mock DB ─────────────────────────────────────────────────────────

const deviceTokens = new Map(); // userId -> doc

function createMockDb() {
  return {
    collection(name) {
      if (name === 'deviceTokens') {
        return {
          async updateOne(filter, update, opts) {
            const existing = deviceTokens.get(filter.userId);
            if (existing) {
              Object.assign(existing, update.$set);
              return { matchedCount: 1, modifiedCount: 1 };
            }
            if (opts?.upsert) {
              deviceTokens.set(filter.userId, { ...update.$set });
              return { matchedCount: 0, upsertedCount: 1 };
            }
            return { matchedCount: 0 };
          },
        };
      }
      return {
        findOne: async () => null,
        find: () => ({
          toArray: async () => [],
          sort: () => ({ toArray: async () => [] }),
        }),
        insertOne: async () => ({}),
        updateOne: async () => ({ matchedCount: 0 }),
        countDocuments: async () => 0,
      };
    },
  };
}

// ── Test server ───────────────────────────────────────────────────────────────

let server;
let baseUrl;

before(async () => {
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
    db: createMockDb(),
    neo4jRun: async () => [],
  });
  testApp.use('/api/v1', apiRouter);
  server = createServer(testApp);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  await fetch(`${baseUrl}/api/v1/health`);
});

after(() => {
  // closeAllConnections destroys any lingering keep-alive sockets first —
  // without it, close()'s callback (and thus process exit / progression to
  // the next test file) waits forever for connections that fetch()'s
  // undici agent doesn't proactively close.
  server.closeAllConnections();
  server.close();
});

async function post(path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

const RT = '/api/v1/participant/register-token';

// ── Auth enforcement ──────────────────────────────────────────────────────────

test('POST /participant/register-token returns 401 without token', async () => {
  const res = await post(RT, { token: 'fcm-abc' });
  assert.strictEqual(res.status, 401);
});

// ── Validation ────────────────────────────────────────────────────────────────

test('returns 400 when token field is missing', async () => {
  const res = await post(RT, {}, makeToken());
  assert.strictEqual(res.status, 400);
});

test('returns 400 when token is not a string', async () => {
  const res = await post(RT, { token: 12345 }, makeToken());
  assert.strictEqual(res.status, 400);
});

// ── Registration & idempotent refresh ─────────────────────────────────────────

test('registers an FCM token for the authenticated user', async () => {
  const res = await post(
    RT,
    { token: 'fcm-token-1' },
    makeToken(['user'], 'rt-user')
  );
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.strictEqual(body.ok, true);

  const stored = deviceTokens.get('rt-user');
  assert.strictEqual(stored.token, 'fcm-token-1');
  assert.ok(stored.updatedAt instanceof Date || stored.updatedAt);
});

test('re-registering replaces the stored token (upsert, one doc per user)', async () => {
  await post(RT, { token: 'fcm-token-old' }, makeToken(['user'], 'rt-user-2'));
  const res = await post(
    RT,
    { token: 'fcm-token-new' },
    makeToken(['user'], 'rt-user-2')
  );
  assert.strictEqual(res.status, 200);

  const stored = deviceTokens.get('rt-user-2');
  assert.strictEqual(stored.token, 'fcm-token-new');
});
