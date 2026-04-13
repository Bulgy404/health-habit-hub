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
pubKeyJwk.kid = 'admin-key-1';
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
  const header = { alg: 'RS256', kid: 'admin-key-1', typ: 'JWT' };
  const h = base64urlEncode(Buffer.from(JSON.stringify(header)));
  const p = base64urlEncode(Buffer.from(JSON.stringify(payload)));
  const signingInput = `${h}.${p}`;
  const sign = createSign('RSA-SHA256');
  sign.update(signingInput);
  return `${signingInput}.${base64urlEncode(sign.sign(privateKey))}`;
}

function makeToken(roles = ['admin'], sub = 'admin-user-test') {
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
        find(query) {
          const results = [];
          for (const [, doc] of store) {
            // Filter out soft-deleted docs if query has deletedAt: { $exists: false }
            if (
              query &&
              query.deletedAt &&
              query.deletedAt.$exists === false &&
              doc.deletedAt !== undefined
            ) {
              continue;
            }
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
            if (query.userId && doc.userId !== query.userId) continue;
            if (
              query.deletedAt &&
              query.deletedAt.$exists === false &&
              doc.deletedAt !== undefined
            ) {
              continue;
            }
            return { ...doc };
          }
          return null;
        },
        async insertOne(doc) {
          const key = doc.userId || Math.random().toString(36);
          store.set(key, { ...doc });
          return { insertedId: key };
        },
        async updateOne(filter, update) {
          let matched = null;
          let key = null;
          for (const [k, doc] of store) {
            if (filter.userId && doc.userId !== filter.userId) continue;
            if (
              filter.deletedAt &&
              filter.deletedAt.$exists === false &&
              doc.deletedAt !== undefined
            ) {
              continue;
            }
            matched = doc;
            key = k;
            break;
          }
          if (!matched) return { matchedCount: 0, modifiedCount: 0 };
          store.set(key, { ...matched, ...update.$set });
          return { matchedCount: 1, modifiedCount: 1 };
        },
      };
    },
  };
}

// ── Mock Token Card Service ───────────────────────────────────────────────────

function createMockTokenCardService() {
  return {
    async generateTokenCard(userId, username, password, format) {
      // Return a minimal fake PDF buffer (starts with %PDF)
      return Buffer.from(`%PDF-1.4 fake-pdf userId=${userId} format=${format}`);
    },
  };
}

// ── Mock Keycloak ─────────────────────────────────────────────────────────────

function createMockKeycloak() {
  const users = new Map();
  return {
    users,
    async createUser({ userId, username, password }) {
      users.set(userId, {
        userId,
        username,
        password,
        roles: [],
        attributes: {},
      });
    },
    async assignRole(userId, roleName) {
      const user = users.get(userId);
      if (user) user.roles.push(roleName);
    },
    async updateUserAttribute(userId, key, value) {
      const user = users.get(userId);
      if (user) user.attributes[key] = value;
    },
  };
}

// ── Test server ───────────────────────────────────────────────────────────────

let server;
let baseUrl;
let mockDb;
let mockKc;
let mockTokenCardSvc;

