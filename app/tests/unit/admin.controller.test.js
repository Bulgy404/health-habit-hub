import { test, before, after } from 'node:test';
import assert from 'node:assert';
import { createServer } from 'node:http';
import express from 'express';
import { createAdminRouter } from '../../routes/adminRouter.js';

// ── In-memory mock DB ─────────────────────────────────────────────────────────

function createMockDb() {
  const stores = {};

  function getStore(name) {
    if (!stores[name]) stores[name] = new Map();
    return stores[name];
  }

  return {
    collection(name) {
      const store = getStore(name);
      return {
        find(filter = {}) {
          const results = [];
          for (const [, doc] of store) {
            if (
              filter.deletedAt?.$exists === false &&
              doc.deletedAt !== undefined
            ) {
              continue;
            }
            results.push({ ...doc });
          }
          return {
            async toArray() {
              return results;
            },
          };
        },
        async findOne(query) {
          for (const [, doc] of store) {
            if (query.userId && doc.userId !== query.userId) continue;
            if (query.id && doc.id !== query.id) continue;
            if (query.key && doc.key !== query.key) continue;
            if (
              query.deletedAt?.$exists === false &&
              doc.deletedAt !== undefined
            ) {
              continue;
            }
            return { ...doc };
          }
          return null;
        },
        async insertOne(doc) {
          const key = doc.userId || doc.id || String(Math.random());
          store.set(key, { ...doc });
          return { insertedId: key };
        },
        async updateOne(filter, update) {
          for (const [k, doc] of store) {
            if (filter.userId && doc.userId !== filter.userId) continue;
            if (filter.id && doc.id !== filter.id) continue;
            if (filter.key && doc.key !== filter.key) continue;
            if (
              filter.deletedAt?.$exists === false &&
              doc.deletedAt !== undefined
            ) {
              continue;
            }
            store.set(k, { ...doc, ...update.$set });
            return { matchedCount: 1, modifiedCount: 1 };
          }
          if (update.upsert || filter.upsert) {
            const key = filter.key || String(Math.random());
            store.set(key, { ...filter, ...update.$set });
            return { matchedCount: 0, modifiedCount: 0, upsertedCount: 1 };
          }
          return { matchedCount: 0, modifiedCount: 0 };
        },
      };
    },
    _seed(name, docs) {
      const store = getStore(name);
      for (const doc of docs) {
        const key = doc.userId || doc.id || doc.key || String(Math.random());
        store.set(key, { ...doc });
      }
    },
  };
}

// ── Mock Keycloak ─────────────────────────────────────────────────────────────

function createMockKeycloak() {
  return {
    async createUser({ userId, username, password }) {
      this._users = this._users || new Map();
      this._users.set(userId, { userId, username, password, roles: [] });
    },
    async assignRole(userId, roleName) {
      if (this._users?.get(userId)) {
        this._users.get(userId).roles.push(roleName);
      }
    },
    async updateUserAttribute() {},
    async listSessions() {
      return [{ sessionId: 'sess-1', userId: 'user-1' }];
    },
    async revokeSession() {},
  };
}

// ── Mock TokenCardService ─────────────────────────────────────────────────────

function createMockTokenCardService() {
  return {
    async generateTokenCard(userId, username, password, format) {
      return Buffer.from(`%PDF-1.4 fake userId=${userId} format=${format}`);
    },
  };
}

// ── HTTP test server ──────────────────────────────────────────────────────────

let server;
let baseUrl;
let mockDb;
let mockKc;
let mockTokenSvc;

before(async () => {
  mockDb = createMockDb();
  mockKc = createMockKeycloak();
  mockTokenSvc = createMockTokenCardService();

  // Seed participants and surveys
  mockDb._seed('participants', [
    {
      userId: 'p-001',
      username: 'p-001',
      group: 'G1',
      enrolledAt: new Date(),
      passwordHash: '$2a$10$fakehashfortest',
      tokenCardPdf: Buffer.from('%PDF-1.4 fake token card for p-001'),
    },
  ]);
  mockDb._seed('surveys', [
    {
      id: 'survey-a',
      title: 'Test Survey',
      type: 'questionnaire',
      status: 'draft',
      assignedGroups: [],
    },
  ]);
  mockDb._seed('admin_settings', [{ key: 'token_card_format', value: 'both' }]);

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { sub: 'admin-test', realm_access: { roles: ['admin'] } };
    next();
  });
  app.use(
    '/admin',
    createAdminRouter({
      db: mockDb,
      keycloak: mockKc,
      tokenCardService: mockTokenSvc,
    })
  );

  server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

// ── Tests ─────────────────────────────────────────────────────────────────────

test('GET /admin returns { ok: true }', async () => {
  const res = await fetch(`${baseUrl}/admin`);
  assert.strictEqual(res.status, 200);
  assert.deepStrictEqual(await res.json(), { ok: true });
});

test('GET /admin/participants returns participant list', async () => {
  const res = await fetch(`${baseUrl}/admin/participants`);
  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.ok(Array.isArray(data));
  assert.ok(data.some((p) => p.userId === 'p-001'));
});

test('POST /admin/participants creates a new participant', async () => {
  const res = await fetch(`${baseUrl}/admin/participants`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ group: 'G2', tokenCardFormat: 'qr' }),
  });
  assert.strictEqual(res.status, 201);
  const data = await res.json();
  assert.ok(data.userId, 'should return userId');
  assert.ok(data.username.startsWith('p-'), 'username should start with p-');
  assert.ok(data.tokenCardUrl, 'should return tokenCardUrl');
});

test('PATCH /admin/participants/:id/group - valid group updates successfully', async () => {
  const res = await fetch(`${baseUrl}/admin/participants/p-001/group`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ group: 'G2' }),
  });
  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.strictEqual(data.ok, true);
  assert.strictEqual(data.group, 'G2');
});

