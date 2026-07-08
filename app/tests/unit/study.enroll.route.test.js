import { test, before, after } from 'node:test';
import assert from 'node:assert';
import { createServer } from 'node:http';
import express from 'express';
import { createStudyEnrollRouter } from '../../routes/studyEnrollRouter.js';
import { ObjectId } from '../../models/survey.js';

// ── In-memory DB stub ─────────────────────────────────────────────────────────

function makeDb(initial = {}) {
  const stores = {};
  for (const [name, docs] of Object.entries(initial)) {
    stores[name] = docs.map((d) => ({ ...d }));
  }
  function store(name) {
    if (!stores[name]) stores[name] = [];
    return stores[name];
  }
  return {
    collection(name) {
      const s = store(name);
      return {
        findOne(filter = {}) {
          const found = s.find((d) =>
            Object.entries(filter).every(
              ([k, v]) => d[k]?.toString() === v?.toString()
            )
          );
          return Promise.resolve(found ? { ...found } : null);
        },
        async findOneAndUpdate(filter, update, options = {}) {
          const { $expr: _expr, ...plain } = filter;
          const idx = s.findIndex((d) =>
            Object.entries(plain).every(
              ([k, v]) => d[k]?.toString() === v?.toString()
            )
          );
          const { upsert = false, returnDocument = 'before' } = options;
          if (idx === -1) {
            if (upsert && update.$setOnInsert) {
              s.push({ ...update.$setOnInsert });
              return null;
            }
            return null;
          }
          const before = { ...s[idx] };
          if (update.$inc) {
            for (const [k, v] of Object.entries(update.$inc)) {
              s[idx][k] = (s[idx][k] || 0) + v;
            }
          }
          if (update.$set) Object.assign(s[idx], update.$set);
          return returnDocument === 'before' ? before : { ...s[idx] };
        },
        async updateOne(filter, update) {
          const idx = s.findIndex((d) =>
            Object.entries(filter).every(
              ([k, v]) => d[k]?.toString() === v?.toString()
            )
          );
          if (idx === -1) return { matchedCount: 0, modifiedCount: 0 };
          if (update.$inc) {
            for (const [k, v] of Object.entries(update.$inc)) {
              s[idx][k] = (s[idx][k] || 0) + v;
            }
          }
          if (update.$set) Object.assign(s[idx], update.$set);
          return { matchedCount: 1, modifiedCount: 1 };
        },
        aggregate() {
          return {
            async toArray() {
              return [];
            },
          };
        },
      };
    },
  };
}

// ── In-memory Neo4j stub ──────────────────────────────────────────────────────

/**
 * Minimal neo4jRun stub covering the cypher used by createEnrollment /
 * getEnrollment: tracks which users are enrolled in a Map.
 */
function makeNeo4jRun() {
  const enrollments = new Map(); // userId → { studyId, groupId, ... }
  return async (cypher, params = {}) => {
    if (cypher.includes('RETURN e IS NOT NULL AS exists')) {
      return [{ exists: enrollments.has(String(params.userId)) }];
    }
    if (cypher.includes('SET e.droppedOutAt = $movedAt')) {
      if (!enrollments.has(String(params.userId))) return [];
      enrollments.set(String(params.userId), {
        studyId: params.newStudyId,
        groupId: params.newGroupId ?? null,
        enrolledAt: params.movedAt ?? null,
        studyCodeUsed: params.studyCodeUsed ?? null,
      });
      return [{ enrolledAt: params.movedAt }];
    }
    if (cypher.includes('CREATE (u)-[e:ENROLLED_IN]')) {
      enrollments.set(String(params.userId), {
        studyId: params.studyId,
        groupId: params.groupId ?? null,
        enrolledAt: params.enrolledAt ?? null,
        studyCodeUsed: params.studyCodeUsed ?? null,
      });
      return [];
    }
    if (cypher.includes('MATCH (u:User {userID: $userId})-[e:ENROLLED_IN]')) {
      const e = enrollments.get(String(params.userId));
      return e ? [e] : [];
    }
    return [];
  };
}

