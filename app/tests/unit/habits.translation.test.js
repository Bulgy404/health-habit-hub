/**
 * Unit tests for US-114: tone-preserving English translation of non-English habits.
 *
 * Mocks LibreTranslate and the LLM refine-translation endpoint to verify:
 *   1. translationEN is stored on the Neo4j habit node for non-English habits
 *   2. The stored value is the LLM-refined text, not the raw literal translation
 *   3. When the LLM step fails, the raw LibreTranslate output is used as fallback
 *   4. English habits produce translationEN: null (no translation needed)
 */

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
pubKeyJwk.kid = 'translation-key-1';
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
  const header = { alg: 'RS256', kid: 'translation-key-1', typ: 'JWT' };
  const h = base64urlEncode(Buffer.from(JSON.stringify(header)));
  const p = base64urlEncode(Buffer.from(JSON.stringify(payload)));
  const signingInput = `${h}.${p}`;
  const sign = createSign('RSA-SHA256');
  sign.update(signingInput);
  return `${signingInput}.${base64urlEncode(sign.sign(privateKey))}`;
}

function makeToken(sub = 'user-1', roles = ['user']) {
  const now = Math.floor(Date.now() / 1000);
  return createJwt({ sub, exp: now + 3600, iat: now, realm_access: { roles } });
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
        find() {
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

// ── Stateful Neo4j mock (captures Habit nodes) ────────────────────────────────

function createNeo4jMock() {
  const habitNodes = [];
  async function neo4jRun(cypher, params = {}) {
    if (cypher.includes('CREATE (h:Habit')) {
      habitNodes.push({ ...params });
    }
    return [];
  }
  return { neo4jRun, getHabits: () => habitNodes };
}

// ── Constants ─────────────────────────────────────────────────────────────────

const API_SERVICE_URL = 'http://mock-api-service:8000';
const LIBRE_TRANSLATE_URL = 'http://mock-libretranslate:5000/translate';

// Known literal (bad) translation that LibreTranslate returns
const LITERAL_TRANSLATION = 'I go every morning running.';
// Refined translation that the LLM produces
const REFINED_TRANSLATION = 'Every morning I go for a run to start my day.';
// Refined German translation that the LLM produces (target = de)
const REFINED_TRANSLATION_DE =
  'Jeden Morgen gehe ich laufen, um den Tag zu beginnen.';

// ── Test server setup ─────────────────────────────────────────────────────────

let server;
let baseUrl;
let mockDb;
let neo4jMock;
let originalFetch;

before(async () => {
  mockDb = createMockDb();
  neo4jMock = createNeo4jMock();

  originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    const urlStr = typeof url === 'string' ? url : url.toString();

    if (urlStr.includes('/jwks')) {
      return { ok: true, json: async () => mockJwks };
    }

    // LibreTranslate mock
    if (urlStr.includes('mock-libretranslate')) {
      return {
        ok: true,
        json: async () => ({ translatedText: LITERAL_TRANSLATION }),
      };
    }

    // API-service mocks
    if (urlStr.includes('mock-api-service')) {
      if (urlStr.includes('/api/v1/llm/classify-habit')) {
        return {
          ok: true,
          json: async () => ({
            uuid: 'test-uuid',
            sentence: JSON.parse(options?.body || '{}').sentence,
            language: JSON.parse(options?.body || '{}').language,
            is_habit: true,
            confidence: 0.92,
          }),
        };
      }
      if (urlStr.includes('/api/v1/llm/classify-context')) {
        return {
          ok: true,
          json: async () => ({
            uuid: 'test-uuid',
            sentence: JSON.parse(options?.body || '{}').sentence,
            language: JSON.parse(options?.body || '{}').language,
            TIME: [],
            PHYSICAL_SETTING: [],
            PRIOR_BEHAVIOR: [],
            OTHER_PEOPLE: [],
            INTERNAL_STATE: [],
            BEHAVIOR: ['running'],
            REASONING: [],
          }),
        };
      }
      if (urlStr.includes('/api/v1/llm/map-bcio')) {
        return { ok: true, json: async () => ({ mappings: [] }) };
      }
      if (urlStr.includes('/api/v1/llm/refine-translation-lang')) {
        const body = JSON.parse(options?.body || '{}');
        const refinedByTarget = {
          en: REFINED_TRANSLATION,
          de: REFINED_TRANSLATION_DE,
        };
        return {
          ok: true,
          json: async () => ({
            refined_translation:
              refinedByTarget[body.target_language] ?? body.raw_translation,
          }),
        };
      }
      return {
        ok: false,
        status: 404,
        json: async () => ({ error: 'Not found' }),
      };
    }

    // Pass through local server calls
    return originalFetch(url, options);
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
    libreTranslateUrl: LIBRE_TRANSLATE_URL,
  });
  testApp.use('/api/v1', apiRouter);

  server = createServer(testApp);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  // Warm up JWKS cache
  await fetch(`${baseUrl}/api/v1/health`);
});

