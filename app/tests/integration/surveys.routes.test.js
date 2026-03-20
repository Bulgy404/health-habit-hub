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

function makeToken(roles = ['participant'], sub = 'user-surveys-test') {
  const now = Math.floor(Date.now() / 1000);
  return createJwt({
    sub,
    exp: now + 3600,
    iat: now,
    realm_access: { roles },
  });
}

// ── In-memory mock MongoDB ────────────────────────────────────────────────────

function createMockDb() {
  const stores = {};

  function getStore(name) {
    if (!stores[name]) stores[name] = new Map();
    return stores[name];
  }

  return {
    collection(name) {
      const store = getStore(name);
      return {
        find(query) {
          const results = [];
          for (const [, doc] of store) {
            if (query && query.status && doc.status !== query.status) continue;
            if (
              query &&
              query.assignedGroups &&
              !doc.assignedGroups?.includes(query.assignedGroups)
            )
              continue;
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
            if (query.userId !== undefined && doc.userId !== query.userId)
              continue;
            if (
              query.deletedAt &&
              query.deletedAt.$exists === false &&
              doc.deletedAt !== undefined
            )
              continue;
            return { ...doc };
          }
          return null;
        },
        async insertOne(doc) {
          const key = doc.id || doc.surveyId || Math.random().toString(36);
          store.set(key, { ...doc });
          return { insertedId: key };
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

  // Seed a published survey assigned to G1
  mockDb.collection('surveys').insertOne({
    id: 'survey-1',
    title: 'Health Survey',
    type: 'questionnaire',
    status: 'published',
    assignedGroups: ['G1'],
    jsonSchema: { questions: [] },
  });

  // Seed a draft survey (should not be visible to participants)
  mockDb.collection('surveys').insertOne({
    id: 'survey-2',
    title: 'Draft Survey',
    type: 'questionnaire',
    status: 'draft',
    assignedGroups: ['G1', 'G2'],
    jsonSchema: {},
  });

  // Seed a participant assigned to G1
  mockDb.collection('participants').insertOne({
    userId: 'user-surveys-test',
    username: 'p-test',
    group: 'G1',
    enrolledAt: new Date(),
  });

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

// ── Auth enforcement ──────────────────────────────────────────────────────────

test('GET /api/v1/surveys returns 401 without token', async () => {
  const res = await get('/api/v1/surveys');
  assert.strictEqual(res.status, 401);
});

test('GET /api/v1/surveys returns 403 for empty-role token', async () => {
  const res = await get('/api/v1/surveys', makeToken([]));
  assert.strictEqual(res.status, 403);
});

test('GET /api/v1/surveys/:id returns 401 without token', async () => {
  const res = await get('/api/v1/surveys/survey-1');
  assert.strictEqual(res.status, 401);
});

test('POST /api/v1/surveys/:id/results returns 401 without token', async () => {
  const res = await post('/api/v1/surveys/survey-1/results', {});
  assert.strictEqual(res.status, 401);
});

// ── GET /api/v1/surveys – participant view ────────────────────────────────────

test('GET /api/v1/surveys returns only published surveys for participant', async () => {
  const token = makeToken(['participant'], 'user-surveys-test');
  const res = await get('/api/v1/surveys', token);
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.ok(Array.isArray(body));
  // Only published surveys for G1 group should appear
  assert.ok(body.length >= 1);
  body.forEach((s) => {
    assert.strictEqual(s.status, 'published');
    assert.ok('id' in s);
    assert.ok('title' in s);
    assert.ok('type' in s);
    assert.ok('assignedGroups' in s);
  });
  // Draft survey must not appear
  const draftFound = body.find((s) => s.id === 'survey-2');
  assert.strictEqual(draftFound, undefined);
});

test('GET /api/v1/surveys returns all surveys for admin role', async () => {
  const token = makeToken(['admin'], 'admin-user');
  const res = await get('/api/v1/surveys', token);
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.ok(Array.isArray(body));
  // Admin sees both published and draft
  assert.ok(body.length >= 2);
});

test('GET /api/v1/surveys returns all surveys for researcher role', async () => {
  const token = makeToken(['researcher'], 'researcher-user');
  const res = await get('/api/v1/surveys', token);
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.ok(Array.isArray(body));
  assert.ok(body.length >= 2);
});

// ── GET /api/v1/surveys/:id ───────────────────────────────────────────────────

test('GET /api/v1/surveys/:id returns survey shape for participant', async () => {
  const token = makeToken(['participant'], 'user-surveys-test');
  const res = await get('/api/v1/surveys/survey-1', token);
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.strictEqual(body.id, 'survey-1');
  assert.strictEqual(body.title, 'Health Survey');
  assert.ok('type' in body);
  assert.ok('status' in body);
  assert.ok('jsonSchema' in body);
  assert.ok('assignedGroups' in body);
});

test('GET /api/v1/surveys/:id returns 404 for unknown survey', async () => {
  const token = makeToken(['participant'], 'user-surveys-test');
  const res = await get('/api/v1/surveys/nonexistent', token);
  assert.strictEqual(res.status, 404);
  const body = await res.json();
  assert.ok(body.error);
});

// ── POST /api/v1/surveys/:id/results ─────────────────────────────────────────

test('POST /api/v1/surveys/:id/results stores response and returns 201', async () => {
  const token = makeToken(['participant'], 'user-surveys-test');
  const res = await post(
    '/api/v1/surveys/survey-1/results',
    { answers: { q1: 'yes' } },
    token
  );
  assert.strictEqual(res.status, 201);
  const body = await res.json();
  assert.strictEqual(body.ok, true);
  assert.strictEqual(body.surveyId, 'survey-1');
  assert.ok(body.completedAt);
});

test('POST /api/v1/surveys/:id/results returns 404 for unknown survey', async () => {
  const token = makeToken(['participant'], 'user-surveys-test');
  const res = await post(
    '/api/v1/surveys/nonexistent/results',
    { answers: {} },
    token
  );
  assert.strictEqual(res.status, 404);
});

// ── GET /api/v1/surveys/:id/render ────────────────────────────────────────────

test('GET /api/v1/surveys/:id/render returns 401 without token', async () => {
  const res = await get('/api/v1/surveys/survey-1/render');
  assert.strictEqual(res.status, 401);
});

test('GET /api/v1/surveys/:id/render returns survey with default lang=en', async () => {
  const token = makeToken(['participant'], 'user-surveys-test');
  const res = await get('/api/v1/surveys/survey-1/render', token);
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.strictEqual(body.id, 'survey-1');
  assert.strictEqual(body.lang, 'en');
  assert.ok(body.jsonSchema);
});

test('GET /api/v1/surveys/:id/render returns lang=de when requested', async () => {
  const token = makeToken(['participant'], 'user-surveys-test');
  const res = await get('/api/v1/surveys/survey-1/render?lang=de', token);
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.strictEqual(body.lang, 'de');
});

test('GET /api/v1/surveys/:id/render returns 404 for unknown survey', async () => {
  const token = makeToken(['participant'], 'user-surveys-test');
  const res = await get('/api/v1/surveys/nonexistent/render', token);
  assert.strictEqual(res.status, 404);
});
