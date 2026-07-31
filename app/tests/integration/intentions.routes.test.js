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
pubKeyJwk.kid = 'intent-key-1';
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
  const header = { alg: 'RS256', kid: 'intent-key-1', typ: 'JWT' };
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

// Mutable per-test hook for simulating a Neo4j study enrollment (read by the
// `neo4jRun` passed to createApiRouter below) and the matching Mongo study
// document `resolveHabitConfig` looks up once it has a studyId. Tests that
// need an enrolled participant set these before their request and reset them
// in a `finally` block — safe because node:test runs tests in this file
// sequentially, not in parallel.
let neo4jEnrollment = null;
let studyDocs = [];
// Mutable per-test hooks for the generic habit-scoped questionnaire pipeline
// (generateHabitCreationWindows): the Mongo enrollment (studyId/groupId),
// the study's questionnaire assignments, and the questionnaire definitions'
// `scope`. SRHI itself is unconditional and never reads these — see the
// "independent of questionnaire_assignments" test below.
let enrollmentDoc = null;
let assignmentDocs = [];
let questionnaireDocs = [];
// Module-level so tests can assert how many SRHI windows the create-intention
// route generated. Reset in each test that cares.
let srhiInserts = [];

function createMockDb() {
  const intentions = [];
  const logs = [];
  const srhiWindows = srhiInserts;
  const enrollments = [];
  const adminSettings = [];

  return {
    collection(name) {
      if (name === 'implementation_intentions') {
        return {
          async insertOne(doc) {
            const _id = doc._id ?? new ObjectId();
            intentions.push({ ...doc, _id });
            return { insertedId: _id };
          },
          async countDocuments(q) {
            return intentions.filter((i) => {
              if (q.userId && i.userId !== q.userId) return false;
              if (q.status && i.status !== q.status) return false;
              return true;
            }).length;
          },
          find(q = {}) {
            return {
              toArray: async () =>
                intentions.filter((i) => {
                  if (q.userId && i.userId !== q.userId) return false;
                  if (q.status && i.status !== q.status) return false;
                  return true;
                }),
            };
          },
          async findOne(q) {
            return (
              intentions.find((i) => {
                if (q._id && i._id.toString() !== q._id.toString())
                  return false;
                if (q.userId && i.userId !== q.userId) return false;
                return true;
              }) ?? null
            );
          },
          async updateOne(q, update) {
            const idx = intentions.findIndex((i) => {
              if (q._id && i._id.toString() !== q._id.toString()) return false;
              if (q.userId && i.userId !== q.userId) return false;
              return true;
            });
            if (idx === -1) return { matchedCount: 0 };
            if (update.$set) Object.assign(intentions[idx], update.$set);
            return { matchedCount: 1, modifiedCount: 1 };
          },
          async findOneAndUpdate(q, update, opts) {
            const idx = intentions.findIndex((i) => {
              if (q._id && i._id.toString() !== q._id.toString()) return false;
              if (q.userId && i.userId !== q.userId) return false;
              return true;
            });
            if (idx === -1) return null;
            if (update.$set) Object.assign(intentions[idx], update.$set);
            return opts?.returnDocument === 'after'
              ? { ...intentions[idx] }
              : {
                  ...intentions[idx],
                  ...Object.fromEntries(
                    Object.entries(update.$set ?? {}).map(([k]) => [
                      k,
                      intentions[idx][k],
                    ])
                  ),
                };
          },
        };
      }
      if (name === 'daily_behavior_logs') {
        return {
          async findOneAndUpdate(q, update, opts) {
            const idx = logs.findIndex(
              (l) =>
                l.intentionId?.toString() === q.intentionId?.toString() &&
                l.date === q.date
            );
            if (idx === -1 && opts?.upsert) {
              const doc = {
                ...update.$setOnInsert,
                intentionId: q.intentionId,
                date: q.date,
              };
              logs.push(doc);
              return opts?.returnDocument === 'after' ? doc : null;
            }
            if (idx !== -1 && update.$set)
              Object.assign(logs[idx], update.$set);
            return opts?.returnDocument === 'after' ? { ...logs[idx] } : null;
          },
          async updateOne(q, update, opts) {
            const idx = logs.findIndex(
              (l) =>
                l.intentionId?.toString() === q.intentionId?.toString() &&
                l.date === q.date
            );
            if (idx === -1 && opts?.upsert) {
              logs.push({
                ...update.$setOnInsert,
                intentionId: q.intentionId,
                date: q.date,
              });
              return { upsertedCount: 1 };
            }
            if (idx !== -1 && update.$set)
              Object.assign(logs[idx], update.$set);
            return { matchedCount: idx === -1 ? 0 : 1 };
          },
          find(q = {}) {
            return {
              toArray: async () =>
                logs.filter((l) => {
                  if (
                    q.intentionId &&
                    l.intentionId?.toString() !== q.intentionId?.toString()
                  )
                    return false;
                  return true;
                }),
            };
          },
        };
      }
      if (name === 'srhi_responses') {
        return {
          async insertOne(doc) {
            srhiWindows.push({ ...doc });
          },
          async insertMany(docs) {
            docs.forEach((d) => srhiWindows.push({ ...d }));
          },
          find(q = {}) {
            return {
              sort: () => ({
                toArray: async () =>
                  srhiWindows.filter((w) => {
                    if (
                      q.intentionId &&
                      w.intentionId?.toString() !== q.intentionId?.toString()
                    )
                      return false;
                    return true;
                  }),
              }),
            };
          },
        };
      }
      if (name === 'enrollments') {
        return {
          findOne: async (q) =>
            enrollmentDoc ??
            enrollments.find((e) => e.userId === q.userId) ??
            null,
          updateOne: async () => ({ matchedCount: 0 }),
        };
      }
      if (name === 'questionnaire_assignments') {
        return {
          find: () => ({ toArray: async () => assignmentDocs }),
        };
      }
      if (name === 'questionnaires') {
        return {
          find: () => ({ toArray: async () => questionnaireDocs }),
        };
      }
      if (name === 'admin_settings') {
        return {
          find: () => ({ toArray: async () => adminSettings }),
        };
      }
      if (name === 'studies') {
        return {
          findOne: async (q) =>
            studyDocs.find((s) => s._id.toString() === q._id?.toString()) ??
            null,
        };
      }
      // fallback for any other collections (e.g. habit_annotations, cue_pools)
      return {
        insertOne: async () => ({}),
        find: () => ({ toArray: async () => [] }),
        findOne: async () => null,
        countDocuments: async () => 0,
        aggregate: () => ({ toArray: async () => [] }),
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
    neo4jRun: async (query) =>
      query.includes('ENROLLED_IN') && neo4jEnrollment ? [neo4jEnrollment] : [],
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

async function patch(path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return fetch(`${baseUrl}${path}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(body),
  });
}

const INTENTIONS = '/api/v1/habits/intentions';
const validBody = {
  behaviorKey: 'walking',
  behaviorLabel: 'Walking',
  durationMinutes: 20,
  cues: [
    { text: 'After dinner each evening', source: 'pre_rated', cueId: null },
  ],
  intentionStatement: 'After dinner each evening, I will go for a 20-min walk.',
  // §7.4 Habit Distinction — habitType is now a required field on create.
  habitType: 'build',
};

// ── Auth enforcement ──────────────────────────────────────────────────────────

test('GET /habits/intentions returns 401 without token', async () => {
  const res = await get(INTENTIONS);
  assert.strictEqual(res.status, 401);
});

test('POST /habits/intentions returns 401 without token', async () => {
  const res = await post(INTENTIONS, validBody);
  assert.strictEqual(res.status, 401);
});

// ── GET list ──────────────────────────────────────────────────────────────────

test('GET /habits/intentions returns empty array when none exist', async () => {
  const res = await get(INTENTIONS, makeToken(['user'], 'fresh-user'));
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.ok(Array.isArray(body));
  assert.strictEqual(body.length, 0);
});

// ── POST create ───────────────────────────────────────────────────────────────

test('POST /habits/intentions returns 400 when required fields missing', async () => {
  const res = await post(INTENTIONS, { behaviorKey: 'walking' }, makeToken());
  assert.strictEqual(res.status, 400);
});

test('POST /habits/intentions creates intention and returns 201', async () => {
  const res = await post(
    INTENTIONS,
    validBody,
    makeToken(['user'], 'creator-user')
  );
  assert.strictEqual(res.status, 201);
  const body = await res.json();
  assert.ok(body._id || body.id);
  assert.strictEqual(body.behaviorKey, 'walking');
  assert.strictEqual(body.status, 'active');
  // §7.4 — habitType echoed back and creationMode defaulted.
  assert.strictEqual(body.habitType, 'build');
  assert.strictEqual(body.creationMode, 'standalone');
});

test('POST /habits/intentions returns 400 when habitType is missing (§7.4)', async () => {
  const { habitType: _drop, ...noType } = validBody;
  const res = await post(
    INTENTIONS,
    noType,
    makeToken(['user'], 'no-type-user')
  );
  assert.strictEqual(res.status, 400);
});

test('POST /habits/intentions returns 400 for an invalid habitType (§7.4)', async () => {
  const res = await post(
    INTENTIONS,
    { ...validBody, habitType: 'maybe' },
    makeToken(['user'], 'bad-type-user')
  );
  assert.strictEqual(res.status, 400);
});

test('POST /habits/intentions persists a quit habit (§7.4)', async () => {
  const res = await post(
    INTENTIONS,
    { ...validBody, habitType: 'quit' },
    makeToken(['user'], 'quit-user')
  );
  assert.strictEqual(res.status, 201);
  const body = await res.json();
  assert.strictEqual(body.habitType, 'quit');
});

test('POST /habits/intentions always generates SRHI windows, independent of questionnaire_assignments', async () => {
  // SRHI is unconditional (no per-study assignment/toggle) — its only
  // precondition is that habit creation itself is enabled, which is already
  // enforced earlier in the handler. Assert this holds with no assignments
  // at all present.
  srhiInserts.length = 0;
  assignmentDocs = [];
  enrollmentDoc = null;
  const res = await post(
    INTENTIONS,
    validBody,
    makeToken(['user'], 'no-assignments-user')
  );
  assert.strictEqual(res.status, 201);
  // srhiService.generateWindows pre-creates GENERATE_AHEAD (4) weekly windows.
  assert.strictEqual(srhiInserts.length, 4);
});

test('POST /habits/intentions returns 403 when the participant-s study disables self habit creation', async () => {
  // Regression test: the Flutter app hides the "add habit" entry point when
  // selfHabitCreationEnabled is false, but that's only a UI convenience —
  // the route must enforce it too, otherwise a direct API call bypasses the
  // study's protocol entirely.
  const studyId = new ObjectId();
  studyDocs = [
    {
      _id: studyId,
      selfHabitCreationEnabled: false,
      groups: [],
    },
  ];
  neo4jEnrollment = { studyId: studyId.toString(), groupId: null };
  try {
    const res = await post(
      INTENTIONS,
      validBody,
      makeToken(['user'], 'restricted-user')
    );
    assert.strictEqual(res.status, 403);
  } finally {
    neo4jEnrollment = null;
    studyDocs = [];
  }
});

test('POST /habits/intentions rejects a client-supplied reminderTime when the study disables reminders', async () => {
  const studyId = new ObjectId();
  studyDocs = [
    {
      _id: studyId,
      reminders: { habit: { mode: 'off', time: null } },
      groups: [],
    },
  ];
  neo4jEnrollment = { studyId: studyId.toString(), groupId: null };
  try {
    const res = await post(
      INTENTIONS,
      { ...validBody, reminderTime: '19:00' },
      makeToken(['user'], 'no-reminders-user')
    );
    assert.strictEqual(res.status, 400);
  } finally {
    neo4jEnrollment = null;
    studyDocs = [];
  }
});

test('POST /habits/intentions silently drops reminderTime (no error) when the study disables reminders and the client sends none', async () => {
  const studyId = new ObjectId();
  studyDocs = [
    {
      _id: studyId,
      reminders: { habit: { mode: 'off', time: null } },
      groups: [],
    },
  ];
  neo4jEnrollment = { studyId: studyId.toString(), groupId: null };
  try {
    const res = await post(
      INTENTIONS,
      validBody,
      makeToken(['user'], 'no-reminders-user-2')
    );
    assert.strictEqual(res.status, 201);
    const body = await res.json();
    assert.strictEqual(body.reminderTime, null);
  } finally {
    neo4jEnrollment = null;
    studyDocs = [];
  }
});

test('POST /habits/intentions coerces reminderTime to the admin-fixed value regardless of what the client sends', async () => {
  const studyId = new ObjectId();
  studyDocs = [
    {
      _id: studyId,
      reminders: { habit: { mode: 'admin_fixed', time: '06:00' } },
      groups: [],
    },
  ];
  neo4jEnrollment = { studyId: studyId.toString(), groupId: null };
  try {
    // Client tries to spoof a different time than the study's fixed one.
    const res = await post(
      INTENTIONS,
      { ...validBody, reminderTime: '23:45' },
      makeToken(['user'], 'fixed-reminder-user')
    );
    assert.strictEqual(res.status, 201);
    const body = await res.json();
    assert.strictEqual(body.reminderTime, '06:00');
  } finally {
    neo4jEnrollment = null;
    studyDocs = [];
  }
});

test('POST /habits/intentions honors the client-supplied reminderTime for participant_choice mode', async () => {
  const studyId = new ObjectId();
  studyDocs = [
    {
      _id: studyId,
      reminders: { habit: { mode: 'participant_choice', time: null } },
      groups: [],
    },
  ];
  neo4jEnrollment = { studyId: studyId.toString(), groupId: null };
  try {
    const res = await post(
      INTENTIONS,
      { ...validBody, reminderTime: '21:15' },
      makeToken(['user'], 'participant-choice-user')
    );
    assert.strictEqual(res.status, 201);
    const body = await res.json();
    assert.strictEqual(body.reminderTime, '21:15');
  } finally {
    neo4jEnrollment = null;
    studyDocs = [];
  }
});

test('POST /habits/intentions returns created intention in subsequent GET', async () => {
  const token = makeToken(['user'], 'list-check-user');
  await post(INTENTIONS, validBody, token);
  const res = await get(INTENTIONS, token);
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.ok(Array.isArray(body));
  assert.ok(body.length >= 1);
  assert.ok(body.some((i) => i.behaviorKey === 'walking'));
});

// ── PATCH status ──────────────────────────────────────────────────────────────

test('PATCH /habits/intentions/:id/status returns 400 for invalid status', async () => {
  const res = await patch(
    `${INTENTIONS}/507f1f77bcf86cd799439011/status`,
    { status: 'unknown' },
    makeToken()
  );
  assert.strictEqual(res.status, 400);
});

test('PATCH /habits/intentions/:id/status returns 404 for nonexistent intention', async () => {
  const res = await patch(
    `${INTENTIONS}/507f1f77bcf86cd799439011/status`,
    { status: 'paused' },
    makeToken()
  );
  assert.strictEqual(res.status, 404);
});

// ── POST logs ────────────────────────────────────────────────────────────────

test('POST /habits/intentions/:id/logs returns 400 when date missing', async () => {
  const res = await post(
    `${INTENTIONS}/507f1f77bcf86cd799439011/logs`,
    { enacted: true },
    makeToken()
  );
  assert.strictEqual(res.status, 400);
});

test('POST /habits/intentions/:id/logs returns 201 with valid payload', async () => {
  const token = makeToken(['user'], 'log-user');
  const createRes = await post(INTENTIONS, validBody, token);
  const created = await createRes.json();
  const id = created._id ?? created.id;

  const res = await post(
    `${INTENTIONS}/${id}/logs`,
    { date: '2026-06-01', enacted: true },
    token
  );
  assert.strictEqual(res.status, 201);
  const body = await res.json();
  assert.strictEqual(body.logged, true);
});

// ── IDOR: cross-user access to another user's daily logs ────────────────────

test('GET /habits/intentions/:id/logs returns 404 for an intention owned by another user', async () => {
  const ownerToken = makeToken(['user'], 'idor-owner-1');
  const attackerToken = makeToken(['user'], 'idor-attacker-1');
  const createRes = await post(INTENTIONS, validBody, ownerToken);
  const created = await createRes.json();
  const id = created._id ?? created.id;

  const res = await get(`${INTENTIONS}/${id}/logs`, attackerToken);
  assert.strictEqual(res.status, 404);
});

test('POST /habits/intentions/:id/logs returns 404 for an intention owned by another user', async () => {
  const ownerToken = makeToken(['user'], 'idor-owner-2');
  const attackerToken = makeToken(['user'], 'idor-attacker-2');
  const createRes = await post(INTENTIONS, validBody, ownerToken);
  const created = await createRes.json();
  const id = created._id ?? created.id;

  const res = await post(
    `${INTENTIONS}/${id}/logs`,
    { date: '2026-06-01', enacted: true },
    attackerToken
  );
  assert.strictEqual(res.status, 404);

  // The owner's own log fetch must not show a log the attacker "created".
  const ownerLogs = await get(`${INTENTIONS}/${id}/logs`, ownerToken);
  const ownerLogsBody = await ownerLogs.json();
  assert.strictEqual(ownerLogsBody.length, 0);
});

test('DELETE /habits/intentions/:id/logs/:date returns 404 for an intention owned by another user, and does not delete the owner-s log', async () => {
  const ownerToken = makeToken(['user'], 'idor-owner-3');
  const attackerToken = makeToken(['user'], 'idor-attacker-3');
  const createRes = await post(INTENTIONS, validBody, ownerToken);
  const created = await createRes.json();
  const id = created._id ?? created.id;

  await post(
    `${INTENTIONS}/${id}/logs`,
    { date: '2026-06-01', enacted: true },
    ownerToken
  );

  const delRes = await fetch(`${baseUrl}${INTENTIONS}/${id}/logs/2026-06-01`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${attackerToken}` },
  });
  assert.strictEqual(delRes.status, 404);

  const ownerLogs = await get(`${INTENTIONS}/${id}/logs`, ownerToken);
  const ownerLogsBody = await ownerLogs.json();
  assert.strictEqual(
    ownerLogsBody.length,
    1,
    'owner log must survive the attacker delete attempt'
  );
});

// ── §7.5 Gamification ───────────────────────────────────────────────────────

test('GET /habits/intentions/gamification returns a summary with First Step', async () => {
  const token = makeToken(['user'], 'gami-user');
  const created = await post(INTENTIONS, validBody, token);
  assert.strictEqual(created.status, 201);

  const res = await get(`${INTENTIONS}/gamification`, token);
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.ok(typeof body.totalXp === 'number');
  assert.ok(body.level >= 1);
  assert.ok(Array.isArray(body.badges));
  assert.ok(body.badges.some((b) => b.badgeKey === 'first_step'));
  // First Step is newly earned on this first read.
  assert.ok(body.newlyEarned.some((b) => b.badgeKey === 'first_step'));
});

test('GET /habits/intentions/gamification requires auth', async () => {
  const res = await get(`${INTENTIONS}/gamification`);
  assert.strictEqual(res.status, 401);
});
