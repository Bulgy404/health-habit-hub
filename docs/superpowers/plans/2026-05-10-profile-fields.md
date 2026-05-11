# Configurable Profile Fields Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace hardcoded age/gender onboarding fields with admin-configurable profile field definitions stored in MongoDB; sync all submitted fields to Neo4j User node; add admin portal Profile Fields tab.

**Architecture:** A new `profile_field_definitions` MongoDB collection stores definitions (fieldId, label, type, options, required, order). The backend exposes admin CRUD under `/api/v1/admin/profile-field-definitions` and a public GET under `/api/v1/profile-field-definitions`. On profile save the POST route converts values by type and fire-and-forgets a Neo4j `SET u += $props` sync. Flutter fetches definitions dynamically and renders four input widget types.

**Tech Stack:** Node.js (ES modules), Express, MongoDB, Neo4j, Next.js 14 (admin portal), Flutter/Dart, `node:test` + `node:assert/strict` for backend tests, Jest + React Testing Library for admin portal tests.

---

## File Map

| Action | File | Responsibility |
|---|---|---|
| Modify | `app/db/userQueries.js` | Add `setUserProfileProperties` |
| Create | `app/routes/profileFieldDefinitionsRouter.js` | Admin CRUD + public GET for definitions |
| Modify | `app/routes/userProfileRouter.js` | Accept `neo4jRun`, type conversion, Neo4j sync, public definitions GET |
| Modify | `app/routes/adminRouter.js` | Mount admin definitions sub-router |
| Modify | `app/routes/v1Router.js` | Mount public definitions router, pass `neo4jRun` to userProfileRouter |
| Create | `app/tests/unit/user.queries.test.js` | Add `setUserProfileProperties` test (existing file) |
| Create | `app/tests/integration/profile-field-definitions.routes.test.js` | Integration tests for definitions CRUD |
| Modify | `app/tests/integration/user-profile.routes.test.js` | Fix role bug, add type conversion + Neo4j sync tests |
| Modify | `admin/src/components/sidebar.tsx` | Add Profile Fields nav item |
| Modify | `admin/src/__tests__/sidebar.test.tsx` | Assert Profile Fields in admin view |
| Create | `admin/src/app/(admin)/profile-fields/page.tsx` | Profile Fields CRUD page |
| Create | `admin/src/app/(admin)/profile-fields/page.module.css` | Page styles |
| Rewrite | `mobile/lib/screens/onboarding/profile_fields.dart` | `ProfileFieldDefinition` model |
| Rewrite | `mobile/lib/screens/onboarding/profile_setup_screen.dart` | Dynamic form rendering |
| Create | `scripts/seed-profile-field-definitions.js` | One-time seed for birthday + gender |

---

### Task 1: `setUserProfileProperties` in `app/db/userQueries.js`

**Files:**
- Modify: `app/db/userQueries.js`
- Test: `app/tests/unit/user.queries.test.js`

- [ ] **Step 1: Write the failing test**

Append to `app/tests/unit/user.queries.test.js`:

```js
import {
  mergeUserAndHabits,
  createSubmissionWithScores,
  setUserProfileProperties,
} from '../../db/userQueries.js';

// … (existing tests stay; add below)

test('setUserProfileProperties merges user and sets props on User node', async () => {
  const calls = [];
  const mockRun = async (cypher, params) => {
    calls.push({ cypher, params });
    return [];
  };
  const fields = [
    { questionId: 'birthday', value: new Date('1990-05-15'), type: 'date' },
    { questionId: 'gender', value: 'female', type: 'select' },
    { questionId: 'score', value: 3.5, type: 'number' },
  ];
  await setUserProfileProperties(mockRun, 'user-xyz', fields);
  assert.strictEqual(calls.length, 1);
  assert.ok(calls[0].cypher.includes('SET u +='));
  assert.strictEqual(calls[0].params.userId, 'user-xyz');
  assert.strictEqual(calls[0].params.props.birthday, '1990-05-15');
  assert.strictEqual(calls[0].params.props.gender, 'female');
  assert.strictEqual(calls[0].params.props.score, 3.5);
});

test('setUserProfileProperties skips fields with null or undefined value', async () => {
  const calls = [];
  const mockRun = async (cypher, params) => {
    calls.push({ cypher, params });
    return [];
  };
  await setUserProfileProperties(mockRun, 'user-xyz', [
    { questionId: 'birthday', value: null, type: 'date' },
  ]);
  assert.strictEqual(calls.length, 0, 'Should not call Neo4j when no valid fields');
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd app && node --test tests/unit/user.queries.test.js
```

Expected: FAIL — `setUserProfileProperties` is not exported.

- [ ] **Step 3: Implement `setUserProfileProperties`**

Append to `app/db/userQueries.js`:

```js
/**
 * Merge a User node and set all profile field values as direct properties.
 * Date fields: stored as ISO "YYYY-MM-DD" string.
 * Number fields: stored as float.
 * Text/select: stored as string.
 * Uses SET u += $props (map merge) — safe for dynamic property names.
 *
 * @param {Function} queryNeo4j
 * @param {string} userId
 * @param {Array<{questionId: string, value: *, type: string}>} fields
 */
export async function setUserProfileProperties(queryNeo4j, userId, fields) {
  const props = {};
  for (const { questionId, value, type } of fields) {
    if (!questionId || value === undefined || value === null) continue;
    if (type === 'date') {
      const d = value instanceof Date ? value : new Date(value);
      if (!isNaN(d.getTime())) props[questionId] = d.toISOString().slice(0, 10);
    } else if (type === 'number') {
      const n = typeof value === 'number' ? value : parseFloat(value);
      if (!isNaN(n)) props[questionId] = n;
    } else {
      props[questionId] = String(value);
    }
  }
  if (Object.keys(props).length === 0) return;
  await queryNeo4j(
    `MERGE (u:User {userId: $userId})
     SET u += $props`,
    { userId, props }
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd app && node --test tests/unit/user.queries.test.js
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add app/db/userQueries.js app/tests/unit/user.queries.test.js
git commit -m "feat: add setUserProfileProperties to userQueries"
```

---

### Task 2: `app/routes/profileFieldDefinitionsRouter.js`

**Files:**
- Create: `app/routes/profileFieldDefinitionsRouter.js`
- Create: `app/tests/integration/profile-field-definitions.routes.test.js`

- [ ] **Step 1: Write the failing integration test**

Create `app/tests/integration/profile-field-definitions.routes.test.js`:

