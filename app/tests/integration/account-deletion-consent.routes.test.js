// App Store compliance — consent recording (5.1.3) & account deletion (5.1.1(v))
import { test, before, after } from 'node:test';
import assert from 'node:assert';
import { createServer } from 'node:http';
import { generateKeyPairSync, createSign } from 'node:crypto';
import express from 'express';
import { createApiRouter } from '../../routes/apiRouter.js';

// ── Key material ──────────────────────────────────────────────────────────────

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
});
const pubKeyJwk = publicKey.export({ format: 'jwk' });
pubKeyJwk.kid = 'del-key-1';
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
  const header = { alg: 'RS256', kid: 'del-key-1', typ: 'JWT' };
  const h = base64urlEncode(Buffer.from(JSON.stringify(header)));
  const p = base64urlEncode(Buffer.from(JSON.stringify(payload)));
  const signingInput = `${h}.${p}`;
  const sign = createSign('RSA-SHA256');
  sign.update(signingInput);
  return `${signingInput}.${base64urlEncode(sign.sign(privateKey))}`;
}

function makeToken(roles = ['user'], sub = 'del-user') {
  const now = Math.floor(Date.now() / 1000);
  return createJwt({ sub, exp: now + 3600, iat: now, realm_access: { roles } });
}

// ── In-memory mock DB ─────────────────────────────────────────────────────────

const store = new Map(); // collection name -> array of docs

function coll(name) {
  if (!store.has(name)) store.set(name, []);
  return store.get(name);
}

function createMockDb() {
  return {
    collection(name) {
      return {
        async insertOne(doc) {
          coll(name).push({ ...doc });
          return { insertedId: 'x' };
        },
        find(q = {}) {
          let docs = coll(name).filter(
            (d) => !q.userId || d.userId === q.userId
          );
          const cursor = {
            sort(spec) {
              const [[k, dir]] = Object.entries(spec);
              docs = [...docs].sort(
                (a, b) => (a[k] > b[k] ? 1 : a[k] < b[k] ? -1 : 0) * dir
              );
              return cursor;
            },
            limit(n) {
              docs = docs.slice(0, n);
              return cursor;
            },
            async toArray() {
              return docs;
            },
          };
          return cursor;
        },
        async findOne(q = {}) {
          return (
            coll(name).find((d) => !q.userId || d.userId === q.userId) ?? null
          );
        },
        async deleteMany(q = {}) {
          const before = coll(name).length;
          store.set(
            name,
            coll(name).filter((d) => d.userId !== q.userId)
          );
          return { deletedCount: before - coll(name).length };
        },
        async updateOne() {
          return { matchedCount: 0 };
        },
        async countDocuments() {
          return coll(name).length;
        },
      };
    },
  };
}

// ── Mock Keycloak admin client ────────────────────────────────────────────────

const keycloakDeletions = [];
const mockKeycloak = {
  async deleteUser(userId) {
    keycloakDeletions.push(userId);
  },
};

// ── Test server ───────────────────────────────────────────────────────────────

let server;
let baseUrl;

before(async () => {
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
    db: createMockDb(),
    neo4jRun: async () => [],
    keycloak: mockKeycloak,
  });
  testApp.use('/api/v1', apiRouter);
  server = createServer(testApp);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
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

function authHeaders(token) {
  return token
    ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    : { 'Content-Type': 'application/json' };
}

// ── Consent recording ─────────────────────────────────────────────────────────

test('GET /users/me/consent returns 401 without token', async () => {
  const res = await fetch(`${baseUrl}/api/v1/users/me/consent`);
  assert.strictEqual(res.status, 401);
});

test('GET /users/me/consent returns 404 before any consent is recorded', async () => {
  const res = await fetch(`${baseUrl}/api/v1/users/me/consent`, {
    headers: authHeaders(makeToken(['user'], 'fresh-user')),
  });
  assert.strictEqual(res.status, 404);
});

test('POST /users/me/consent requires consentVersion', async () => {
  const res = await fetch(`${baseUrl}/api/v1/users/me/consent`, {
    method: 'POST',
    headers: authHeaders(makeToken()),
    body: JSON.stringify({}),
  });
  assert.strictEqual(res.status, 400);
});

