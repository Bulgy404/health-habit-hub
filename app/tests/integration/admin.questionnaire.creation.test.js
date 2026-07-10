// Covers creation of every questionnaire question type ('text', 'single_choice',
// 'multi_choice', 'scale') in every supported content language ('en', 'de',
// 'fr', 'ja', 'nl'), plus a regression test for the bug where an empty
// `description: {}` (the admin UI's default when no description is entered)
// was rejected by the backend even though description is meant to be optional.
import { test, before, after } from 'node:test';
import assert from 'node:assert';
import { createServer } from 'node:http';
import { generateKeyPairSync, createSign } from 'node:crypto';
import { ObjectId } from 'mongodb';
import express from 'express';
import { createApiRouter } from '../../routes/apiRouter.js';
import { SUPPORTED_LANGS } from '../../utils/localeText.js';

// ── Key material ─────────────────────────────────────────────────────────────

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
});
const pubKeyJwk = publicKey.export({ format: 'jwk' });
pubKeyJwk.kid = 'qc-key-1';
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
  const header = { alg: 'RS256', kid: 'qc-key-1', typ: 'JWT' };
  const h = base64urlEncode(Buffer.from(JSON.stringify(header)));
  const p = base64urlEncode(Buffer.from(JSON.stringify(payload)));
  const signingInput = `${h}.${p}`;
  const sign = createSign('RSA-SHA256');
  sign.update(signingInput);
  return `${signingInput}.${base64urlEncode(sign.sign(privateKey))}`;
}

