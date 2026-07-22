import { test, before, after } from 'node:test';
import assert from 'node:assert';
import { createServer } from 'node:http';
import { generateKeyPairSync, createSign } from 'node:crypto';
import { ObjectId } from 'mongodb';
import express from 'express';
import { createApiRouter } from '../../routes/apiRouter.js';

// ── Key material ─────────────────────────────────────────────────────────────

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
});
const pubKeyJwk = publicKey.export({ format: 'jwk' });
pubKeyJwk.kid = 'ql-key-1';
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
  const header = { alg: 'RS256', kid: 'ql-key-1', typ: 'JWT' };
  const h = base64urlEncode(Buffer.from(JSON.stringify(header)));
  const p = base64urlEncode(Buffer.from(JSON.stringify(payload)));
  const signingInput = `${h}.${p}`;
  const sign = createSign('RSA-SHA256');
  sign.update(signingInput);
  return `${signingInput}.${base64urlEncode(sign.sign(privateKey))}`;
}

function makeToken(roles = ['admin'], sub = 'user-ql') {
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
      if (key === '$or') {
        if (!val.some((clause) => matchesFilter(doc, clause))) return false;
        continue;
      }
      if (typeof val === 'object' && val !== null) {
        if ('$in' in val) {
          const list = val.$in.map((v) => v?.toString());
          if (!list.includes(doc[key]?.toString())) return false;
          continue;
        }
        if ('$exists' in val) {
          const exists = key in doc;
          if (val.$exists !== exists) return false;
          continue;
        }
        if ('$ne' in val) {
          if (doc[key] === val.$ne) return false;
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
          const cursor = {
            sort(spec) {
              const [[field, dir]] = Object.entries(spec);
              results.sort((a, b) => (a[field] > b[field] ? 1 : a[field] < b[field] ? -1 : 0) * dir);
              return cursor;
            },
            async toArray() {
              return results.map((d) => ({ ...d }));
            },
          };
          return cursor;
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
        async findOneAndUpdate(filter, update, options = {}) {
          let matches = store.filter((doc) => matchesFilter(doc, filter));
          if (options.sort) {
            const [[field, dir]] = Object.entries(options.sort);
            matches = [...matches].sort(
              (a, b) => (a[field] > b[field] ? 1 : a[field] < b[field] ? -1 : 0) * dir
            );
          }
          const found = matches[0];
          if (!found) return null;
          if (update.$set) Object.assign(found, update.$set);
          return found;
        },
        async updateMany(filter, update) {
          let count = 0;
          for (const doc of store) {
            if (matchesFilter(doc, filter)) {
              if (update.$set) Object.assign(doc, update.$set);
              count++;
            }
          }
          return { matchedCount: count, modifiedCount: count };
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

// Configurable Neo4j enrollment mock: tests set entries before calling the endpoint.
const neo4jEnrollments = new Map(); // userId → { studyId, groupId, enrolledAt, studyCodeUsed }

const neo4jRun = async (cypher, params) => {
  if (cypher.includes('ENROLLED_IN')) {
    const row = neo4jEnrollments.get(params.userId);
    return row ? [row] : [];
  }
  return [];
};

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
    neo4jRun,
  });
  testApp.use('/api/v1', apiRouter);

  server = createServer(testApp);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  // Wait for admin router to seed defaults
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

// ── HTTP helpers ──────────────────────────────────────────────────────────────

async function get(path, token) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  return fetch(`${baseUrl}${path}`, { headers });
}

async function post(path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

async function put(path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return fetch(`${baseUrl}${path}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(body),
  });
}

async function del(path, token) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  return fetch(`${baseUrl}${path}`, { method: 'DELETE', headers });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test('GET /api/v1/admin/questionnaires - 401 without token', async () => {
  const res = await get('/api/v1/admin/questionnaires');
  assert.strictEqual(res.status, 401);
});

test('GET /api/v1/admin/questionnaires - 403 for participant role', async () => {
  const token = makeToken(['user']);
  const res = await get('/api/v1/admin/questionnaires', token);
  assert.strictEqual(res.status, 403);
});

test('GET /api/v1/admin/questionnaires - returns all questionnaires with isLibrary field', async () => {
  // Seed library and custom questionnaires
  const libId = new ObjectId();
  const customId = new ObjectId();
  mockDb._seed('questionnaires', [
    {
      _id: libId,
      slug: 'sliq',
      title: { en: 'SLIQ' },
      description: {},
      version: '1',
      languages: ['en'],
      active: true,
      isLibrary: true,
      questions: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      _id: customId,
      slug: null,
      title: { en: 'Custom Q' },
      description: {},
      version: '1',
      languages: ['en'],
      active: true,
      isLibrary: false,
      questions: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]);

  const token = makeToken(['admin']);
  const res = await get('/api/v1/admin/questionnaires', token);
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.ok(Array.isArray(body));
  const lib = body.find((q) => q.id === libId.toString());
  assert.ok(lib, 'library questionnaire should be present');
  assert.strictEqual(lib.isLibrary, true);
  const custom = body.find((q) => q.id === customId.toString());
  assert.ok(custom, 'custom questionnaire should be present');
  assert.strictEqual(custom.isLibrary, false);
});

test('GET /api/v1/admin/questionnaires?library=true - filters to library items only', async () => {
  const token = makeToken(['admin']);
  const res = await get('/api/v1/admin/questionnaires?library=true', token);
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.ok(Array.isArray(body));
  for (const q of body) {
    assert.strictEqual(q.isLibrary, true);
  }
  const sliq = body.find((q) => q.slug === 'sliq');
  assert.ok(sliq, 'SLIQ should be in library');
});

test('POST /api/v1/admin/questionnaires - creates custom questionnaire with isLibrary: false', async () => {
  const token = makeToken(['admin']);
  const res = await post(
    '/api/v1/admin/questionnaires',
    {
      title: { en: 'My Custom Survey' },
      description: { en: 'Test' },
      languages: ['en'],
      questions: [{ id: 'q1', text: { en: 'Question 1' }, type: 'text' }],
    },
    token
  );
  assert.strictEqual(res.status, 201);
  const body = await res.json();
  assert.ok(body.ok);
  assert.ok(body.id, 'should return an id');
});

test('POST /api/v1/admin/questionnaires - 400 without title', async () => {
  const token = makeToken(['admin']);
  const res = await post(
    '/api/v1/admin/questionnaires',
    { description: 'No title' },
    token
  );
  assert.strictEqual(res.status, 400);
});

test('PUT /api/v1/admin/questionnaires/:id - 403 for library questionnaire', async () => {
  // Get the SLIQ library questionnaire id
  const adminToken = makeToken(['admin']);
  const listRes = await get(
    '/api/v1/admin/questionnaires?library=true',
    adminToken
  );
  const list = await listRes.json();
  const sliq = list.find((q) => q.slug === 'sliq');
  assert.ok(sliq, 'SLIQ must exist');

  const res = await put(
    `/api/v1/admin/questionnaires/${sliq.id}`,
    { title: { en: 'Modified SLIQ' } },
    adminToken
  );
  assert.strictEqual(res.status, 403);
});

test('PUT /api/v1/admin/questionnaires/:id - updates custom questionnaire', async () => {
  // Create a custom questionnaire first
  const adminToken = makeToken(['admin']);
  const createRes = await post(
    '/api/v1/admin/questionnaires',
    { title: { en: 'To Update' }, languages: ['en'], questions: [] },
    adminToken
  );
  const { id } = await createRes.json();

  const res = await put(
    `/api/v1/admin/questionnaires/${id}`,
    { title: { en: 'Updated Title' } },
    adminToken
  );
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.strictEqual(body.ok, true);
});

test('PUT /api/v1/admin/questionnaires/:id - 404 for invalid id', async () => {
  const token = makeToken(['admin']);
  const fakeId = new ObjectId();
  const res = await put(
    `/api/v1/admin/questionnaires/${fakeId}`,
    { title: { en: 'X' } },
    token
  );
  assert.strictEqual(res.status, 404);
});

test('DELETE /api/v1/admin/questionnaires/:id - 403 for library questionnaire', async () => {
  const adminToken = makeToken(['admin']);
  const listRes = await get(
    '/api/v1/admin/questionnaires?library=true',
    adminToken
  );
  const list = await listRes.json();
  const sliq = list.find((q) => q.slug === 'sliq');

  const res = await del(`/api/v1/admin/questionnaires/${sliq.id}`, adminToken);
  assert.strictEqual(res.status, 403);
});

test('DELETE /api/v1/admin/questionnaires/:id - deletes custom questionnaire', async () => {
  const adminToken = makeToken(['admin']);
  const createRes = await post(
    '/api/v1/admin/questionnaires',
    { title: { en: 'To Delete' }, languages: ['en'], questions: [] },
    adminToken
  );
  const { id } = await createRes.json();

  const res = await del(`/api/v1/admin/questionnaires/${id}`, adminToken);
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.strictEqual(body.deleted, true);
});

test('DELETE /api/v1/admin/questionnaires/:id - 409 if assigned to active study', async () => {
  const adminToken = makeToken(['admin']);
  // Create a questionnaire
  const createRes = await post(
    '/api/v1/admin/questionnaires',
    { title: { en: 'Assigned Q' }, languages: ['en'], questions: [] },
    adminToken
  );
  const { id } = await createRes.json();

  // Seed an active study and an active assignment linking this questionnaire
  // to it — the delete guard now checks questionnaire_assignments, not the
  // legacy study.questionnaires array.
  const studyId = new ObjectId();
  mockDb._seed('studies', [
    {
      _id: studyId,
      name: 'Active Study',
      isDefault: false,
      isActive: true,
      groups: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]);
  mockDb._seed('questionnaire_assignments', [
    {
      _id: new ObjectId(),
      studyId,
      groupId: null,
      questionnaireId: new ObjectId(id),
      questionnaireSlug: 'assigned-q',
      cadence: { mode: 'interval', intervalDays: 7, occurrences: 1 },
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]);

  const res = await del(`/api/v1/admin/questionnaires/${id}`, adminToken);
  assert.strictEqual(res.status, 409);
});

// ── Participant questionnaires route ──────────────────────────────────────────

test('GET /api/v1/participant/questionnaires - 401 without token', async () => {
  const res = await get('/api/v1/participant/questionnaires');
  assert.strictEqual(res.status, 401);
});

test('GET /api/v1/participant/questionnaires - 404 when not enrolled', async () => {
  const token = makeToken(['user'], 'unenrolled-user');
  const res = await get('/api/v1/participant/questionnaires', token);
  assert.strictEqual(res.status, 404);
});

test('GET /api/v1/participant/questionnaires - returns study questionnaires for enrolled participant', async () => {
  // Create a questionnaire
  const adminToken = makeToken(['admin']);
  const createRes = await post(
    '/api/v1/admin/questionnaires',
    {
      title: { en: 'Participant Q' },
      languages: ['en'],
      questions: [{ id: 'q1', text: { en: 'Q1' }, type: 'text' }],
    },
    adminToken
  );
  const { id: qId } = await createRes.json();

  // Seed enrollment (Neo4j mock) and study
  const studyId = new ObjectId();
  const groupId = new ObjectId();
  neo4jEnrollments.set('enrolled-user', {
    studyId: studyId.toString(),
    groupId: groupId.toString(),
    enrolledAt: new Date().toISOString(),
    studyCodeUsed: null,
  });
  mockDb._seed('studies', [
    {
      _id: studyId,
      name: 'Study With Q',
      isDefault: false,
      isActive: true,
      groups: [{ id: groupId, label: 'Group A', index: 1 }],
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]);
  // participantRouter now derives "available questionnaires" from active
  // questionnaire_assignments, not the legacy study.questionnaires array.
  mockDb._seed('questionnaire_assignments', [
    {
      _id: new ObjectId(),
      studyId,
      groupId: null,
      questionnaireId: new ObjectId(qId),
      questionnaireSlug: 'participant-q',
      cadence: { mode: 'interval', intervalDays: 7, occurrences: 1 },
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]);

  const participantToken = makeToken(['user'], 'enrolled-user');
  const res = await get('/api/v1/participant/questionnaires', participantToken);
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.ok(Array.isArray(body));
  const found = body.find((q) => q.id === qId);
  assert.ok(found, 'enrolled participant should see assigned questionnaire');
  assert.strictEqual(found.title, 'Participant Q');
});

test('GET /api/v1/participant/questionnaires - hides a habit-scoped questionnaire until the participant has a window for it', async () => {
  const adminToken = makeToken(['admin']);
  const createRes = await post(
    '/api/v1/admin/questionnaires',
    {
      title: { en: 'Custom Habit Check-in' },
      languages: ['en'],
      questions: [{ id: 'q1', text: { en: 'Q1' }, type: 'text' }],
      scope: 'habit',
    },
    adminToken
  );
  const { id: qId } = await createRes.json();

  const studyId = new ObjectId();
  const groupId = new ObjectId();
  neo4jEnrollments.set('habit-q-user', {
    studyId: studyId.toString(),
    groupId: groupId.toString(),
    enrolledAt: new Date().toISOString(),
    studyCodeUsed: null,
  });
  mockDb._seed('studies', [
    {
      _id: studyId,
      name: 'Study With Habit-Scoped Q',
      isDefault: false,
      isActive: true,
      groups: [{ id: groupId, label: 'Group A', index: 1 }],
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]);
  mockDb._seed('questionnaire_assignments', [
    {
      _id: new ObjectId(),
      studyId,
      groupId: null,
      questionnaireId: new ObjectId(qId),
      questionnaireSlug: 'custom-habit-check-in',
      cadence: { mode: 'interval', intervalDays: 7, occurrences: 1 },
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]);

  const participantToken = makeToken(['user'], 'habit-q-user');

  // No habit created yet — no window — the definition isn't listed.
  const beforeRes = await get('/api/v1/participant/questionnaires', participantToken);
  const beforeBody = await beforeRes.json();
  assert.ok(
    !beforeBody.some((q) => q.id === qId),
    'habit-scoped questionnaire must not be listed before a habit exists'
  );

  // Participant creates a habit — generateHabitCreationWindows materializes a
  // window for this assignment (simulated directly here).
  mockDb._seed('questionnaire_windows', [
    {
      _id: new ObjectId(),
      userId: 'habit-q-user',
      questionnaireSlug: 'custom-habit-check-in',
      occurrence: 1,
      scheduledFor: new Date(),
      submittedAt: null,
    },
  ]);

  const afterRes = await get('/api/v1/participant/questionnaires', participantToken);
  const afterBody = await afterRes.json();
  const found = afterBody.find((q) => q.id === qId);
  assert.ok(found, 'habit-scoped questionnaire should be listed once a window exists');
  assert.strictEqual(found.title, 'Custom Habit Check-in');
});

test('GET /api/v1/participant/questionnaires - reports available/completedAt, and POST /questionnaire-responses blocks resubmission once the due window is closed', async () => {
  const adminToken = makeToken(['admin']);
  const createRes = await post(
    '/api/v1/admin/questionnaires',
    {
      title: { en: 'Wellbeing Check' },
      languages: ['en'],
      questions: [{ id: 'q1', text: { en: 'Q1' }, type: 'text' }],
    },
    adminToken
  );
  const { id: qId } = await createRes.json();

  const studyId = new ObjectId();
  const groupId = new ObjectId();
  neo4jEnrollments.set('resubmit-user', {
    studyId: studyId.toString(),
    groupId: groupId.toString(),
    enrolledAt: new Date().toISOString(),
    studyCodeUsed: null,
  });
  mockDb._seed('studies', [
    {
      _id: studyId,
      name: 'Study With Resubmission Guard',
      isDefault: false,
      isActive: true,
      groups: [{ id: groupId, label: 'Group A', index: 1 }],
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]);
  mockDb._seed('questionnaire_assignments', [
    {
      _id: new ObjectId(),
      studyId,
      groupId: null,
      questionnaireId: new ObjectId(qId),
      questionnaireSlug: 'wellbeing-check',
      cadence: { mode: 'interval', intervalDays: 7, occurrences: 1 },
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]);
  const past = new Date(Date.now() - 60 * 1000);
  mockDb._seed('questionnaire_windows', [
    {
      _id: new ObjectId(),
      userId: 'resubmit-user',
      assignmentId: new ObjectId(),
      questionnaireSlug: 'wellbeing-check',
      occurrence: 1,
      scheduledFor: past,
      submittedAt: null,
      responseId: null,
    },
  ]);

  const participantToken = makeToken(['user'], 'resubmit-user');

  // Due now, never completed — available, no completedAt.
  const beforeRes = await get('/api/v1/participant/questionnaires', participantToken);
  const before = (await beforeRes.json()).find((q) => q.id === qId);
  assert.strictEqual(before.available, true);
  assert.strictEqual(before.completedAt, null);

  // First submission succeeds and closes the window.
  const submitRes = await post(
    '/api/v1/questionnaire-responses',
    { questionnaireSlug: 'wellbeing-check', answers: { q1: 'fine' } },
    participantToken
  );
  assert.strictEqual(submitRes.status, 201);

  // Now greyed out: not available, completedAt set.
  const afterRes = await get('/api/v1/participant/questionnaires', participantToken);
  const after = (await afterRes.json()).find((q) => q.id === qId);
  assert.strictEqual(after.available, false);
  assert.ok(after.completedAt, 'completedAt should be set after submission');

  // Resubmitting is rejected — no open due window left.
  const resubmitRes = await post(
    '/api/v1/questionnaire-responses',
    { questionnaireSlug: 'wellbeing-check', answers: { q1: 'changed my mind' } },
    participantToken
  );
  assert.strictEqual(resubmitRes.status, 409);
});
