import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { generateKeyPairSync, createSign } from 'node:crypto';
import express from 'express';
import { createApiRouter } from '../../routes/apiRouter.js';
import { seedDefaultProfileFields } from '../../db/seedProfileFields.js';

// ── Key material ────────────────────────────────────────────────────────────

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
});
const pubKeyJwk = publicKey.export({ format: 'jwk' });
pubKeyJwk.kid = 'pfd-key-1';
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
  const header = { alg: 'RS256', kid: 'pfd-key-1', typ: 'JWT' };
  const h = base64urlEncode(Buffer.from(JSON.stringify(header)));
  const p = base64urlEncode(Buffer.from(JSON.stringify(payload)));
  const sigInput = `${h}.${p}`;
  const sign = createSign('RSA-SHA256');
  sign.update(sigInput);
  return `${sigInput}.${base64urlEncode(sign.sign(privateKey))}`;
}

function makeToken(sub = 'user-1', roles = ['admin']) {
  const now = Math.floor(Date.now() / 1000);
  return createJwt({ sub, exp: now + 3600, iat: now, realm_access: { roles } });
}

// ── Mock MongoDB ─────────────────────────────────────────────────────────────

function createMockDb() {
  const store = {};
  function getCol(name) {
    if (!store[name]) store[name] = [];
    return store[name];
  }
  return {
    collection(name) {
      const col = getCol(name);
      return {
        find(query = {}) {
          let results = [...col];
          for (const [k, v] of Object.entries(query)) {
            results = results.filter((d) => d[k] === v);
          }
          return {
            async toArray() {
              return results;
            },
          };
        },
        async findOne(query) {
          for (const [k, v] of Object.entries(query)) {
            const found = col.find((d) => d[k] === v);
            if (found) return found;
          }
          return null;
        },
        async insertOne(doc) {
          col.push({ ...doc, _id: String(Math.random()) });
        },
        async findOneAndUpdate(filter, update, opts) {
          const idx = col.findIndex((d) =>
            Object.entries(filter).every(([k, v]) => d[k] === v)
          );
          if (idx < 0) return null;
          col[idx] = { ...col[idx], ...update.$set };
          return opts?.returnDocument === 'after' ? { ...col[idx] } : col[idx];
        },
        async deleteOne(filter) {
          const idx = col.findIndex((d) =>
            Object.entries(filter).every(([k, v]) => d[k] === v)
          );
          if (idx < 0) return { deletedCount: 0 };
          col.splice(idx, 1);
          return { deletedCount: 1 };
        },
        async updateOne(filter, update, opts) {
          const idx = col.findIndex((d) =>
            Object.entries(filter).every(([k, v]) => d[k] === v)
          );
          if (idx >= 0) {
            col[idx] = { ...col[idx], ...update.$set };
          } else if (opts?.upsert) {
            col.push({ ...update.$set, _id: String(Math.random()) });
          }
        },
        async createIndex() {},
      };
    },
  };
}

// ── Test server setup ────────────────────────────────────────────────────────

let server;
let baseUrl;
let db;
const realFetch = global.fetch;

before(async () => {
  db = createMockDb();
  const app = express();
  app.use(express.json());
  const v1 = createApiRouter({
    jwksUrl: 'http://mock-keycloak/jwks',
    expectedIssuer: null,
    expectedAudience: null,
    db,
    neo4jRun: async () => [],
  });
  app.use('/api/v1', v1);

  server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  global.fetch = async (url, opts) => {
    const u = typeof url === 'string' ? url : url.toString();
    if (u.includes('mock-keycloak'))
      return { ok: true, json: async () => mockJwks };
    return realFetch(u, opts);
  };
  // No JWKS warm-up call here on purpose: the router fetches JWKS lazily on the
  // first authenticated request (served instantly by the mock above). Hitting
  // /health instead would trigger checkAllServices() — real neo4j/mongo/HTTP
  // probes to unreachable hosts that share the global undici dispatcher and can
  // starve its connection pool under concurrent test files, hanging the very
  // first loopback request until undici's 300s headers timeout.
});

after(() => {
  global.fetch = realFetch;
  // closeAllConnections destroys any lingering keep-alive sockets first —
  // without it, close()'s callback (and thus process exit / progression to
  // the next test file) waits forever for connections that fetch()'s
  // undici agent doesn't proactively close.
  server.closeAllConnections();
  server.close();
});