function makeToken(roles = ['admin'], sub = 'user-qc') {
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
  const stores = {};

  function getStore(name) {
    if (!stores[name]) stores[name] = [];
    return stores[name];
  }

  function matchesFilter(doc, filter) {
    for (const [key, val] of Object.entries(filter)) {
      if (key === '$in') continue;
      if (typeof val === 'object' && val !== null) {
        if ('$in' in val) {
          const list = val.$in.map((v) => v.toString());
          if (!list.includes(doc[key]?.toString())) return false;
          continue;
        }
      }
      const docVal = doc[key];
      const filterVal = val;
      if (docVal?.toString() !== filterVal?.toString()) return false;
    }
    return true;
  }

  return {
    _seed(colName, docs) {
      const store = getStore(colName);
      for (const doc of docs) store.push({ ...doc });
    },
    collection(name) {
      const store = getStore(name);
      return {
        find(query = {}) {
          const results = store.filter((doc) => matchesFilter(doc, query));
          return {
            async toArray() {
              return results.map((d) => ({ ...d }));
            },
          };
        },
        async findOne(query = {}) {
          const found = store.find((doc) => matchesFilter(doc, query));
          return found ? { ...found } : null;
        },
        async insertOne(doc) {
          const id = doc._id || new ObjectId();
          const stored = { ...doc, _id: id };
          store.push(stored);
          return { insertedId: id };
        },
        async updateOne(filter, update) {
          const idx = store.findIndex((doc) => matchesFilter(doc, filter));
          if (idx === -1) return { matchedCount: 0, modifiedCount: 0 };
          if (update.$set) Object.assign(store[idx], update.$set);
          return { matchedCount: 1, modifiedCount: 1 };
        },
        async deleteOne(filter) {
          const idx = store.findIndex((doc) => matchesFilter(doc, filter));
          if (idx === -1) return { deletedCount: 0 };
          store.splice(idx, 1);
          return { deletedCount: 1 };
        },
        async countDocuments(filter = {}) {
          return store.filter((doc) => matchesFilter(doc, filter)).length;
        },
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

  // Wait for admin router to seed defaults.
  await new Promise((resolve) => setTimeout(resolve, 50));
});

after(() => {
  server.close();
});

// ── HTTP helpers ──────────────────────────────────────────────────────────────

async function post(path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

async function get(path, token) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  return fetch(`${baseUrl}${path}`, { headers });
}

// ── Fixture builders ────────────────────────────────────────────────────────

const QUESTION_TYPES = ['text', 'single_choice', 'multi_choice', 'scale'];
const HAS_OPTIONS = new Set(['single_choice', 'multi_choice']);

/** Locale-text map with the same placeholder string in every one of `langs`. */
function localeTextFor(langs, label) {
  const map = {};
  for (const lang of langs) map[lang] = `${label} (${lang})`;
  return map;
}

function buildQuestion(type, langs) {
  const question = {
    id: `q-${type}`,
    type,
    text: localeTextFor(langs, `${type} question`),
    required: false,
    options: [],
  };
  if (HAS_OPTIONS.has(type)) {
    question.options = [
      { value: '0', label: localeTextFor(langs, 'Option A') },
      { value: '1', label: localeTextFor(langs, 'Option B') },
    ];
  }
  return question;
}

// ── Tests: every question type × every supported language ─────────────────────

for (const lang of SUPPORTED_LANGS) {
  for (const type of QUESTION_TYPES) {
    test(`POST /api/v1/admin/questionnaires - creates a '${type}' question in '${lang}'`, async () => {
      const token = makeToken(['admin']);
      const payload = {
        title: localeTextFor([lang], 'Single-lang questionnaire'),
        description: localeTextFor([lang], 'Description'),
        languages: [lang],
        questions: [buildQuestion(type, [lang])],
      };
      const res = await post('/api/v1/admin/questionnaires', payload, token);
      const created = await res.json();
      assert.strictEqual(res.status, 201, `expected 201, got ${res.status}: ${JSON.stringify(created)}`);
      const { id } = created;

      const detailRes = await get(`/api/v1/admin/questionnaires/${id}`, token);
      assert.strictEqual(detailRes.status, 200);
      const detail = await detailRes.json();
      assert.strictEqual(detail.questions.length, 1);
      assert.strictEqual(detail.questions[0].type, type);
      assert.strictEqual(detail.questions[0].text[lang], `${type} question (${lang})`);
      if (HAS_OPTIONS.has(type)) {
        assert.strictEqual(detail.questions[0].options.length, 2);
        assert.strictEqual(detail.questions[0].options[0].label[lang], `Option A (${lang})`);
      }
    });
  }
}

// ── Test: all question types together, in all languages at once ──────────────

test('POST /api/v1/admin/questionnaires - creates one questionnaire with every question type, in every language', async () => {
  const token = makeToken(['admin']);
  const payload = {
    title: localeTextFor(SUPPORTED_LANGS, 'Full-matrix questionnaire'),
    description: localeTextFor(SUPPORTED_LANGS, 'Full-matrix description'),
    languages: [...SUPPORTED_LANGS],
    questions: QUESTION_TYPES.map((type) => buildQuestion(type, SUPPORTED_LANGS)),
  };
  const res = await post('/api/v1/admin/questionnaires', payload, token);
  const created = await res.json();
  assert.strictEqual(res.status, 201, `expected 201, got ${res.status}: ${JSON.stringify(created)}`);
  const { id } = created;

  const detailRes = await get(`/api/v1/admin/questionnaires/${id}`, token);
  const detail = await detailRes.json();
  assert.strictEqual(detail.questions.length, QUESTION_TYPES.length);
  for (const lang of SUPPORTED_LANGS) {
    assert.strictEqual(detail.title[lang], `Full-matrix questionnaire (${lang})`);
  }
});

// ── Regression: empty description must not be rejected ────────────────────────

test('POST /api/v1/admin/questionnaires - 201 with an explicitly empty description ({})', async () => {
  // This is what the admin UI always sends when the description field is left
  // blank (only the title is required client-side). The backend previously
  // rejected this because `.optional()` on a locale-text schema only allows
  // *omitting* the key, not sending an empty object — the inner "must have
  // non-empty text" refine still ran and failed.
  const token = makeToken(['admin']);
  const res = await post(
    '/api/v1/admin/questionnaires',
    {
      title: { en: 'No description here' },
      description: {},
      languages: ['en'],
      questions: [],
    },
    token
  );
  const created = await res.json();
  assert.strictEqual(res.status, 201, `expected 201, got ${res.status}: ${JSON.stringify(created)}`);
});

test('POST /api/v1/admin/questionnaires - description can be omitted entirely', async () => {
  const token = makeToken(['admin']);
  const res = await post(
    '/api/v1/admin/questionnaires',
    { title: { en: 'No description key' }, languages: ['en'], questions: [] },
    token
  );
  assert.strictEqual(res.status, 201);
});

// ── Regression: a question with no text in any selected language is rejected ──

test('POST /api/v1/admin/questionnaires - 400 when a question has no text in any language', async () => {
  const token = makeToken(['admin']);
  const res = await post(
    '/api/v1/admin/questionnaires',
    {
      title: { en: 'Has an empty question' },
      languages: ['en'],
      questions: [{ id: 'q1', type: 'text', text: {}, required: false, options: [] }],
    },
    token
  );
  assert.strictEqual(res.status, 400);
  const body = await res.json();
  assert.ok(
    body.details?.some((d) => d.path === 'questions.0.text'),
    `expected a details entry for questions.0.text, got ${JSON.stringify(body.details)}`
  );
});