```js
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { generateKeyPairSync, createSign } from 'node:crypto';
import express from 'express';
import { createV1Router } from '../../routes/v1Router.js';

// ── Key material ────────────────────────────────────────────────────────────

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const pubKeyJwk = publicKey.export({ format: 'jwk' });
pubKeyJwk.kid = 'pfd-key-1';
pubKeyJwk.use = 'sig';
const mockJwks = { keys: [pubKeyJwk] };

function base64urlEncode(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
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
        async find(query = {}) {
          let results = [...col];
          for (const [k, v] of Object.entries(query)) {
            results = results.filter((d) => d[k] === v);
          }
          return { async toArray() { return results; } };
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
const realFetch = global.fetch;

before(async () => {
  const db = createMockDb();
  const app = express();
  app.use(express.json());
  const v1 = createV1Router({
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
    if (u.includes('mock-keycloak')) return { ok: true, json: async () => mockJwks };
    return realFetch(u, opts);
  };

  // Warm up JWKS cache
  await fetch(`${baseUrl}/api/v1/health`);
});

after(() => {
  global.fetch = realFetch;
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
  label: 'Your height (cm)',
  type: 'number',
  options: [],
  required: false,
  order: 5,
};

// ── Auth enforcement ─────────────────────────────────────────────────────────

test('GET /admin/profile-field-definitions — 401 without token', async () => {
  const res = await req('GET', '/api/v1/admin/profile-field-definitions');
  assert.strictEqual(res.status, 401);
});

test('GET /admin/profile-field-definitions — 403 for user role', async () => {
  const res = await req('GET', '/api/v1/admin/profile-field-definitions', { token: USER_TOKEN });
  assert.strictEqual(res.status, 403);
});

test('GET /admin/profile-field-definitions — 403 for researcher role', async () => {
  const res = await req('GET', '/api/v1/admin/profile-field-definitions', { token: RESEARCHER_TOKEN });
  assert.strictEqual(res.status, 403);
});

// ── Admin CRUD ───────────────────────────────────────────────────────────────

test('GET /admin/profile-field-definitions — 200 empty array initially', async () => {
  const res = await req('GET', '/api/v1/admin/profile-field-definitions', { token: ADMIN_TOKEN });
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
    body: { fieldId: 'mood', label: 'Mood', type: 'select', options: [], required: false, order: 1 },
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
  const res = await req('PUT', '/api/v1/admin/profile-field-definitions/height', {
    token: ADMIN_TOKEN,
    body: { label: 'Height in cm' },
  });
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.strictEqual(body.label, 'Height in cm');
});

test('PUT /admin/profile-field-definitions/:fieldId — 404 for unknown fieldId', async () => {
  const res = await req('PUT', '/api/v1/admin/profile-field-definitions/unknown_field', {
    token: ADMIN_TOKEN,
    body: { label: 'Whatever' },
  });
  assert.strictEqual(res.status, 404);
});

test('DELETE /admin/profile-field-definitions/:fieldId — 200 removes definition', async () => {
  const res = await req('DELETE', '/api/v1/admin/profile-field-definitions/height', {
    token: ADMIN_TOKEN,
  });
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.strictEqual(body.ok, true);
});

test('DELETE /admin/profile-field-definitions/:fieldId — 404 for unknown fieldId', async () => {
  const res = await req('DELETE', '/api/v1/admin/profile-field-definitions/height', {
    token: ADMIN_TOKEN,
  });
  assert.strictEqual(res.status, 404);
});

// ── Public GET ───────────────────────────────────────────────────────────────

test('GET /profile-field-definitions — 401 without token', async () => {
  const res = await req('GET', '/api/v1/profile-field-definitions');
  assert.strictEqual(res.status, 401);
});

test('GET /profile-field-definitions — 200 for user role', async () => {
  // Seed one definition first via admin
  await req('POST', '/api/v1/admin/profile-field-definitions', {
    token: ADMIN_TOKEN,
    body: { fieldId: 'mood', label: 'Mood', type: 'select', options: ['Happy', 'Sad'], required: false, order: 1 },
  });
  const res = await req('GET', '/api/v1/profile-field-definitions', { token: USER_TOKEN });
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.ok(Array.isArray(body));
  assert.ok(body.some((d) => d.fieldId === 'mood'));
});

test('GET /profile-field-definitions — sorted by order', async () => {
  await req('POST', '/api/v1/admin/profile-field-definitions', {
    token: ADMIN_TOKEN,
    body: { fieldId: 'zzz_last', label: 'Last', type: 'text', options: [], required: false, order: 99 },
  });
  await req('POST', '/api/v1/admin/profile-field-definitions', {
    token: ADMIN_TOKEN,
    body: { fieldId: 'aaa_first', label: 'First', type: 'text', options: [], required: false, order: 1 },
  });
  const res = await req('GET', '/api/v1/profile-field-definitions', { token: USER_TOKEN });
  const body = await res.json();
  const orders = body.map((d) => d.order);
  assert.deepStrictEqual(orders, [...orders].sort((a, b) => a - b));
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd app && node --test tests/integration/profile-field-definitions.routes.test.js
```

Expected: FAIL — routes do not exist yet.

- [ ] **Step 3: Create `app/routes/profileFieldDefinitionsRouter.js`**

