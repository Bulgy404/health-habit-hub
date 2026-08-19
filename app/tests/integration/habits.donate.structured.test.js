// §7.x — Structured donation input mode: a participant picks a catalog
// activity_types entry instead of typing/speaking a sentence. Verifies the
// server resolves+validates the behaviorKey itself (never trusting a
// client-sent sentence/label), skips classifyHabit() entirely, and still
// produces a normal accepted Habit node through the rest of the pipeline.
import { test, before, after } from 'node:test';
import assert from 'node:assert';
import { createServer } from 'node:http';
import { generateKeyPairSync, createSign } from 'node:crypto';
import express from 'express';
import { ObjectId } from 'mongodb';
import { createApiRouter } from '../../routes/apiRouter.js';

// ── Key material ─────────────────────────────────────────────────────────────

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
});
const pubKeyJwk = publicKey.export({ format: 'jwk' });
pubKeyJwk.kid = 'donate-structured-key-1';
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
  const header = { alg: 'RS256', kid: 'donate-structured-key-1', typ: 'JWT' };
  const h = base64urlEncode(Buffer.from(JSON.stringify(header)));
  const p = base64urlEncode(Buffer.from(JSON.stringify(payload)));
  const signingInput = `${h}.${p}`;
  const sign = createSign('RSA-SHA256');
  sign.update(signingInput);
  return `${signingInput}.${base64urlEncode(sign.sign(privateKey))}`;
}

function makeToken(sub, roles = ['user']) {
  const now = Math.floor(Date.now() / 1000);
  return createJwt({
    sub,
    exp: now + 3600,
    iat: now,
    realm_access: { roles },
  });
}

// ── Fixtures: two studies — one structured, one freeText-only ─────────────────

const structuredUser = 'struct-user-1';
const structuredEnrollment = {
  studyId: new ObjectId(),
  groupId: new ObjectId(),
};
const structuredStudyDoc = {
  _id: structuredEnrollment.studyId,
  recommenderEnabled: true,
  donationInputMode: 'structured',
  structuredActivityKeys: ['walking', 'meditation'],
  groups: [{ id: structuredEnrollment.groupId, label: 'Group A', index: 1 }],
};

const freeTextUser = 'freetext-user-1';
const freeTextEnrollment = {
  studyId: new ObjectId(),
  groupId: new ObjectId(),
};
const freeTextStudyDoc = {
  _id: freeTextEnrollment.studyId,
  recommenderEnabled: true,
  donationInputMode: 'freeText',
  groups: [{ id: freeTextEnrollment.groupId, label: 'Group B', index: 1 }],
};

const activityTypeDocs = [
  { key: 'walking', label_en: 'Going for a walk' },
  { key: 'meditation', label_en: 'Meditating' },
];

// ── In-memory mock Mongo ────────────────────────────────────────────────────

function createMockDb() {
  const habitDonations = [];
  return {
    collection(name) {
      if (name === 'studies') {
        return {
          async findOne(q) {
            const id = String(q._id);
            if (id === structuredEnrollment.studyId.toString())
              return structuredStudyDoc;
            if (id === freeTextEnrollment.studyId.toString())
              return freeTextStudyDoc;
            return null;
          },
        };
      }
      if (name === 'activity_types') {
        return {
          find(q) {
            const keys = q?.key?.$in ?? [];
            const docs = activityTypeDocs.filter((d) => keys.includes(d.key));
            return {
              async toArray() {
                return docs;
              },
            };
          },
        };
      }
      if (name === 'habit_donations') {
        return {
          async insertOne(doc) {
            habitDonations.push({ ...doc });
            return { insertedId: `mock-${habitDonations.length}` };
          },
          async updateOne(query, update) {
            const doc = habitDonations.find((d) => d.uuid === query.uuid);
            if (!doc) return { matchedCount: 0 };
            if (update.$set) Object.assign(doc, update.$set);
            return { matchedCount: 1 };
          },
          async findOne(query) {
            return habitDonations.find((d) => d.uuid === query.uuid) ?? null;
          },
        };
      }
      return {
        findOne: async () => null,
        find: () => ({ toArray: async () => [] }),
        insertOne: async () => ({}),
        updateOne: async () => ({ matchedCount: 0 }),
      };
    },
    _getAll: () => habitDonations,
  };
}

// ── Stateful mock Neo4j: enrollment lookups + minimal Habit-node bookkeeping ──

function createNeo4jMock() {
  const habitNodes = [];

  async function neo4jRun(cypher, params = {}) {
    if (cypher.includes('ENROLLED_IN')) {
      if (params.userId === structuredUser) {
        return [
          {
            studyId: structuredEnrollment.studyId.toString(),
            groupId: structuredEnrollment.groupId.toString(),
            enrolledAt: null,
            studyCodeUsed: null,
          },
        ];
      }
      if (params.userId === freeTextUser) {
        return [
          {
            studyId: freeTextEnrollment.studyId.toString(),
            groupId: freeTextEnrollment.groupId.toString(),
            enrolledAt: null,
            studyCodeUsed: null,
          },
        ];
      }
      return [];
    }
    if (cypher.includes('CREATE (h:Habit')) {
      habitNodes.push({ ...params });
      return [];
    }
    if (cypher.includes('MERGE (b:BCIOConcept')) return [];
    return [];
  }

  return { neo4jRun, getHabits: () => habitNodes };
}

