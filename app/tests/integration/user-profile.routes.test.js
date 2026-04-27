import { test, before, after } from 'node:test';
import assert from 'node:assert';
import { createServer } from 'node:http';
import { generateKeyPairSync, createSign } from 'node:crypto';
import express from 'express';
import { createV1Router } from '../../routes/v1Router.js';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const pubKeyJwk = publicKey.export({ format: 'jwk' });
pubKeyJwk.kid = 'up-key-1';
pubKeyJwk.use = 'sig';
const mockJwks = { keys: [pubKeyJwk] };

function base64urlEncode(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function createJwt(payload) {
  const header = { alg: 'RS256', kid: 'up-key-1', typ: 'JWT' };
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

function createMockDb() {
  const collections = {};

  function getCol(name) {
    if (!collections[name]) collections[name] = [];
    return collections[name];
  }

  return {
    collection(name) {
      return {
        async findOne(query) {
          let results = [...getCol(name)];
          for (const [k, v] of Object.entries(query)) {
            results = results.filter((d) => d[k] === v);
          }
          return results[0] || null;
        },
        async updateOne(filter, update, opts) {
          const col = getCol(name);
          const idx = col.findIndex((d) => d.userId === filter.userId);
          if (idx >= 0) {
            col[idx] = { ...col[idx], ...update.$set };
          } else if (opts?.upsert) {
            col.push({ ...update.$set, _id: String(Math.random()) });
          }
        },
      };
    },
  };
}

let server;
let port;
let jwksServer;
let jwksPort;
const realFetch = global.fetch;
const SERVICE_SECRET = 'test-service-secret-123';

before(async () => {
  const jwksApp = express();
  jwksApp.get('/realms/hhh/protocol/openid-connect/certs', (_req, res) => res.json(mockJwks));
  jwksServer = createServer(jwksApp);
  await new Promise((resolve) => jwksServer.listen(0, '127.0.0.1', resolve));
  jwksPort = jwksServer.address().port;

  process.env.API_SERVICE_SECRET = SERVICE_SECRET;

  const db = createMockDb();
  const app = express();
  app.use(express.json());
  app.use(
    '/api/v1',
    createV1Router({
      jwksUrl: `http://127.0.0.1:${jwksPort}/realms/hhh/protocol/openid-connect/certs`,
      expectedIssuer: null,
      expectedAudience: null,
      db,
    })
  );

  server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = server.address().port;

  global.fetch = async (url, ...args) => {
    const u = typeof url === 'string' ? url : url.toString();
    if (u.includes('127.0.0.1')) return realFetch(u, ...args);
    throw new Error(`Unexpected fetch to: ${u}`);
  };
});

after(async () => {
  global.fetch = realFetch;
  delete process.env.API_SERVICE_SECRET;
  await new Promise((resolve) => server.close(resolve));
  await new Promise((resolve) => jwksServer.close(resolve));
});

function req(method, path, { token, serviceToken, body } = {}) {
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (serviceToken) headers['X-Service-Auth-Token'] = serviceToken;
  if (body) headers['Content-Type'] = 'application/json';
  return realFetch(`http://127.0.0.1:${port}/api/v1${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

const VALID_FIELDS = [
  { questionId: 'age', questionText: 'Age', value: 21, label: '18–24' },
  { questionId: 'gender', questionText: 'Gender', value: 'male', label: 'Male' },
];

test('POST /user-profile — 401 without token', async () => {
  const res = await req('POST', '/user-profile', { body: { fields: VALID_FIELDS } });
  assert.strictEqual(res.status, 401);
});

test('POST /user-profile — 400 when fields is missing', async () => {
  const token = makeToken('u1');
  const res = await req('POST', '/user-profile', { token, body: {} });
  assert.strictEqual(res.status, 400);
});

test('POST /user-profile — 400 when fields is empty array', async () => {
  const token = makeToken('u1');
  const res = await req('POST', '/user-profile', { token, body: { fields: [] } });
  assert.strictEqual(res.status, 400);
});

test('POST /user-profile — 400 when a field is missing label', async () => {
  const token = makeToken('u2');
  const res = await req('POST', '/user-profile', {
    token,
    body: {
      fields: [{ questionId: 'age', questionText: 'Age', value: 21 }],
    },
  });
  assert.strictEqual(res.status, 400);
});

test('POST /user-profile — 200 and upserts document', async () => {
  const token = makeToken('user-post-test');
  const res = await req('POST', '/user-profile', { token, body: { fields: VALID_FIELDS } });
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.strictEqual(body.ok, true);
});

test('POST /user-profile — repeat call overwrites previous fields', async () => {
  const token = makeToken('user-overwrite');
  await req('POST', '/user-profile', {
    token,
    body: { fields: [{ questionId: 'age', questionText: 'Age', value: 21, label: '18–24' }] },
  });
  const res2 = await req('POST', '/user-profile', {
    token,
    body: { fields: [{ questionId: 'age', questionText: 'Age', value: 49, label: '45–54' }] },
  });
  assert.strictEqual(res2.status, 200);

  const getRes = await req('GET', '/user-profile', { token });
  const body = await getRes.json();
  assert.strictEqual(body.fields[0].value, 49);
});

test('GET /user-profile — 401 without token', async () => {
  const res = await req('GET', '/user-profile');
  assert.strictEqual(res.status, 401);
});

test('GET /user-profile — 404 when no profile exists', async () => {
  const token = makeToken('user-no-profile');
  const res = await req('GET', '/user-profile', { token });
  assert.strictEqual(res.status, 404);
});

test('GET /user-profile — returns profile after POST', async () => {
  const token = makeToken('user-get-test');
  await req('POST', '/user-profile', { token, body: { fields: VALID_FIELDS } });

  const res = await req('GET', '/user-profile', { token });
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.strictEqual(body.userId, 'user-get-test');
  assert.deepStrictEqual(body.fields, VALID_FIELDS);
  assert.ok(body.updatedAt);
  assert.ok(!('_id' in body));
});

test('GET /user-profile — user isolation: different users see different profiles', async () => {
  const tokenA = makeToken('user-iso-a');
  const tokenB = makeToken('user-iso-b');

  await req('POST', '/user-profile', { token: tokenA, body: { fields: VALID_FIELDS } });

  const res = await req('GET', '/user-profile', { token: tokenB });
  assert.strictEqual(res.status, 404);
});

test('GET /user-profile/service/:userId — 401 without service token', async () => {
  const res = await req('GET', '/user-profile/service/any-user');
  assert.strictEqual(res.status, 401);
});

test('GET /user-profile/service/:userId — 401 with wrong service token', async () => {
  const res = await req('GET', '/user-profile/service/any-user', {
    serviceToken: 'wrong-secret',
  });
  assert.strictEqual(res.status, 401);
});

test('GET /user-profile/service/:userId — 404 when user has no profile', async () => {
  const res = await req('GET', '/user-profile/service/ghost-user', {
    serviceToken: SERVICE_SECRET,
  });
  assert.strictEqual(res.status, 404);
});

test('GET /user-profile/service/:userId — 200 returns profile after POST', async () => {
  const token = makeToken('user-service-read');
  await req('POST', '/user-profile', { token, body: { fields: VALID_FIELDS } });

  const res = await req('GET', '/user-profile/service/user-service-read', {
    serviceToken: SERVICE_SECRET,
  });
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.strictEqual(body.userId, 'user-service-read');
  assert.deepStrictEqual(body.fields, VALID_FIELDS);
  assert.ok(!('_id' in body));
});
