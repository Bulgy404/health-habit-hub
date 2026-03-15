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
pubKeyJwk.kid = 'surveys-key-1';
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
  const header = { alg: 'RS256', kid: 'surveys-key-1', typ: 'JWT' };
  const h = base64urlEncode(Buffer.from(JSON.stringify(header)));
  const p = base64urlEncode(Buffer.from(JSON.stringify(payload)));
  const signingInput = `${h}.${p}`;
  const sign = createSign('RSA-SHA256');
  sign.update(signingInput);
  return `${signingInput}.${base64urlEncode(sign.sign(privateKey))}`;
}

function makeToken(roles = ['admin'], sub = 'user-surveys') {
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
    _seed(colName, docs) {
      const store = getStore(colName);
      for (const doc of docs) {
        const k = doc.id || doc.userId || doc.key || Math.random().toString(36);
        store.set(k, { ...doc });
      }
    },
    collection(name) {
      const store = getStore(name);
      return {
        find(query) {
          const results = [];
          for (const [, doc] of store) {
            // Handle deletedAt.$exists === false filter
            if (
              query &&
              query.deletedAt &&
              query.deletedAt.$exists === false &&
              doc.deletedAt !== undefined
            ) {
              continue;
            }
            // status filter
            if (query && query.status !== undefined && doc.status !== query.status) {
              continue;
            }
            // assignedGroups filter (MongoDB $in or string equality)
            if (query && query.assignedGroups !== undefined) {
              const filterVal = query.assignedGroups;
              const docGroups = doc.assignedGroups || [];
              if (!docGroups.includes(filterVal)) continue;
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
            if (query.id !== undefined && doc.id !== query.id) continue;
            if (query.userId !== undefined && doc.userId !== query.userId) continue;
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
          const k = doc.id || doc.userId || doc.key || Math.random().toString(36);
          store.set(k, { ...doc });
          return { insertedId: k };
        },
        async updateOne(filter, update, _options = {}) {
          let matched = null;
          let storeKey = null;
          for (const [k, doc] of store) {
            if (filter.id !== undefined && doc.id !== filter.id) continue;
            if (filter.userId !== undefined && doc.userId !== filter.userId) continue;
            if (filter.key !== undefined && doc.key !== filter.key) continue;
            matched = doc;
            storeKey = k;
            break;
          }
          if (!matched) {
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
    serviceChecks: { neo4jCheck: okCheck, mongoCheck: okCheck },
    db: mockDb,
  });
  testApp.use('/api/v1', v1Router);

  server = createServer(testApp);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  // Wait for admin router to seed defaults
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

async function post(path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
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

async function patch(path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return fetch(`${baseUrl}${path}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(body),
  });
}

// ── Admin Survey CRUD Tests ───────────────────────────────────────────────────

test('GET /api/v1/admin/surveys - 401 without token', async () => {
  const res = await get('/api/v1/admin/surveys');
  assert.strictEqual(res.status, 401);
});

test('GET /api/v1/admin/surveys - 403 for participant role', async () => {
  const token = makeToken(['participant']);
  const res = await get('/api/v1/admin/surveys', token);
  assert.strictEqual(res.status, 403);
});

test('GET /api/v1/admin/surveys - empty list initially', async () => {
  const token = makeToken(['admin']);
  const res = await get('/api/v1/admin/surveys', token);
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  // May have 0 surveys (admin_settings seeded, surveys collection empty)
  assert.ok(Array.isArray(body));
});

test('POST /api/v1/admin/surveys - 401 without token', async () => {
  const res = await post('/api/v1/admin/surveys', { title: 'Test', type: 'custom' });
  assert.strictEqual(res.status, 401);
});

test('POST /api/v1/admin/surveys - 403 for participant role', async () => {
  const token = makeToken(['participant']);
  const res = await post('/api/v1/admin/surveys', { title: 'Test', type: 'custom' }, token);
  assert.strictEqual(res.status, 403);
});

test('POST /api/v1/admin/surveys - creates survey with defaults', async () => {
  const token = makeToken(['admin']);
  const res = await post(
    '/api/v1/admin/surveys',
    { title: 'Habit Survey', type: 'habit-donation' },
    token
  );
  assert.strictEqual(res.status, 201);
  const body = await res.json();
  assert.ok(body.id);
  assert.strictEqual(body.title, 'Habit Survey');
  assert.strictEqual(body.type, 'habit-donation');
  assert.strictEqual(body.status, 'draft');
  assert.deepStrictEqual(body.assignedGroups, []);
});

test('POST /api/v1/admin/surveys - 400 missing required fields', async () => {
  const token = makeToken(['admin']);
  const res = await post('/api/v1/admin/surveys', { title: 'No type survey' }, token);
  assert.strictEqual(res.status, 400);
});

test('GET /api/v1/admin/surveys - returns created survey', async () => {
  const token = makeToken(['admin']);
  const res = await get('/api/v1/admin/surveys', token);
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.ok(Array.isArray(body));
  const survey = body.find((s) => s.title === 'Habit Survey');
  assert.ok(survey, 'created survey should be in list');
  assert.strictEqual(survey.status, 'draft');
});

test('PATCH /api/v1/admin/surveys/:id/status - publishes survey', async () => {
  const adminToken = makeToken(['admin']);

  // Create survey and get id
  const createRes = await post(
    '/api/v1/admin/surveys',
    { title: 'Profile Survey', type: 'profile' },
    adminToken
  );
  const { id } = await createRes.json();

  // Publish it
  const res = await patch(`/api/v1/admin/surveys/${id}/status`, { status: 'published' }, adminToken);
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.strictEqual(body.ok, true);
  assert.strictEqual(body.status, 'published');
});

test('PATCH /api/v1/admin/surveys/:id/status - 400 for invalid status', async () => {
  const adminToken = makeToken(['admin']);
  const createRes = await post(
    '/api/v1/admin/surveys',
    { title: 'Status Test', type: 'custom' },
    adminToken
  );
  const { id } = await createRes.json();
  const res = await patch(`/api/v1/admin/surveys/${id}/status`, { status: 'invalid' }, adminToken);
  assert.strictEqual(res.status, 400);
});

test('PATCH /api/v1/admin/surveys/:id/status - 404 for unknown survey', async () => {
  const token = makeToken(['admin']);
  const res = await patch('/api/v1/admin/surveys/nonexistent-id/status', { status: 'draft' }, token);
  assert.strictEqual(res.status, 404);
});

test('PATCH /api/v1/admin/surveys/:id/groups - assigns groups', async () => {
  const adminToken = makeToken(['admin']);
  const createRes = await post(
    '/api/v1/admin/surveys',
    { title: 'Group Survey', type: 'profile' },
    adminToken
  );
  const { id } = await createRes.json();

  const res = await patch(`/api/v1/admin/surveys/${id}/groups`, { groups: ['G1', 'G2'] }, adminToken);
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.strictEqual(body.ok, true);
  assert.deepStrictEqual(body.assignedGroups, ['G1', 'G2']);
});

test('PATCH /api/v1/admin/surveys/:id/groups - 400 for invalid groups', async () => {
  const adminToken = makeToken(['admin']);
  const createRes = await post(
    '/api/v1/admin/surveys',
    { title: 'Invalid Group Survey', type: 'custom' },
    adminToken
  );
  const { id } = await createRes.json();
  const res = await patch(`/api/v1/admin/surveys/${id}/groups`, { groups: ['G5'] }, adminToken);
  assert.strictEqual(res.status, 400);
});

test('PUT /api/v1/admin/surveys/:id - updates survey fields', async () => {
  const adminToken = makeToken(['admin']);
  const createRes = await post(
    '/api/v1/admin/surveys',
    { title: 'Update Me', type: 'custom' },
    adminToken
  );
  const { id } = await createRes.json();

  const res = await put(
    `/api/v1/admin/surveys/${id}`,
    { title: 'Updated Title', jsonSchema: { fields: [] } },
    adminToken
  );
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.strictEqual(body.ok, true);
  assert.strictEqual(body.id, id);
});

test('PUT /api/v1/admin/surveys/:id - 404 for unknown survey', async () => {
  const token = makeToken(['admin']);
  const res = await put('/api/v1/admin/surveys/no-such-id', { title: 'X' }, token);
  assert.strictEqual(res.status, 404);
});

test('GET /api/v1/admin/surveys - researcher role allowed', async () => {
  const token = makeToken(['researcher']);
  const res = await get('/api/v1/admin/surveys', token);
  assert.strictEqual(res.status, 200);
});

// ── Participant Survey List Tests ─────────────────────────────────────────────

test('GET /api/v1/surveys - 401 without token', async () => {
  const res = await get('/api/v1/surveys');
  assert.strictEqual(res.status, 401);
});

test('GET /api/v1/surveys - participant sees only published surveys for their group', async () => {
  const adminToken = makeToken(['admin']);

  // Create a published survey assigned to G1
  const createRes = await post(
    '/api/v1/admin/surveys',
    { title: 'G1 Survey', type: 'profile' },
    adminToken
  );
  const { id: surveyId } = await createRes.json();
  await patch(`/api/v1/admin/surveys/${surveyId}/groups`, { groups: ['G1'] }, adminToken);
  await patch(`/api/v1/admin/surveys/${surveyId}/status`, { status: 'published' }, adminToken);

  // Seed a participant in G1 matching the participant token sub
  mockDb._seed('participants', [
    { userId: 'participant-g1', group: 'G1', enrolledAt: new Date() },
  ]);

  const participantToken = makeToken(['participant'], 'participant-g1');
  const res = await get('/api/v1/surveys', participantToken);
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.ok(Array.isArray(body));
  const found = body.find((s) => s.id === surveyId);
  assert.ok(found, 'G1 participant should see G1 survey');
  assert.strictEqual(found.status, 'published');
});

test('GET /api/v1/surveys - participant does not see surveys for other groups', async () => {
  // Seed a participant in G2
  mockDb._seed('participants', [
    { userId: 'participant-g2', group: 'G2', enrolledAt: new Date() },
  ]);

  const adminToken = makeToken(['admin']);
  // Create a published survey for G3 only
  const createRes = await post(
    '/api/v1/admin/surveys',
    { title: 'G3 Only Survey', type: 'custom' },
    adminToken
  );
  const { id: g3SurveyId } = await createRes.json();
  await patch(`/api/v1/admin/surveys/${g3SurveyId}/groups`, { groups: ['G3'] }, adminToken);
  await patch(`/api/v1/admin/surveys/${g3SurveyId}/status`, { status: 'published' }, adminToken);

  const participantToken = makeToken(['participant'], 'participant-g2');
  const res = await get('/api/v1/surveys', participantToken);
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  const found = body.find((s) => s.id === g3SurveyId);
  assert.ok(!found, 'G2 participant should not see G3-only survey');
});

test('GET /api/v1/surveys - admin sees all surveys regardless of status', async () => {
  const token = makeToken(['admin']);
  const res = await get('/api/v1/surveys', token);
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.ok(Array.isArray(body));
  // Admin should see drafts too
  const hasDraft = body.some((s) => s.status === 'draft');
  assert.ok(hasDraft, 'admin should see draft surveys');
});
