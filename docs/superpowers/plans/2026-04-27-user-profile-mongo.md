# User Profile MongoDB Collection — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `form_responses` user-profile write with a dedicated `user_profiles` MongoDB collection storing structured Q&A, wire it into the LLM pipeline, and add a settings screen for editing.

**Architecture:** A new `userProfileRouter.js` exports two sub-routers — one for service-token access (mounted before JWT auth) and one for user JWT access (mounted after). The Python `extract_profile.py` fetches from the new service endpoint and formats `fields` as human-readable text for the LLM. Flutter's onboarding screen POSTs structured fields and a new `PersonalInfoScreen` lets users edit them later.

**Tech Stack:** Node.js/Express, MongoDB, Python/FastAPI/httpx, Flutter/Dart/Riverpod/GoRouter

---

## File Map

| File | Action |
|------|--------|
| `app/routes/userProfileRouter.js` | **Create** — two exported router factories |
| `app/routes/v1Router.js` | **Modify** — import + mount both sub-routers |
| `app/tests/integration/user-profile.routes.test.js` | **Create** — integration tests |
| `API-service/routers/extract_profile.py` | **Modify** — replace user-profile fetch + format |
| `API-service/tests/test_extract_profile.py` | **Modify** — update mocks to patch `_fetch_user_profile` |
| `mobile/lib/screens/onboarding/profile_fields.dart` | **Create** — shared constants |
| `mobile/lib/screens/onboarding/profile_setup_screen.dart` | **Modify** — use shared constants + new POST payload |
| `mobile/lib/screens/settings/personal_info_screen.dart` | **Create** — edit profile screen |
| `mobile/lib/main.dart` | **Modify** — register `/settings/personal-info` route |
| `mobile/lib/screens/user_settings_screen.dart` | **Modify** — add Personal info row |

---

## Task 1: Create the backend router (stub + tests first)

**Files:**
- Create: `app/routes/userProfileRouter.js`
- Create: `app/tests/integration/user-profile.routes.test.js`

- [ ] **Step 1: Create the stub router**

Create `app/routes/userProfileRouter.js` with this content:

```javascript
import express from 'express';
import { makeGetDb } from '../utils/getDb.js';

export function createUserProfileServiceRouter({ db } = {}) {
  const router = express.Router();
  const getDb = makeGetDb(db);

  // GET /service/:userId — service-to-service, authenticated via X-Service-Auth-Token
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

export function createUserProfileRouter({ db } = {}) {
  const router = express.Router();
  const getDb = makeGetDb(db);

  // POST / — upsert caller's structured user profile
  router.post('/', async (req, res) => {
    try {
      const userId = req.user?.sub;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const { fields } = req.body;
      if (!Array.isArray(fields) || fields.length === 0) {
        return res
          .status(400)
          .json({ error: 'fields must be a non-empty array' });
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
            error:
              'each field must have questionId, questionText, value, and label',
          });
        }
      }

      const database = await getDb();
      await database.collection('user_profiles').updateOne(
        { userId },
        { $set: { userId, fields, updatedAt: new Date() } },
        { upsert: true }
      );
      res.json({ ok: true });
    } catch (err) {
      console.error('[userProfileRouter] POST /:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET / — return caller's profile or 404
  router.get('/', async (req, res) => {
    try {
      const database = await getDb();
      const doc = await database
        .collection('user_profiles')
        .findOne({ userId: req.user.sub });
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

- [ ] **Step 2: Register the router in v1Router.js**

Open `app/routes/v1Router.js`.

Add this import near the top with the other router imports:

```javascript
import { createUserProfileRouter, createUserProfileServiceRouter } from './userProfileRouter.js';
```

Add the service sub-router BEFORE the `router.use(authenticate)` line (around line 133, after the `/onboard` mount):

```javascript
// Service-to-service: user profile (no JWT required, uses X-Service-Auth-Token)
router.use('/user-profile', createUserProfileServiceRouter({ db }));
```

Add the user-auth sub-router AFTER the `router.use(limiter)` line (after the existing profile route around line 175, following the same pattern):

```javascript
// User profile: require participant, admin, or researcher role
router.use(
  '/user-profile',
  requireRole('participant', 'admin', 'researcher'),
  createUserProfileRouter({ db })
);
```

- [ ] **Step 3: Write the integration tests**

Create `app/tests/integration/user-profile.routes.test.js`:

```javascript
import { test, before, after } from 'node:test';
import assert from 'node:assert';
import { createServer } from 'node:http';
import { generateKeyPairSync, createSign } from 'node:crypto';
import express from 'express';
import { createV1Router } from '../../routes/v1Router.js';

