import { test, before, after } from 'node:test';
import assert from 'node:assert';
import { createServer } from 'node:http';
import { generateKeyPairSync, createSign } from 'node:crypto';
import express from 'express';
import { createApiRouter } from '../../routes/apiRouter.js';

// Research roles cannot use shared administration endpoints. Admins retain
// access to separately mounted resources without catch-all sibling gates.

// ── Key material ─────────────────────────────────────────────────────────────

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
});
const pubKeyJwk = publicKey.export({ format: 'jwk' });
pubKeyJwk.kid = 'role-scoping-key-1';
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
  const header = { alg: 'RS256', kid: 'role-scoping-key-1', typ: 'JWT' };
  const h = base64urlEncode(Buffer.from(JSON.stringify(header)));
  const p = base64urlEncode(Buffer.from(JSON.stringify(payload)));
  const signingInput = `${h}.${p}`;
  const sign = createSign('RSA-SHA256');
  sign.update(signingInput);
  return `${signingInput}.${base64urlEncode(sign.sign(privateKey))}`;
}

function makeToken(roles = ['admin'], sub = 'role-scoping-user') {
  const now = Math.floor(Date.now() / 1000);
  return createJwt({
    sub,
    exp: now + 3600,
    iat: now,
    realm_access: { roles },
  });
}

// ── Minimal mock MongoDB db (supports the chains cuePoolService needs) ───────

function createMockDb() {
  const collections = {};
  function getStore(name) {
    if (!collections[name]) collections[name] = new Map();
    return collections[name];
  }

  return {
    collection(name) {
      const store = getStore(name);
      return {
        find(_query) {
          const results = [...store.values()].map((d) => ({ ...d }));
          const cursor = {
            skip() {
              return cursor;
            },
            limit() {
              return cursor;
            },
            async toArray() {
              return results;
            },
          };
          return cursor;
        },
        async countDocuments() {
          return store.size;
        },
        async findOne(query) {
          for (const [, doc] of store) {
            if (query?.key !== undefined && doc.key !== query.key) continue;
            return { ...doc };
          }
          return null;
        },
        async insertOne(doc) {
          const key = doc.key || Math.random().toString(36);
          store.set(key, { ...doc });
          return { insertedId: key };
        },
      };
    },
  };
}

// ── Test server ───────────────────────────────────────────────────────────────

let server;
let baseUrl;

before(async () => {
  const mockDb = createMockDb();

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
    neo4jRun: async () => ({ records: [] }),
    db: mockDb,
  });
  testApp.use('/api/v1', apiRouter);

  server = createServer(testApp);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  await new Promise((resolve) => setTimeout(resolve, 50));
});

after(() => {
  // closeAllConnections destroys any lingering keep-alive sockets first —
  // without it, close()'s callback (and thus process exit / progression to
  // the next test file) waits forever for connections that fetch()'s
  // undici agent doesn't proactively close.
  server.closeAllConnections();
  server.close();
});

async function get(path, token) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  return fetch(`${baseUrl}${path}`, { headers });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test('GET /api/v1/admin/cue-pools - researcher can browse shared templates', async () => {
  const token = makeToken(['researcher']);
  const res = await get('/api/v1/admin/cue-pools', token);
  assert.strictEqual(res.status, 200);
});

test('GET /api/v1/admin/cue-pools - admin is allowed', async () => {
  const token = makeToken(['admin']);
  const res = await get('/api/v1/admin/cue-pools', token);
  assert.strictEqual(res.status, 200);
});

test('GET /api/v1/admin/cue-pools - plain user role is forbidden', async () => {
  const token = makeToken(['user']);
  const res = await get('/api/v1/admin/cue-pools', token);
  assert.strictEqual(res.status, 403);
});

test('GET /api/v1/admin/system/overview - researcher still correctly forbidden (admin-only route)', async () => {
  const token = makeToken(['researcher']);
  const res = await get('/api/v1/admin/system/overview', token);
  assert.strictEqual(res.status, 403);
});

test('GET /api/v1/admin/backups/status - researcher still correctly forbidden (admin-only route)', async () => {
  const token = makeToken(['researcher']);
  const res = await get('/api/v1/admin/backups/status', token);
  assert.strictEqual(res.status, 403);
});
