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
pubKeyJwk.kid = 'q-key-1';
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
  const header = { alg: 'RS256', kid: 'q-key-1', typ: 'JWT' };
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

const SLIQ = {
  slug: 'sliq',
  title: {
    en: 'Short Lifestyle Indicator Questionnaire (SLIQ)',
    de: 'Kurzer Lebensstil-Indikator (SLIQ)',
  },
  description: { en: 'A validated 4-item instrument.' },
  version: '1.0.0',
  languages: ['en', 'de'],
  active: true,
  questions: [
    {
      id: 'sliq_diet',
      text: {
        en: 'How would you rate your overall diet?',
        de: 'Wie bewerten Sie Ihre Ernährung?',
      },
      type: 'single_choice',
      options: [
        { value: '0', label: { en: 'Very unhealthy', de: 'Sehr ungesund' } },
        { value: '3', label: { en: 'Very healthy', de: 'Sehr gesund' } },
      ],
      required: true,
    },
    {
      id: 'sliq_physical_activity',
      text: { en: 'How much physical activity?' },
      type: 'single_choice',
      options: [{ value: '0', label: { en: 'None' } }],
      required: true,
    },
    {
      id: 'sliq_smoking',
      text: { en: 'Smoking status?' },
      type: 'single_choice',
      options: [{ value: '3', label: { en: 'Never smoked' } }],
      required: true,
    },
    {
      id: 'sliq_alcohol',
      text: { en: 'Alcohol per week?' },
      type: 'single_choice',
      options: [{ value: '3', label: { en: 'Do not drink' } }],
      required: true,
    },
  ],
};

const RAND36 = {
  slug: 'rand-36',
  title: { en: 'RAND 36-Item Health Survey' },
  description: { en: 'A 36-item health survey.' },
  version: '1.0.0',
  languages: ['en'],
  active: true,
  questions: Array.from({ length: 36 }, (_, i) => ({
    id: `rand36_q${i + 1}`,
    text: { en: `Question ${i + 1}` },
    type: 'single_choice',
    options: [{ value: '1', label: { en: 'Excellent' } }],
    required: true,
  })),
};

const INACTIVE = {
  slug: 'inactive-q',
  title: { en: 'Inactive Questionnaire' },
  description: { en: 'Should not be returned.' },
  version: '1.0.0',
  languages: ['en'],
  active: false,
  questions: [],
};

function createMockDb() {
  const store = [SLIQ, RAND36, INACTIVE];
  return {
    collection(name) {
      if (name !== 'questionnaires') {
        return {
          find: () => ({ toArray: async () => [] }),
          findOne: async () => null,
        };
      }
      return {
        find(query) {
          let results = [...store];
          if (query && query.active !== undefined) {
            results = results.filter((d) => d.active === query.active);
          }
          return {
            async toArray() {
              return results;
            },
          };
        },
        async findOne(query) {
          return (
            store.find(
              (d) =>
                d.slug === query.slug &&
                (query.active === undefined || d.active === query.active)
            ) || null
          );
        },
      };
    },
  };
}

// ── Test server setup ─────────────────────────────────────────────────────────

let server;
let port;
let jwksServer;
let jwksPort;
const realFetch = global.fetch;

before(async () => {
  // JWKS server
  const jwksApp = express();
  jwksApp.get('/realms/hhh/protocol/openid-connect/certs', (_req, res) =>
    res.json(mockJwks)
  );
  jwksServer = createServer(jwksApp);
  await new Promise((resolve) => jwksServer.listen(0, '127.0.0.1', resolve));
  jwksPort = jwksServer.address().port;

  const db = createMockDb();
  const app = express();
  app.use(express.json());
  app.use(
    '/api/v1',
    createApiRouter({
      jwksUrl: `http://127.0.0.1:${jwksPort}/realms/hhh/protocol/openid-connect/certs`,
      expectedIssuer: null,
      expectedAudience: null,
      db,
    })
  );

  server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = server.address().port;

  // Intercept fetch: pass through 127.0.0.1 calls, block everything else
  global.fetch = async (url, ...args) => {
    const u = typeof url === 'string' ? url : url.toString();
    if (u.includes('127.0.0.1')) return realFetch(u, ...args);
    throw new Error(`Unexpected fetch to: ${u}`);
  };
});

after(async () => {
  global.fetch = realFetch;
  await new Promise((resolve) => server.close(resolve));
  await new Promise((resolve) => jwksServer.close(resolve));
});