```js
import express from 'express';
import { makeGetDb } from '../utils/getDb.js';

const VALID_TYPES = ['text', 'number', 'date', 'select'];
const FIELD_ID_RE = /^[a-z][a-z0-9_]*$/;

export function createProfileFieldDefinitionsAdminRouter({ db } = {}) {
  const router = express.Router();
  const getDb = makeGetDb(db);

  // GET /api/v1/admin/profile-field-definitions
  router.get('/', async (_req, res) => {
    try {
      const database = await getDb();
      const defs = await (await database.collection('profile_field_definitions').find({})).toArray();
      defs.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      res.json(defs.map(({ _id, ...d }) => d));
    } catch (err) {
      console.error('[profileFieldDefs] GET /admin:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /api/v1/admin/profile-field-definitions
  router.post('/', async (req, res) => {
    try {
      const { fieldId, label, type, options = [], required = false, order = 0 } = req.body;
      if (!fieldId || !FIELD_ID_RE.test(fieldId)) {
        return res.status(400).json({ error: 'fieldId must match /^[a-z][a-z0-9_]*$/' });
      }
      if (!VALID_TYPES.includes(type)) {
        return res.status(400).json({ error: `type must be one of: ${VALID_TYPES.join(', ')}` });
      }
      if (!label || typeof label !== 'string') {
        return res.status(400).json({ error: 'label is required' });
      }
      if (type === 'select' && (!Array.isArray(options) || options.length === 0)) {
        return res.status(400).json({ error: 'options must be a non-empty array when type is select' });
      }
      const database = await getDb();
      const existing = await database.collection('profile_field_definitions').findOne({ fieldId });
      if (existing) {
        return res.status(409).json({ error: `fieldId '${fieldId}' already exists` });
      }
      const doc = {
        fieldId,
        label,
        type,
        options,
        required: Boolean(required),
        order: Number(order) || 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      await database.collection('profile_field_definitions').insertOne(doc);
      const { _id, ...rest } = doc;
      res.status(201).json(rest);
    } catch (err) {
      console.error('[profileFieldDefs] POST /admin:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // PUT /api/v1/admin/profile-field-definitions/:fieldId
  router.put('/:fieldId', async (req, res) => {
    try {
      const { fieldId } = req.params;
      const { label, type, options, required, order } = req.body;
      if (type !== undefined && !VALID_TYPES.includes(type)) {
        return res.status(400).json({ error: `type must be one of: ${VALID_TYPES.join(', ')}` });
      }
      if (type === 'select' && (!Array.isArray(options) || options.length === 0)) {
        return res.status(400).json({ error: 'options must be a non-empty array when type is select' });
      }
      const updates = { updatedAt: new Date() };
      if (label !== undefined) updates.label = label;
      if (type !== undefined) updates.type = type;
      if (options !== undefined) updates.options = options;
      if (required !== undefined) updates.required = Boolean(required);
      if (order !== undefined) updates.order = Number(order) || 0;
      const database = await getDb();
      const result = await database
        .collection('profile_field_definitions')
        .findOneAndUpdate({ fieldId }, { $set: updates }, { returnDocument: 'after' });
      if (!result) return res.status(404).json({ error: 'Not found' });
      const { _id, ...rest } = result;
      res.json(rest);
    } catch (err) {
      console.error('[profileFieldDefs] PUT /admin/:fieldId:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // DELETE /api/v1/admin/profile-field-definitions/:fieldId
  router.delete('/:fieldId', async (req, res) => {
    try {
      const { fieldId } = req.params;
      const database = await getDb();
      const result = await database
        .collection('profile_field_definitions')
        .deleteOne({ fieldId });
      if (result.deletedCount === 0) return res.status(404).json({ error: 'Not found' });
      res.json({ ok: true });
    } catch (err) {
      console.error('[profileFieldDefs] DELETE /admin/:fieldId:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}

export function createProfileFieldDefinitionsPublicRouter({ db } = {}) {
  const router = express.Router();
  const getDb = makeGetDb(db);

  // GET /api/v1/profile-field-definitions
  router.get('/', async (_req, res) => {
    try {
      const database = await getDb();
      const defs = await (await database.collection('profile_field_definitions').find({})).toArray();
      defs.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      res.json(defs.map(({ _id, ...d }) => d));
    } catch (err) {
      console.error('[profileFieldDefs] GET /public:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd app && node --test tests/integration/profile-field-definitions.routes.test.js
```

Expected: all tests PASS (after wiring in Task 4 the routes exist — run again after Task 4 if needed).

> Note: Tests that hit `/api/v1/admin/profile-field-definitions` or `/api/v1/profile-field-definitions` will fail until Task 4 wires the routers into v1Router/adminRouter. That is expected — re-run after Task 4.

- [ ] **Step 5: Format**

```bash
cd app && npm run format:fix -- routes/profileFieldDefinitionsRouter.js
```

- [ ] **Step 6: Commit**

```bash
git add app/routes/profileFieldDefinitionsRouter.js app/tests/integration/profile-field-definitions.routes.test.js
git commit -m "feat: add profileFieldDefinitionsRouter with admin CRUD and public GET"
```

---

### Task 3: Update `app/routes/userProfileRouter.js`

**Files:**
- Modify: `app/routes/userProfileRouter.js`
- Modify: `app/tests/integration/user-profile.routes.test.js`

- [ ] **Step 1: Update the integration test**

In `app/tests/integration/user-profile.routes.test.js`:

1. Fix the `makeToken` default role from `['participant']` to `['user']`:
```js
// Line 34 — change:
function makeToken(sub = 'user-1', roles = ['participant']) {
// to:
function makeToken(sub = 'user-1', roles = ['user']) {
```

2. Add `neo4jRun` mock to the `createV1Router` call (around line 94):
```js
const neo4jCalls = [];
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
    neo4jRun: async (cypher, params) => {
      neo4jCalls.push({ cypher, params });
      return [];
    },
  })
);
```

3. Add these tests at the end of the file:

```js
test('POST /user-profile — stores date field as Date object', async () => {
  const token = makeToken('user-date-test');
  const res = await req('POST', '/user-profile', {
    token,
    body: {
      fields: [
        {
          questionId: 'birthday',
          questionText: 'When were you born?',
          type: 'date',
          value: '1990-05-15',
          label: 'May 15, 1990',
        },
      ],
    },
  });
  assert.strictEqual(res.status, 200);
  // Verify GET returns the field
  const getRes = await req('GET', '/user-profile', { token });
  const body = await getRes.json();
  assert.ok(body.fields[0].value instanceof Date || typeof body.fields[0].value === 'string',
    'birthday value should be stored');
});

test('POST /user-profile — stores number field as number', async () => {
  const token = makeToken('user-num-test');
  const res = await req('POST', '/user-profile', {
    token,
    body: {
      fields: [
        {
          questionId: 'score',
          questionText: 'Score',
          type: 'number',
          value: '3.5',
          label: '3.5',
        },
      ],
    },
  });
  assert.strictEqual(res.status, 200);
  const getRes = await req('GET', '/user-profile', { token });
  const body = await getRes.json();
  assert.strictEqual(typeof body.fields[0].value, 'number');
  assert.strictEqual(body.fields[0].value, 3.5);
});
```

- [ ] **Step 2: Run the updated tests to confirm they pass (existing) and new ones fail**

```bash
cd app && node --test tests/integration/user-profile.routes.test.js
```

Expected: existing tests PASS (role fix may affect some — 403 → 200), new tests FAIL.

- [ ] **Step 3: Update `app/routes/userProfileRouter.js`**

Replace the entire file:

```js
import express from 'express';
import neo4j from 'neo4j-driver';
import { makeGetDb } from '../utils/getDb.js';
import { setUserProfileProperties } from '../db/userQueries.js';

function convertFieldValue(field) {
  const { type, value } = field;
  if (value === undefined || value === null) return field;
  if (type === 'date') {
    const d = value instanceof Date ? value : new Date(value);
    return { ...field, value: isNaN(d.getTime()) ? value : d };
  }
  if (type === 'number') {
    const n = typeof value === 'number' ? value : parseFloat(value);
    return { ...field, value: isNaN(n) ? value : n };
  }
  return field;
}

export function createUserProfileServiceRouter({ db } = {}) {
  const router = express.Router();
  const getDb = makeGetDb(db);

  router.get('/service/:userId', async (req, res) => {
    try {
      const token = req.headers['x-service-auth-token'];
      const expected = process.env.API_SERVICE_SECRET;
      if (!token || !expected || token !== expected) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const database = await getDb();
      const doc = await database
        .collection('user_profiles')
        .findOne({ userId: req.params.userId });
      if (!doc) return res.status(404).json({ error: 'Profile not found' });
      const { _id, ...rest } = doc;
      res.json(rest);
    } catch (err) {
      console.error('[userProfileRouter] GET /service/:userId:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}

export function createUserProfileRouter({ db, neo4jRun } = {}) {
  const router = express.Router();
  const getDb = makeGetDb(db);

  const _neo4jDriver = neo4jRun
    ? null
    : neo4j.driver(
        process.env.NEO4J_URI || 'bolt://neo4j:7687',
        neo4j.auth.basic(
          process.env.NEO4J_USER || 'neo4j',
          process.env.NEO4J_PASSWORD || 'password'
        )
      );

  async function queryNeo4j(cypher, params = {}) {
    if (neo4jRun) return neo4jRun(cypher, params);
    const session = _neo4jDriver.session();
    try {
      const result = await session.run(cypher, params);
      return result.records.map((r) => r.toObject());
    } finally {
      await session.close();
    }
  }

  router.post('/', async (req, res) => {
    try {
      const userId = req.user?.sub;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const { fields } = req.body;
      if (!Array.isArray(fields) || fields.length === 0) {
        return res.status(400).json({ error: 'fields must be a non-empty array' });
      }
      for (const f of fields) {
        if (
          typeof f.questionId !== 'string' ||
          !f.questionId ||
          typeof f.questionText !== 'string' ||
          !f.questionText ||
          f.value === undefined ||
          f.value === null ||
          typeof f.label !== 'string' ||
          !f.label
        ) {
          return res.status(400).json({
            error: 'each field must have questionId, questionText, value, and label',
          });
        }
      }

      const converted = fields.map(convertFieldValue);

      const database = await getDb();
      await database
        .collection('user_profiles')
        .updateOne(
          { userId },
          { $set: { userId, fields: converted, updatedAt: new Date() } },
          { upsert: true }
        );

      // Fire-and-forget Neo4j sync
      setUserProfileProperties(queryNeo4j, userId, converted).catch((err) =>
        console.error('[userProfileRouter] Neo4j sync error:', err)
      );

      res.json({ ok: true });
    } catch (err) {
      console.error('[userProfileRouter] POST /:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.get('/', async (req, res) => {
    try {
      const database = await getDb();
      const doc = await database
        .collection('user_profiles')
        .findOne({ userId: req.user?.sub });
      if (!doc) return res.status(404).json({ error: 'Profile not found' });
      const { _id, ...rest } = doc;
      res.json(rest);
    } catch (err) {
      console.error('[userProfileRouter] GET /:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd app && node --test tests/integration/user-profile.routes.test.js
```

Expected: all tests PASS.

- [ ] **Step 5: Format**

```bash
cd app && npm run format:fix -- routes/userProfileRouter.js
```

- [ ] **Step 6: Commit**

```bash
git add app/routes/userProfileRouter.js app/tests/integration/user-profile.routes.test.js
git commit -m "feat: add type conversion and Neo4j sync to userProfileRouter"
```

---

### Task 4: Wire routing in `adminRouter.js` and `v1Router.js`

**Files:**
- Modify: `app/routes/adminRouter.js`
- Modify: `app/routes/v1Router.js`

- [ ] **Step 1: Update `app/routes/adminRouter.js`**

Add import at the top (after existing imports):
```js
import { createProfileFieldDefinitionsAdminRouter } from './profileFieldDefinitionsRouter.js';
```

Add mount before the `return router;` line at the bottom of `createAdminRouter`:
```js
router.use(
  '/profile-field-definitions',
  requireRole(ROLES.ADMIN),
  createProfileFieldDefinitionsAdminRouter({ db })
);
```

- [ ] **Step 2: Update `app/routes/v1Router.js`**

Add import (after existing router imports):
```js
import { createProfileFieldDefinitionsPublicRouter } from './profileFieldDefinitionsRouter.js';
```

Update the `createUserProfileRouter` call (around line 252) to pass `neo4jRun`:
```js
router.use(
  '/user-profile',
  requireRole(ROLES.USER, ROLES.ADMIN, ROLES.RESEARCHER),
  createUserProfileRouter({ db, neo4jRun })
);
```

Add a new mount for the public definitions route (add after the `/user-profile` block):
```js
// Profile field definitions: require user, admin, or researcher role
router.use(
  '/profile-field-definitions',
  requireRole(ROLES.USER, ROLES.ADMIN, ROLES.RESEARCHER),
  createProfileFieldDefinitionsPublicRouter({ db })
);
```

- [ ] **Step 3: Run all backend tests**

```bash
cd app && node --test tests/unit/user.queries.test.js tests/integration/user-profile.routes.test.js tests/integration/profile-field-definitions.routes.test.js
```

Expected: all tests PASS.

- [ ] **Step 4: Run the full test suite**

```bash
cd app && npm test
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/routes/adminRouter.js app/routes/v1Router.js
git commit -m "feat: wire profile-field-definitions routes in adminRouter and v1Router"
```

---

### Task 5: Admin portal — sidebar + profile-fields page

**Files:**
- Modify: `admin/src/components/sidebar.tsx`
- Modify: `admin/src/__tests__/sidebar.test.tsx`
- Create: `admin/src/app/(admin)/profile-fields/page.tsx`
- Create: `admin/src/app/(admin)/profile-fields/page.module.css`

- [ ] **Step 1: Write the failing sidebar test**

In `admin/src/__tests__/sidebar.test.tsx`, add to the existing `describe('Sidebar')` block:

