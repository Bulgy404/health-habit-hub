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

// Array of docs (not a Map) — a participant can now have more than one
// (userId, deviceId) pair, which a single-key Map couldn't represent.
const deviceTokens = [];

function docMatchesFilter(doc, filter) {
  return Object.entries(filter).every(([key, value]) => {
    if (value && typeof value === 'object' && '$exists' in value) {
      return value.$exists ? key in doc : !(key in doc);
    }
    return doc[key] === value;
  });
}

function createMockDb() {
  return {
    collection(name) {
      if (name === 'deviceTokens') {
        return {
          async updateOne(filter, update, opts) {
            const existing = deviceTokens.find((d) =>
              docMatchesFilter(d, filter)
            );
            if (existing) {
              Object.assign(existing, update.$set);
              return { matchedCount: 1, modifiedCount: 1 };
            }
            if (opts?.upsert) {
              deviceTokens.push({ ...update.$set });
              return { matchedCount: 0, upsertedCount: 1 };
            }
            return { matchedCount: 0 };
          },
          async deleteOne(filter) {
            const idx = deviceTokens.findIndex((d) =>
              docMatchesFilter(d, filter)
            );
            if (idx === -1) return { deletedCount: 0 };
            deviceTokens.splice(idx, 1);
            return { deletedCount: 1 };
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

/** Finds the one stored deviceTokens doc for a plain userId (no deviceId) — mirrors the old Map.get(userId) convenience used throughout this file's existing assertions. */
function getByUserId(userId) {
  return deviceTokens.find((d) => d.userId === userId);
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

  const stored = getByUserId('rt-user');
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

  const stored = getByUserId('rt-user-2');
  assert.strictEqual(stored.token, 'fcm-token-new');
});

// ── Multi-device registration (deviceId) ──────────────────────────────────────

test('two devices for the same participant are kept as separate docs when each sends a deviceId', async () => {
  const user = makeToken(['user'], 'rt-user-multi');
  await post(
    RT,
    {
      token: 'fcm-phone',
      deviceId: 'device-a',
      platform: 'ios',
      model: 'iPhone16,1',
      appVersion: '1.1.1+5',
    },
    user
  );
  await post(
    RT,
    {
      token: 'fcm-tablet',
      deviceId: 'device-b',
      platform: 'android',
      model: 'Pixel Tablet',
      appVersion: '1.1.1+5',
    },
    user
  );

  const docs = deviceTokens.filter((d) => d.userId === 'rt-user-multi');
  assert.strictEqual(docs.length, 2, 'each deviceId gets its own doc');
  const byDeviceId = Object.fromEntries(docs.map((d) => [d.deviceId, d]));
  assert.strictEqual(byDeviceId['device-a'].token, 'fcm-phone');
  assert.strictEqual(byDeviceId['device-a'].model, 'iPhone16,1');
  assert.strictEqual(byDeviceId['device-b'].token, 'fcm-tablet');
  assert.strictEqual(byDeviceId['device-b'].model, 'Pixel Tablet');
});

test('re-registering the same deviceId updates that device in place, not a new doc', async () => {
  const user = makeToken(['user'], 'rt-user-samedevice');
  await post(
    RT,
    { token: 'fcm-v1', deviceId: 'device-x', appVersion: '1.1.0+4' },
    user
  );
  await post(
    RT,
    { token: 'fcm-v2', deviceId: 'device-x', appVersion: '1.1.1+5' },
    user
  );

  const docs = deviceTokens.filter((d) => d.userId === 'rt-user-samedevice');
  assert.strictEqual(docs.length, 1);
  assert.strictEqual(docs[0].token, 'fcm-v2');
  assert.strictEqual(docs[0].appVersion, '1.1.1+5');
});

test("a deviceId registration supersedes and removes an older build's legacy no-deviceId doc for the same user", async () => {
  const user = makeToken(['user'], 'rt-user-upgrading');
  // Simulates an app build that predates device tracking.
  await post(RT, { token: 'fcm-legacy' }, user);
  assert.strictEqual(
    deviceTokens.filter((d) => d.userId === 'rt-user-upgrading').length,
    1
  );

  // Same participant, now on an updated build that sends a deviceId.
  await post(
    RT,
    { token: 'fcm-legacy', deviceId: 'device-y', platform: 'android' },
    user
  );

  const docs = deviceTokens.filter((d) => d.userId === 'rt-user-upgrading');
  assert.strictEqual(
    docs.length,
    1,
    'the legacy no-deviceId doc should be removed, leaving only the new device-scoped one'
  );
  assert.strictEqual(docs[0].deviceId, 'device-y');
});

test('deviceId is optional — omitting it keeps the original single-doc-per-user fallback', async () => {
  const res = await post(
    RT,
    { token: 'fcm-no-device-id' },
    makeToken(['user'], 'rt-user-nodeviceid')
  );
  assert.strictEqual(res.status, 200);
  const stored = getByUserId('rt-user-nodeviceid');
  assert.strictEqual(stored.token, 'fcm-no-device-id');
  assert.strictEqual('deviceId' in stored, false);
});