after(() => {
  global.fetch = originalFetch;
  server.close();
});

// ── Helper ────────────────────────────────────────────────────────────────────

async function post(path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

// ── Tests ──────────────────────────────────────────────────────────────────────

test('German habit donation stores refined translationEN on Neo4j node', async () => {
  const before = neo4jMock.getHabits().length;

  const res = await post(
    '/api/v1/habits/donate',
    { sentence: 'Ich gehe jeden Morgen laufen.', language: 'de' },
    makeToken('user-de-1')
  );

  assert.strictEqual(res.status, 201);
  const body = await res.json();
  assert.strictEqual(body.is_habit, true);

  const after = neo4jMock.getHabits().length;
  assert.ok(after > before, 'A new Habit node should be created');

  const habit = neo4jMock.getHabits().at(-1);
  assert.ok(
    habit.translationEN,
    'translationEN should be set on the habit node'
  );
  // Must be the LLM-refined version, not the bad literal translation
  assert.strictEqual(
    habit.translationEN,
    REFINED_TRANSLATION,
    'translationEN should be the LLM-refined translation'
  );
  assert.notStrictEqual(
    habit.translationEN,
    LITERAL_TRANSLATION,
    'translationEN must not be the raw literal LibreTranslate output'
  );
});

test('English habit donation stores translationEN: null (no translation needed)', async () => {
  const before = neo4jMock.getHabits().length;

  const res = await post(
    '/api/v1/habits/donate',
    { sentence: 'I go for a run every morning.', language: 'en' },
    makeToken('user-en-1')
  );

  assert.strictEqual(res.status, 201);

  const after = neo4jMock.getHabits().length;
  assert.ok(after > before);

  const habit = neo4jMock.getHabits().at(-1);
  assert.strictEqual(
    habit.translationEN,
    null,
    'English habits should have translationEN: null'
  );
  assert.strictEqual(
    habit.translationDE,
    REFINED_TRANSLATION_DE,
    'English habits should still get a refined German translation'
  );
});

test('Japanese habit donation produces both EN and DE translations', async () => {
  const before = neo4jMock.getHabits().length;

  const res = await post(
    '/api/v1/habits/donate',
    { sentence: '毎朝ランニングに行きます。', language: 'ja' },
    makeToken('user-ja-1')
  );

  assert.strictEqual(res.status, 201);
  const body = await res.json();
  assert.strictEqual(body.is_habit, true);

  const after = neo4jMock.getHabits().length;
  assert.ok(after > before, 'A new Habit node should be created');

  const habit = neo4jMock.getHabits().at(-1);
  assert.strictEqual(habit.language, 'ja');
  assert.strictEqual(
    habit.translationEN,
    REFINED_TRANSLATION,
    'Japanese habits should get a refined English translation'
  );
  assert.strictEqual(
    habit.translationDE,
    REFINED_TRANSLATION_DE,
    'Japanese habits should also get a refined German translation'
  );
});

test('French habit donation produces both EN and DE translations', async () => {
  const before = neo4jMock.getHabits().length;

  const res = await post(
    '/api/v1/habits/donate',
    { sentence: 'Je cours tous les matins.', language: 'fr' },
    makeToken('user-fr-1')
  );

  assert.strictEqual(res.status, 201);
  const body = await res.json();
  assert.strictEqual(body.is_habit, true);

  const after = neo4jMock.getHabits().length;
  assert.ok(after > before, 'A new Habit node should be created');

  const habit = neo4jMock.getHabits().at(-1);
  assert.strictEqual(habit.language, 'fr');
  assert.strictEqual(
    habit.translationEN,
    REFINED_TRANSLATION,
    'French habits should get a refined English translation'
  );
  assert.strictEqual(
    habit.translationDE,
    REFINED_TRANSLATION_DE,
    'French habits should also get a refined German translation'
  );
});

test('Dutch habit donation produces both EN and DE translations', async () => {
  const before = neo4jMock.getHabits().length;

  const res = await post(
    '/api/v1/habits/donate',
    { sentence: 'Ik ga elke ochtend hardlopen.', language: 'nl' },
    makeToken('user-nl-1')
  );

  assert.strictEqual(res.status, 201);
  const body = await res.json();
  assert.strictEqual(body.is_habit, true);

  const after = neo4jMock.getHabits().length;
  assert.ok(after > before, 'A new Habit node should be created');

  const habit = neo4jMock.getHabits().at(-1);
  assert.strictEqual(habit.language, 'nl');
  assert.strictEqual(
    habit.translationEN,
    REFINED_TRANSLATION,
    'Dutch habits should get a refined English translation'
  );
  assert.strictEqual(
    habit.translationDE,
    REFINED_TRANSLATION_DE,
    'Dutch habits should also get a refined German translation'
  );
});

test('German habit donation uses raw LibreTranslate output when LLM refine step fails', async () => {
  // Override fetch temporarily to make refine-translation fail
  const savedFetch = global.fetch;
  global.fetch = async (url, options) => {
    const urlStr = typeof url === 'string' ? url : url.toString();

    if (urlStr.includes('/jwks'))
      return { ok: true, json: async () => mockJwks };

    if (urlStr.includes('mock-libretranslate')) {
      return {
        ok: true,
        json: async () => ({ translatedText: LITERAL_TRANSLATION }),
      };
    }

    if (urlStr.includes('mock-api-service')) {
      if (urlStr.includes('/api/v1/llm/classify-habit')) {
        return {
          ok: true,
          json: async () => ({
            uuid: 'test-uuid',
            sentence: JSON.parse(options?.body || '{}').sentence,
            language: 'de',
            is_habit: true,
            confidence: 0.9,
          }),
        };
      }
      if (urlStr.includes('/api/v1/llm/classify-context')) {
        return {
          ok: true,
          json: async () => ({
            uuid: 'test-uuid',
            sentence: JSON.parse(options?.body || '{}').sentence,
            language: 'de',
            TIME: [],
            PHYSICAL_SETTING: [],
            PRIOR_BEHAVIOR: [],
            OTHER_PEOPLE: [],
            INTERNAL_STATE: [],
            BEHAVIOR: ['running'],
            REASONING: [],
          }),
        };
      }
      if (urlStr.includes('/api/v1/llm/map-bcio')) {
        return { ok: true, json: async () => ({ mappings: [] }) };
      }
      if (urlStr.includes('/api/v1/llm/refine-translation-lang')) {
        // Simulate LLM failure
        return {
          ok: false,
          status: 503,
          json: async () => ({ error: 'Service unavailable' }),
        };
      }
    }

    return originalFetch(url, options);
  };

  try {
    const before = neo4jMock.getHabits().length;

    const res = await post(
      '/api/v1/habits/donate',
      { sentence: 'Ich schlafe jeden Abend früh.', language: 'de' },
      makeToken('user-de-2')
    );

    assert.strictEqual(res.status, 201);

    const after = neo4jMock.getHabits().length;
    assert.ok(after > before);

    const habit = neo4jMock.getHabits().at(-1);
    assert.strictEqual(
      habit.translationEN,
      LITERAL_TRANSLATION,
      'When LLM fails, raw LibreTranslate output should be stored as translationEN'
    );
  } finally {
    global.fetch = savedFetch;
  }
});

test('German habit donation falls back to LLM-only translation when LibreTranslate itself fails', async () => {
  const savedFetch = global.fetch;
  const LLM_ONLY_TRANSLATION = 'I sleep early every evening.';

  global.fetch = async (url, options) => {
    const urlStr = typeof url === 'string' ? url : url.toString();

    if (urlStr.includes('/jwks'))
      return { ok: true, json: async () => mockJwks };

    // LibreTranslate itself is down.
    if (urlStr.includes('mock-libretranslate')) {
      return {
        ok: false,
        status: 503,
        json: async () => ({ error: 'Service unavailable' }),
      };
    }

    if (urlStr.includes('mock-api-service')) {
      if (urlStr.includes('/api/v1/llm/classify-habit')) {
        return {
          ok: true,
          json: async () => ({
            uuid: 'test-uuid',
            sentence: JSON.parse(options?.body || '{}').sentence,
            language: 'de',
            is_habit: true,
            confidence: 0.9,
          }),
        };
      }
      if (urlStr.includes('/api/v1/llm/classify-context')) {
        return {
          ok: true,
          json: async () => ({
            TIME: [],
            PHYSICAL_SETTING: [],
            PRIOR_BEHAVIOR: [],
            OTHER_PEOPLE: [],
            INTERNAL_STATE: [],
            BEHAVIOR: ['running'],
            REASONING: [],
          }),
        };
      }
      if (urlStr.includes('/api/v1/llm/map-bcio')) {
        return { ok: true, json: async () => ({ mappings: [] }) };
      }
      if (urlStr.includes('/api/v1/llm/translate-lang')) {
        const body = JSON.parse(options?.body || '{}');
        return {
          ok: true,
          json: async () => ({
            translation:
              body.target_language === 'en' ? LLM_ONLY_TRANSLATION : 'x',
          }),
        };
      }
    }

    return originalFetch(url, options);
  };

  try {
    const before = neo4jMock.getHabits().length;

    const res = await post(
      '/api/v1/habits/donate',
      { sentence: 'Ich schlafe jeden Abend früh.', language: 'de' },
      makeToken('user-de-3')
    );

    assert.strictEqual(res.status, 201);

    const after = neo4jMock.getHabits().length;
    assert.ok(after > before);

    const habit = neo4jMock.getHabits().at(-1);
    assert.strictEqual(
      habit.translationEN,
      LLM_ONLY_TRANSLATION,
      'When LibreTranslate itself fails, the LLM-only translation should be used instead of skipping translationEN'
    );
  } finally {
    global.fetch = savedFetch;
  }
});