// ── Test server ───────────────────────────────────────────────────────────────

let server;
let baseUrl;

const studyId = new ObjectId();
const groupId = new ObjectId();
const studyId2 = new ObjectId();
const groupId2 = new ObjectId();

before(async () => {
  const db = makeDb({
    studies: [
      {
        _id: studyId,
        name: 'Test Study',
        isDefault: true,
        isActive: true,
        groups: [{ id: groupId, label: 'Group 1', index: 1 }],
        questionnaires: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        _id: studyId2,
        name: 'Other Study',
        isDefault: false,
        isActive: true,
        groups: [{ id: groupId2, label: 'Group A', index: 1 }],
        questionnaires: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
    studyCodes: [
      {
        code: 'HHH-ABCDE',
        studyId,
        groupId,
        maxRedemptions: null,
        redemptionCount: 0,
        expiresAt: null,
        createdAt: new Date(),
      },
      {
        code: 'HHH-OTHER',
        studyId: studyId2,
        groupId: groupId2,
        maxRedemptions: null,
        redemptionCount: 0,
        expiresAt: null,
        createdAt: new Date(),
      },
    ],
  });

  const testApp = express();
  testApp.use(express.json());
  // Inject fake authenticated user (overridable per request via header)
  testApp.use((req, _res, next) => {
    req.user = { sub: req.headers['x-test-user'] ?? 'test-user-1' };
    next();
  });
  testApp.use(
    '/api/v1/onboarding',
    createStudyEnrollRouter({ db, neo4jRun: makeNeo4jRun() })
  );

  server = createServer(testApp);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
});

// ── Format validation tests ───────────────────────────────────────────────────

test('POST /redeem-code returns 400 for missing code', async () => {
  const res = await fetch(`${baseUrl}/api/v1/onboarding/redeem-code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  assert.strictEqual(res.status, 400);
  const body = await res.json();
  assert.ok(body.error, 'should return error message');
});

test('POST /redeem-code returns 400 for code without HHH- prefix', async () => {
  const res = await fetch(`${baseUrl}/api/v1/onboarding/redeem-code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: 'ABC-12345' }),
  });
  assert.strictEqual(res.status, 400);
  const body = await res.json();
  assert.match(body.error, /Invalid code format/);
});

test('POST /redeem-code returns 400 for code with wrong suffix length', async () => {
  const res = await fetch(`${baseUrl}/api/v1/onboarding/redeem-code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: 'HHH-ABCD' }),
  });
  assert.strictEqual(res.status, 400);
  const body = await res.json();
  assert.match(body.error, /Invalid code format/);
});

test('POST /redeem-code returns 400 for code with special characters', async () => {
  const res = await fetch(`${baseUrl}/api/v1/onboarding/redeem-code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: 'HHH-AB!DE' }),
  });
  assert.strictEqual(res.status, 400);
  const body = await res.json();
  assert.match(body.error, /Invalid code format/);
});

test('POST /redeem-code returns 400 for empty string', async () => {
  const res = await fetch(`${baseUrl}/api/v1/onboarding/redeem-code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: '' }),
  });
  assert.strictEqual(res.status, 400);
});

test('POST /redeem-code accepts valid uppercase code and enrolls the user', async () => {
  const res = await fetch(`${baseUrl}/api/v1/onboarding/redeem-code`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-test-user': 'redeem-upper-user',
    },
    body: JSON.stringify({ code: 'HHH-ABCDE' }),
  });
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.ok(body.studyId, 'should return studyId');
  assert.ok(body.groupId, 'should return groupId');
  assert.strictEqual(body.studyName, 'Test Study');
  assert.strictEqual(body.groupLabel, 'Group 1');
});

test('POST /redeem-code accepts valid lowercase code and enrolls the user', async () => {
  const res = await fetch(`${baseUrl}/api/v1/onboarding/redeem-code`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-test-user': 'redeem-lower-user',
    },
    body: JSON.stringify({ code: 'hhh-abcde' }),
  });
  // Format is valid (case-insensitive) — the code resolves and enrolls
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.ok(body.studyId, 'should return studyId');
});

test('POST /redeem-code returns 409 when the user is already enrolled', async () => {
  const redeem = () =>
    fetch(`${baseUrl}/api/v1/onboarding/redeem-code`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-test-user': 'redeem-twice-user',
      },
      body: JSON.stringify({ code: 'HHH-ABCDE' }),
    });
  const first = await redeem();
  assert.strictEqual(first.status, 200);
  const second = await redeem();
  assert.strictEqual(second.status, 409);
  const body = await second.json();
  assert.match(body.error, /Already enrolled/);
});

// ── GET /enrollment, POST /switch-study, POST /leave-study ────────────────────

async function post(path, body, testUser) {
  return fetch(`${baseUrl}/api/v1/onboarding/${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-test-user': testUser,
    },
    body: JSON.stringify(body ?? {}),
  });
}

