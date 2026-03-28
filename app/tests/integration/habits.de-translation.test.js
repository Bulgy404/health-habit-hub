/**
 * Integration tests for US-115: German translation for English-donated habits.
 *
 * Mocks LibreTranslate and the LLM refine-translation-de endpoint to verify:
 *   1. translationDE is stored on the Neo4j habit node for English habits
 *   2. The stored value is the LLM-refined German text
 *   3. When the LLM step fails, raw LibreTranslate output is used as fallback
 *   4. Non-English habits produce translationDE: null
 *   5. The original English sentence is preserved as `sentence` on the node
 */

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
pubKeyJwk.kid = 'de-translation-key-1';
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
  const header = { alg: 'RS256', kid: 'de-translation-key-1', typ: 'JWT' };
  const h = base64urlEncode(Buffer.from(JSON.stringify(header)));
  const p = base64urlEncode(Buffer.from(JSON.stringify(payload)));
  const signingInput = `${h}.${p}`;
  const sign = createSign('RSA-SHA256');
  sign.update(signingInput);
  return `${signingInput}.${base64urlEncode(sign.sign(privateKey))}`;
}

function makeToken(sub = 'user-1', roles = ['participant']) {
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

const API_SERVICE_URL = 'http://mock-api-service-de:8000';
const LIBRE_TRANSLATE_URL = 'http://mock-libretranslate-de:5000/translate';

const ENGLISH_SENTENCE = 'I go for a run every morning.';
const LITERAL_DE_TRANSLATION = 'Ich gehe jeden Morgen laufen.';
const REFINED_DE_TRANSLATION = 'Jeden Morgen gehe ich laufen.';

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

    // LibreTranslate mock (EN→DE)
    if (urlStr.includes('mock-libretranslate-de')) {
      return {
        ok: true,
        json: async () => ({ translatedText: LITERAL_DE_TRANSLATION }),
      };
    }

    // API-service mocks
    if (urlStr.includes('mock-api-service-de')) {
      if (urlStr.includes('/api/v1/llm/classify-habit')) {
        return {
          ok: true,
          json: async () => ({
            uuid: 'test-uuid-de',
            sentence: JSON.parse(options?.body || '{}').sentence,
            language: JSON.parse(options?.body || '{}').language,
            is_habit: true,
            confidence: 0.95,
          }),
        };
      }
      if (urlStr.includes('/api/v1/llm/classify-context')) {
        return {
          ok: true,
          json: async () => ({
            TIME: ['every morning'],
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
      if (urlStr.includes('/api/v1/llm/refine-translation-de')) {
        return {
          ok: true,
          json: async () => ({ refined_translation: REFINED_DE_TRANSLATION }),
        };
      }
      // refine-translation (EN endpoint) — not called for English habits
      if (urlStr.includes('/api/v1/llm/refine-translation')) {
        return { ok: true, json: async () => ({ refined_translation: '' }) };
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
  const v1Router = createV1Router({
    jwksUrl: 'http://keycloak/jwks',
    expectedIssuer: null,
    expectedAudience: null,
    serviceChecks: { neo4jCheck: okCheck, mongoCheck: okCheck },
    db: mockDb,
    neo4jRun: neo4jMock.neo4jRun,
    apiServiceUrl: API_SERVICE_URL,
    libreTranslateUrl: LIBRE_TRANSLATE_URL,
  });
  testApp.use('/api/v1', v1Router);

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

// ── Tests ─────────────────────────────────────────────────────────────────────

test('English habit donation stores original sentence and refined translationDE on Neo4j node', async () => {
  const before = neo4jMock.getHabits().length;

  const res = await post(
    '/api/v1/habits/donate',
    { sentence: ENGLISH_SENTENCE, language: 'en' },
    makeToken('user-en-de-1')
  );

  assert.strictEqual(res.status, 201);
  const body = await res.json();
  assert.strictEqual(body.is_habit, true);

  const after = neo4jMock.getHabits().length;
  assert.ok(after > before, 'A new Habit node should be created');

  const habit = neo4jMock.getHabits().at(-1);

  // Original English sentence preserved
  assert.strictEqual(
    habit.sentence,
    ENGLISH_SENTENCE,
    'Original English sentence should be stored on the habit node'
  );

  // translationEN should be null for English habits
  assert.strictEqual(
    habit.translationEN,
    null,
    'English habits should have translationEN: null'
  );

  // translationDE should be the LLM-refined German translation
  assert.ok(
    habit.translationDE,
    'translationDE should be set on the habit node'
  );
  assert.strictEqual(
    habit.translationDE,
    REFINED_DE_TRANSLATION,
    'translationDE should be the LLM-refined German translation'
  );
  assert.notStrictEqual(
    habit.translationDE,
    LITERAL_DE_TRANSLATION,
    'translationDE must not be the raw literal LibreTranslate output'
  );
});

test('Non-English habit donation stores translationDE: null', async () => {
  const before = neo4jMock.getHabits().length;

  const res = await post(
    '/api/v1/habits/donate',
    { sentence: 'Ich gehe jeden Morgen laufen.', language: 'de' },
    makeToken('user-de-no-translation-1')
  );

  assert.strictEqual(res.status, 201);

  const after = neo4jMock.getHabits().length;
  assert.ok(after > before);

  const habit = neo4jMock.getHabits().at(-1);
  assert.strictEqual(
    habit.translationDE,
    null,
    'Non-English habits should have translationDE: null'
  );
});

test('English habit donation uses raw LibreTranslate output when LLM refine-de step fails', async () => {
  const savedFetch = global.fetch;
  global.fetch = async (url, options) => {
    const urlStr = typeof url === 'string' ? url : url.toString();

    if (urlStr.includes('/jwks'))
      return { ok: true, json: async () => mockJwks };

    if (urlStr.includes('mock-libretranslate-de')) {
      return {
        ok: true,
        json: async () => ({ translatedText: LITERAL_DE_TRANSLATION }),
      };
    }

    if (urlStr.includes('mock-api-service-de')) {
      if (urlStr.includes('/api/v1/llm/classify-habit')) {
        return {
          ok: true,
          json: async () => ({
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
      if (urlStr.includes('/api/v1/llm/refine-translation-de')) {
        // Simulate LLM failure
        return {
          ok: false,
          status: 503,
          json: async () => ({ error: 'Service unavailable' }),
        };
      }
      if (urlStr.includes('/api/v1/llm/refine-translation')) {
        return { ok: true, json: async () => ({ refined_translation: '' }) };
      }
    }

    return originalFetch(url, options);
  };

  try {
    const before = neo4jMock.getHabits().length;

    const res = await post(
      '/api/v1/habits/donate',
      { sentence: 'I meditate every evening before bed.', language: 'en' },
      makeToken('user-en-de-2')
    );

    assert.strictEqual(res.status, 201);

    const after = neo4jMock.getHabits().length;
    assert.ok(after > before);

    const habit = neo4jMock.getHabits().at(-1);
    assert.strictEqual(
      habit.translationDE,
      LITERAL_DE_TRANSLATION,
      'When LLM fails, raw LibreTranslate output should be stored as translationDE'
    );
  } finally {
    global.fetch = savedFetch;
  }
});