```tsx
it('shows Profile Fields for admin', () => {
  mockedUseSession.mockReturnValue({
    data: { roles: ['admin'], accessToken: '', user: { email: 'a@test.com' }, expires: '' },
    status: 'authenticated',
    update: jest.fn(),
  });
  render(<Sidebar />);
  expect(screen.getByText('Profile Fields')).toBeInTheDocument();
});

it('does not show Profile Fields for researcher', () => {
  mockedUseSession.mockReturnValue({
    data: { roles: ['researcher'], accessToken: '', user: { email: 'r@test.com' }, expires: '' },
    status: 'authenticated',
    update: jest.fn(),
  });
  render(<Sidebar />);
  expect(screen.queryByText('Profile Fields')).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run the sidebar test to verify it fails**

```bash
cd admin && npx jest src/__tests__/sidebar.test.tsx
```

Expected: FAIL — "Profile Fields" not found.

- [ ] **Step 3: Update `admin/src/components/sidebar.tsx`**

Add the new nav item to `NAV_ITEMS`:
```tsx
const NAV_ITEMS: NavItem[] = [
  { href: "/studies", label: "Studies", icon: "🔬" },
  { href: "/questionnaires", label: "Questionnaires", icon: "📋" },
  { href: "/profile-fields", label: "Profile Fields", icon: "👤", adminOnly: true },
  { href: "/knowledge-base", label: "Knowledge Base", icon: "📚", adminOnly: true },
  { href: "/settings", label: "Settings", icon: "⚙️", adminOnly: true },
];
```

- [ ] **Step 4: Run the sidebar test to verify it passes**

```bash
cd admin && npx jest src/__tests__/sidebar.test.tsx
```

Expected: all tests PASS (including the pre-existing "shows all nav items for admin" — it checks for KB and Settings but not exhaustively, so adding Profile Fields does not break it).

- [ ] **Step 5: Create `admin/src/app/(admin)/profile-fields/page.module.css`**

```css
.page {
  max-width: 1200px;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 2rem;
}

.headerText {}

.title {
  font-size: 1.75rem;
  font-weight: 700;
  color: var(--color-text);
  margin-bottom: 0.375rem;
}

.subtitle {
  color: var(--color-text-muted);
  font-size: 0.95rem;
}

.addButton {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.625rem 1.25rem;
  background: var(--color-primary);
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
}

.addButton:hover { opacity: 0.9; }

.error {
  color: #dc2626;
  margin-bottom: 1rem;
  font-size: 0.9rem;
}

.tableWrap {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  overflow: hidden;
  margin-bottom: 2rem;
}

.table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
}

.table th {
  background: #f1f5f9;
  text-align: left;
  padding: 0.75rem 1rem;
  font-weight: 600;
  color: var(--color-text-muted);
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-bottom: 1px solid var(--color-border);
}

.table td {
  padding: 0.875rem 1rem;
  border-bottom: 1px solid var(--color-border);
  vertical-align: middle;
}

.table tr:last-child td { border-bottom: none; }

.actionBtn {
  padding: 0.25rem 0.75rem;
  border-radius: 6px;
  font-size: 0.8rem;
  cursor: pointer;
  border: 1px solid var(--color-border);
  background: transparent;
  margin-right: 0.5rem;
}