test('records consent with version, locale and timestamp; readable afterwards', async () => {
  const token = makeToken(['user'], 'consenting-user');
  const res = await fetch(`${baseUrl}/api/v1/users/me/consent`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ consentVersion: '1.0.0', locale: 'de' }),
  });
  assert.strictEqual(res.status, 201);
  const body = await res.json();
  assert.strictEqual(body.consentVersion, '1.0.0');
  assert.strictEqual(body.locale, 'de');
  assert.ok(body.consentedAt);

  const read = await fetch(`${baseUrl}/api/v1/users/me/consent`, {
    headers: authHeaders(token),
  });
  assert.strictEqual(read.status, 200);
  const latest = await read.json();
  assert.strictEqual(latest.consentVersion, '1.0.0');
});

test('re-consent to a newer version is appended and returned as latest', async () => {
  const token = makeToken(['user'], 'reconsent-user');
  for (const v of ['1.0.0', '1.1.0']) {
    await fetch(`${baseUrl}/api/v1/users/me/consent`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ consentVersion: v, locale: 'en' }),
    });
    // Ensure distinct consentedAt timestamps (sorted on by the endpoint)
    await new Promise((r) => setTimeout(r, 5));
  }
  const read = await fetch(`${baseUrl}/api/v1/users/me/consent`, {
    headers: authHeaders(token),
  });
  const latest = await read.json();
  assert.strictEqual(latest.consentVersion, '1.1.0');
});

// ── Data export (GDPR Art. 20) ────────────────────────────────────────────────

test('GET /users/me/export returns 401 without token', async () => {
  const res = await fetch(`${baseUrl}/api/v1/users/me/export`);
  assert.strictEqual(res.status, 401);
});

test('exports all participant-linked documents as a JSON download', async () => {
  const sub = 'export-user';
  const db = createMockDb();
  await db
    .collection('users')
    .insertOne({ userId: sub, preferredLanguage: 'de' });
  await db
    .collection('implementation_intentions')
    .insertOne({ userId: sub, behaviorKey: 'walking' });
  await db.collection('consents').insertOne({
    userId: sub,
    consentVersion: '1.0.0',
    consentedAt: new Date(),
  });

  const res = await fetch(`${baseUrl}/api/v1/users/me/export`, {
    headers: authHeaders(makeToken(['user'], sub)),
  });
  assert.strictEqual(res.status, 200);
  assert.match(
    res.headers.get('content-disposition') ?? '',
    /attachment; filename="health-habit-hub-export\.json"/
  );
  const body = await res.json();
  assert.strictEqual(body.format, 'health-habit-hub-export/v1');
  assert.strictEqual(body.userId, sub);
  assert.strictEqual(body.data.users.length, 1);
  assert.strictEqual(body.data.users[0].preferredLanguage, 'de');
  assert.strictEqual(
    body.data.implementation_intentions[0].behaviorKey,
    'walking'
  );
  assert.strictEqual(body.data.consents[0].consentVersion, '1.0.0');
  // Collections without data are present as empty arrays (complete inventory)
  assert.deepStrictEqual(body.data.profiles, []);
});

// ── Account deletion ──────────────────────────────────────────────────────────

test('DELETE /users/me returns 401 without token', async () => {
  const res = await fetch(`${baseUrl}/api/v1/users/me`, { method: 'DELETE' });
  assert.strictEqual(res.status, 401);
});

test('deletes all participant data and the Keycloak identity', async () => {
  const sub = 'doomed-user';
  // Seed data across several collections
  const db = createMockDb();
  for (const c of ['users', 'implementation_intentions', 'consents']) {
    await db.collection(c).insertOne({ userId: sub, payload: c });
  }
  await db.collection('users').insertOne({ userId: 'other-user' });

  const res = await fetch(`${baseUrl}/api/v1/users/me`, {
    method: 'DELETE',
    headers: authHeaders(makeToken(['user'], sub)),
  });
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.strictEqual(body.ok, true);
  assert.strictEqual(body.deleted.users >= 1, true);
  // enrollment is now deleted from Neo4j, not MongoDB
  assert.strictEqual(body.deleted.implementation_intentions >= 1, true);
  assert.strictEqual(body.deleted.consents >= 1, true);

  // Keycloak identity removed
  assert.ok(keycloakDeletions.includes(sub));

  // Other users' data untouched
  const other = await db.collection('users').findOne({ userId: 'other-user' });
  assert.ok(other);
});

test('deletion is idempotent — second call succeeds with zero counts', async () => {
  const token = makeToken(['user'], 'doomed-user');
  const res = await fetch(`${baseUrl}/api/v1/users/me`, {
    method: 'DELETE',
    headers: authHeaders(token),
  });
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.strictEqual(body.ok, true);
  assert.strictEqual(body.deleted.users, 0);
});