// ── Key material ──────────────────────────────────────────────────────────────

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const pubKeyJwk = publicKey.export({ format: 'jwk' });
pubKeyJwk.kid = 'up-key-1';
pubKeyJwk.use = 'sig';
const mockJwks = { keys: [pubKeyJwk] };

// ── JWT helpers ───────────────────────────────────────────────────────────────

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

// ── In-memory mock MongoDB ────────────────────────────────────────────────────

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

// ── Test server setup ─────────────────────────────────────────────────────────

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

// ── POST /user-profile ────────────────────────────────────────────────────────

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
      fields: [{ questionId: 'age', questionText: 'Age', value: 21 }], // missing label
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

// ── GET /user-profile ─────────────────────────────────────────────────────────

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

// ── GET /user-profile/service/:userId ────────────────────────────────────────

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
```

- [ ] **Step 4: Run the tests**

```bash
cd /Users/felixreinsch/Github/health-habit-hub/app
node --test tests/integration/user-profile.routes.test.js
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add app/routes/userProfileRouter.js app/routes/v1Router.js app/tests/integration/user-profile.routes.test.js
git commit -m "feat: add user_profiles MongoDB collection with service + user-auth endpoints"
```

---

## Task 2: Update Python extract_profile.py

**Files:**
- Modify: `API-service/routers/extract_profile.py`
- Modify: `API-service/tests/test_extract_profile.py`

- [ ] **Step 1: Write the new failing test**

Open `API-service/tests/test_extract_profile.py`.

The current tests patch `_fetch_questionnaire_response` with a `side_effect` list of three responses (sliq, rand36, user-profile). The user-profile response used `answers` key. We need to update this to:
1. Only two `_fetch_questionnaire_response` calls (sliq + rand-36)
2. A new `_fetch_user_profile` call returning `fields` key

Add this new test and update the existing ones. Replace the entire file content with:

```python
"""Unit tests for POST /api/v1/llm/extract-profile."""
import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from main import app

_SLIQ_RESPONSE = {
    "userId": "user-abc",
    "questionnaireSlug": "sliq",
    "answers": {
        "sliq_sleep_quality": "3",
        "sliq_sleep_duration": "6",
        "sliq_daytime_sleepiness": "2",
    },
}

_RAND36_RESPONSE = {
    "userId": "user-abc",
    "questionnaireSlug": "rand-36",
    "answers": {
        "rand36_physical_functioning": "4",
        "rand36_energy": "3",
        "rand36_mental_health": "4",
    },
}

_USER_PROFILE_RESPONSE = {
    "userId": "user-abc",
    "fields": [
        {"questionId": "age", "questionText": "Age", "value": 21, "label": "18–24"},
        {"questionId": "gender", "questionText": "Gender", "value": "male", "label": "Male"},
    ],
    "updatedAt": "2026-04-27T10:00:00.000Z",
}

_LLM_REPLY = json.dumps({
    "profile_summary": "The user has mild sleep issues and moderate physical health.",
    "profile_detailed": (
        "The user reports fair sleep quality (SLIQ score: 3/5) with short sleep duration "
        "of approximately 6 hours. Physical functioning and energy levels are moderate "
        "per RAND-36. Mental health scores are within normal range. The user's goal of "
        "improving overall fitness is supported by a foundation of moderate health status "
        "but may be constrained by low energy and sleep quality. Improving sleep duration "
        "and quality could be a meaningful first step toward achieving the stated goal."
    ),
    "rag_query": (
        "Evidence-based interventions for improving physical fitness in adults with "
        "mild sleep problems and moderate energy levels."
    ),
})


