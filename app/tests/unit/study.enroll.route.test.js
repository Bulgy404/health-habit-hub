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

// ── Test server ───────────────────────────────────────────────────────────────

let server;
let baseUrl;

before(async () => {
  const studyId = new ObjectId();
  const groupId = new ObjectId();

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
    ],
  });

  const testApp = express();
  testApp.use(express.json());
  // Inject fake authenticated user
  testApp.use((req, _res, next) => {
    req.user = { sub: 'test-user-1' };
    next();
  });
  testApp.use('/api/v1/onboarding', createStudyEnrollRouter({ db }));

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

test('POST /redeem-code accepts valid uppercase code and proceeds past format check', async () => {
  const res = await fetch(`${baseUrl}/api/v1/onboarding/redeem-code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: 'HHH-ABCDE' }),
  });
  // Format is valid — result depends on service logic (200 or 404), not 400
  assert.notStrictEqual(res.status, 400);
});

test('POST /redeem-code accepts valid lowercase code and proceeds past format check', async () => {
  const res = await fetch(`${baseUrl}/api/v1/onboarding/redeem-code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: 'hhh-abcde' }),
  });
  // Format is valid (case-insensitive) — must not be rejected as invalid format
  assert.notStrictEqual(res.status, 400);
});