function get(path, token) {
  return realFetch(`http://127.0.0.1:${port}/api/v1${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test('GET /questionnaires — rejects unauthenticated requests', async () => {
  const res = await get('/questionnaires');
  assert.strictEqual(res.status, 401);
});

test('GET /questionnaires — returns active questionnaires for participant', async () => {
  const token = makeToken('user-1', ['user']);
  const res = await get('/questionnaires', token);
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.ok(Array.isArray(body));
  // Only active questionnaires returned (sliq + rand-36, not inactive-q)
  assert.strictEqual(body.length, 2);
  const slugs = body.map((q) => q.slug).sort();
  assert.deepStrictEqual(slugs, ['rand-36', 'sliq']);
});

test('GET /questionnaires — each entry has required fields', async () => {
  const token = makeToken('user-1', ['user']);
  const res = await get('/questionnaires', token);
  const body = await res.json();
  for (const q of body) {
    assert.ok(typeof q.slug === 'string', 'missing slug');
    assert.ok(typeof q.title === 'string', 'missing title');
    assert.ok(typeof q.description === 'string', 'missing description');
    assert.ok(typeof q.version === 'string', 'missing version');
    assert.ok(typeof q.questionCount === 'number', 'missing questionCount');
  }
  const sliq = body.find((q) => q.slug === 'sliq');
  assert.strictEqual(sliq.questionCount, 4);
  assert.strictEqual(sliq.title, SLIQ.title.en);
  const rand36 = body.find((q) => q.slug === 'rand-36');
  assert.strictEqual(rand36.questionCount, 36);
});

test('GET /questionnaires?lang=de — resolves to the German translation when available', async () => {
  const token = makeToken('user-1', ['user']);
  const res = await get('/questionnaires?lang=de', token);
  const body = await res.json();
  const sliq = body.find((q) => q.slug === 'sliq');
  assert.strictEqual(sliq.title, SLIQ.title.de);
  // rand-36 has no German translation — falls back to English.
  const rand36 = body.find((q) => q.slug === 'rand-36');
  assert.strictEqual(rand36.title, RAND36.title.en);
});

test('GET /questionnaires/:slug — returns full definition for sliq', async () => {
  const token = makeToken('user-1', ['user']);
  const res = await get('/questionnaires/sliq', token);
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.strictEqual(body.slug, 'sliq');
  assert.ok(Array.isArray(body.questions));
  assert.strictEqual(body.questions.length, 4);
  // Verify question structure and content resolves to the default (English).
  const q = body.questions[0];
  assert.ok(typeof q.id === 'string');
  assert.strictEqual(q.text, SLIQ.questions[0].text.en);
  assert.ok(typeof q.type === 'string');
  assert.ok(Array.isArray(q.options));
  assert.strictEqual(q.options[0].label, SLIQ.questions[0].options[0].label.en);
  assert.ok(typeof q.required === 'boolean');
});

test('GET /questionnaires/:slug?lang=de — resolves question text and option labels to German', async () => {
  const token = makeToken('user-1', ['user']);
  const res = await get('/questionnaires/sliq?lang=de', token);
  const body = await res.json();
  assert.strictEqual(body.title, SLIQ.title.de);
  const q = body.questions[0];
  assert.strictEqual(q.text, SLIQ.questions[0].text.de);
  assert.strictEqual(q.options[0].label, SLIQ.questions[0].options[0].label.de);
});

test('GET /questionnaires/:slug?lang=ja — falls back to English when Japanese is unavailable', async () => {
  const token = makeToken('user-1', ['user']);
  const res = await get('/questionnaires/sliq?lang=ja', token);
  const body = await res.json();
  assert.strictEqual(body.title, SLIQ.title.en);
});

test('GET /questionnaires/:slug — returns 36 questions for rand-36', async () => {
  const token = makeToken('user-1', ['user']);
  const res = await get('/questionnaires/rand-36', token);
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.strictEqual(body.slug, 'rand-36');
  assert.strictEqual(body.questions.length, 36);
});

test('GET /questionnaires/:slug — returns 404 for unknown slug', async () => {
  const token = makeToken('user-1', ['user']);
  const res = await get('/questionnaires/nonexistent', token);
  assert.strictEqual(res.status, 404);
  const body = await res.json();
  assert.ok(body.error);
});

test('GET /questionnaires/:slug — returns 404 for inactive questionnaire', async () => {
  const token = makeToken('user-1', ['user']);
  const res = await get('/questionnaires/inactive-q', token);
  assert.strictEqual(res.status, 404);
});

test('GET /questionnaires — rejects user without valid role', async () => {
  // A token with no recognized roles
  const token = makeToken('user-99', []);
  const res = await get('/questionnaires', token);
  assert.strictEqual(res.status, 403);
});