test('PATCH /admin/participants/:id/group - invalid group returns 400', async () => {
  const res = await fetch(`${baseUrl}/admin/participants/p-001/group`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ group: 'G9' }),
  });
  assert.strictEqual(res.status, 400);
  const data = await res.json();
  assert.ok(data.error.includes('Invalid group'));
});

test('PATCH /admin/participants/:id/group - unknown participant returns 404', async () => {
  const res = await fetch(`${baseUrl}/admin/participants/unknown-id/group`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ group: 'G1' }),
  });
  assert.strictEqual(res.status, 404);
  const data = await res.json();
  assert.deepStrictEqual(data, { error: 'Participant not found' });
});

test('GET /admin/participants/:id/token-card returns PDF', async () => {
  const res = await fetch(`${baseUrl}/admin/participants/p-001/token-card`);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.headers.get('content-type'), 'application/pdf');
  const buf = Buffer.from(await res.arrayBuffer());
  assert.ok(buf.toString().startsWith('%PDF'));
});

test('GET /admin/participants/:id/token-card - unknown participant returns 404', async () => {
  const res = await fetch(
    `${baseUrl}/admin/participants/unknown-id/token-card`
  );
  assert.strictEqual(res.status, 404);
});

test('GET /admin/participants/:id/token-card - participant exists but no tokenCardPdf returns 404', async () => {
  const noCardDb = createMockDb();
  noCardDb._seed('participants', [
    {
      userId: 'p-nocard',
      username: 'p-nocard',
      passwordHash: '$2a$10$fakehashfortest',
    },
  ]);
  const noCardApp = express();
  noCardApp.use(express.json());
  noCardApp.use(
    '/admin',
    createAdminRouter({
      db: noCardDb,
      keycloak: createMockKeycloak(),
      tokenCardService: createMockTokenCardService(),
    })
  );
  const noCardServer = createServer(noCardApp);
  await new Promise((resolve) => noCardServer.listen(0, '127.0.0.1', resolve));
  const noCardUrl = `http://127.0.0.1:${noCardServer.address().port}`;

  const res = await fetch(
    `${noCardUrl}/admin/participants/p-nocard/token-card`
  );
  assert.strictEqual(res.status, 404);
  const data = await res.json();
  assert.deepStrictEqual(data, { error: 'Token card not available' });

  await new Promise((resolve) => noCardServer.close(resolve));
});

test('GET /admin/settings returns settings object', async () => {
  const res = await fetch(`${baseUrl}/admin/settings`);
  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.ok(typeof data === 'object');
  assert.strictEqual(data.token_card_format, 'both');
});

test('PUT /admin/settings/:key updates setting', async () => {
  const res = await fetch(`${baseUrl}/admin/settings/token_card_format`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value: 'qr' }),
  });
  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.strictEqual(data.ok, true);
  assert.strictEqual(data.key, 'token_card_format');
  assert.strictEqual(data.value, 'qr');
});

test('PUT /admin/settings/:key - missing value returns 400', async () => {
  const res = await fetch(`${baseUrl}/admin/settings/token_card_format`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  assert.strictEqual(res.status, 400);
  const data = await res.json();
  assert.deepStrictEqual(data, { error: 'Missing value' });
});

test('PATCH /admin/participants/:id/group - malicious group string returns 400 and executes no Cypher', async () => {
  let neo4jCalled = false;
  const mockNeo4jRun = async () => {
    neo4jCalled = true;
    return { records: [] };
  };

  const injectionDb = createMockDb();
  injectionDb._seed('participants', [
    {
      userId: 'p-inj',
      username: 'p-inj',
      group: 'G1',
      enrolledAt: new Date(),
      passwordHash: '$2a$10$fakehashfortest',
    },
  ]);
  const injectionApp = express();
  injectionApp.use(express.json());
  injectionApp.use(
    '/admin',
    createAdminRouter({
      db: injectionDb,
      neo4jRun: mockNeo4jRun,
      keycloak: createMockKeycloak(),
      tokenCardService: createMockTokenCardService(),
    })
  );
  const injectionServer = createServer(injectionApp);
  await new Promise((resolve) =>
    injectionServer.listen(0, '127.0.0.1', resolve)
  );
  const injUrl = `http://127.0.0.1:${injectionServer.address().port}`;

  const res = await fetch(`${injUrl}/admin/participants/p-inj/group`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ group: 'G1`; MATCH (n) DETACH DELETE n //' }),
  });

  assert.strictEqual(res.status, 400);
  assert.strictEqual(
    neo4jCalled,
    false,
    'neo4jRun must not be called for malicious input'
  );

  await new Promise((resolve) => injectionServer.close(resolve));
});

test('GET /admin/surveys returns survey list', async () => {
  const res = await fetch(`${baseUrl}/admin/surveys`);
  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.ok(Array.isArray(data));
  assert.ok(data.some((s) => s.id === 'survey-a'));
});

test('POST /admin/surveys creates survey with 201', async () => {
  const res = await fetch(`${baseUrl}/admin/surveys`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'New Survey', type: 'questionnaire' }),
  });
  assert.strictEqual(res.status, 201);
  const data = await res.json();
  assert.ok(data.id, 'should return id');
  assert.strictEqual(data.status, 'draft');
});

test('POST /admin/surveys - missing title returns 400', async () => {
  const res = await fetch(`${baseUrl}/admin/surveys`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'questionnaire' }),
  });
  assert.strictEqual(res.status, 400);
});

test('DELETE /admin/participants/:id soft-deletes participant', async () => {
  const res = await fetch(`${baseUrl}/admin/participants/p-001`, {
    method: 'DELETE',
  });
  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.strictEqual(data.ok, true);
});
