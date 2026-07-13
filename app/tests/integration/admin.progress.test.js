import { test, before, after } from 'node:test';
import assert from 'node:assert';
import { createServer } from 'node:http';
import { generateKeyPairSync, createSign } from 'node:crypto';
import express from 'express';
import { createApiRouter } from '../../routes/apiRouter.js';

// ── Key material ─────────────────────────────────────────────────────────────

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
});
const pubKeyJwk = publicKey.export({ format: 'jwk' });
pubKeyJwk.kid = 'progress-key-1';
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
  const header = { alg: 'RS256', kid: 'progress-key-1', typ: 'JWT' };
  const h = base64urlEncode(Buffer.from(JSON.stringify(header)));
  const p = base64urlEncode(Buffer.from(JSON.stringify(payload)));
  const signingInput = `${h}.${p}`;
  const sign = createSign('RSA-SHA256');
  sign.update(signingInput);
  return `${signingInput}.${base64urlEncode(sign.sign(privateKey))}`;
}

function makeToken(roles = ['admin'], sub = 'admin-progress-test') {
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
            if (
              query &&
              query.deletedAt &&
              query.deletedAt.$exists === false &&
              doc.deletedAt !== undefined
            ) {
              continue;
            }
            if (
              query &&
              query.participantId !== undefined &&
              doc.participantId !== query.participantId
            ) {
              continue;
            }
            if (
              query &&
              query.group !== undefined &&
              doc.group !== query.group
            ) {
              continue;
            }
            if (
              query &&
              query.category !== undefined &&
              doc.category !== query.category
            ) {
              continue;
            }
            results.push({ ...doc });
          }
          // Chainable cursor supporting skip/limit/sort
          function makeCursor(rows) {
            let _skip = 0;
            let _limit = null;
            const cursor = {
              skip(n) {
                _skip = n;
                return cursor;
              },
              limit(n) {
                _limit = n;
                return cursor;
              },
              project() {
                return cursor;
              },
              sort() {
                return cursor;
              },
              async toArray() {
                const sliced =
                  _limit !== null
                    ? rows.slice(_skip, _skip + _limit)
                    : rows.slice(_skip);
                return sliced;
              },
            };
            return cursor;
          }
          return makeCursor(results);
        },
        async countDocuments(query) {
          const allResults = [];
          for (const [, doc] of store) {
            if (query && query.group !== undefined && doc.group !== query.group)
              continue;
            if (
              query &&
              query.category !== undefined &&
              doc.category !== query.category
            )
              continue;
            if (query && query.donatedAt) {
              if (query.donatedAt.$gte && doc.donatedAt < query.donatedAt.$gte)
                continue;
              if (query.donatedAt.$lte && doc.donatedAt > query.donatedAt.$lte)
                continue;
            }
            allResults.push(doc);
          }
          return allResults.length;
        },
        async findOne(query) {
          for (const [, doc] of store) {
            if (query.userId !== undefined && doc.userId !== query.userId)
              continue;
            if (query.key !== undefined && doc.key !== query.key) continue;
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
          const key = doc.userId || doc.key || Math.random().toString(36);
          store.set(key, { ...doc });
          return { insertedId: key };
        },
        async updateOne(filter, update, options = {}) {
          let matched = null;
          let storeKey = null;
          for (const [k, doc] of store) {
            if (filter.userId !== undefined && doc.userId !== filter.userId)
              continue;
            if (filter.key !== undefined && doc.key !== filter.key) continue;
            if (
              filter.deletedAt &&
              filter.deletedAt.$exists === false &&
              doc.deletedAt !== undefined
            ) {
              continue;
            }
            matched = doc;
            storeKey = k;
            break;
          }
          if (!matched) {
            if (options && options.upsert) {
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
    // Expose collections for seeding
    _seed(colName, docs) {
      const store = getStore(colName);
      for (const doc of docs) {
        const k =
          doc.userId || doc.key || doc._id || Math.random().toString(36);
        store.set(k, { ...doc });
      }
    },
  };
}

// ── Mock Keycloak ─────────────────────────────────────────────────────────────

function createMockKeycloak() {
  // Shaped like Keycloak's real /clients/{id}/user-sessions response
  // (id, userId, lastAccess epoch-ms) — the admin route maps this to the
  // sessionId/userId/lastSeen shape the frontend renders.
  const sessions = [
    {
      id: 'sess-1',
      userId: 'p-abc',
      lastAccess: Date.now(),
      start: Date.now(),
      ipAddress: '127.0.0.1',
    },
    {
      id: 'sess-2',
      userId: 'p-def',
      lastAccess: Date.now(),
      start: Date.now(),
      ipAddress: '127.0.0.1',
    },
  ];
  const revokedSessions = new Set();
  return {
    async createUser() {},
    async assignRole() {},
    async updateUserAttribute() {},
    async listSessions() {
      return sessions.filter((s) => !revokedSessions.has(s.id));
    },
    async revokeSession(sessionId) {
      revokedSessions.add(sessionId);
    },
  };
}

// ── Test server ───────────────────────────────────────────────────────────────

let server;
let baseUrl;
let mockDb;
let mockKc;

const PARTICIPANT_ID = 'user-progress-001';

before(async () => {
  mockDb = createMockDb();
  mockKc = createMockKeycloak();

  // Seed participants
  mockDb._seed('participants', [
    {
      userId: PARTICIPANT_ID,
      username: `p-${PARTICIPANT_ID}`,
      group: 'G1',
      enrolledAt: new Date('2026-01-01T10:00:00Z'),
      profileCompleted: true,
      profileCompletedAt: new Date('2026-01-02T09:00:00Z'),
    },
  ]);

  // Seed survey_responses
  mockDb._seed('survey_responses', [
    {
      _id: 'sr-1',
      participantId: PARTICIPANT_ID,
      surveyId: 'survey-abc',
      surveyTitle: 'Baseline Survey',
      completedAt: new Date('2026-01-05T12:00:00Z'),
    },
    {
      _id: 'sr-2',
      participantId: PARTICIPANT_ID,
      surveyId: 'survey-def',
      surveyTitle: 'Week 1 Survey',
      completedAt: new Date('2026-01-12T14:00:00Z'),
    },
  ]);

  // Seed habit_donations
  mockDb._seed('habit_donations', [
    {
      _id: 'hd-1',
      participantId: PARTICIPANT_ID,
      habitName: 'Walk 10k steps',
      category: 'physical',
      group: 'G1',
      donatedAt: new Date('2026-01-08T08:00:00Z'),
    },
    {
      _id: 'hd-2',
      participantId: 'user-other',
      habitName: 'Meditate 10 min',
      category: 'mental',
      group: 'G2',
      donatedAt: new Date('2026-01-09T09:00:00Z'),
    },
    {
      _id: 'hd-3',
      participantId: PARTICIPANT_ID,
      habitName: 'Drink 2L water',
      category: 'physical',
      group: 'G1',
      donatedAt: new Date('2026-01-10T10:00:00Z'),
    },
  ]);

  // Seed recommendations_log
  mockDb._seed('recommendations_log', [
    {
      _id: 'rl-1',
      participantId: PARTICIPANT_ID,
      type: 'accepted',
      timestamp: new Date('2026-01-06T11:00:00Z'),
      recommendationId: 'rec-1',
    },
    {
      _id: 'rl-2',
      participantId: PARTICIPANT_ID,
      type: 'dismissed',
      timestamp: new Date('2026-01-07T15:00:00Z'),
      recommendationId: 'rec-2',
    },
  ]);

  // A study whose groups let the habits feed resolve group ids → labels.
  const STUDY_ID = '5f000000000000000000aa01';
  const GRP_G1 = '5f000000000000000000bb01';
  const GRP_G2 = '5f000000000000000000bb02';
  mockDb._seed('studies', [
    {
      _id: STUDY_ID,
      name: 'Test Study',
      groups: [
        { id: GRP_G1, label: 'G1' },
        { id: GRP_G2, label: 'G2' },
      ],
    },
  ]);

  // Donated habits now live in Neo4j; the feed reads them via neo4jRun. This
  // cypher-aware stub returns the three donations for the feed query and the
  // participant's habit count for getParticipantProgress.
  const donationRows = [
    {
      id: 'hd-1',
      participantId: PARTICIPANT_ID,
      habitName: 'Walk 10k steps',
      category: 'physical',
      studyId: STUDY_ID,
      groupId: GRP_G1,
      donatedAt: '2026-01-08T08:00:00.000Z',
    },
    {
      id: 'hd-2',
      participantId: 'user-other',
      habitName: 'Meditate 10 min',
      category: 'mental',
      studyId: STUDY_ID,
      groupId: GRP_G2,
      donatedAt: '2026-01-09T09:00:00.000Z',
    },
    {
      id: 'hd-3',
      participantId: PARTICIPANT_ID,
      habitName: 'Drink 2L water',
      category: 'physical',
      studyId: STUDY_ID,
      groupId: GRP_G1,
      donatedAt: '2026-01-10T10:00:00.000Z',
    },
  ];
  const neo4jRunStub = async (cypher = '') => {
    if (cypher.includes('RETURN h.uuid AS id, u.userID AS participantId')) {
      return donationRows;
    }
    if (cypher.includes('count(h) AS cnt')) {
      return [{ cnt: 2 }];
    }
    return [];
  };

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
    neo4jRun: neo4jRunStub,
    keycloak: mockKc,
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

// ── HTTP helpers ──────────────────────────────────────────────────────────────

async function get(path, token) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  return fetch(`${baseUrl}${path}`, { headers });
}

async function del(path, token) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  return fetch(`${baseUrl}${path}`, { method: 'DELETE', headers });
}

// ── Auth enforcement ──────────────────────────────────────────────────────────

test('GET /api/v1/admin/participants/:id/progress - 401 without token', async () => {
  const res = await get(
    `/api/v1/admin/participants/${PARTICIPANT_ID}/progress`
  );
  assert.strictEqual(res.status, 401);
});

test('GET /api/v1/admin/participants/:id/progress - 403 for participant role', async () => {
  const token = makeToken(['user']);
  const res = await get(
    `/api/v1/admin/participants/${PARTICIPANT_ID}/progress`,
    token
  );
  assert.strictEqual(res.status, 403);
});

test('GET /api/v1/admin/habits/feed - 401 without token', async () => {
  const res = await get('/api/v1/admin/habits/feed');
  assert.strictEqual(res.status, 401);
});

test('GET /api/v1/admin/habits/feed/export - 401 without token', async () => {
  const res = await get('/api/v1/admin/habits/feed/export?format=csv');
  assert.strictEqual(res.status, 401);
});

test('GET /api/v1/admin/sessions - 401 without token', async () => {
  const res = await get('/api/v1/admin/sessions');
  assert.strictEqual(res.status, 401);
});

test('DELETE /api/v1/admin/sessions/:id - 401 without token', async () => {
  const res = await del('/api/v1/admin/sessions/sess-1');
  assert.strictEqual(res.status, 401);
});

// ── GET participant progress ──────────────────────────────────────────────────

test('GET /participants/:id/progress - returns full progress structure', async () => {
  const token = makeToken(['admin']);
  const res = await get(
    `/api/v1/admin/participants/${PARTICIPANT_ID}/progress`,
    token
  );
  assert.strictEqual(res.status, 200);
  const body = await res.json();

  assert.ok('profile' in body, 'should have profile');
  assert.strictEqual(body.profile.completed, true);

  assert.ok(Array.isArray(body.surveys), 'should have surveys array');
  assert.strictEqual(body.surveys.length, 2);
  assert.strictEqual(body.surveys[0].title, 'Baseline Survey');

  assert.strictEqual(typeof body.habitsCount, 'number');
  assert.strictEqual(body.habitsCount, 2);

  assert.ok('recommendations' in body, 'should have recommendations');
  assert.strictEqual(body.recommendations.accepted, 1);
  assert.strictEqual(body.recommendations.dismissed, 1);

  assert.ok(Array.isArray(body.timeline), 'should have timeline');
  assert.ok(body.timeline.length >= 1);
  assert.strictEqual(body.timeline[0].type, 'enrolled');
});

test('GET /participants/:id/progress - 404 for unknown participant', async () => {
  const token = makeToken(['admin']);
  const res = await get(
    '/api/v1/admin/participants/nonexistent-xyz/progress',
    token
  );
  assert.strictEqual(res.status, 404);
});

test('GET /participants/:id/progress - researcher role allowed', async () => {
  const token = makeToken(['researcher']);
  const res = await get(
    `/api/v1/admin/participants/${PARTICIPANT_ID}/progress`,
    token
  );
  assert.strictEqual(res.status, 200);
});

// ── GET habits feed ───────────────────────────────────────────────────────────

test('GET /habits/feed - returns paginated results', async () => {
  const token = makeToken(['admin']);
  const res = await get('/api/v1/admin/habits/feed', token);
  assert.strictEqual(res.status, 200);
  const body = await res.json();

  assert.ok('total' in body, 'should have total');
  assert.ok('results' in body, 'should have results');
  assert.ok(Array.isArray(body.results));
  assert.strictEqual(body.total, 3);
  assert.ok(body.results.length <= 20);

  const first = body.results[0];
  assert.ok('participantId' in first);
  assert.ok('habitName' in first);
  assert.ok('category' in first);
  assert.ok('donatedAt' in first);
});

test('GET /habits/feed - filter by group', async () => {
  const token = makeToken(['admin']);
  const res = await get('/api/v1/admin/habits/feed?group=G1', token);
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.strictEqual(body.total, 2);
  for (const r of body.results) {
    assert.strictEqual(r.participantId, PARTICIPANT_ID);
  }
});

test('GET /habits/feed - filter by category', async () => {
  const token = makeToken(['admin']);
  const res = await get('/api/v1/admin/habits/feed?category=mental', token);
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.strictEqual(body.total, 1);
  assert.strictEqual(body.results[0].category, 'mental');
});

test('GET /habits/feed - pagination works', async () => {
  const token = makeToken(['admin']);
  const res = await get('/api/v1/admin/habits/feed?limit=2&page=1', token);
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.strictEqual(body.limit, 2);
  assert.strictEqual(body.page, 1);
  assert.strictEqual(body.results.length, 2);
  assert.strictEqual(body.total, 3);
});

// ── GET habits feed export ────────────────────────────────────────────────────

test('GET /habits/feed/export?format=csv - returns CSV', async () => {
  const token = makeToken(['admin']);
  const res = await get('/api/v1/admin/habits/feed/export?format=csv', token);
  assert.strictEqual(res.status, 200);
  assert.ok(res.headers.get('content-type').includes('text/csv'));
  const text = await res.text();
  assert.ok(
    text.startsWith('participantId,habitName,category,group,donatedAt')
  );
  const lines = text.split('\n');
  assert.strictEqual(lines.length, 4); // header + 3 rows
});

test('GET /habits/feed/export - 400 for unsupported format', async () => {
  const token = makeToken(['admin']);
  const res = await get('/api/v1/admin/habits/feed/export?format=xlsx', token);
  assert.strictEqual(res.status, 400);
});

// ── GET sessions ──────────────────────────────────────────────────────────────

test('GET /api/v1/admin/sessions - returns paginated session list', async () => {
  const token = makeToken(['admin']);
  const res = await get('/api/v1/admin/sessions', token);
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.ok(Array.isArray(body.sessions));
  assert.ok(typeof body.total === 'number');
  assert.ok(body.sessions.length >= 1);
  assert.ok('sessionId' in body.sessions[0]);
});

test('DELETE /api/v1/admin/sessions/:sessionId - revokes session', async () => {
  const token = makeToken(['admin']);
  const res = await del('/api/v1/admin/sessions/sess-1', token);
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.strictEqual(body.ok, true);

  // Session should no longer appear
  const listRes = await get('/api/v1/admin/sessions', token);
  const { sessions } = await listRes.json();
  const found = sessions.find((s) => s.sessionId === 'sess-1');
  assert.strictEqual(found, undefined);
});

test('GET /api/v1/admin/sessions - researcher role allowed', async () => {
  const token = makeToken(['researcher']);
  const res = await get('/api/v1/admin/sessions', token);
  assert.strictEqual(res.status, 200);
});
