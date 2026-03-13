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
pubKeyJwk.kid = 'test-key-1';
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
  const header = { alg: 'RS256', kid: 'test-key-1', typ: 'JWT' };
  const h = base64urlEncode(Buffer.from(JSON.stringify(header)));
  const p = base64urlEncode(Buffer.from(JSON.stringify(payload)));
  const signingInput = `${h}.${p}`;
  const sign = createSign('RSA-SHA256');
  sign.update(signingInput);
  return `${signingInput}.${base64urlEncode(sign.sign(privateKey))}`;
}

function makeToken(roles = []) {
  const now = Math.floor(Date.now() / 1000);
  return createJwt({
    sub: 'user-test',
    exp: now + 3600,
    iat: now,
    realm_access: { roles },
  });
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
  const v1Router = createV1Router({ jwksUrl: 'http://keycloak/jwks' });
  testApp.use('/api/v1', v1Router);

  server = createServer(testApp);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;

  // Warm up JWKS cache
  await get('/api/v1/health');
});

after(() => {
  server.close();
});

// ── Helper ────────────────────────────────────────────────────────────────────

async function get(path, token) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  return fetch(`${baseUrl}${path}`, { headers });
}

// ── Public route ──────────────────────────────────────────────────────────────

test('GET /api/v1/health returns 200 without auth', async () => {
  const res = await get('/api/v1/health');
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.strictEqual(body.status, 'ok');
});

// ── 401 – no token ────────────────────────────────────────────────────────────

test('GET /api/v1/surveys returns 401 with no token', async () => {
  const res = await get('/api/v1/surveys');
  assert.strictEqual(res.status, 401);
});

test('GET /api/v1/habits returns 401 with no token', async () => {
  const res = await get('/api/v1/habits');
  assert.strictEqual(res.status, 401);
});

test('GET /api/v1/admin returns 401 with no token', async () => {
  const res = await get('/api/v1/admin');
  assert.strictEqual(res.status, 401);
});

// ── 403 – wrong role ──────────────────────────────────────────────────────────

test('GET /api/v1/admin returns 403 for participant role', async () => {
  const token = makeToken(['participant']);
  const res = await get('/api/v1/admin', token);
  assert.strictEqual(res.status, 403);
});

test('GET /api/v1/surveys returns 403 for token with no roles', async () => {
  const token = makeToken([]);
  const res = await get('/api/v1/surveys', token);
  assert.strictEqual(res.status, 403);
});

test('GET /api/v1/habits returns 403 for token with no roles', async () => {
  const token = makeToken([]);
  const res = await get('/api/v1/habits', token);
  assert.strictEqual(res.status, 403);
});

// ── 200 – correct role ────────────────────────────────────────────────────────

test('GET /api/v1/surveys returns 200 for participant role', async () => {
  const token = makeToken(['participant']);
  const res = await get('/api/v1/surveys', token);
  assert.strictEqual(res.status, 200);
});

test('GET /api/v1/habits returns 200 for participant role', async () => {
  const token = makeToken(['participant']);
  const res = await get('/api/v1/habits', token);
  assert.strictEqual(res.status, 200);
});

test('GET /api/v1/admin returns 200 for admin role', async () => {
  const token = makeToken(['admin']);
  const res = await get('/api/v1/admin', token);
  assert.strictEqual(res.status, 200);
});

test('GET /api/v1/admin returns 200 for researcher role', async () => {
  const token = makeToken(['researcher']);
  const res = await get('/api/v1/admin', token);
  assert.strictEqual(res.status, 200);
});

test('GET /api/v1/surveys returns 200 for admin role', async () => {
  const token = makeToken(['admin']);
  const res = await get('/api/v1/surveys', token);
  assert.strictEqual(res.status, 200);
});
