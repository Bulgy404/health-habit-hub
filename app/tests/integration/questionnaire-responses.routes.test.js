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
pubKeyJwk.kid = 'qr-key-1';
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
  const header = { alg: 'RS256', kid: 'qr-key-1', typ: 'JWT' };
  const h = base64urlEncode(Buffer.from(JSON.stringify(header)));
  const p = base64urlEncode(Buffer.from(JSON.stringify(payload)));
  const signingInput = `${h}.${p}`;
  const sign = createSign('RSA-SHA256');
  sign.update(signingInput);
  return `${signingInput}.${base64urlEncode(sign.sign(privateKey))}`;
}

function makeToken(sub = 'user-1', roles = ['user']) {
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
  const collections = {};

  function getCol(name) {
    if (!collections[name]) collections[name] = [];
    return collections[name];
  }

  return {
    collection(name) {
      return {
        async createIndex() {},
        async insertOne(doc) {
          const stored = { ...doc, _id: String(Math.random()) };
          getCol(name).push(stored);
          return { insertedId: stored._id };
        },
        find(query) {
          let results = [...getCol(name)];
          if (query) {
            for (const [k, v] of Object.entries(query)) {
              results = results.filter((d) => d[k] === v);
            }
          }
          let sorted = results;
          let limitCount = null;
          return {
            sort(spec) {
              const [field, dir] = Object.entries(spec)[0];
              sorted = [...results].sort((a, b) => {
                const av =
                  a[field] instanceof Date ? a[field].getTime() : a[field];
                const bv =
                  b[field] instanceof Date ? b[field].getTime() : b[field];
                return dir === -1 ? bv - av : av - bv;
              });
              results = sorted;
              return this;
            },
            limit(n) {
              limitCount = n;
              return this;
            },
            async toArray() {
              return limitCount !== null
                ? results.slice(0, limitCount)
                : results;
            },
          };
        },
        async findOne(query) {
          let results = [...getCol(name)];
          if (query) {
            for (const [k, v] of Object.entries(query)) {
              results = results.filter((d) => d[k] === v);
            }
          }
          return results[0] || null;
        },
      };
    },
  };
}

// ── Neo4j mock ────────────────────────────────────────────────────────────────
function createNeo4jMock() {
  const calls = [];
  return {
    async neo4jRun(cypher, params = {}) {
      calls.push({ cypher, params });
      return [];
    },
    getCalls() {
      return calls;
    },
  };
}

// ── Test server setup ─────────────────────────────────────────────────────────

let server;
let port;
let jwksServer;
let jwksPort;
let neo4jMock;
const realFetch = global.fetch;

before(async () => {
  // JWKS server
  const jwksApp = express();
  jwksApp.get('/realms/hhh/protocol/openid-connect/certs', (_req, res) =>
    res.json(mockJwks)
  );
  jwksServer = createServer(jwksApp);
  await new Promise((resolve) => jwksServer.listen(0, '127.0.0.1', resolve));
  jwksPort = jwksServer.address().port;

  neo4jMock = createNeo4jMock();
  const db = createMockDb();
  const app = express();
  app.use(express.json());
  app.use(
    '/api/v1',
    createV1Router({
      jwksUrl: `http://127.0.0.1:${jwksPort}/realms/hhh/protocol/openid-connect/certs`,
      expectedIssuer: null,
      expectedAudience: null,
      db,
      neo4jRun: neo4jMock.neo4jRun,
    })
  );

  server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = server.address().port;

  // Intercept fetch: pass through 127.0.0.1 calls, block everything else
  global.fetch = async (url, ...args) => {
    const u = typeof url === 'string' ? url : url.toString();
    if (u.includes('127.0.0.1')) return realFetch(u, ...args);
    throw new Error(`Unexpected fetch to: ${u}`);
  };
});

after(async () => {
  global.fetch = realFetch;
  await new Promise((resolve) => server.close(resolve));
  await new Promise((resolve) => jwksServer.close(resolve));
});