@pytest.mark.asyncio
async def test_returns_profile_with_questionnaire_and_user_profile_data():
    """Questionnaire data + user profile are fetched, LLM is called, profile returned."""
    with (
        patch("routers.extract_profile._get_redis", new=AsyncMock(return_value=None)),
        patch(
            "routers.extract_profile._fetch_questionnaire_response",
            new=AsyncMock(side_effect=[_SLIQ_RESPONSE, _RAND36_RESPONSE]),
        ),
        patch(
            "routers.extract_profile._fetch_user_profile",
            new=AsyncMock(return_value=_USER_PROFILE_RESPONSE),
        ),
        patch("routers.extract_profile.chat_complete", new=AsyncMock(return_value=_LLM_REPLY)),
    ):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post(
                "/api/v1/llm/extract-profile",
                json={"user_id": "user-abc", "goal": "improve fitness"},
            )

    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data["profile_summary"], str)
    assert len(data["profile_summary"]) > 0
    assert isinstance(data["profile_detailed"], str)
    assert len(data["profile_detailed"]) > 0
    assert isinstance(data["rag_query"], str)
    assert len(data["rag_query"]) > 0


@pytest.mark.asyncio
async def test_missing_questionnaire_data_still_returns_profile():
    """When questionnaire responses are unavailable (None), LLM still called with empty data."""
    with (
        patch("routers.extract_profile._get_redis", new=AsyncMock(return_value=None)),
        patch(
            "routers.extract_profile._fetch_questionnaire_response",
            new=AsyncMock(return_value=None),
        ),
        patch(
            "routers.extract_profile._fetch_user_profile",
            new=AsyncMock(return_value=None),
        ),
        patch("routers.extract_profile.chat_complete", new=AsyncMock(return_value=_LLM_REPLY)),
    ):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post(
                "/api/v1/llm/extract-profile",
                json={"user_id": "user-xyz", "goal": "lose weight"},
            )

    assert resp.status_code == 200
    data = resp.json()
    assert "profile_summary" in data
    assert "profile_detailed" in data
    assert "rag_query" in data


@pytest.mark.asyncio
async def test_user_profile_fields_formatted_as_readable_text():
    """profile_text passed to LLM contains human-readable label lines, not raw JSON."""
    captured_prompt = {}

    async def fake_chat_complete(messages, **kwargs):
        captured_prompt["content"] = messages[0]["content"]
        return _LLM_REPLY

    with (
        patch("routers.extract_profile._get_redis", new=AsyncMock(return_value=None)),
        patch(
            "routers.extract_profile._fetch_questionnaire_response",
            new=AsyncMock(return_value=None),
        ),
        patch(
            "routers.extract_profile._fetch_user_profile",
            new=AsyncMock(return_value=_USER_PROFILE_RESPONSE),
        ),
        patch("routers.extract_profile.chat_complete", new=fake_chat_complete),
    ):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            await client.post(
                "/api/v1/llm/extract-profile",
                json={"user_id": "user-abc", "goal": "improve fitness"},
            )

    prompt = captured_prompt["content"]
    assert "Age: 18–24" in prompt
    assert "Gender: Male" in prompt
    # Confirm raw numeric value is NOT present without label context
    assert '"value": 21' not in prompt


@pytest.mark.asyncio
async def test_invalid_llm_json_returns_fallback():
    """Malformed LLM response returns fallback profile."""
    with (
        patch("routers.extract_profile._get_redis", new=AsyncMock(return_value=None)),
        patch(
            "routers.extract_profile._fetch_questionnaire_response",
            new=AsyncMock(return_value=None),
        ),
        patch(
            "routers.extract_profile._fetch_user_profile",
            new=AsyncMock(return_value=None),
        ),
        patch(
            "routers.extract_profile.chat_complete",
            new=AsyncMock(return_value="not valid json"),
        ),
    ):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post(
                "/api/v1/llm/extract-profile",
                json={"user_id": "user-abc", "goal": "improve sleep"},
            )

    assert resp.status_code == 200
    data = resp.json()
    assert "profile_summary" in data
    assert "rag_query" in data
    assert data["rag_query"] == "improve sleep"