// ── Mock LLM/API-service responses ─────────────────────────────────────────────

const API_SERVICE_URL = 'http://mock-api-service-structured:8000';

let classifyHabitCalled = false;

// ── Test server ───────────────────────────────────────────────────────────────

let server;
let baseUrl;
let mockDb;
let neo4jMock;

before(async () => {
  mockDb = createMockDb();
  neo4jMock = createNeo4jMock();

  const realFetch = global.fetch;
  global.fetch = async (url, options) => {
    const urlStr = typeof url === 'string' ? url : url.toString();

    if (urlStr.includes('/jwks')) {
      return { ok: true, json: async () => mockJwks };
    }

    if (urlStr.includes('mock-api-service-structured')) {
      if (urlStr.includes('/api/v1/llm/classify-habit')) {
        classifyHabitCalled = true;
        return {
          ok: true,
          json: async () => ({
            is_habit: true,
            confidence: 0.95,
          }),
        };
      }
      if (urlStr.includes('/api/v1/llm/classify-context')) {
        const body = JSON.parse(options?.body || '{}');
        return {
          ok: true,
          json: async () => ({
            uuid: body.uuid,
            sentence: body.sentence,
            language: body.language,
            TIME: [],
            PHYSICAL_SETTING: [],
            PRIOR_BEHAVIOR: [],
            OTHER_PEOPLE: [],
            INTERNAL_STATE: [],
            BEHAVIOR: [],
            REASONING: [],
          }),
        };
      }
      if (urlStr.includes('/api/v1/llm/map-bcio')) {
        return { ok: true, json: async () => ({ mappings: [] }) };
      }
      return {
        ok: false,
        status: 404,
        text: async () => JSON.stringify({ error: 'Not found' }),
        json: async () => ({ error: 'Not found' }),
      };
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
    neo4jRun: neo4jMock.neo4jRun,
    apiServiceUrl: API_SERVICE_URL,
  });
  testApp.use('/api/v1', apiRouter);

  server = createServer(testApp);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  await fetch(`${baseUrl}/api/v1/health`);
});

after(() => {
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

// ── Tests ────────────────────────────────────────────────────────────────────

test('structured donation: accepted, sentence resolved server-side from the catalog, classifyHabit never called', async () => {
  classifyHabitCalled = false;
  const res = await post(
    '/api/v1/habits/donate',
    { inputMode: 'structured', behaviorKey: 'walking', language: 'en' },
    makeToken(structuredUser)
  );
  const body = await res.json();
  assert.strictEqual(res.status, 201);
  assert.strictEqual(body.is_habit, true);
  assert.strictEqual(classifyHabitCalled, false);

  const donations = mockDb._getAll();
  const record = donations.find((d) => d.uuid === body.uuid);
  assert.ok(record, 'a habit_donations record should exist for this uuid');
  assert.strictEqual(record.inputMode, 'structured');

  const habits = neo4jMock.getHabits();
  const node = habits.find((h) => h.uuid === body.uuid);
  assert.ok(node, 'a Habit node should have been created');
  assert.strictEqual(
    node.sentence,
    'Going for a walk',
    'sentence must be the server-resolved catalog label, not client-supplied text'
  );
  assert.strictEqual(
    node.habit_type,
    'build',
    'structured donations default to build (no classifier read, no build/quit question)'
  );
});

test('structured donation: an ignored client-supplied sentence does not override the resolved catalog label', async () => {
  const res = await post(
    '/api/v1/habits/donate',
    {
      inputMode: 'structured',
      behaviorKey: 'meditation',
      language: 'en',
      sentence: 'this text should be ignored',
    },
    makeToken(structuredUser)
  );
  const body = await res.json();
  assert.strictEqual(res.status, 201);
  const node = neo4jMock.getHabits().find((h) => h.uuid === body.uuid);
  assert.strictEqual(node.sentence, 'Meditating');
});

test("structured donation: 400 for a behaviorKey outside this study's structuredActivityKeys", async () => {
  const res = await post(
    '/api/v1/habits/donate',
    { inputMode: 'structured', behaviorKey: 'running', language: 'en' },
    makeToken(structuredUser)
  );
  assert.strictEqual(res.status, 400);
  const body = await res.json();
  assert.ok(body.error);
});

test('structured donation: 400 when behaviorKey is missing entirely', async () => {
  const res = await post(
    '/api/v1/habits/donate',
    { inputMode: 'structured', language: 'en' },
    makeToken(structuredUser)
  );
  assert.strictEqual(res.status, 400);
  const body = await res.json();
  assert.ok(body.error);
});

test("structured donation: 403 when the participant's study only accepts freeText donations", async () => {
  const res = await post(
    '/api/v1/habits/donate',
    { inputMode: 'structured', behaviorKey: 'walking', language: 'en' },
    makeToken(freeTextUser)
  );
  assert.strictEqual(res.status, 403);
  const body = await res.json();
  assert.ok(body.error);
});