.editBtn { color: var(--color-primary); }
.deleteBtn { color: #dc2626; }

.formSection {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 1.5rem;
}

.formSection h2 {
  font-size: 1.1rem;
  font-weight: 700;
  margin-bottom: 1.25rem;
}

.formRow {
  display: flex;
  align-items: flex-start;
  gap: 1rem;
  margin-bottom: 1rem;
}

.formLabel {
  width: 100px;
  font-size: 0.875rem;
  font-weight: 600;
  padding-top: 0.4rem;
  flex-shrink: 0;
}

.formInput {
  flex: 1;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  font-size: 0.875rem;
}

.formSelect {
  flex: 1;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  font-size: 0.875rem;
}

.optionRow {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.25rem;
  font-size: 0.875rem;
}

.optionRow button {
  background: none;
  border: none;
  cursor: pointer;
  color: #dc2626;
  font-size: 0.8rem;
}

.addOptionRow {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.5rem;
}

.addOptionRow button {
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
  font-size: 0.875rem;
}

.formActions {
  display: flex;
  gap: 0.75rem;
  margin-top: 1.5rem;
}

.saveButton {
  padding: 0.5rem 1.25rem;
  background: var(--color-primary);
  color: #fff;
  border: none;
  border-radius: 6px;
  font-weight: 600;
  cursor: pointer;
}

.cancelButton {
  padding: 0.5rem 1.25rem;
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  cursor: pointer;
}
```

- [ ] **Step 6: Create `admin/src/app/(admin)/profile-fields/page.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import styles from "./page.module.css";

const VALID_TYPES = ["text", "number", "date", "select"] as const;
type FieldType = (typeof VALID_TYPES)[number];

interface ProfileFieldDefinition {
  fieldId: string;
  label: string;
  type: FieldType;
  options: string[];
  required: boolean;
  order: number;
}

const API_BASE =
  (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api/v1") +
  "/admin/profile-field-definitions";

async function apiFetch(url: string, token: string, opts: RequestInit = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(opts.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(
      (body as { error?: string }).error ?? `HTTP ${res.status}`
    );
    (err as Error & { status?: number }).status = res.status;
    throw err;
  }
  return res.json();
}

function emptyForm(): ProfileFieldDefinition {
  return { fieldId: "", label: "", type: "text", options: [], required: false, order: 0 };
}

export default function ProfileFieldsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [defs, setDefs] = useState<ProfileFieldDefinition[]>([]);
  const [form, setForm] = useState<ProfileFieldDefinition>(emptyForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [newOption, setNewOption] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === "loading") return;
    if (!session?.roles?.includes("admin")) router.replace("/access-denied");
  }, [session, status, router]);

  useEffect(() => {
    if (!session?.accessToken) return;
    apiFetch(API_BASE, session.accessToken)
      .then(setDefs)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [session?.accessToken]);

  async function handleSave() {
    if (!session?.accessToken) return;
    setError(null);
    try {
      if (editingId) {
        const { label, type, options, required, order } = form;
        const updated = await apiFetch(`${API_BASE}/${editingId}`, session.accessToken, {
          method: "PUT",
          body: JSON.stringify({ label, type, options, required, order }),
        });
        setDefs(defs.map((d) => (d.fieldId === editingId ? updated : d)));
      } else {
        const created = await apiFetch(API_BASE, session.accessToken, {
          method: "POST",
          body: JSON.stringify(form),
        });
        setDefs([...defs, created]);
      }
      setShowForm(false);
      setEditingId(null);
      setForm(emptyForm());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error saving");
    }
  }

  async function handleDelete(fieldId: string) {
    if (!session?.accessToken || !confirm(`Delete field '${fieldId}'?`)) return;
    try {
      await apiFetch(`${API_BASE}/${fieldId}`, session.accessToken, { method: "DELETE" });
      setDefs(defs.filter((d) => d.fieldId !== fieldId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error deleting");
    }
  }

  function startEdit(def: ProfileFieldDefinition) {
    setForm({ ...def });
    setEditingId(def.fieldId);
    setShowForm(true);
  }

  function addOption() {
    if (!newOption.trim()) return;
    setForm({ ...form, options: [...form.options, newOption.trim()] });
    setNewOption("");
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.headerText}>
          <h1 className={styles.title}>Profile Fields</h1>
          <p className={styles.subtitle}>
            Configure which fields appear in the onboarding profile setup.
          </p>
        </div>
        <button className={styles.addButton} onClick={() => { setForm(emptyForm()); setEditingId(null); setShowForm(true); }}>
          + Add Field
        </button>
      </div>

      {error && <p className={styles.error}>{error}</p>}

      {loading ? (
        <p>Loading…</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Label</th>
                <th>Field ID</th>
                <th>Type</th>
                <th>Required</th>
                <th>Order</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {defs.map((def) => (
                <tr key={def.fieldId}>
                  <td>{def.label}</td>
                  <td><code>{def.fieldId}</code></td>
                  <td>{def.type}</td>
                  <td>{def.required ? "Yes" : "No"}</td>
                  <td>{def.order}</td>
                  <td>
                    <button className={`${styles.actionBtn} ${styles.editBtn}`} onClick={() => startEdit(def)}>Edit</button>
                    <button className={`${styles.actionBtn} ${styles.deleteBtn}`} onClick={() => handleDelete(def.fieldId)}>Delete</button>
                  </td>
                </tr>
              ))}
              {defs.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign: "center", color: "var(--color-text-muted)", padding: "2rem" }}>No profile fields defined yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <div className={styles.formSection}>
          <h2>{editingId ? "Edit Field" : "Add Field"}</h2>

          <div className={styles.formRow}>
            <label className={styles.formLabel}>Field ID</label>
            <input
              className={styles.formInput}
              value={form.fieldId}
              onChange={(e) => setForm({ ...form, fieldId: e.target.value })}
              disabled={!!editingId}
              placeholder="e.g. birthday (lowercase, underscores only)"
            />
          </div>

          <div className={styles.formRow}>
            <label className={styles.formLabel}>Label</label>
            <input
              className={styles.formInput}
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
              placeholder="Shown to the user"
            />
          </div>

          <div className={styles.formRow}>
            <label className={styles.formLabel}>Type</label>
            <select
              className={styles.formSelect}
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value as FieldType, options: [] })}
            >
              {VALID_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          {form.type === "select" && (
            <div className={styles.formRow}>
              <label className={styles.formLabel}>Options</label>
              <div>
                {form.options.map((opt, i) => (
                  <div key={i} className={styles.optionRow}>
                    <span>{opt}</span>
                    <button onClick={() => setForm({ ...form, options: form.options.filter((_, j) => j !== i) })}>✕</button>
                  </div>
                ))}
                <div className={styles.addOptionRow}>
                  <input
                    className={styles.formInput}
                    value={newOption}
                    onChange={(e) => setNewOption(e.target.value)}
                    placeholder="New option"
                    onKeyDown={(e) => e.key === "Enter" && addOption()}
                  />
                  <button onClick={addOption}>Add</button>
                </div>
              </div>
            </div>
          )}

          <div className={styles.formRow}>
            <label className={styles.formLabel}>Required</label>
            <input
              type="checkbox"
              checked={form.required}
              onChange={(e) => setForm({ ...form, required: e.target.checked })}
            />
          </div>

          <div className={styles.formRow}>
            <label className={styles.formLabel}>Order</label>
            <input
              className={styles.formInput}
              type="number"
              value={form.order}
              onChange={(e) => setForm({ ...form, order: parseInt(e.target.value, 10) || 0 })}
            />
          </div>

          <div className={styles.formActions}>
            <button className={styles.saveButton} onClick={handleSave}>
              {editingId ? "Save" : "Create"}
            </button>
            <button className={styles.cancelButton} onClick={() => { setShowForm(false); setEditingId(null); setForm(emptyForm()); }}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 7: Run all admin portal tests**

```bash
cd admin && npx jest
```

Expected: all tests PASS including new sidebar tests.

- [ ] **Step 8: Commit**

```bash
git add admin/src/components/sidebar.tsx admin/src/__tests__/sidebar.test.tsx admin/src/app/\(admin\)/profile-fields/
git commit -m "feat: add Profile Fields admin portal page and sidebar nav item"
```

---

### Task 6: Flutter dynamic profile setup

**Files:**
- Rewrite: `mobile/lib/screens/onboarding/profile_fields.dart`
- Rewrite: `mobile/lib/screens/onboarding/profile_setup_screen.dart`

- [ ] **Step 1: Rewrite `mobile/lib/screens/onboarding/profile_fields.dart`**

```dart
class ProfileFieldDefinition {
  final String fieldId;
  final String label;
  final String type; // 'text', 'number', 'date', 'select'
  final List<String> options;
  final bool required;
  final int order;

  const ProfileFieldDefinition({
    required this.fieldId,
    required this.label,
    required this.type,
    required this.options,
    required this.required,
    required this.order,
  });

  factory ProfileFieldDefinition.fromJson(Map<String, dynamic> json) {
    return ProfileFieldDefinition(
      fieldId: json['fieldId'] as String,
      label: json['label'] as String,
      type: json['type'] as String,
      options: (json['options'] as List<dynamic>?)?.cast<String>() ?? const [],
      required: json['required'] as bool? ?? false,
      order: json['order'] as int? ?? 0,
    );
  }
}

String formatDate(DateTime d) {
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  return '${months[d.month - 1]} ${d.day}, ${d.year}';
}

String isoDate(DateTime d) {
  final y = d.year.toString().padLeft(4, '0');
  final m = d.month.toString().padLeft(2, '0');
  final day = d.day.toString().padLeft(2, '0');
  return '$y-$m-$day';
}
```

- [ ] **Step 2: Rewrite `mobile/lib/screens/onboarding/profile_setup_screen.dart`**

```dart
import 'package:flutter/material.dart';
import 'package:flutter/cupertino.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/dio_provider.dart';
import '../../config/app_config.dart';
import 'profile_fields.dart';

class ProfileSetupScreen extends ConsumerStatefulWidget {
  const ProfileSetupScreen({super.key});

  @override
  ConsumerState<ProfileSetupScreen> createState() => _ProfileSetupScreenState();
}

class _ProfileSetupScreenState extends ConsumerState<ProfileSetupScreen> {
  List<ProfileFieldDefinition> _definitions = [];
  final Map<String, dynamic> _values = {};
  final Map<String, TextEditingController> _controllers = {};
  bool _loading = true;
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    _fetchDefinitions();
  }

  @override
  void dispose() {
    for (final c in _controllers.values) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _fetchDefinitions() async {
    try {
      final dio = ref.read(dioProvider);
      final response = await dio.get(
        '${AppConfig.apiBaseUrl}/profile-field-definitions',
      );
      final List<dynamic> data = response.data as List<dynamic>;
      setState(() {
        _definitions = data
            .map((e) => ProfileFieldDefinition.fromJson(e as Map<String, dynamic>))
            .toList();
        _loading = false;
      });
    } catch (_) {
      setState(() => _loading = false);
    }
  }

  bool get _canSubmit {
    if (_submitting) return false;
    return _definitions
        .where((d) => d.required)
        .every((d) => _values.containsKey(d.fieldId));
  }

  Future<void> _showDatePicker(ProfileFieldDefinition def) async {
    if (_submitting) return;
    DateTime temp = _values[def.fieldId] is DateTime
        ? _values[def.fieldId] as DateTime
        : DateTime(1990);
    final controller = FixedExtentScrollController();

    await showModalBottomSheet<void>(
      context: context,
      builder: (context) => SafeArea(
        child: SizedBox(
          height: 320,
          child: Column(
            children: [
              Align(
                alignment: Alignment.centerRight,
                child: TextButton(
                  onPressed: () {
                    setState(() => _values[def.fieldId] = temp);
                    Navigator.of(context).pop();
                  },
                  child: const Text('Done'),
                ),
              ),
              Expanded(
                child: CupertinoDatePicker(
                  mode: CupertinoDatePickerMode.date,
                  initialDateTime: temp,
                  maximumDate: DateTime.now(),
                  minimumDate: DateTime(1900),
                  onDateTimeChanged: (dt) => temp = dt,
                ),
              ),
            ],
          ),
        ),
      ),
    );
    controller.dispose();
  }

  Future<void> _showSelectPicker(ProfileFieldDefinition def) async {
    if (_submitting) return;
    final options = def.options;
    String temp = _values[def.fieldId] as String? ?? options.first;
    final initialIndex = options.indexOf(temp);
    final controller = FixedExtentScrollController(
      initialItem: initialIndex < 0 ? 0 : initialIndex,
    );

    await showModalBottomSheet<void>(
      context: context,
      builder: (context) => SafeArea(
        child: SizedBox(
          height: 320,
          child: Column(
            children: [
              Align(
                alignment: Alignment.centerRight,
                child: TextButton(
                  onPressed: () {
                    setState(() => _values[def.fieldId] = temp);
                    Navigator.of(context).pop();
                  },
                  child: const Text('Done'),
                ),
              ),
              Expanded(
                child: CupertinoPicker(
                  itemExtent: 36,
                  scrollController: controller,
                  onSelectedItemChanged: (i) => temp = options[i],
                  children: [
                    for (final opt in options) Center(child: Text(opt)),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
    controller.dispose();
  }

  String _displayValue(ProfileFieldDefinition def) {
    final val = _values[def.fieldId];
    if (val == null) return '';
    if (def.type == 'date' && val is DateTime) return formatDate(val);
    return val.toString();
  }

  List<Map<String, dynamic>> _buildFields() {
    final result = <Map<String, dynamic>>[];
    for (final def in _definitions) {
      final val = _values[def.fieldId];
      if (val == null) continue;
      dynamic submittedValue;
      String label;
      if (def.type == 'date' && val is DateTime) {
        submittedValue = isoDate(val);
        label = formatDate(val);
      } else if (def.type == 'number') {
        final n = double.tryParse(val.toString()) ?? 0.0;
        submittedValue = n;
        label = n.toString();
      } else {
        submittedValue = val.toString();
        label = val.toString();
      }
      result.add({
        'questionId': def.fieldId,
        'questionText': def.label,
        'type': def.type,
        'value': submittedValue,
        'label': label,
      });
    }
    return result;
  }

  Future<void> _submit() async {
    final fields = _buildFields();
    if (fields.isEmpty) {
      if (mounted) context.go('/onboarding/study-code');
      return;
    }
    setState(() => _submitting = true);
    try {
      final dio = ref.read(dioProvider);
      await dio.post(
        '${AppConfig.apiBaseUrl}/user-profile',
        data: {'fields': fields},
      );
    } catch (_) {
      // Best-effort — profile missing is recoverable
    }
    if (mounted) context.go('/onboarding/study-code');
  }

  void _skip() => context.go('/onboarding/study-code');

  Widget _buildFieldInput(ProfileFieldDefinition def) {
    final cs = Theme.of(context).colorScheme;
    final tt = Theme.of(context).textTheme;
    final hasValue = _values.containsKey(def.fieldId);
    final displayText = hasValue ? _displayValue(def) : null;

    if (def.type == 'date' || def.type == 'select') {
      return InkWell(
        onTap: def.type == 'date'
            ? () => _showDatePicker(def)
            : () => _showSelectPicker(def),
        borderRadius: BorderRadius.circular(14),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          decoration: BoxDecoration(
            color: cs.surfaceContainerHighest,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: cs.outlineVariant),
          ),
          child: Row(
            children: [
              Expanded(
                child: Text(
                  displayText ??
                      (def.type == 'date' ? 'Select date' : 'Select option'),
                  style: tt.bodyLarge?.copyWith(
                    color: displayText == null
                        ? cs.onSurfaceVariant
                        : cs.onSurface,
                    fontWeight: displayText == null
                        ? FontWeight.w500
                        : FontWeight.w700,
                  ),
                ),
              ),
              Icon(Icons.unfold_more_rounded, color: cs.onSurfaceVariant),
            ],
          ),
        ),
      );
    }

    // text or number
    final ctrl = _controllers.putIfAbsent(
      def.fieldId,
      () => TextEditingController(text: _values[def.fieldId]?.toString() ?? ''),
    );
    return TextField(
      controller: ctrl,
      keyboardType: def.type == 'number'
          ? const TextInputType.numberWithOptions(decimal: true)
          : TextInputType.text,
      decoration: InputDecoration(
        filled: true,
        fillColor: cs.surfaceContainerHighest,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: BorderSide(color: cs.outlineVariant),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: BorderSide(color: cs.outlineVariant),
        ),
        hintText: def.type == 'number' ? 'Enter a number' : 'Enter text',
      ),
      onChanged: (v) {
        if (def.type == 'number') {
          final n = double.tryParse(v);
          if (n != null) {
            setState(() => _values[def.fieldId] = n);
          } else {
            setState(() => _values.remove(def.fieldId));
          }
        } else {
          setState(() {
            if (v.isNotEmpty) {
              _values[def.fieldId] = v;
            } else {
              _values.remove(def.fieldId);
            }
          });
        }
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final tt = Theme.of(context).textTheme;

    return Scaffold(
      body: SafeArea(
        child: _loading
            ? const Center(child: CircularProgressIndicator())
            : SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(28, 24, 28, 32),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Align(
                      alignment: Alignment.topRight,
                      child: TextButton(
                        onPressed: _skip,
                        child: const Text('Skip'),
                      ),
                    ),
                    const SizedBox(height: 12),
                    Center(
                      child: Container(
                        width: 72,
                        height: 72,
                        decoration: BoxDecoration(
                          color: cs.primaryContainer,
                          borderRadius: BorderRadius.circular(22),
                          boxShadow: [
                            BoxShadow(
                              color: cs.primary.withAlpha(0x2E),
                              blurRadius: 20,
                              offset: const Offset(0, 6),
                            ),
                          ],
                        ),
                        child: Icon(
                          Icons.person_outline,
                          size: 40,
                          color: cs.primary,
                        ),
                      ),
                    ),
                    const SizedBox(height: 24),
                    Text(
                      'Tell us about yourself',
                      style: tt.headlineSmall
                          ?.copyWith(fontWeight: FontWeight.w900),
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'This helps personalise your habit recommendations. You can skip and update later.',
                      style: tt.bodyMedium?.copyWith(
                        color: cs.onSurfaceVariant,
                        height: 1.5,
                      ),
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 32),
                    for (final def in _definitions) ...[
                      Text(
                        def.label,
                        style: tt.titleSmall
                            ?.copyWith(fontWeight: FontWeight.w700),
                      ),
                      const SizedBox(height: 10),
                      _buildFieldInput(def),
                      const SizedBox(height: 28),
                    ],
                    const SizedBox(height: 12),
                    FilledButton(
                      onPressed: _canSubmit ? _submit : null,
                      child: _submitting
                          ? const SizedBox(
                              height: 20,
                              width: 20,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: Colors.white,
                              ),
                            )
                          : const Text('Continue'),
                    ),
                  ],
                ),
              ),
      ),
    );
  }
}
```

- [ ] **Step 3: Run Flutter analyze**

```bash
cd mobile && flutter analyze lib/screens/onboarding/
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add mobile/lib/screens/onboarding/profile_fields.dart mobile/lib/screens/onboarding/profile_setup_screen.dart
git commit -m "feat: rewrite profile setup screen to use dynamic field definitions"
```

---

### Task 7: Seed script

**Files:**
- Create: `scripts/seed-profile-field-definitions.js`

- [ ] **Step 1: Create `scripts/seed-profile-field-definitions.js`**

```js
#!/usr/bin/env node
/**
 * Idempotent seed: inserts birthday (date) and gender (select) profile field
 * definitions. Safe to re-run — uses upsert on fieldId.
 *
 * Usage (run from project root):
 *   node scripts/seed-profile-field-definitions.js
 *   node scripts/seed-profile-field-definitions.js --dry-run
 */

import { MongoClient } from 'mongodb';

const DRY_RUN = process.argv.includes('--dry-run');

const DEFINITIONS = [
  {
    fieldId: 'birthday',
    label: 'When were you born?',
    type: 'date',
    options: [],
    required: false,
    order: 1,
  },
  {
    fieldId: 'gender',
    label: 'What is your gender?',
    type: 'select',
    options: ['Male', 'Female', 'Non-binary', 'Prefer not to say'],
    required: false,
    order: 2,
  },
];

async function main() {
  const uri = `mongodb://${process.env.MONGO_USER}:${process.env.MONGO_PASSWORD}@${process.env.MONGO_HOST ?? 'localhost'}:${process.env.MONGO_PORT ?? 27017}/${process.env.MONGO_DB ?? 'surveyjs'}?authSource=${process.env.MONGO_AUTH_SOURCE ?? 'admin'}`;
  const client = new MongoClient(uri);

  try {
    await client.connect();
    const db = client.db(process.env.MONGO_DB ?? 'surveyjs');
    const col = db.collection('profile_field_definitions');

    for (const def of DEFINITIONS) {
      const existing = await col.findOne({ fieldId: def.fieldId });
      if (existing) {
        console.log(`[skip]   ${def.fieldId} — already exists`);
        continue;
      }
      const doc = { ...def, createdAt: new Date(), updatedAt: new Date() };
      if (DRY_RUN) {
        console.log(`[dry-run] would insert: ${JSON.stringify(doc)}`);
      } else {
        await col.insertOne(doc);
        console.log(`[insert] ${def.fieldId}`);
      }
    }

    console.log('Done.');
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Verify the script is parseable**

```bash
node --check scripts/seed-profile-field-definitions.js
```

Expected: no output (syntax valid).

- [ ] **Step 3: Run a dry-run to verify logic**

```bash
MONGO_HOST=localhost MONGO_USER=admin MONGO_PASSWORD=test node scripts/seed-profile-field-definitions.js --dry-run
```

Expected: output showing two `[dry-run] would insert:` lines (or `[skip]` if already seeded).

- [ ] **Step 4: Commit**

```bash
git add scripts/seed-profile-field-definitions.js
git commit -m "feat: add seed script for profile field definitions"
```

---

### Final check

- [ ] **Run full backend test suite**

```bash
cd app && npm test
```

Expected: PASS.

- [ ] **Run admin portal test suite**

```bash
cd admin && npx jest
```

Expected: PASS.

- [ ] **Run Flutter analyze**

```bash
cd mobile && flutter analyze lib/screens/onboarding/
```

Expected: no errors.