@pytest.mark.asyncio
async def test_cache_hit_skips_backend_and_llm():
    """When Redis has a cached result, backend and LLM are NOT called."""
    cached_result = {
        "profile_summary": "Cached summary.",
        "profile_detailed": "Cached detailed profile.",
        "rag_query": "Cached rag query for fitness.",
    }

    mock_redis = MagicMock()
    mock_redis.get = AsyncMock(return_value=json.dumps(cached_result))
    mock_redis.setex = AsyncMock()
    mock_backend = AsyncMock()
    mock_user_profile = AsyncMock()
    mock_llm = AsyncMock()

    with (
        patch("routers.extract_profile._get_redis", new=AsyncMock(return_value=mock_redis)),
        patch("routers.extract_profile._fetch_questionnaire_response", new=mock_backend),
        patch("routers.extract_profile._fetch_user_profile", new=mock_user_profile),
        patch("routers.extract_profile.chat_complete", new=mock_llm),
    ):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post(
                "/api/v1/llm/extract-profile",
                json={"user_id": "user-abc", "goal": "improve fitness"},
            )

        mock_backend.assert_not_called()
        mock_user_profile.assert_not_called()
        mock_llm.assert_not_called()

    assert resp.status_code == 200
    data = resp.json()
    assert data["profile_summary"] == "Cached summary."
    assert data["rag_query"] == "Cached rag query for fitness."
```

- [ ] **Step 2: Run the tests — expect failures**

```bash
cd /Users/felixreinsch/Github/health-habit-hub/API-service
python -m pytest tests/test_extract_profile.py -v
```

Expected: failures on tests that patch `_fetch_user_profile` (name doesn't exist yet).

- [ ] **Step 3: Update extract_profile.py**

Open `API-service/routers/extract_profile.py`.

**Add** the `_fetch_user_profile` helper after `_fetch_questionnaire_response` (around line 80):

```python
async def _fetch_user_profile(user_id: str) -> Optional[Dict[str, Any]]:
    """Fetch the user's structured profile from the user_profiles collection.

    Uses GET /api/v1/user-profile/service/:userId authenticated
    with X-Service-Auth-Token header.
    """
    if not _SERVICE_SECRET:
        logger.warning("API_SERVICE_SECRET not set — cannot fetch user profile.")
        return None

    url = f"{_BACKEND_URL}/api/v1/user-profile/service/{user_id}"
    headers = {"X-Service-Auth-Token": _SERVICE_SECRET}
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url, headers=headers)
        if resp.status_code == 200:
            return resp.json()
        if resp.status_code == 404:
            logger.info("No user profile found for user %s.", user_id)
        else:
            logger.warning(
                "Unexpected status %d fetching user profile for user %s.",
                resp.status_code,
                user_id,
            )
    except Exception as exc:  # noqa: BLE001
        logger.warning("Failed to fetch user profile for user %s: %s", user_id, exc)
    return None
```

**Replace** the `asyncio.gather` block inside the `extract_profile` endpoint (around lines 153–165). Change from:

```python
sliq_data, rand36_data, profile_data = await asyncio.gather(
    _fetch_questionnaire_response(body.user_id, "sliq"),
    _fetch_questionnaire_response(body.user_id, "rand-36"),
    _fetch_questionnaire_response(body.user_id, "user-profile"),
)

sliq_json = json.dumps(sliq_data.get("answers", {}) if sliq_data else {}, ensure_ascii=False)
rand36_json = json.dumps(
    rand36_data.get("answers", {}) if rand36_data else {}, ensure_ascii=False
)
profile_answers = profile_data.get("answers", {}) if profile_data else {}
profile_json = json.dumps(profile_answers, ensure_ascii=False)
```

To:

```python
sliq_data, rand36_data, profile_data = await asyncio.gather(
    _fetch_questionnaire_response(body.user_id, "sliq"),
    _fetch_questionnaire_response(body.user_id, "rand-36"),
    _fetch_user_profile(body.user_id),
)

sliq_json = json.dumps(sliq_data.get("answers", {}) if sliq_data else {}, ensure_ascii=False)
rand36_json = json.dumps(
    rand36_data.get("answers", {}) if rand36_data else {}, ensure_ascii=False
)
profile_text = ""
if profile_data and profile_data.get("fields"):
    lines = [
        f"{f['questionText']}: {f['label']}"
        for f in profile_data["fields"]
        if f.get("questionText") and f.get("label")
    ]
    profile_text = "\n".join(lines)
```

**Update** the prompt `.format()` call — change `profile_json=profile_json` to `profile_json=profile_text`:

```python
prompt = _PROMPT_TEMPLATE.format(
    goal=body.goal,
    sliq_json=sliq_json,
    rand36_json=rand36_json,
    profile_json=profile_text,
)
```

- [ ] **Step 4: Run the tests — expect all pass**

```bash
cd /Users/felixreinsch/Github/health-habit-hub/API-service
python -m pytest tests/test_extract_profile.py -v
```

Expected: all 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add API-service/routers/extract_profile.py API-service/tests/test_extract_profile.py
git commit -m "feat: wire user_profiles collection into LLM extract-profile pipeline"
```