function request(method, path, token, body) {
  const opts = {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  };
  return realFetch(`http://127.0.0.1:${port}/api/v1${path}`, opts);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test('POST /questionnaire-responses — rejects unauthenticated requests', async () => {
  const res = await request('POST', '/questionnaire-responses', null, {
    questionnaireSlug: 'sliq',
    answers: { sliq_diet: '2' },
  });
  assert.strictEqual(res.status, 401);
});

test('POST /questionnaire-responses — rejects missing questionnaireSlug', async () => {
  const token = makeToken('user-1', ['user']);
  const res = await request('POST', '/questionnaire-responses', token, {
    answers: { sliq_diet: '2' },
  });
  assert.strictEqual(res.status, 400);
});

test('POST /questionnaire-responses — rejects missing answers', async () => {
  const token = makeToken('user-1', ['user']);
  const res = await request('POST', '/questionnaire-responses', token, {
    questionnaireSlug: 'sliq',
  });
  assert.strictEqual(res.status, 400);
});

test('GET /questionnaire-responses/me — rejects unauthenticated requests', async () => {
  const res = await request('GET', '/questionnaire-responses/me', null);
  assert.strictEqual(res.status, 401);
});

test('GET /questionnaire-responses/me/:slug — rejects unauthenticated requests', async () => {
  const res = await request('GET', '/questionnaire-responses/me/sliq', null);
  assert.strictEqual(res.status, 401);
});

test('Integration: submit SLIQ response → fetch by slug → verify answers match', async () => {
  const token = makeToken('user-sliq-test', ['user']);
  const answers = {
    sliq_diet: '3',
    sliq_physical_activity: '2',
    sliq_smoking: '3',
    sliq_alcohol: '3',
  };

  // Submit response
  const postRes = await request('POST', '/questionnaire-responses', token, {
    questionnaireSlug: 'sliq',
    answers,
  });
  assert.strictEqual(postRes.status, 201);
  const { ok } = await postRes.json();
  assert.strictEqual(ok, true, 'response should have ok: true');

  // Fetch by slug
  const getRes = await request(
    'GET',
    '/questionnaire-responses/me/sliq',
    token
  );
  assert.strictEqual(getRes.status, 200);
  const body = await getRes.json();
  assert.strictEqual(body.questionnaireSlug, 'sliq');
  assert.deepStrictEqual(body.answers, answers);
  assert.ok(body.submittedAt, 'should have submittedAt');
});

test('GET /questionnaire-responses/me — returns all responses ordered by most recent first', async () => {
  const token = makeToken('user-order-test', ['user']);

  // Submit two responses for different slugs
  await request('POST', '/questionnaire-responses', token, {
    questionnaireSlug: 'sliq',
    answers: { sliq_diet: '1' },
  });
  await request('POST', '/questionnaire-responses', token, {
    questionnaireSlug: 'rand-36',
    answers: { rand36_q1: '1' },
  });

  const res = await request('GET', '/questionnaire-responses/me', token);
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.ok(Array.isArray(body));
  assert.ok(body.length >= 2);
  // All belong to this user
  for (const r of body) {
    assert.strictEqual(r.userId, 'user-order-test');
  }
  // Most recent first: submitted_at should be non-increasing
  const times = body.map((r) => new Date(r.submittedAt).getTime());
  for (let i = 1; i < times.length; i++) {
    assert.ok(
      times[i] <= times[i - 1],
      'responses should be ordered most recent first'
    );
  }
});

test('GET /questionnaire-responses/me/:slug — returns 404 when no response exists', async () => {
  const token = makeToken('user-no-response', ['user']);
  const res = await request(
    'GET',
    '/questionnaire-responses/me/nonexistent',
    token
  );
  assert.strictEqual(res.status, 404);
});

test('GET /questionnaire-responses/me/:slug — returns only matching user responses', async () => {
  const tokenA = makeToken('user-a-isolation', ['user']);
  const tokenB = makeToken('user-b-isolation', ['user']);

  // User A submits a response
  await request('POST', '/questionnaire-responses', tokenA, {
    questionnaireSlug: 'sliq',
    answers: { sliq_diet: '2' },
  });

  // User B should not see user A's response
  const res = await request('GET', '/questionnaire-responses/me/sliq', tokenB);
  assert.strictEqual(res.status, 404);
});

test('POST /questionnaire-responses — triggers neo4j user sync', async () => {
  const token = makeToken('user-neo4j-sync', ['user']);
  const callsBefore = neo4jMock.getCalls().length;

  const res = await request('POST', '/questionnaire-responses', token, {
    questionnaireSlug: 'sliq',
    answers: { sliq_diet: '3', sliq_activity: '2' },
  });
  assert.strictEqual(res.status, 201);

  // Flush the event loop so the fire-and-forget neo4j sync can complete
  await new Promise((resolve) => setImmediate(resolve));

  const newCalls = neo4jMock.getCalls().slice(callsBefore);
  assert.ok(
    newCalls.length >= 2,
    'expected at least 2 neo4j calls (mergeUser + createSubmission)'
  );
  assert.ok(
    newCalls.some((c) => c.params.userId === 'user-neo4j-sync'),
    'expected a call with the submitting userId'
  );
  assert.ok(
    newCalls.some((c) => c.params.questionnaireId === 'sliq'),
    'expected a call with the questionnaireId'
  );
});
