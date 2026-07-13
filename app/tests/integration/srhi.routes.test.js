import { test, before, after } from 'node:test';
import assert from 'node:assert';
import { createServer } from 'node:http';
import { generateKeyPairSync, createSign } from 'node:crypto';
import express from 'express';
import { ObjectId } from 'mongodb';
import { createApiRouter } from '../../routes/apiRouter.js';

// ── Key material ──────────────────────────────────────────────────────────────

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
});
const pubKeyJwk = publicKey.export({ format: 'jwk' });
pubKeyJwk.kid = 'srhi-key-1';
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
  const header = { alg: 'RS256', kid: 'srhi-key-1', typ: 'JWT' };
  const h = base64urlEncode(Buffer.from(JSON.stringify(header)));
  const p = base64urlEncode(Buffer.from(JSON.stringify(payload)));
  const signingInput = `${h}.${p}`;
  const sign = createSign('RSA-SHA256');
  sign.update(signingInput);
  return `${signingInput}.${base64urlEncode(sign.sign(privateKey))}`;
}

function makeToken(roles = ['user'], sub = 'test-user') {
  const now = Math.floor(Date.now() / 1000);
  return createJwt({ sub, exp: now + 3600, iat: now, realm_access: { roles } });
}

// ── In-memory mock DB ─────────────────────────────────────────────────────────