---

## Task 3: Flutter — shared profile field constants

**Files:**
- Create: `mobile/lib/screens/onboarding/profile_fields.dart`

- [ ] **Step 1: Create the shared constants file**

Create `mobile/lib/screens/onboarding/profile_fields.dart`:

```dart
// Shared age/gender constants used by ProfileSetupScreen and PersonalInfoScreen.

class ProfileAgeRange {
  final String label;
  final int value;
  const ProfileAgeRange(this.label, this.value);
}

const profileAgeRanges = [
  ProfileAgeRange('Under 18', 15),
  ProfileAgeRange('18–24', 21),
  ProfileAgeRange('25–34', 29),
  ProfileAgeRange('35–44', 39),
  ProfileAgeRange('45–54', 49),
  ProfileAgeRange('55–64', 59),
  ProfileAgeRange('65+', 67),
];

const profileGenderOptions = [
  ('male', 'Male'),
  ('female', 'Female'),
  ('non_binary', 'Non-binary'),
  ('prefer_not_to_say', 'Prefer not to say'),
];

String? profileAgeLabel(int? value) => profileAgeRanges
    .where((r) => r.value == value)
    .map((r) => r.label)
    .firstOrNull;

String? profileGenderLabel(String? value) => profileGenderOptions
    .where((o) => o.$1 == value)
    .map((o) => o.$2)
    .firstOrNull;
```

- [ ] **Step 2: Update profile_setup_screen.dart**

Open `mobile/lib/screens/onboarding/profile_setup_screen.dart`.

**Add** import at the top of the import section:
```dart
import 'profile_fields.dart';
```

**Replace** the `_submit` method. Change from:
```dart
  Future<void> _submit() async {
    if (_age == null || _gender == null) return;
    setState(() => _submitting = true);
    try {
      final dio = ref.read(dioProvider);
      await dio.post(
        '${AppConfig.apiBaseUrl}/questionnaire-responses',
        data: {
          'questionnaireSlug': 'user-profile',
          'answers': {'age': _age, 'gender': _gender},
        },
      );
    } catch (_) {
      // Best-effort — profile data missing is recoverable
    }
    if (mounted) context.go('/onboarding/study-code');
  }
```

To:
```dart
  Future<void> _submit() async {
    if (_age == null || _gender == null) return;
    setState(() => _submitting = true);
    try {
      final dio = ref.read(dioProvider);
      await dio.post(
        '${AppConfig.apiBaseUrl}/user-profile',
        data: {
          'fields': [
            {
              'questionId': 'age',
              'questionText': 'Age',
              'value': _age,
              'label': profileAgeLabel(_age) ?? '',
            },
            {
              'questionId': 'gender',
              'questionText': 'Gender',
              'value': _gender,
              'label': profileGenderLabel(_gender) ?? '',
            },
          ],
        },
      );
    } catch (_) {
      // Best-effort — profile data missing is recoverable
    }
    if (mounted) context.go('/onboarding/study-code');
  }
```

**Replace** the private `_AgeRange` class and `_ageRanges` / `_genderOptions` constants at the bottom of the file. Delete these lines:

```dart
class _AgeRange {
  final String label;
  final int value;
  const _AgeRange(this.label, this.value);
}

const _ageRanges = [
  _AgeRange('Under 18', 15),
  _AgeRange('18–24', 21),
  _AgeRange('25–34', 29),
  _AgeRange('35–44', 39),
  _AgeRange('45–54', 49),
  _AgeRange('55–64', 59),
  _AgeRange('65+', 67),
];
```

And update the chip references in `build` to use the shared names. Replace `_ageRanges` with `profileAgeRanges` and `_genderOptions` with `profileGenderOptions`. Replace `range.label` / `range.value` with the same (field names match). The `_genderOptions` record pattern `(code, label)` stays the same — just rename `_genderOptions` → `profileGenderOptions`.

Full updated `build` chip sections:

```dart
// Age chips — replace _ageRanges with profileAgeRanges
for (final range in profileAgeRanges)
  ChoiceChip(
    label: Text(range.label),
    selected: _age == range.value,
    onSelected: _submitting ? null : (_) => setState(() => _age = range.value),
    labelStyle: tt.bodyMedium?.copyWith(
      color: _age == range.value ? cs.onPrimaryContainer : cs.onSurfaceVariant,
      fontWeight: _age == range.value ? FontWeight.w700 : FontWeight.normal,
    ),
  ),

// Gender chips — replace _genderOptions with profileGenderOptions
for (final (code, label) in profileGenderOptions)
  ChoiceChip(
    label: Text(label),
    selected: _gender == code,
    onSelected: _submitting ? null : (_) => setState(() => _gender = code),
    labelStyle: tt.bodyMedium?.copyWith(
      color: _gender == code ? cs.onPrimaryContainer : cs.onSurfaceVariant,
      fontWeight: _gender == code ? FontWeight.w700 : FontWeight.normal,
    ),
  ),
```

- [ ] **Step 3: Verify the app compiles**

```bash
cd /Users/felixreinsch/Github/health-habit-hub/mobile
flutter analyze lib/screens/onboarding/profile_setup_screen.dart lib/screens/onboarding/profile_fields.dart
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add mobile/lib/screens/onboarding/profile_fields.dart mobile/lib/screens/onboarding/profile_setup_screen.dart
git commit -m "feat: update onboarding to POST structured Q&A to /api/v1/user-profile"
```

---

## Task 4: Flutter — PersonalInfoScreen + settings wiring

**Files:**
- Create: `mobile/lib/screens/settings/personal_info_screen.dart`
- Modify: `mobile/lib/main.dart`
- Modify: `mobile/lib/screens/user_settings_screen.dart`

- [ ] **Step 1: Create the settings directory if needed**

```bash
mkdir -p /Users/felixreinsch/Github/health-habit-hub/mobile/lib/screens/settings
```

- [ ] **Step 2: Create PersonalInfoScreen**

Create `mobile/lib/screens/settings/personal_info_screen.dart`:

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../config/app_config.dart';
import '../../core/dio_provider.dart';
import '../onboarding/profile_fields.dart';

class PersonalInfoScreen extends ConsumerStatefulWidget {
  const PersonalInfoScreen({super.key});

  @override
  ConsumerState<PersonalInfoScreen> createState() => _PersonalInfoScreenState();
}

