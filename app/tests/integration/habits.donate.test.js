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
pubKeyJwk.kid = 'donate-key-1';
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
  const header = { alg: 'RS256', kid: 'donate-key-1', typ: 'JWT' };
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
  return {
    collection(name) {
      if (!collections[name]) collections[name] = [];
      const col = collections[name];
      return {
        async insertOne(doc) {
          col.push({ ...doc });
        },
        find(query) {
          let results = [...col];
          if (query && query.habitId !== undefined) {
            results = results.filter((a) => a.habitId === query.habitId);
          }
          if (query && query.createdAt && query.createdAt.$gte) {
            results = results.filter(
              (a) => a.createdAt >= query.createdAt.$gte
            );
          }
          return {
            async toArray() {
              return results;
            },
          };
        },
      };
    },
    _getAll(name) {
      return collections[name] || [];
    },
  };
}

// ── Stateful mock Neo4j ────────────────────────────────────────────────────────
// Simulates MERGE semantics: BCIOConcept nodes are deduplicated by bcio_concept_id

function createStatefulNeo4jMock() {
  const habitNodes = [];
  const _contextNodes = new Map(); // key: `${text}:${dimension}` — reserved for future context MERGE tracking
  const bcioNodes = new Map(); // key: bcio_concept_id
  const cypher_log = [];

  async function neo4jRun(cypher, params = {}) {
    cypher_log.push({ cypher, params });

    if (cypher.includes('CREATE (h:Habit')) {
      habitNodes.push({ ...params });
      return [];
    }

    if (cypher.includes('MERGE (b:BCIOConcept')) {
      // UNWIND batch: params.mappings is an array of {bcio_concept_id, bcio_concept_label, ...}
      const mappings = params.mappings || [
        {
          bcio_concept_id: params.bcio_concept_id,
          bcio_concept_label: params.bcio_concept_label,
        },
      ];
      for (const m of mappings) {
        if (!bcioNodes.has(m.bcio_concept_id)) {
          bcioNodes.set(m.bcio_concept_id, {
            bcio_concept_id: m.bcio_concept_id,
            bcio_concept_label: m.bcio_concept_label,
          });
        }
      }
      return [];
    }

    if (cypher.includes('count(h) AS total'))
      return [{ total: habitNodes.length }];
    if (cypher.includes('AS category, cnt AS count')) return [];

    return [];
  }

  return {
    neo4jRun,
    getHabits: () => habitNodes,
    getBcioNodes: () => [...bcioNodes.values()],
    getCypherLog: () => cypher_log,
  };
}

// ── Mock API-service responses ─────────────────────────────────────────────────

const API_SERVICE_URL = 'http://mock-api-service:8000';

const MOCK_CLASSIFY_HABIT_IS_HABIT = {
  uuid: 'test-uuid',
  sentence: 'I go for a morning run every day',
  language: 'en',
  is_habit: true,
  confidence: 0.95,
};

const MOCK_CLASSIFY_HABIT_NOT_HABIT = {
  uuid: 'test-uuid',
  sentence: 'The sky is blue',
  language: 'en',
  is_habit: false,
  confidence: 0.1,
};

const MOCK_CLASSIFY_CONTEXT = {
  uuid: 'test-uuid',
  sentence: 'I go for a morning run every day',
  language: 'en',
  TIME: ['every morning', 'every day'],
  PHYSICAL_SETTING: [],
  PRIOR_BEHAVIOR: [],
  OTHER_PEOPLE: [],
  INTERNAL_STATE: [],
  BEHAVIOR: ['running'],
  REASONING: [],
};

const MOCK_MAP_BCIO = {
  mappings: [
    {
      phrase: 'running',
      dimension: 'BEHAVIOR',
      bcio_concept_id: 'BCIO:0000042',
      bcio_concept_label: 'Physical activity',
      confidence: 0.92,
    },
  ],
};

// ── Test server ───────────────────────────────────────────────────────────────

let server;
let baseUrl;
let mockDb;
let neo4jMock;