function createMockDb() {
  const srhiWindows = [];

  return {
    collection(name) {
      if (name === 'srhi_responses') {
        return {
          async insertOne(doc) {
            srhiWindows.push({ _id: new ObjectId(), ...doc });
          },
          async insertMany(docs) {
            docs.forEach((d) =>
              srhiWindows.push({ _id: new ObjectId(), ...d })
            );
          },
          find(q = {}) {
            const filtered = srhiWindows.filter((w) => {
              if (q.userId && w.userId !== q.userId) return false;
              if (
                'submittedAt' in q &&
                q.submittedAt === null &&
                w.submittedAt !== null
              )
                return false;
              if (
                q.intentionId &&
                w.intentionId?.toString() !== q.intentionId?.toString()
              )
                return false;
              if (q.scheduledFor) {
                const sf =
                  w.scheduledFor instanceof Date
                    ? w.scheduledFor
                    : new Date(w.scheduledFor);
                if (q.scheduledFor.$lte && sf > q.scheduledFor.$lte)
                  return false;
                if (q.scheduledFor.$gte && sf < q.scheduledFor.$gte)
                  return false;
              }
              return true;
            });
            return {
              sort: () => ({ toArray: async () => filtered }),
              toArray: async () => filtered,
            };
          },
          async findOneAndUpdate(q, update, opts) {
            const idx = srhiWindows.findIndex((w) => {
              if (
                q.intentionId &&
                w.intentionId?.toString() !== q.intentionId?.toString()
              )
                return false;
              if (q.userId && w.userId !== q.userId) return false;
              if (q.weekNumber !== undefined && w.weekNumber !== q.weekNumber)
                return false;
              if (
                'submittedAt' in q &&
                q.submittedAt === null &&
                w.submittedAt !== null
              )
                return false;
              return true;
            });
            if (idx === -1) return null;
            if (update.$set) Object.assign(srhiWindows[idx], update.$set);
            return opts?.returnDocument === 'after'
              ? { ...srhiWindows[idx] }
              : null;
          },
        };
      }
      // fallback for all other collections (enrollments, habit_annotations, etc.)
      return {
        insertOne: async () => ({}),
        insertMany: async () => ({}),
        find: () => ({
          sort: () => ({ toArray: async () => [] }),
          toArray: async () => [],
        }),
        findOne: async () => null,
        countDocuments: async () => 0,
        updateOne: async () => ({ matchedCount: 0 }),
        findOneAndUpdate: async () => null,
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
    db: mockDb,
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

const SRHI = '/api/v1/srhi';

// ── Auth enforcement ──────────────────────────────────────────────────────────

test('GET /srhi/due returns 401 without token', async () => {
  const res = await get(`${SRHI}/due`);
  assert.strictEqual(res.status, 401);
});

test('POST /srhi/:intentionId/week/:weekNumber returns 401 without token', async () => {
  const res = await post(`${SRHI}/507f1f77bcf86cd799439011/week/1`, {
    items: {},
  });
  assert.strictEqual(res.status, 401);
});

// ── GET due ───────────────────────────────────────────────────────────────────

test('GET /srhi/due returns 200 with empty array when no windows', async () => {
  const res = await get(`${SRHI}/due`, makeToken(['user'], 'no-windows-user'));
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.ok(Array.isArray(body));
  assert.strictEqual(body.length, 0);
});

test('GET /srhi/due returns pending windows for user', async () => {
  const userId = 'srhi-due-user';
  const intentionId = new ObjectId();
  // Seed a window that is due (scheduledFor in the past, not submitted)
  await mockDb.collection('srhi_responses').insertOne({
    intentionId,
    userId,
    studyId: null,
    groupId: null,
    weekNumber: 1,
    scheduledFor: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    submittedAt: null,
    items: null,
    score: null,
    createdAt: new Date(),
  });

  const res = await get(`${SRHI}/due`, makeToken(['user'], userId));
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.ok(Array.isArray(body));
  assert.ok(body.length >= 1);
  assert.strictEqual(body[0].weekNumber, 1);
});

// ── POST submit ───────────────────────────────────────────────────────────────

test('POST /srhi/:intentionId/week/:weekNumber returns 400 when items missing', async () => {
  const res = await post(
    `${SRHI}/507f1f77bcf86cd799439011/week/1`,
    {},
    makeToken()
  );
  assert.strictEqual(res.status, 400);
});

test('POST /srhi/:intentionId/week/:weekNumber returns 404 for nonexistent window', async () => {
  const validItems = Object.fromEntries(
    Array.from({ length: 12 }, (_, i) => [`srhi_${i + 1}`, 5])
  );
  const res = await post(
    `${SRHI}/507f1f77bcf86cd799439011/week/1`,
    { items: validItems },
    makeToken(['user'], 'no-window-user')
  );
  assert.strictEqual(res.status, 404);
});

test('POST /srhi/:intentionId/week/:weekNumber submits and scores window', async () => {
  const userId = 'srhi-submit-user';
  const intentionId = new ObjectId();
  await mockDb.collection('srhi_responses').insertOne({
    intentionId,
    userId,
    studyId: null,
    groupId: null,
    weekNumber: 2,
    scheduledFor: new Date(Date.now() - 86400000),
    submittedAt: null,
    items: null,
    score: null,
    createdAt: new Date(),
  });

  const validItems = Object.fromEntries(
    Array.from({ length: 12 }, (_, i) => [`srhi_${i + 1}`, 5])
  );
  const res = await post(
    `${SRHI}/${intentionId}/week/2`,
    { items: validItems },
    makeToken(['user'], userId)
  );
  assert.strictEqual(res.status, 201);
  const body = await res.json();
  assert.ok(typeof body.score === 'number');
  assert.strictEqual(body.score, 5);
});

// ── GET trajectory ────────────────────────────────────────────────────────────

test('GET /srhi/:intentionId/trajectory returns 200 with history', async () => {
  const userId = 'traj-user';
  const intentionId = new ObjectId();
  await mockDb.collection('srhi_responses').insertOne({
    intentionId,
    userId,
    studyId: null,
    groupId: null,
    weekNumber: 1,
    scheduledFor: new Date(),
    submittedAt: new Date(),
    items: Object.fromEntries(
      Array.from({ length: 12 }, (_, i) => [`srhi_${i + 1}`, 4])
    ),
    score: 4,
    createdAt: new Date(),
  });

  const res = await get(
    `${SRHI}/${intentionId}/trajectory`,
    makeToken(['user'], userId)
  );
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.ok(Array.isArray(body));
  assert.ok(body.length >= 1);
  assert.ok(typeof body[0].score === 'number');
});