function req(method, path, { token, body } = {}) {
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';
  return fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

const ADMIN_TOKEN = makeToken('admin-1', ['admin']);
const USER_TOKEN = makeToken('user-1', ['user']);
const RESEARCHER_TOKEN = makeToken('researcher-1', ['researcher']);
const VALID_DEF = {
  fieldId: 'height',
  label: { en: 'Your height (cm)', de: 'Ihre Größe (cm)' },
  type: 'number',
  options: [],
  languages: ['en', 'de'],
  required: false,
  order: 5,
};

// ── Auth enforcement ─────────────────────────────────────────────────────────

test('GET /admin/profile-field-definitions — 401 without token', async () => {
  const res = await req('GET', '/api/v1/admin/profile-field-definitions');
  assert.strictEqual(res.status, 401);
});

test('GET /admin/profile-field-definitions — 403 for user role', async () => {
  const res = await req('GET', '/api/v1/admin/profile-field-definitions', {
    token: USER_TOKEN,
  });
  assert.strictEqual(res.status, 403);
});

test('GET /admin/profile-field-definitions — 403 for researcher role', async () => {
  const res = await req('GET', '/api/v1/admin/profile-field-definitions', {
    token: RESEARCHER_TOKEN,
  });
  assert.strictEqual(res.status, 403);
});

// ── Admin CRUD ───────────────────────────────────────────────────────────────

test('GET /admin/profile-field-definitions — 200 empty array initially', async () => {
  const res = await req('GET', '/api/v1/admin/profile-field-definitions', {
    token: ADMIN_TOKEN,
  });
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.ok(Array.isArray(body));
});

test('POST /admin/profile-field-definitions — 400 with invalid fieldId', async () => {
  const res = await req('POST', '/api/v1/admin/profile-field-definitions', {
    token: ADMIN_TOKEN,
    body: { ...VALID_DEF, fieldId: 'Invalid-ID' },
  });
  assert.strictEqual(res.status, 400);
});

test('POST /admin/profile-field-definitions — 400 with invalid type', async () => {
  const res = await req('POST', '/api/v1/admin/profile-field-definitions', {
    token: ADMIN_TOKEN,
    body: { ...VALID_DEF, type: 'boolean' },
  });
  assert.strictEqual(res.status, 400);
});

test('POST /admin/profile-field-definitions — 400 for select type without options', async () => {
  const res = await req('POST', '/api/v1/admin/profile-field-definitions', {
    token: ADMIN_TOKEN,
    body: {
      fieldId: 'mood',
      label: { en: 'Mood' },
      type: 'select',
      options: [],
      languages: ['en'],
      required: false,
      order: 1,
    },
  });
  assert.strictEqual(res.status, 400);
});

test('POST /admin/profile-field-definitions — 201 creates definition', async () => {
  const res = await req('POST', '/api/v1/admin/profile-field-definitions', {
    token: ADMIN_TOKEN,
    body: VALID_DEF,
  });
  assert.strictEqual(res.status, 201);
  const body = await res.json();
  assert.strictEqual(body.fieldId, 'height');
  assert.strictEqual(body.type, 'number');
  assert.deepStrictEqual(body.label, VALID_DEF.label);
  assert.strictEqual(body.isLibrary, false);
  assert.ok(!('_id' in body));
});

test('POST /admin/profile-field-definitions — 409 on duplicate fieldId', async () => {
  const res = await req('POST', '/api/v1/admin/profile-field-definitions', {
    token: ADMIN_TOKEN,
    body: VALID_DEF,
  });
  assert.strictEqual(res.status, 409);
});

test('PUT /admin/profile-field-definitions/:fieldId — 200 updates label', async () => {
  const res = await req(
    'PUT',
    '/api/v1/admin/profile-field-definitions/height',
    {
      token: ADMIN_TOKEN,
      body: { label: { en: 'Height in cm' } },
    }
  );
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.deepStrictEqual(body.label, { en: 'Height in cm' });
});

test('library fields (gender, age_group) are seeded with isLibrary: true', async () => {
  await seedDefaultProfileFields(db);
  const res = await req('GET', '/api/v1/admin/profile-field-definitions', {
    token: ADMIN_TOKEN,
  });
  const body = await res.json();
  const gender = body.find((d) => d.fieldId === 'gender');
  assert.ok(gender);
  assert.strictEqual(gender.isLibrary, true);
});

test('PUT /admin/profile-field-definitions/:fieldId — 403 for a library field', async () => {
  const res = await req(
    'PUT',
    '/api/v1/admin/profile-field-definitions/gender',
    {
      token: ADMIN_TOKEN,
      body: { label: { en: 'Renamed' } },
    }
  );
  assert.strictEqual(res.status, 403);
});

test('DELETE /admin/profile-field-definitions/:fieldId — 403 for a library field', async () => {
  const res = await req(
    'DELETE',
    '/api/v1/admin/profile-field-definitions/gender',
    { token: ADMIN_TOKEN }
  );
  assert.strictEqual(res.status, 403);
});

test('PUT /admin/profile-field-definitions/:fieldId — 404 for unknown fieldId', async () => {
  const res = await req(
    'PUT',
    '/api/v1/admin/profile-field-definitions/unknown_field',
    {
      token: ADMIN_TOKEN,
      body: { label: { en: 'Whatever' } },
    }
  );
  assert.strictEqual(res.status, 404);
});

test('DELETE /admin/profile-field-definitions/:fieldId — 200 removes definition', async () => {
  const res = await req(
    'DELETE',
    '/api/v1/admin/profile-field-definitions/height',
    {
      token: ADMIN_TOKEN,
    }
  );
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.strictEqual(body.ok, true);
});

test('DELETE /admin/profile-field-definitions/:fieldId — 404 for unknown fieldId', async () => {
  const res = await req(
    'DELETE',
    '/api/v1/admin/profile-field-definitions/height',
    {
      token: ADMIN_TOKEN,
    }
  );
  assert.strictEqual(res.status, 404);
});

// ── Public GET ───────────────────────────────────────────────────────────────

test('GET /profile-field-definitions — 401 without token', async () => {
  const res = await req('GET', '/api/v1/profile-field-definitions');
  assert.strictEqual(res.status, 401);
});

test('GET /profile-field-definitions — 200 for user role, resolved to plain strings', async () => {
  // Seed one definition first via admin
  await req('POST', '/api/v1/admin/profile-field-definitions', {
    token: ADMIN_TOKEN,
    body: {
      fieldId: 'mood',
      label: { en: 'Mood', de: 'Stimmung' },
      type: 'select',
      options: [
        { value: 'happy', label: { en: 'Happy', de: 'Glücklich' } },
        { value: 'sad', label: { en: 'Sad', de: 'Traurig' } },
      ],
      languages: ['en', 'de'],
      required: false,
      order: 1,
    },
  });
  const res = await req('GET', '/api/v1/profile-field-definitions', {
    token: USER_TOKEN,
  });
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.ok(Array.isArray(body));
  const mood = body.find((d) => d.fieldId === 'mood');
  assert.ok(mood);
  assert.strictEqual(mood.label, 'Mood');
  assert.deepStrictEqual(mood.options, [
    { value: 'happy', label: 'Happy' },
    { value: 'sad', label: 'Sad' },
  ]);
});

test('GET /profile-field-definitions?lang=de — resolves the requested language', async () => {
  const res = await req('GET', '/api/v1/profile-field-definitions?lang=de', {
    token: USER_TOKEN,
  });
  const body = await res.json();
  const mood = body.find((d) => d.fieldId === 'mood');
  assert.strictEqual(mood.label, 'Stimmung');
  assert.deepStrictEqual(mood.options, [
    { value: 'happy', label: 'Glücklich' },
    { value: 'sad', label: 'Traurig' },
  ]);
});

test('GET /profile-field-definitions — sorted by order', async () => {
  await req('POST', '/api/v1/admin/profile-field-definitions', {
    token: ADMIN_TOKEN,
    body: {
      fieldId: 'zzz_last',
      label: { en: 'Last' },
      type: 'text',
      options: [],
      languages: ['en'],
      required: false,
      order: 99,
    },
  });
  await req('POST', '/api/v1/admin/profile-field-definitions', {
    token: ADMIN_TOKEN,
    body: {
      fieldId: 'aaa_first',
      label: { en: 'First' },
      type: 'text',
      options: [],
      languages: ['en'],
      required: false,
      order: 1,
    },
  });
  const res = await req('GET', '/api/v1/profile-field-definitions', {
    token: USER_TOKEN,
  });
  const body = await res.json();
  const orders = body.map((d) => d.order);
  assert.deepStrictEqual(
    orders,
    [...orders].sort((a, b) => a - b)
  );
});