before(async () => {
  mockDb = createMockDb();
  neo4jMock = createStatefulNeo4jMock();

  const realFetch = global.fetch;
  global.fetch = async (url, options) => {
    const urlStr = typeof url === 'string' ? url : url.toString();

    if (urlStr.includes('/jwks')) {
      return { ok: true, json: async () => mockJwks };
    }

    // Intercept API-service (mock-api-service) calls
    if (urlStr.includes('mock-api-service')) {
      if (urlStr.includes('/api/v1/llm/classify-habit')) {
        const body = JSON.parse(options?.body || '{}');
        const isHabit =
          body.sentence && body.sentence.toLowerCase().includes('sky')
            ? MOCK_CLASSIFY_HABIT_NOT_HABIT
            : { ...MOCK_CLASSIFY_HABIT_IS_HABIT, sentence: body.sentence };
        return { ok: true, json: async () => isHabit };
      }

      if (urlStr.includes('/api/v1/llm/classify-context')) {
        const body = JSON.parse(options?.body || '{}');
        return {
          ok: true,
          json: async () => ({
            ...MOCK_CLASSIFY_CONTEXT,
            sentence: body.sentence,
          }),
        };
      }

      if (urlStr.includes('/api/v1/llm/map-bcio')) {
        return { ok: true, json: async () => MOCK_MAP_BCIO };
      }

      return {
        ok: false,
        status: 404,
        json: async () => ({ error: 'Not found' }),
      };
    }

    // All other calls (including to the test server) go to real fetch
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

  // Warm up JWKS cache
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

// ── Helpers ───────────────────────────────────────────────────────────────────

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

test('POST /api/v1/habits/donate returns 401 without token', async () => {
  const res = await post('/api/v1/habits/donate', {
    sentence: 'I run every morning',
    language: 'en',
  });
  assert.strictEqual(res.status, 401);
});

test('POST /api/v1/habits/donate returns 400 without sentence', async () => {
  const res = await post(
    '/api/v1/habits/donate',
    { language: 'en' },
    makeToken()
  );
  assert.strictEqual(res.status, 400);
  const body = await res.json();
  assert.ok(body.error);
});

test('POST /api/v1/habits/donate returns 400 without language', async () => {
  const res = await post(
    '/api/v1/habits/donate',
    { sentence: 'I run every morning' },
    makeToken()
  );
  assert.strictEqual(res.status, 400);
  const body = await res.json();
  assert.ok(body.error);
});

// ── Non-habit donation ────────────────────────────────────────────────────────

test('POST /api/v1/habits/donate stores non-habit in MongoDB when is_habit=false', async () => {
  const res = await post(
    '/api/v1/habits/donate',
    { sentence: 'The sky is blue', language: 'en' },
    makeToken()
  );
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.strictEqual(body.is_habit, false);
  assert.ok(body.message);

  const stored = mockDb._getAll('habits');
  const nonHabit = stored.find((h) => h.sentence === 'The sky is blue');
  assert.ok(nonHabit, 'Non-habit should be stored in MongoDB');
  assert.strictEqual(nonHabit.is_habit, false);
});

// ── Habit donation ────────────────────────────────────────────────────────────

test('POST /api/v1/habits/donate returns 201 with uuid for valid habit', async () => {
  const res = await post(
    '/api/v1/habits/donate',
    { sentence: 'I go for a morning run every day', language: 'en' },
    makeToken('user-1')
  );
  assert.strictEqual(res.status, 201);
  const body = await res.json();
  assert.strictEqual(body.is_habit, true);
  assert.ok(body.uuid, 'Response should include uuid');
  assert.ok(body.message);
});

test('POST /api/v1/habits/donate creates a Habit node in Neo4j', async () => {
  const before = neo4jMock.getHabits().length;
  await post(
    '/api/v1/habits/donate',
    { sentence: 'I meditate for 10 minutes each morning', language: 'en' },
    makeToken('user-2')
  );
  const after = neo4jMock.getHabits().length;
  assert.ok(after > before, 'A new Habit node should be created');
  const latest = neo4jMock.getHabits().at(-1);
  assert.ok(latest.uuid);
  assert.strictEqual(latest.sentence, 'I meditate for 10 minutes each morning');
  assert.strictEqual(latest.is_habit, undefined); // stored as string literal in cypher
});

// ── Integration: two users share one BCIOConcept node ────────────────────────

test('Two users donating similar habits share a single BCIOConcept node', async () => {
  // User 3 donates a habit
  await post(
    '/api/v1/habits/donate',
    { sentence: 'I run for 30 minutes every morning', language: 'en' },
    makeToken('user-3')
  );

  // User 4 donates a similar habit (both map to BCIO:0000042 via mock)
  await post(
    '/api/v1/habits/donate',
    { sentence: 'I jog in the park every morning', language: 'en' },
    makeToken('user-4')
  );

  const bcioNodes = neo4jMock.getBcioNodes();
  const physicalActivityNodes = bcioNodes.filter(
    (n) => n.bcio_concept_id === 'BCIO:0000042'
  );

  // Both donations map to the same BCIO concept — only one BCIOConcept node should exist
  assert.strictEqual(
    physicalActivityNodes.length,
    1,
    'Two similar habits should share one BCIOConcept node (BCIO:0000042)'
  );

  // Verify the MERGE cypher pattern was used for BCIOConcept (not CREATE)
  const cypherLog = neo4jMock.getCypherLog();
  const bcioCyphers = cypherLog.filter((entry) =>
    entry.cypher.includes('MERGE (b:BCIOConcept')
  );
  assert.ok(
    bcioCyphers.length >= 2,
    'BCIOConcept MERGE should be called at least twice (once per donation)'
  );

  // Verify both merge calls used the same concept id
  // UNWIND batches: check params.mappings array (or fallback to params.bcio_concept_id for non-batched)
  const mergedIds = bcioCyphers
    .flatMap((e) => {
      if (e.params.mappings)
        return e.params.mappings.map((m) => m.bcio_concept_id);
      return [e.params.bcio_concept_id];
    })
    .filter((id) => id === 'BCIO:0000042');
  assert.ok(
    mergedIds.length >= 2,
    'Both donations should MERGE the same BCIOConcept ID'
  );
});