async function get(path, testUser) {
  return fetch(`${baseUrl}/api/v1/onboarding/${path}`, {
    headers: { 'x-test-user': testUser },
  });
}

test('GET /enrollment returns 404 for a user with no enrollment', async () => {
  const res = await get('enrollment', 'never-enrolled-user');
  assert.strictEqual(res.status, 404);
});

test('GET /enrollment returns the current study after redeeming a code', async () => {
  await post('redeem-code', { code: 'HHH-OTHER' }, 'enrollment-status-user');
  const res = await get('enrollment', 'enrollment-status-user');
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.strictEqual(body.studyName, 'Other Study');
  assert.strictEqual(body.isDefaultStudy, false);
});

test('POST /switch-study moves the user to the new study', async () => {
  await post('redeem-code', { code: 'HHH-OTHER' }, 'switch-user');
  const res = await post('switch-study', { code: 'HHH-ABCDE' }, 'switch-user');
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.strictEqual(body.studyName, 'Test Study');

  const status = await get('enrollment', 'switch-user');
  const statusBody = await status.json();
  assert.strictEqual(statusBody.studyName, 'Test Study');
});

test('POST /switch-study returns 409 when not currently enrolled', async () => {
  const res = await post(
    'switch-study',
    { code: 'HHH-OTHER' },
    'never-enrolled-switch-user'
  );
  assert.strictEqual(res.status, 409);
});

test('POST /switch-study returns 409 for a code targeting the current study', async () => {
  await post('redeem-code', { code: 'HHH-OTHER' }, 'switch-same-user');
  const res = await post(
    'switch-study',
    { code: 'HHH-OTHER' },
    'switch-same-user'
  );
  assert.strictEqual(res.status, 409);
  const body = await res.json();
  assert.match(body.error, /Already enrolled in that study/);
});

test('POST /switch-study returns 400 for an invalid code format', async () => {
  await post('redeem-code', { code: 'HHH-OTHER' }, 'switch-badcode-user');
  const res = await post(
    'switch-study',
    { code: 'nope' },
    'switch-badcode-user'
  );
  assert.strictEqual(res.status, 400);
});

test('POST /leave-study moves the user from a code-joined study back to the default study', async () => {
  await post('redeem-code', { code: 'HHH-OTHER' }, 'leave-user');
  const res = await post('leave-study', null, 'leave-user');
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.strictEqual(body.studyName, 'Test Study');

  const status = await get('enrollment', 'leave-user');
  const statusBody = await status.json();
  assert.strictEqual(statusBody.isDefaultStudy, true);
});

test('POST /leave-study returns 409 when already in the default study', async () => {
  await post('redeem-code', { code: 'HHH-ABCDE' }, 'leave-default-user');
  const res = await post('leave-study', null, 'leave-default-user');
  assert.strictEqual(res.status, 409);
  const body = await res.json();
  assert.match(body.error, /Already enrolled in the default study/);
});

test('POST /leave-study returns 409 when not currently enrolled', async () => {
  const res = await post('leave-study', null, 'never-enrolled-leave-user');
  assert.strictEqual(res.status, 409);
});