before(async () => {
  mockDb = createMockDb();
  mockKc = createMockKeycloak();
  mockTokenCardSvc = createMockTokenCardService();

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
    keycloak: mockKc,
    tokenCardService: mockTokenCardSvc,
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

// ── HTTP helpers ──────────────────────────────────────────────────────────────

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

async function patch(path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return fetch(`${baseUrl}${path}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(body),
  });
}

async function del(path, token) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  return fetch(`${baseUrl}${path}`, { method: 'DELETE', headers });
}

// ── Auth enforcement ──────────────────────────────────────────────────────────

test('GET /api/v1/admin/participants returns 401 without token', async () => {
  const res = await get('/api/v1/admin/participants');
  assert.strictEqual(res.status, 401);
});

test('POST /api/v1/admin/participants returns 401 without token', async () => {
  const res = await post('/api/v1/admin/participants', {});
  assert.strictEqual(res.status, 401);
});

test('GET /api/v1/admin/participants returns 403 for participant role', async () => {
  const token = makeToken(['participant']);
  const res = await get('/api/v1/admin/participants', token);
  assert.strictEqual(res.status, 403);
});

// ── GET participants ──────────────────────────────────────────────────────────

test('GET /api/v1/admin/participants returns empty array initially', async () => {
  const token = makeToken(['admin']);
  const res = await get('/api/v1/admin/participants', token);
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.ok(Array.isArray(body));
});

// ── POST creates participant ──────────────────────────────────────────────────

test('POST /api/v1/admin/participants creates participant and returns credentials', async () => {
  const token = makeToken(['admin']);
  const res = await post('/api/v1/admin/participants', {}, token);
  assert.strictEqual(res.status, 201);
  const body = await res.json();
  assert.ok(body.userId, 'should have userId');
  assert.ok(body.username.startsWith('p-'), 'username should start with p-');
  assert.ok(body.password, 'should have password');
});

test('POST creates participant visible in GET list', async () => {
  const token = makeToken(['admin'], 'admin-list-test');
  await post('/api/v1/admin/participants', {}, token);
  const res = await get('/api/v1/admin/participants', token);
  const body = await res.json();
  assert.ok(body.length >= 1);
  const p = body[0];
  assert.ok(p.userId);
  assert.ok(p.username);
  assert.ok(p.enrolledAt);
  assert.ok('group' in p);
  assert.ok('surveyCompletionPct' in p);
});

// ── PATCH group ───────────────────────────────────────────────────────────────

test('PATCH /api/v1/admin/participants/:id/group updates group', async () => {
  const token = makeToken(['admin'], 'admin-group-test');

  // Create participant
  const createRes = await post('/api/v1/admin/participants', {}, token);
  const { userId } = await createRes.json();

  // Update group
  const patchRes = await patch(
    `/api/v1/admin/participants/${userId}/group`,
    { group: 'G2' },
    token
  );
  assert.strictEqual(patchRes.status, 200);
  const body = await patchRes.json();
  assert.strictEqual(body.ok, true);
  assert.strictEqual(body.group, 'G2');
});

test('PATCH group returns 400 for invalid group', async () => {
  const token = makeToken(['admin']);
  const res = await patch(
    '/api/v1/admin/participants/some-id/group',
    { group: 'G5' },
    token
  );
  assert.strictEqual(res.status, 400);
});

test('PATCH group returns 404 for unknown participant', async () => {
  const token = makeToken(['admin']);
  const res = await patch(
    '/api/v1/admin/participants/nonexistent-id/group',
    { group: 'G1' },
    token
  );
  assert.strictEqual(res.status, 404);
});

// ── DELETE soft-delete ────────────────────────────────────────────────────────

test('DELETE /api/v1/admin/participants/:id soft-deletes participant', async () => {
  const token = makeToken(['admin'], 'admin-delete-test');

  // Create participant
  const createRes = await post('/api/v1/admin/participants', {}, token);
  const { userId } = await createRes.json();

  // Delete
  const deleteRes = await del(`/api/v1/admin/participants/${userId}`, token);
  assert.strictEqual(deleteRes.status, 200);
  const body = await deleteRes.json();
  assert.strictEqual(body.ok, true);
});

test('DELETE returns 404 for unknown participant', async () => {
  const token = makeToken(['admin']);
  const res = await del('/api/v1/admin/participants/unknown-id', token);
  assert.strictEqual(res.status, 404);
});

// ── Token card ────────────────────────────────────────────────────────────────

test('POST /api/v1/admin/participants response includes tokenCardUrl', async () => {
  const token = makeToken(['admin'], 'admin-token-url-test');
  const res = await post('/api/v1/admin/participants', {}, token);
  assert.strictEqual(res.status, 201);
  const body = await res.json();
  assert.ok(body.tokenCardUrl, 'response should include tokenCardUrl');
  assert.ok(
    body.tokenCardUrl.includes(body.userId),
    'tokenCardUrl should contain the userId'
  );
});

test('GET /api/v1/admin/participants/:id/token-card returns PDF for valid participant', async () => {
  const token = makeToken(['admin'], 'admin-tokencard-get-test');

  // Create participant first
  const createRes = await post('/api/v1/admin/participants', {}, token);
  const { userId } = await createRes.json();

  // Fetch token card
  const res = await get(
    `/api/v1/admin/participants/${userId}/token-card`,
    token
  );
  assert.strictEqual(res.status, 200);
  assert.ok(
    res.headers.get('content-type').includes('application/pdf'),
    'content-type should be application/pdf'
  );
  const buf = Buffer.from(await res.arrayBuffer());
  assert.ok(buf.length > 0, 'PDF buffer should not be empty');
});

test('GET /api/v1/admin/participants/:id/token-card returns 404 for unknown participant', async () => {
  const token = makeToken(['admin']);
  const res = await get(
    '/api/v1/admin/participants/nonexistent/token-card',
    token
  );
  assert.strictEqual(res.status, 404);
});

test('GET /api/v1/admin/participants/:id/token-card returns 400 for invalid format', async () => {
  const token = makeToken(['admin'], 'admin-tokencard-format-test');

  const createRes = await post('/api/v1/admin/participants', {}, token);
  const { userId } = await createRes.json();

  const res = await get(
    `/api/v1/admin/participants/${userId}/token-card?format=invalid`,
    token
  );
  assert.strictEqual(res.status, 400);
});

test('GET /api/v1/admin/participants/:id/token-card returns 401 without token', async () => {
  const res = await get('/api/v1/admin/participants/some-id/token-card');
  assert.strictEqual(res.status, 401);
});

// ── Deleted participant list ──────────────────────────────────────────────────

test('Deleted participant not included in GET list', async () => {
  const token = makeToken(['admin'], 'admin-deleted-list-test');

  // Create then delete
  const createRes = await post('/api/v1/admin/participants', {}, token);
  const { userId } = await createRes.json();
  await del(`/api/v1/admin/participants/${userId}`, token);

  // Should not appear in list
  const listRes = await get('/api/v1/admin/participants', token);
  const list = await listRes.json();
  const found = list.find((p) => p.userId === userId);
  assert.strictEqual(found, undefined);
});