class _PersonalInfoScreenState extends ConsumerState<PersonalInfoScreen> {
  int? _age;
  String? _gender;
  bool _loading = true;
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    _loadProfile();
  }

  Future<void> _loadProfile() async {
    try {
      final dio = ref.read(dioProvider);
      final res = await dio.get('${AppConfig.apiBaseUrl}/user-profile');
      final fields = (res.data['fields'] as List<dynamic>?) ?? [];
      int? age;
      String? gender;
      for (final f in fields) {
        if (f['questionId'] == 'age') age = (f['value'] as num?)?.toInt();
        if (f['questionId'] == 'gender') gender = f['value'] as String?;
      }
      if (mounted) setState(() { _age = age; _gender = gender; _loading = false; });
    } catch (_) {
      // 404 (no profile yet) or network error — start with empty chips
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _save() async {
    if (_age == null || _gender == null) return;
    setState(() => _submitting = true);
    try {
      final dio = ref.read(dioProvider);
      await dio.post(
        '${AppConfig.apiBaseUrl}/user-profile',
        data: {
          'fields': [
            {
              'questionId': 'age',
              'questionText': 'Age',
              'value': _age,
              'label': profileAgeLabel(_age) ?? '',
            },
            {
              'questionId': 'gender',
              'questionText': 'Gender',
              'value': _gender,
              'label': profileGenderLabel(_gender) ?? '',
            },
          ],
        },
      );
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Saved')),
        );
        Navigator.of(context).pop();
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not save. Please try again.')),
        );
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final tt = Theme.of(context).textTheme;
    final canSave = _age != null && _gender != null && !_submitting;

    return Scaffold(
      appBar: AppBar(title: const Text('Personal info')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(28, 24, 28, 32),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text('Age', style: tt.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
                  const SizedBox(height: 10),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      for (final range in profileAgeRanges)
                        ChoiceChip(
                          label: Text(range.label),
                          selected: _age == range.value,
                          onSelected: _submitting
                              ? null
                              : (_) => setState(() => _age = range.value),
                          labelStyle: tt.bodyMedium?.copyWith(
                            color: _age == range.value
                                ? cs.onPrimaryContainer
                                : cs.onSurfaceVariant,
                            fontWeight: _age == range.value
                                ? FontWeight.w700
                                : FontWeight.normal,
                          ),
                        ),
                    ],
                  ),
                  const SizedBox(height: 28),
                  Text('Gender', style: tt.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
                  const SizedBox(height: 10),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      for (final (code, label) in profileGenderOptions)
                        ChoiceChip(
                          label: Text(label),
                          selected: _gender == code,
                          onSelected: _submitting
                              ? null
                              : (_) => setState(() => _gender = code),
                          labelStyle: tt.bodyMedium?.copyWith(
                            color: _gender == code
                                ? cs.onPrimaryContainer
                                : cs.onSurfaceVariant,
                            fontWeight: _gender == code
                                ? FontWeight.w700
                                : FontWeight.normal,
                          ),
                        ),
                    ],
                  ),
                  const SizedBox(height: 40),
                  FilledButton(
                    onPressed: canSave ? _save : null,
                    child: _submitting
                        ? const SizedBox(
                            height: 20,
                            width: 20,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Colors.white,
                            ),
                          )
                        : const Text('Save'),
                  ),
                ],
              ),
            ),
    );
  }
}
```

- [ ] **Step 3: Register the route in main.dart**

Open `mobile/lib/main.dart`.

Add this import near the top with other screen imports:
```dart
import 'screens/settings/personal_info_screen.dart';
```

Inside the `GoRoute(path: '/settings', ...)` block, add after the existing `'profile'` sub-route:

```dart
GoRoute(
  path: 'personal-info',
  builder: (context, state) => const PersonalInfoScreen(),
),
```

- [ ] **Step 4: Add the settings row in UserSettingsScreen**

Open `mobile/lib/screens/user_settings_screen.dart`.

Inside the `_SettingsCard` for the Profile section, add a divider and new row after the existing "My Profile" row:

```dart
_SettingsCard(children: [
  _SettingsRow(
    icon: Icons.assignment_ind,
    title: l10n.myProfile,
    trailing: const Icon(Icons.chevron_right, size: 18),
    onTap: () => context.push('/settings/profile'),
  ),
  const Divider(height: 1, indent: 52),          // add this
  _SettingsRow(                                   // add this
    icon: Icons.person_outline,
    title: 'Personal info',
    trailing: const Icon(Icons.chevron_right, size: 18),
    onTap: () => context.push('/settings/personal-info'),
  ),
]),
```

- [ ] **Step 5: Verify the app compiles**

```bash
cd /Users/felixreinsch/Github/health-habit-hub/mobile
flutter analyze lib/screens/settings/personal_info_screen.dart lib/main.dart lib/screens/user_settings_screen.dart
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add mobile/lib/screens/settings/personal_info_screen.dart mobile/lib/main.dart mobile/lib/screens/user_settings_screen.dart
git commit -m "feat: add PersonalInfoScreen in settings for viewing and editing user profile"
```

---

## Self-review checklist

| Spec requirement | Covered by |
|-----------------|-----------|
| New `user_profiles` MongoDB collection | Task 1 — router uses `user_profiles` collection |
| `POST /api/v1/user-profile` (JWT, upsert) | Task 1 — `createUserProfileRouter` |
| `GET /api/v1/user-profile` (JWT, read) | Task 1 — `createUserProfileRouter` |
| `GET /api/v1/user-profile/service/:userId` (X-Service-Auth-Token) | Task 1 — `createUserProfileServiceRouter`, mounted before `authenticate` |
| Service endpoint accessible without JWT | Task 1 Step 2 — mounted before `router.use(authenticate)` |
| Replace `form_responses` for user-profile | Task 3 — `profile_setup_screen.dart` now POSTs to `/user-profile` |
| Python fetches from new service endpoint | Task 2 — `_fetch_user_profile` replaces the third `gather` call |
| Human-readable text in LLM prompt | Task 2 — `profile_text = "Age: 18–24\nGender: Male"` |
| Shared constants between onboarding + settings | Task 3 — `profile_fields.dart` |
| Settings screen with pre-filled values | Task 4 — `PersonalInfoScreen` loads `GET /api/v1/user-profile` on init |
| Settings row in UserSettingsScreen | Task 4 Step 4 |
| Route `/settings/personal-info` registered | Task 4 Step 3 |
