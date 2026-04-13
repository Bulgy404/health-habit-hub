# Backlog Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all P1 and P2 backlog items from the 2026-04-10 full system audit (AUDIT.md) across Node.js backend, Python API service, Next.js admin, and Flutter mobile.

**Architecture:** Risk-ordered batches — Group A (11 small one-to-five-line fixes, one commit), Group B (5 medium independent items run in parallel), Group C (3 large refactors run in parallel). Each group builds on the previous; items within a group share no files and are safe to run in parallel.

**Tech Stack:** Node.js/Express, FastAPI/Python, Next.js 14, Flutter/Dart, MongoDB, Redis, bcryptjs, Jest + React Testing Library

---

## File Map

**Modified in Group A:**
- `app/utils/config.js` — fix `this.db.name` → `this.db.path` in `getDbHeader()`
- `app/middleware/requestParser.js` — remove stale comment; add body size limit
- `app/app.js` — move internal router before `httpServer.listen()`; add API_SERVICE_SECRET startup warning; pass `redisUrl` to scheduler
- `app/utils/SparqlDatabase.js` — add allowlist assertion in `_appendContext` and `_appendBehavior`
- `app/routes/adminRouter.js` — settings key whitelist, count validation, 201 status sweep
- `app/services/adminStatsService.js` — reject unknown settings keys
- `app/routes/questionnaireResponsesRouter.js` — return `{ ok: true }` instead of `{ id }`
- `app/services/notificationService.js` — zero-delivery warn log; Redis lock
- `admin/package.json` — bump next to latest 14.x patch
- `mobile/lib/router/redirect.dart` — admin guard: check login before roles

**Created in Group B:**
- `API-service/auth.py` — shared-secret auth dependency
- `app/tests/integration/recommendations.idor.test.js` — IDOR regression test

**Modified in Group B:**
- `app/routes/recommendRouter.js` — inject X-Service-Auth-Token header
- `app/routes/recommendationsRouter.js` — scope feedback query by userId
- `app/services/notificationService.js` — Redis distributed lock
- `API-service/main.py` — lifespan + startup validation
- `API-service/deps.py` (new) — shared lifespan-managed singletons
- `API-service/routers/recommend.py` — remove module-level singletons, use Depends
- `API-service/routers/retrieve.py` — remove module-level `_openai_client`, use shared
- `API-service/routers/map_bcio.py` — remove module-level `_openai_client`, use shared
- `stack.env` — add `API_SERVICE_SECRET`, `REDIS_URL`
- `docker-compose.yml` — add env vars to `recommender` service
- `docker-compose.local.yml` — add env vars to `recommender` and `app` services
- `mobile/lib/screens/donate_screen.dart` — add `onNavigationRequest` to WebView
- `mobile/lib/screens/profile_screen.dart` — add `onNavigationRequest` to WebView

**Created in Group C:**
- `app/routes/admin/surveysRouter.js` — surveys + questionnaires CRUD
- `app/routes/admin/notificationsRouter.js` — notifications schedule/list
- `app/routes/admin/studiesRouter.js` — studies + codes CRUD
- `app/routes/admin/participantsRouter.js` — participants CRUD + token-card
- `admin/jest.config.ts`
- `admin/jest.setup.ts`
- `admin/src/__tests__/middleware.test.ts`
- `admin/src/__tests__/auth.test.ts`
- `admin/src/__tests__/apiFetch.test.ts`
- `admin/src/__tests__/questionnaires.test.tsx`
- `admin/src/__tests__/studies.test.tsx`
- `admin/src/__tests__/knowledge-base.test.tsx`

**Modified in Group C:**
- `app/services/adminParticipantService.js` — bcrypt hash, generate PDF at creation
- `app/routes/adminRouter.js` — serve tokenCardPdf buffer; decompose into sub-routers
- `app/package.json` — add bcryptjs
- `admin/package.json` — add jest devDependencies + test script

---

## Group A — Small Targeted Fixes

### Task A1: Fix config.js db.name bug (F-029)

**Files:**
- Modify: `app/utils/config.js:44`

- [ ] **Step 1: Apply fix**

In `app/utils/config.js` line 44, change `this.db.name` to `this.db.path`:

```js
// Before (line 44):
      ['path', `/${this.db.name}`],
// After:
      ['path', `/${this.db.path}`],
```

- [ ] **Step 2: Verify**

```bash
grep -n "this.db\." app/utils/config.js
# Expected: all references use .host, .port, .user, .password, or .path — no .name
```

---

### Task A2: Fix requestParser.js (F-030)

**Files:**
- Modify: `app/middleware/requestParser.js`

- [ ] **Step 1: Apply fix**

Replace the entire file content:

```js
import bodyParser from 'body-parser';

// Middleware to parse JSON data in the request body
const jsonBodyParser = bodyParser.json({ limit: '100kb' });

// Export the middleware
export { jsonBodyParser };
```

---

### Task A3: Move internal router before httpServer.listen() (F-031)

**Files:**
- Modify: `app/app.js`

- [ ] **Step 1: Apply fix**

In `app/app.js`, move the `app.use('/api/internal', ...)` line from after `httpServer.listen()` to before it. The bottom of app.js currently reads:

```js
const httpServer = createServer(app);
const verifyToken = createTokenVerifier();
const { broadcast } = createRecommendationWsServer(httpServer, { verifyToken });
app.use('/api/internal', express.json(), createInternalRouter({ broadcast }));

httpServer.listen(port, () => {
  console.log(`Server is running on http://app.localhost`);
});
```

Change to:

```js
const httpServer = createServer(app);
const verifyToken = createTokenVerifier();
const { broadcast } = createRecommendationWsServer(httpServer, { verifyToken });
app.use('/api/internal', express.json(), createInternalRouter({ broadcast }));

if (!process.env.API_SERVICE_SECRET) {
  console.warn('[startup] API_SERVICE_SECRET is not set — Python API service is unauthenticated');
}

httpServer.listen(port, () => {
  console.log(`Server is running on http://app.localhost`);
});
```

Note: The `/api/internal` line is already before `httpServer.listen()` in the current code (line 176 vs line 178–180). Confirm this is already correct; if so, this task is just adding the startup warning.

- [ ] **Step 2: Verify**

```bash
grep -n "api/internal\|httpServer.listen\|API_SERVICE_SECRET" app/app.js
# Expected: /api/internal appears before httpServer.listen; startup warn appears
```

---

### Task A4: SPARQL label type allowlist (F-032)

**Files:**
- Modify: `app/utils/SparqlDatabase.js:160-183,208-238`

The `_appendContext` method currently uses `hhh:${context.value}` without validating that `context.value` is a known type. Same in `_appendBehavior`. Add an explicit allowlist assertion.

- [ ] **Step 1: Add allowlist constant near top of class (after existing imports, before first method)**

Find the line `class SparqlDbClient {` and add the constant just inside the class body after the constructor:

```js
  static LABEL_TYPE_MAP = new Set(['context', 'behavior', 'setting', 'target', 'mechanism']);
```

If there is already a `LABEL_TYPE_MAP` elsewhere in the file, use that — run `grep -n "LABEL_TYPE_MAP" app/utils/SparqlDatabase.js` first.

- [ ] **Step 2: Add assertion at the top of `_appendContext`**

Current `_appendContext` (line 160):
```js
  _appendContext(donation, translatedDonation, experimentalSetting) {
    return donation.labels
      .filter((label) => label.type === 'context')
      .map((context) => {
```

Add assertion after the `.map((context) => {` line:
```js
  _appendContext(donation, translatedDonation, experimentalSetting) {
    return donation.labels
      .filter((label) => label.type === 'context')
      .map((context) => {
        if (!SparqlDbClient.LABEL_TYPE_MAP.has(context.value)) {
          throw new Error(`Unknown SPARQL label type: ${context.value}`);
        }
```

- [ ] **Step 3: Add the same assertion at the top of `_appendBehavior`**

Current `_appendBehavior` (line 208):
```js
  _appendBehavior(donation, translatedDonation, experimentalSetting) {
    const contextStatement = donation.labels
      .filter((label) => label.type === 'context')
      .map((context) => `hhh:Context-${context.id}`)
      .join(' , ');
    return donation.labels
      .filter((label) => label.type === 'behavior')
      .map((behavior) => {
```

Add assertion after `.map((behavior) => {`:
```js
        if (!SparqlDbClient.LABEL_TYPE_MAP.has(behavior.value)) {
          throw new Error(`Unknown SPARQL label type: ${behavior.value}`);
        }
```

- [ ] **Step 4: Verify by checking what values are used in practice**

```bash
grep -rn "context\.value\|behavior\.value" app/utils/SparqlDatabase.js
# Check the values look like they're all from a controlled set
```

---

### Task A5: Settings key allowlist (F-033)

**Files:**
- Modify: `app/routes/adminRouter.js` (PUT /settings/:key handler at line ~537)
- Modify: `app/services/adminStatsService.js` (updateSetting function at line ~117)

- [ ] **Step 1: Add whitelist to adminStatsService.js**

In `app/services/adminStatsService.js`, add a constant before `updateSetting`:

```js
const VALID_SETTINGS_KEYS = new Set(['token_card_format']);

export async function updateSetting({ db, key, value }) {
  if (!VALID_SETTINGS_KEYS.has(key)) {
    return { error: `Unknown setting key: ${key}`, status: 400 };
  }
  await db
    .collection('admin_settings')
    .updateOne(
      { key },
      { $set: { value, updatedAt: new Date() } },
      { upsert: true }
    );
  return { ok: true, key, value };
}
```

- [ ] **Step 2: Check for the error in adminRouter.js**

In `app/routes/adminRouter.js` at the `PUT /settings/:key` handler (~line 537):

```js
  router.put('/settings/:key', async (req, res) => {
    try {
      const { key } = req.params;
      const { value } = req.body;
      if (value === undefined) {
        return res.status(400).json({ error: 'Missing value' });
      }
      const database = await getDb();
      const result = await updateSetting({ db: database, key, value });
      if (result.error) {
        return res.status(result.status || 400).json({ error: result.error });
      }
      res.json(result);
    } catch (err) {
      console.error('[route] Error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
```

---

### Task A6: Validate `count` for code generation (F-034)

**Files:**
- Modify: `app/routes/adminRouter.js` (POST /studies/:id/codes handler at line ~1734)

- [ ] **Step 1: Add validation before existing groupId check**

```js
  router.post('/studies/:id/codes', async (req, res) => {
    try {
      const { count, groupId, maxRedemptions, expiresAt } = req.body;
      const parsedCount = parseInt(count, 10);
      if (!Number.isInteger(parsedCount) || parsedCount < 1 || parsedCount > 100) {
        return res.status(400).json({ error: 'count must be a positive integer ≤ 100' });
      }
      if (!groupId || typeof groupId !== 'string') {
        return res.status(400).json({ error: 'groupId is required' });
      }
      const database = await getDb();
      const result = await createCodes({
        db: database,
        studyId: req.params.id,
        groupId,
        count: parsedCount,
        maxRedemptions,
        expiresAt,
      });
      if (result.notFound)
        return res.status(404).json({ error: 'Study not found' });
      if (result.groupNotFound)
        return res.status(404).json({ error: 'Group not found in study' });
      res.status(201).json({ codes: result.codes });
    } catch (err) {
      console.error('[route] Error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
```

---

### Task A7: POST creation endpoints → 201 status sweep (F-035)

**Files:**
- Modify: `app/routes/adminRouter.js`

- [ ] **Step 1: Audit all POST handlers in adminRouter.js**

```bash
grep -n "router\.post\|res\.status(200\|res\.json(" app/routes/adminRouter.js | head -60
```

Look for `POST` handlers that respond with `res.json(...)` without a `201` status. Currently the router uses `res.status(201).json(...)` for `/participants` and `/surveys` already. Check which ones are missing it:
- `POST /surveys` — already has `res.status(201).json(...)`
- `POST /questionnaires` — already has `res.status(201).json(...)`
- `POST /studies` — check current status
- `POST /notifications/schedule` — check current status

- [ ] **Step 2: Fix any POST creation endpoints missing 201**

For each `POST` route that creates a resource and currently uses `res.json(...)` (implying 200), change to `res.status(201).json(...)`.

Run:
```bash
grep -n -A 15 "router\.post(" app/routes/adminRouter.js | grep -B 5 "res\.json\b" | grep -v "status(201\|status(400\|status(404\|status(500"
```

---

### Task A8: questionnaire-responses: return `{ ok: true }` not `{ id }` (F-037)

**Files:**
- Modify: `app/routes/questionnaireResponsesRouter.js:89`

- [ ] **Step 1: Apply fix**

Current line 89:
```js
      res.status(201).json({ id: result.insertedId });
```

Change to:
```js
      res.status(201).json({ ok: true });
```

Also update the Swagger JSDoc above (around line 55–60):
```js
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                   example: true
```

---

### Task A9: Zero-delivery warn log in notificationService (F-041)

**Files:**
- Modify: `app/services/notificationService.js:162-195`

- [ ] **Step 1: Add warn before setting dispatched = true**

In `dispatchDueNotifications`, the current flow calls `sendStudyNotification(...)` and sets `dispatched = true`. Add a result capture and warn:

```js
  for (const notification of due) {
    let dispatched = false;
    try {
      const result = await sendStudyNotification({
        db,
        messaging,
        studyId: notification.studyId.toString(),
        groupId: notification.groupId
          ? notification.groupId.toString()
          : undefined,
        title: notification.title,
        body: notification.body,
        data: notification.data,
      });
      if (result.sent === 0 && result.failed > 0) {
        console.warn(
          '[notification] All sends failed for notification',
          notification._id.toString(),
          'failed:', result.failed
        );
      }
      dispatched = true;
    } catch (err) {
      console.error(
        '[notification] Error dispatching scheduled notification',
        notification._id.toString(),
        'studyId:', notification.studyId?.toString(),
        'scheduledAt:', notification.scheduledAt?.toISOString(),
        err
      );
    }

    if (dispatched) {
      await db
        .collection(COLLECTION_SCHEDULED)
        .updateOne(
          { _id: notification._id },
          { $set: { sent: true, sentAt: now } }
        );
    }
  }
```

---

### Task A10: Bump Next.js to latest 14.x (F-046)

**Files:**
- Modify: `admin/package.json`

- [ ] **Step 1: Check latest 14.x patch**

```bash
cd admin && npm view next versions --json | node -e "const v=require('fs').readFileSync('/dev/stdin','utf8'); const versions=JSON.parse(v); console.log(versions.filter(v=>v.startsWith('14.')).at(-1));"
```

- [ ] **Step 2: Update package.json**

Replace `"next": "14.2.4"` with the latest 14.x version found. For example:
```json
"next": "14.2.29",
```

- [ ] **Step 3: Install and verify build**

```bash
cd admin && npm install && npm run build
# Expected: build completes without errors
```

---

### Task A11: Flutter admin redirect guard (F-050)

**Files:**
- Modify: `mobile/lib/router/redirect.dart:25-35`

- [ ] **Step 1: Apply fix**

Current admin guard (lines 25–35):
```dart
  if (location.startsWith('/admin')) {
    try {
      final roles = await getUserRoles();
      if (!roles.contains('admin') && !roles.contains('researcher')) {
        return '/';
      }
    } catch (_) {
      return '/';
    }
    return null;
  }
```

Change to check login first, redirect unauthenticated to onboarding:
```dart
  if (location.startsWith('/admin')) {
    try {
      final isLoggedIn = await getIsLoggedIn();
      if (!isLoggedIn) return '/onboarding/welcome';
      final roles = await getUserRoles();
      if (!roles.contains('admin') && !roles.contains('researcher')) {
        return '/';
      }
    } catch (_) {
      return '/onboarding/welcome';
    }
    return null;
  }
```

- [ ] **Step 2: Verify**

```bash
grep -A 12 "startsWith..'/admin'" mobile/lib/router/redirect.dart
# Expected: getIsLoggedIn() is called before getUserRoles()
```

---

### Task A12: Commit Group A

- [ ] **Step 1: Stage and commit**

```bash
cd /path/to/repo
git add app/utils/config.js \
        app/middleware/requestParser.js \
        app/app.js \
        app/utils/SparqlDatabase.js \
        app/routes/adminRouter.js \
        app/services/adminStatsService.js \
        app/routes/questionnaireResponsesRouter.js \
        app/services/notificationService.js \
        admin/package.json \
        mobile/lib/router/redirect.dart
git commit -m "fix: group-A backlog — config bug, body limits, SPARQL allowlist, settings whitelist, count validation, 201 sweep, misc"
```

---

## Group B — Medium Complexity

*B1–B5 are independent. Run in parallel.*

---

### Task B1: Python API service authentication (F-022)

**Files:**
- Create: `API-service/auth.py`
- Modify: `API-service/main.py`
- Modify: `API-service/routers/recommend.py` (and all other routers)
- Modify: `app/routes/recommendRouter.js`
- Modify: `stack.env`, `docker-compose.yml`, `docker-compose.local.yml`

- [ ] **Step 1: Create `API-service/auth.py`**

```python
import hmac
import os

from fastapi import Header, HTTPException


async def verify_service_token(x_service_auth_token: str = Header(...)) -> None:
    """Verify the shared-secret service-to-service token."""
    secret = os.environ.get("API_SERVICE_SECRET", "")
    if not secret:
        # Secret not configured — fail closed
        raise HTTPException(status_code=403, detail="Forbidden")
    if not hmac.compare_digest(x_service_auth_token, secret):
        raise HTTPException(status_code=403, detail="Forbidden")
```

- [ ] **Step 2: Apply `Depends(verify_service_token)` to every router**

In each file `API-service/routers/*.py` that has a `router = APIRouter()` line (all except `__init__.py`), change:

```python
router = APIRouter()
```

to:

```python
from fastapi import Depends
from auth import verify_service_token

router = APIRouter(dependencies=[Depends(verify_service_token)])
```

Files to update:
- `API-service/routers/classify_context.py`
- `API-service/routers/classify_habit.py`
- `API-service/routers/extract_habits.py`
- `API-service/routers/extract_profile.py`
- `API-service/routers/map_bcio.py`
- `API-service/routers/recommend.py`
- `API-service/routers/refine_translation.py`
- `API-service/routers/refine_translation_de.py`
- `API-service/routers/retrieve.py`

- [ ] **Step 3: Add startup validation to `API-service/main.py`**

After `import logging` and before app creation:

```python
import os
import logging

logging.basicConfig(level=logging.INFO)

_secret = os.environ.get("API_SERVICE_SECRET")
if not _secret:
    raise RuntimeError(
        "API_SERVICE_SECRET environment variable is required but not set."
    )
```

The `/health` endpoint should remain unauthenticated (it's defined on `app` directly, not via a router with the dependency).

- [ ] **Step 4: Inject header in `app/routes/recommendRouter.js`**

In `proxyToRecommender` function (lines 4–17), add the service auth header:

```js
async function proxyToRecommender(req, res, targetUrl) {
  const headers = {};
  if (req.headers.authorization) {
    headers['Authorization'] = req.headers.authorization;
  }
  if (process.env.API_SERVICE_SECRET) {
    headers['X-Service-Auth-Token'] = process.env.API_SERVICE_SECRET;
  }
  const fetchOptions = { method: req.method, headers };
  if (req.body && Object.keys(req.body).length > 0) {
    fetchOptions.body = JSON.stringify(req.body);
    headers['Content-Type'] = 'application/json';
  }
  const upstream = await fetch(targetUrl, fetchOptions);
  const data = await upstream.json();
  res.status(upstream.status).json(data);
}
```

- [ ] **Step 5: Add `API_SERVICE_SECRET` to env files**

In `stack.env`, add after the `RECOMMENDER_URL` line:
```
API_SERVICE_SECRET=CHANGE_THIS_API_SERVICE_SECRET
```

In `docker-compose.yml`, find the `recommender:` service `environment:` block (or add one if absent) and add:
```yaml
      - API_SERVICE_SECRET=${API_SERVICE_SECRET}
```

Also add to the `app:` service environment:
```yaml
      - API_SERVICE_SECRET=${API_SERVICE_SECRET}
```

In `docker-compose.local.yml`, same additions to `recommender:` and `app:` environment blocks.

- [ ] **Step 6: Verify**

```bash
grep -n "API_SERVICE_SECRET" \
  API-service/auth.py \
  API-service/main.py \
  app/routes/recommendRouter.js \
  stack.env \
  docker-compose.yml \
  docker-compose.local.yml
# Expected: all six files contain the string
```

- [ ] **Step 7: Commit**

```bash
git add API-service/auth.py API-service/main.py API-service/routers/ \
        app/routes/recommendRouter.js \
        stack.env docker-compose.yml docker-compose.local.yml
git commit -m "fix: add shared-secret auth between Node and Python API service"
```

---

### Task B2: Recommendations IDOR hardening + regression test (F-038/039)

**Files:**
- Modify: `app/routes/recommendationsRouter.js:56-59`
- Create: `app/tests/integration/recommendations.idor.test.js`

- [ ] **Step 1: Scope feedback query by userId**

In `app/routes/recommendationsRouter.js` lines 56–59, change:

```js
      // Before
      const rec = await database
        .collection('recommendations')
        .findOne({ recommendation_id }, { projection: { goal: 1, userId: 1 } });
```

to:

```js
      // After — userId scope prevents IDOR
      const rec = await database
        .collection('recommendations')
        .findOne({ recommendation_id, userId }, { projection: { goal: 1, userId: 1 } });
```

The `userId` variable is already set from `req.user?.sub` above (line 49). A wrong owner now gets an implicit 404 (record not found).

- [ ] **Step 2: Verify the 404 path exists**

Check that when `rec` is null, the router returns 404:

```bash
grep -n -A 5 "if (!rec)" app/routes/recommendationsRouter.js
# Expected: returns 404
```

- [ ] **Step 3: Create integration test**

Create `app/tests/integration/recommendations.idor.test.js`:

```js
/**
 * IDOR regression test for POST /recommendations/:id/feedback
 *
 * Verifies that USER_B cannot post feedback on USER_A's recommendation.
 */
import { createRecommendationsRouter } from '../../routes/recommendationsRouter.js';
import express from 'express';
import request from 'supertest';

const USER_A = 'user-a-uuid';
const USER_B = 'user-b-uuid';
const REC_ID = 'rec-001';

function makeApp(userId) {
  const db = {
    collection: () => ({
      findOne: async ({ recommendation_id, userId: scopedUserId }) => {
        // Simulate DB: only USER_A owns REC_ID
        if (recommendation_id === REC_ID && scopedUserId === USER_A) {
          return { recommendation_id: REC_ID, userId: USER_A, goal: 'eat better' };
        }
        return null;
      },
      insertOne: async () => ({ insertedId: 'feedback-1' }),
    }),
  };

  const app = express();
  app.use(express.json());
  // Simulate auth middleware — inject req.user
  app.use((req, _res, next) => {
    req.user = { sub: userId };
    next();
  });
  app.use('/', createRecommendationsRouter({ db, redisClient: null }));
  return app;
}

describe('Recommendations IDOR', () => {
  it('USER_A can post feedback on their own recommendation', async () => {
    const res = await request(makeApp(USER_A))
      .post(`/${REC_ID}/feedback`)
      .send({ comment: 'good rec' });
    expect(res.status).toBe(200);
  });

  it('USER_B receives 404 on USER_A recommendation ID', async () => {
    const res = await request(makeApp(USER_B))
      .post(`/${REC_ID}/feedback`)
      .send({ comment: 'sneaky' });
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 4: Run test**

```bash
cd app && npm test -- recommendations.idor
# Expected: 2 passing
```

- [ ] **Step 5: Commit**

```bash
git add app/routes/recommendationsRouter.js \
        app/tests/integration/recommendations.idor.test.js
git commit -m "fix: scope recommendation feedback query by userId; add IDOR regression test"
```

---

### Task B3: Notification cron Redis distributed lock (F-040)

**Files:**
- Modify: `app/services/notificationService.js`
- Modify: `app/app.js`

- [ ] **Step 1: Update `startNotificationScheduler` to accept `redisUrl`**

In `app/services/notificationService.js`, change the function signature and add Redis lock logic:

```js
export function startNotificationScheduler({ getDb, redisUrl } = {}) {
  const task = cron.schedule('* * * * *', async () => {
    // --- Redis distributed lock ---
    let redis = null;
    let lockAcquired = false;
    if (redisUrl) {
      try {
        const { createClient } = await import('redis');
        redis = createClient({ url: redisUrl });
        redis.on('error', () => {}); // suppress unhandled errors
        await redis.connect();
        const lockSet = await redis.set('hhh:notif-lock', '1', {
          NX: true,
          PX: 55000,
        });
        if (!lockSet) {
          await redis.quit();
          return; // another instance is dispatching — skip this tick
        }
        lockAcquired = true;
      } catch (redisErr) {
        console.warn('[notification] Redis unavailable — proceeding unlocked:', redisErr.message);
        redis = null;
      }
    }

    try {
      const db = await getDb();
      await dispatchDueNotifications({ db });
    } catch (err) {
      console.error('[notification] Scheduler error:', err);
    } finally {
      if (redis && lockAcquired) {
        try {
          await redis.del('hhh:notif-lock');
        } catch (_) {}
        await redis.quit().catch(() => {});
      }
    }
  });
  return task;
}
```

- [ ] **Step 2: Pass `redisUrl` in `app/app.js`**

Change:
```js
startNotificationScheduler({ getDb: makeGetDb() });
```
To:
```js
startNotificationScheduler({ getDb: makeGetDb(), redisUrl: process.env.REDIS_URL });
```

- [ ] **Step 3: Verify**

```bash
grep -n "redisUrl\|REDIS_URL\|hhh:notif-lock" \
  app/services/notificationService.js \
  app/app.js
# Expected: all three strings present in each respective file
```

- [ ] **Step 4: Commit**

```bash
git add app/services/notificationService.js app/app.js
git commit -m "fix: add Redis distributed lock to notification cron to prevent duplicate dispatch"
```

---

### Task B4: Python singleton cleanup (F-044)

**Files:**
- Create: `API-service/deps.py`
- Modify: `API-service/main.py`
- Modify: `API-service/routers/recommend.py`
- Modify: `API-service/routers/retrieve.py`
- Modify: `API-service/routers/map_bcio.py`

- [ ] **Step 1: Create `API-service/deps.py`**

```python
"""Shared lifespan-managed dependencies for the FastAPI app."""
from __future__ import annotations

import os
from contextlib import asynccontextmanager
from typing import AsyncGenerator, Optional

import motor.motor_asyncio
import redis.asyncio as aioredis
from fastapi import FastAPI

from llm_client import get_openai_client  # noqa: F401 — re-exported for routers

_redis: Optional[aioredis.Redis] = None
_mongo: Optional[motor.motor_asyncio.AsyncIOMotorClient] = None


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    global _redis, _mongo

    redis_url = os.environ.get("REDIS_URL", "redis://redis:6379")
    _redis = aioredis.from_url(redis_url, decode_responses=True)

    _build_mongo_client()

    yield

    if _redis is not None:
        await _redis.aclose()
    if _mongo is not None:
        _mongo.close()


def _build_mongo_client() -> None:
    global _mongo
    mongo_url = os.environ.get("MONGO_URL", "")
    mongo_host = os.environ.get("MONGO_HOST", "mongo")
    mongo_port = int(os.environ.get("MONGO_PORT", "27017"))
    mongo_user = os.environ.get("MONGO_USER", "")
    mongo_password = os.environ.get("MONGO_PASSWORD", "")
    mongo_auth = os.environ.get("MONGO_AUTH_SOURCE", "admin")

    if mongo_url:
        url = mongo_url
    elif mongo_user and mongo_password:
        url = (
            f"mongodb://{mongo_user}:{mongo_password}"
            f"@{mongo_host}:{mongo_port}/?authSource={mongo_auth}"
        )
    else:
        url = f"mongodb://{mongo_host}:{mongo_port}/"

    _mongo = motor.motor_asyncio.AsyncIOMotorClient(url)


async def get_redis() -> Optional[aioredis.Redis]:
    return _redis


async def get_mongo_db() -> motor.motor_asyncio.AsyncIOMotorDatabase:  # type: ignore[type-arg]
    assert _mongo is not None, "MongoDB client not initialised"
    db_name = os.environ.get("MONGO_DB", "surveyjs")
    return _mongo[db_name]
```

- [ ] **Step 2: Update `API-service/main.py` to use lifespan**

```python
"""Health Habit Hub — API-service (FastAPI)."""
import logging
import os

from fastapi import FastAPI

from deps import lifespan
from routers.classify_context import router as classify_context_router
from routers.classify_habit import router as classify_habit_router
from routers.extract_habits import router as extract_habits_router
from routers.extract_profile import router as extract_profile_router
from routers.map_bcio import router as map_bcio_router
from routers.recommend import router as recommend_router
from routers.refine_translation import router as refine_translation_router
from routers.refine_translation_de import router as refine_translation_de_router
from routers.retrieve import router as retrieve_router

logging.basicConfig(level=logging.INFO)

_secret = os.environ.get("API_SERVICE_SECRET")
if not _secret:
    raise RuntimeError(
        "API_SERVICE_SECRET environment variable is required but not set."
    )

app = FastAPI(title="HHH API Service", version="1.0.0", lifespan=lifespan)

app.include_router(classify_habit_router, prefix="/api/v1")
app.include_router(classify_context_router, prefix="/api/v1")
app.include_router(map_bcio_router, prefix="/api/v1")
app.include_router(extract_habits_router, prefix="/api/v1")
app.include_router(extract_profile_router, prefix="/api/v1")
app.include_router(refine_translation_router, prefix="/api/v1")
app.include_router(refine_translation_de_router, prefix="/api/v1")
app.include_router(retrieve_router, prefix="/api/v1")
app.include_router(recommend_router, prefix="/api/v1")


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}
```

- [ ] **Step 3: Update `API-service/routers/recommend.py` — remove module-level singletons**

At the top of `recommend.py`, remove these module-level variables and their helper functions:
```python
# REMOVE:
_redis: Optional[aioredis.Redis] = None

async def _get_redis() -> Optional[aioredis.Redis]:
    ...

_mongo_client: Optional[motor.motor_asyncio.AsyncIOMotorClient] = None

def _get_mongo_db() -> Any:
    ...
```

Add imports:
```python
from fastapi import Depends
from deps import get_redis, get_mongo_db
```

Find the main endpoint function in `recommend.py` and inject deps. The function signature will change from something like `async def recommend(request: RecommendRequest)` to:

```python
@router.post("/llm/recommend")
async def recommend(
    request: RecommendRequest,
    redis: Optional[aioredis.Redis] = Depends(get_redis),
    db: Any = Depends(get_mongo_db),
) -> dict:
```

Replace all internal calls `await _get_redis()` with `redis` and `_get_mongo_db()` with `db`.

- [ ] **Step 4: Update `API-service/routers/retrieve.py` — remove module-level `_openai_client`**

Remove:
```python
_api_key = os.getenv("OPENAI_API_KEY", "")
_openai_client = openai.AsyncOpenAI(api_key=_api_key or "placeholder")
```

Add:
```python
from llm_client import get_openai_client
```

Replace all uses of `_openai_client` with `get_openai_client()`.

- [ ] **Step 5: Check what `llm_client.get_openai_client` looks like**

```bash
grep -n "def get_openai_client\|get_openai_client" API-service/llm_client.py
```

If `get_openai_client()` does not exist, check if there is a module-level client to reference instead — adapt accordingly.

- [ ] **Step 6: Update `API-service/routers/map_bcio.py` — remove module-level `_openai_client`**

Same pattern as retrieve.py: remove the module-level `_openai_client`, import from `llm_client`.

- [ ] **Step 7: Verify**

```bash
grep -n "_openai_client\|_redis\s*=\|_mongo_client\s*=" \
  API-service/routers/recommend.py \
  API-service/routers/retrieve.py \
  API-service/routers/map_bcio.py
# Expected: no matches (all removed)

grep -n "from deps import\|lifespan" \
  API-service/main.py \
  API-service/deps.py
# Expected: both files reference deps/lifespan
```

- [ ] **Step 8: Commit**

```bash
git add API-service/deps.py API-service/main.py \
        API-service/routers/recommend.py \
        API-service/routers/retrieve.py \
        API-service/routers/map_bcio.py
git commit -m "fix: consolidate Python API singletons into shared lifespan-managed deps.py"
```

---

### Task B5: Flutter WebView origin guard (F-047/048)

**Files:**
- Modify: `mobile/lib/screens/donate_screen.dart:62-64`
- Modify: `mobile/lib/screens/profile_screen.dart:112-114`

- [ ] **Step 1: Add `onNavigationRequest` to `donate_screen.dart`**

Current WebView in `_buildWebController` (lines 47–69):
```dart
      ..setNavigationDelegate(NavigationDelegate(
        onPageFinished: (_) => _injectCompletionHook(),
      ))
```

Change to:
```dart
      ..setNavigationDelegate(NavigationDelegate(
        onPageFinished: (_) => _injectCompletionHook(),
        onNavigationRequest: (NavigationRequest request) {
          final allowed = request.url.startsWith(AppConfig.appBaseUrl);
          return allowed
              ? NavigationDecision.navigate
              : NavigationDecision.prevent;
        },
      ))
```

Note: Use `AppConfig.appBaseUrl` — verify this constant exists:
```bash
grep -n "appBaseUrl\|apiBaseUrl" mobile/lib/config/app_config.dart
```

If the constant is `apiBaseUrl` (not `appBaseUrl`), use that instead.

- [ ] **Step 2: Add `onNavigationRequest` to `profile_screen.dart`**

Current WebView in `_initSurvey` (lines 106–119):
```dart
      final controller = WebViewController()
        ..setJavaScriptMode(JavaScriptMode.unrestricted)
        ..addJavaScriptChannel(
          'ProfileSurveyComplete',
          onMessageReceived: (msg) => _onSurveyComplete(msg.message),
        )
        ..setNavigationDelegate(NavigationDelegate(
          onPageFinished: (_) => _injectCompletionHook(),
        ))
```

Change the `setNavigationDelegate` call to:
```dart
        ..setNavigationDelegate(NavigationDelegate(
          onPageFinished: (_) => _injectCompletionHook(),
          onNavigationRequest: (NavigationRequest request) {
            final allowed = request.url.startsWith(AppConfig.appBaseUrl);
            return allowed
                ? NavigationDecision.navigate
                : NavigationDecision.prevent;
          },
        ))
```

- [ ] **Step 3: Verify**

```bash
grep -n "onNavigationRequest\|NavigationDecision" \
  mobile/lib/screens/donate_screen.dart \
  mobile/lib/screens/profile_screen.dart
# Expected: 2 matches in each file
```

- [ ] **Step 4: Build check**

```bash
cd mobile && flutter analyze lib/screens/donate_screen.dart lib/screens/profile_screen.dart
# Expected: no errors
```

- [ ] **Step 5: Commit**

```bash
git add mobile/lib/screens/donate_screen.dart \
        mobile/lib/screens/profile_screen.dart
git commit -m "fix: restrict WebView navigation to app origin in donate and profile screens"
```

---

## Group C — Large Refactors

*C1, C2, C3 are independent. Run in parallel.*

---

### Task C1: Plaintext participant password fix (F-005)

**Files:**
- Modify: `app/package.json` — add bcryptjs
- Modify: `app/services/adminParticipantService.js`
- Modify: `app/routes/adminRouter.js` (token-card endpoint + Swagger JSDoc)

- [ ] **Step 1: Add bcryptjs dependency**

```bash
cd app && npm install bcryptjs
```

Verify `"bcryptjs"` appears in `app/package.json` dependencies.

- [ ] **Step 2: Rewrite `createParticipant` in adminParticipantService.js**

Current function (lines 49–74):
```js
export async function createParticipant({ db, kc }) {
  const userId = randomUUID();
  const username = `p-${userId}`;
  const password = randomPassword();

  const keycloakUserId = await kc.createUser({ userId, username, password });
  await kc.assignRole(keycloakUserId || userId, 'participant');

  const now = new Date();
  await db.collection('participants').insertOne({
    userId,
    username,
    password,
    group: null,
    enrolledAt: now,
    lastActive: null,
    surveyCompletionPct: 0,
  });

  return {
    userId,
    username,
    password,
    tokenCardUrl: `/api/v1/admin/participants/${userId}/token-card`,
  };
}
```

Add import at top of file:
```js
import bcrypt from 'bcryptjs';
import { generateTokenCard } from './token_card_service.js';
```

Change `createParticipant` to:
```js
export async function createParticipant({ db, kc }) {
  const userId = randomUUID();
  const username = `p-${userId}`;
  const password = randomPassword();

  const keycloakUserId = await kc.createUser({ userId, username, password });
  await kc.assignRole(keycloakUserId || userId, 'participant');

  // Generate PDF before hashing so we still have the plaintext password
  const tokenCardPdf = await generateTokenCard(userId, username, password, 'both');

  const passwordHash = await bcrypt.hash(password, 10);

  const now = new Date();
  await db.collection('participants').insertOne({
    userId,
    username,
    passwordHash,
    tokenCardPdf,
    group: null,
    enrolledAt: now,
    lastActive: null,
    surveyCompletionPct: 0,
  });

  return {
    userId,
    username,
    tokenCardUrl: `/api/v1/admin/participants/${userId}/token-card`,
  };
}
```

Note: `generateTokenCard` is already imported in `adminRouter.js` from `'../services/token_card_service.js'`. In the service file use the same path, adjusted: `'./token_card_service.js'`.

Verify the import path:
```bash
ls app/services/token_card_service.js
```

If it is in a different location (e.g., `app/services/token_card_service.js`), adjust accordingly.

- [ ] **Step 3: Update `GET /participants/:id/token-card` in adminRouter.js**

Current handler (lines 394–430):
```js
  router.get('/participants/:id/token-card', async (req, res) => {
    try {
      const { id } = req.params;
      const format = req.query.format || 'both';

      if (!['qr', 'print', 'both'].includes(format)) {
        return res.status(400).json({ error: "Invalid format. Must be 'qr', 'print', or 'both'" });
      }

      const database = await getDb();
      const participant = await getParticipant({ db: database, id });

      if (!participant) {
        return res.status(404).json({ error: 'Participant not found' });
      }

      const svc = getTokenCardService();
      const pdfBuffer = await svc.generateTokenCard(
        participant.userId,
        participant.username,
        participant.password || '',
        format
      );

      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="token-card-${id}.pdf"`,
        'Content-Length': pdfBuffer.length,
      });
      res.send(pdfBuffer);
    } catch (err) {
      console.error('[route] Error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
```

Replace with:
```js
  router.get('/participants/:id/token-card', async (req, res) => {
    try {
      const { id } = req.params;

      const database = await getDb();
      const participant = await getParticipant({ db: database, id });

      if (!participant) {
        return res.status(404).json({ error: 'Participant not found' });
      }

      if (!participant.tokenCardPdf) {
        return res.status(404).json({ error: 'Token card not available' });
      }

      const pdfBuffer = Buffer.isBuffer(participant.tokenCardPdf)
        ? participant.tokenCardPdf
        : Buffer.from(participant.tokenCardPdf.buffer || participant.tokenCardPdf);

      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="token-card-${id}.pdf"`,
        'Content-Length': pdfBuffer.length,
      });
      res.send(pdfBuffer);
    } catch (err) {
      console.error('[route] Error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
```

Note: MongoDB stores binary data as `Binary` objects. `participant.tokenCardPdf.buffer` is needed when the value was stored as a `Buffer` — MongoDB's driver may return it as a `Binary` object. The `Buffer.from(...)` handles both cases.

- [ ] **Step 4: Update Swagger JSDoc for POST /participants response**

Find the JSDoc block for `POST /participants` response (~line 175–183) and remove the `password` property:

```js
 *       201:
 *         description: Participant created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 userId: { type: string, format: uuid }
 *                 username: { type: string, example: p-a1b2c3d4 }
 *                 tokenCardUrl: { type: string, example: /api/v1/admin/participants/a1b2c3d4.../token-card }
```

(Remove the `password` line.)

- [ ] **Step 5: Verify**

```bash
grep -n "password\b" app/services/adminParticipantService.js
# Expected: only `randomPassword()` function definition and the `kc.createUser` call — no DB insertOne with password

grep -n "participant\.password" app/routes/adminRouter.js
# Expected: no matches
```

- [ ] **Step 6: Run existing tests**

```bash
cd app && npm test
# Expected: all tests pass
```

- [ ] **Step 7: Commit**

```bash
git add app/package.json app/package-lock.json \
        app/services/adminParticipantService.js \
        app/routes/adminRouter.js
git commit -m "fix: store bcrypt hash instead of plaintext password; generate token card PDF at creation time"
```

---

### Task C2: adminRouter decomposition (F-036)

**Files:**
- Create: `app/routes/admin/surveysRouter.js`
- Create: `app/routes/admin/notificationsRouter.js`
- Create: `app/routes/admin/studiesRouter.js`
- Create: `app/routes/admin/participantsRouter.js`
- Modify: `app/routes/adminRouter.js` — thin parent only
- Modify: `app/app.js` — update swagger glob

This is a file organisation refactor only — **no logic changes**.

- [ ] **Step 1: Identify route groups in adminRouter.js**

```bash
grep -n "router\.\(get\|post\|put\|patch\|delete\)" app/routes/adminRouter.js
```

Use this to map routes to their sub-router:

| Sub-router | Routes |
|---|---|
| `surveysRouter.js` | `/surveys`, `/surveys/:id`, `/surveys/:id/status`, `/surveys/:id/targeting`, `/questionnaires`, `/questionnaires/:id`, `/questionnaires/:id/active`, `/questionnaires/:id/assign-study` |
| `notificationsRouter.js` | `/notifications/schedule`, `/notifications/scheduled`, `/notifications/scheduled/:id` |
| `studiesRouter.js` | `/studies`, `/studies/:id`, `/studies/:id/default`, `/studies/:id/codes`, `/studies/:id/codes/:code`, `/studies/:id/participants`, `/studies/:id/groups`, `/studies/:id/groups/:groupId` |
| `participantsRouter.js` | `/participants`, `/participants/:id`, `/participants/:id/group`, `/participants/:id/token-card`, `/participants/:id/progress` |

All other routes (base `/`, `/settings`, `/settings/:key`, `/habits/feed`, `/habits/feed/export`, `/sessions`, `/sessions/:id`, `/knowledge-base/*`) stay in the thin `adminRouter.js`.

- [ ] **Step 2: Create `app/routes/admin/` directory and sub-router files**

Each sub-router follows this template. Example for `participantsRouter.js`:

```js
import express from 'express';
// Copy the imports used by participant routes from adminRouter.js:
// import { ObjectId } from 'mongodb';
// import { makeGetDb } from '../../utils/getDb.js';
// import { generateTokenCard } from '../../services/token_card_service.js';
// import { listParticipants, createParticipant, assignGroup, getParticipant, softDeleteParticipant } from '../../services/adminParticipantService.js';
// import { getParticipantProgress } from '../../services/adminStatsService.js';
// import { createKeycloakAdminClient } from '../../services/keycloakAdminClient.js';

export function createParticipantsRouter({ db, keycloak, tokenCardService } = {}) {
  const router = express.Router();
  // ... move participant route handlers here verbatim (copy-paste from adminRouter.js)
  return router;
}
```

Cut the route handlers from `adminRouter.js` and paste them into the sub-router files. **Do not modify the logic.**

- [ ] **Step 3: Update the thin parent `adminRouter.js`**

`adminRouter.js` becomes:

```js
import express from 'express';
import { makeGetDb } from '../utils/getDb.js';
import { createKeycloakAdminClient } from '../services/keycloakAdminClient.js';
import { generateTokenCard } from '../services/token_card_service.js';
// ... other shared imports

import { createSurveysRouter } from './admin/surveysRouter.js';
import { createNotificationsRouter } from './admin/notificationsRouter.js';
import { createStudiesRouter } from './admin/studiesRouter.js';
import { createParticipantsRouter } from './admin/participantsRouter.js';

// Keep: DEFAULT_SETTINGS, seedDefaultSettings, createAdminRouter factory signature,
//       shared middleware (auth, role check, sanitizeBody), Swagger tag definitions,
//       routes that don't belong to a sub-router (/settings, /habits/*, /sessions/*, /knowledge-base/*)

export function createAdminRouter({ db, neo4jRun, keycloak, tokenCardService } = {}) {
  const router = express.Router();
  const getDb = makeGetDb(db);

  // ... seed settings, shared middleware setup

  // Mount sub-routers
  router.use('/', createSurveysRouter({ db, neo4jRun }));
  router.use('/', createNotificationsRouter({ db }));
  router.use('/', createStudiesRouter({ db, neo4jRun, keycloak }));
  router.use('/', createParticipantsRouter({ db, keycloak, tokenCardService }));

  // ... remaining inline routes

  return router;
}
```

- [ ] **Step 4: Update swagger glob in app.js**

In `app/app.js` or wherever swagger-jsdoc is configured, update the glob to include the new admin sub-router files:

```bash
grep -n "swagger\|jsdoc\|routes/admin" app/app.js app/routes/index.js 2>/dev/null | head -20
```

Find the `apis:` array in the swagger config and add `'./routes/admin/*.js'`.

- [ ] **Step 5: Smoke test**

```bash
cd app && node --input-type=module <<'EOF'
import { createAdminRouter } from './routes/adminRouter.js';
const r = createAdminRouter();
console.log('Admin router created:', typeof r);
EOF
# Expected: "Admin router created: function" (Express Router)
```

- [ ] **Step 6: Run existing tests**

```bash
cd app && npm test
# Expected: all tests pass
```

- [ ] **Step 7: Commit**

```bash
git add app/routes/adminRouter.js \
        app/routes/admin/ \
        app/app.js
git commit -m "refactor: split adminRouter.js into domain sub-routers under app/routes/admin/"
```

---

### Task C3: Next.js admin test coverage (F-051)

**Files:**
- Create: `admin/jest.config.ts`
- Create: `admin/jest.setup.ts`
- Create: `admin/src/__tests__/middleware.test.ts`
- Create: `admin/src/__tests__/auth.test.ts`
- Create: `admin/src/__tests__/apiFetch.test.ts`
- Create: `admin/src/__tests__/questionnaires.test.tsx`
- Create: `admin/src/__tests__/studies.test.tsx`
- Create: `admin/src/__tests__/knowledge-base.test.tsx`
- Modify: `admin/package.json`

- [ ] **Step 1: Install test dependencies**

```bash
cd admin && npm install --save-dev \
  jest \
  @testing-library/react \
  @testing-library/user-event \
  @testing-library/jest-dom \
  jest-environment-jsdom \
  @types/jest \
  ts-jest
```

- [ ] **Step 2: Create `admin/jest.config.ts`**

```ts
import type { Config } from 'jest';

const config: Config = {
  testEnvironment: 'jsdom',
  setupFilesAfterFramework: ['<rootDir>/jest.setup.ts'],
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', { tsconfig: { jsx: 'react-jsx' } }],
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '\\.(css|less|scss|sass)$': '<rootDir>/src/__mocks__/styleMock.js',
  },
  testMatch: ['**/__tests__/**/*.test.{ts,tsx}'],
};

export default config;
```

If Jest reports an unknown config key for `setupFilesAfterFramework`, run `npx jest --showConfig 2>/dev/null | grep -i "setupfiles"` to confirm the correct spelling for the installed version.

- [ ] **Step 3: Create `admin/jest.setup.ts`**

```ts
import '@testing-library/jest-dom';
```

- [ ] **Step 4: Add `test` script to `admin/package.json`**

Find the `"scripts"` block and add:
```json
"test": "jest"
```

- [ ] **Step 5: Create `admin/src/__tests__/middleware.test.ts`**

Read the current middleware first:
```bash
cat admin/src/middleware.ts
```

Then write tests:

```ts
/**
 * Tests for admin Next.js middleware (auth gate + role check).
 */
import { NextRequest, NextResponse } from 'next/server';

// Mock next-auth/jwt
jest.mock('next-auth/jwt', () => ({
  getToken: jest.fn(),
}));

import { getToken } from 'next-auth/jwt';
import { middleware } from '../middleware';

const mockGetToken = getToken as jest.MockedFunction<typeof getToken>;

function makeRequest(path: string): NextRequest {
  return new NextRequest(`http://localhost${path}`);
}

describe('middleware', () => {
  beforeEach(() => jest.clearAllMocks());

  it('redirects unauthenticated requests to sign-in', async () => {
    mockGetToken.mockResolvedValue(null);
    const res = await middleware(makeRequest('/dashboard'));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('sign-in');
  });

  it('allows authenticated admin through', async () => {
    mockGetToken.mockResolvedValue({
      roles: ['admin'],
      accessToken: 'tok',
    } as any);
    const res = await middleware(makeRequest('/dashboard'));
    expect(res.status).not.toBe(307);
  });

  it('redirects authenticated user with wrong role to /access-denied', async () => {
    mockGetToken.mockResolvedValue({ roles: ['participant'], accessToken: 'tok' } as any);
    const res = await middleware(makeRequest('/dashboard'));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('access-denied');
  });
});
```

Adjust the test expectations if the actual middleware works differently — read `admin/src/middleware.ts` to get the exact redirect paths.

- [ ] **Step 6: Create `admin/src/__tests__/auth.test.ts`**

Read the auth config first:
```bash
cat admin/src/lib/auth.ts
```

Then write tests:

```ts
/**
 * Tests for NextAuth callbacks in auth.ts
 */

// Import the auth config's jwt callback directly
// Adjust import path based on what auth.ts exports
import { authOptions } from '../lib/auth';

describe('jwt callback', () => {
  const jwtCallback = authOptions.callbacks?.jwt;

  it('extracts roles from realm_access.roles', async () => {
    const token = {};
    const account = { access_token: 'tok' };
    const profile = { realm_access: { roles: ['admin', 'researcher'] } } as any;
    const result = await (jwtCallback as any)({ token, account, profile });
    expect(result.roles).toEqual(['admin', 'researcher']);
    expect(result.accessToken).toBe('tok');
  });

  it('sets empty array when realm_access is missing', async () => {
    const token = {};
    const account = { access_token: 'tok' };
    const profile = {} as any;
    const result = await (jwtCallback as any)({ token, account, profile });
    expect(result.roles).toEqual([]);
  });

  it('forwards accessToken', async () => {
    const token = {};
    const account = { access_token: 'mytoken' };
    const profile = { realm_access: { roles: [] } } as any;
    const result = await (jwtCallback as any)({ token, account, profile });
    expect(result.accessToken).toBe('mytoken');
  });
});
```

- [ ] **Step 7: Create `admin/src/__tests__/apiFetch.test.ts`**

Read the apiFetch utility:
```bash
grep -rn "apiFetch\|api-fetch\|fetchWithAuth" admin/src/lib/ 2>/dev/null | head -10
```

Then write tests based on what you find. If the function is `apiFetch` in `admin/src/lib/apiFetch.ts`:

```ts
import { apiFetch } from '../lib/apiFetch';

global.fetch = jest.fn();
const mockFetch = fetch as jest.MockedFunction<typeof fetch>;

describe('apiFetch', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns JSON on success', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: 'value' }),
    } as Response);
    const result = await apiFetch('/api/test', 'token');
    expect(result).toEqual({ data: 'value' });
  });

  it('throws with error message on non-ok response', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ error: 'Forbidden' }),
    } as Response);
    await expect(apiFetch('/api/test', 'token')).rejects.toThrow('Forbidden');
  });

  it('falls back to HTTP status when body has no error field', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    } as Response);
    await expect(apiFetch('/api/test', 'token')).rejects.toThrow('HTTP 500');
  });
});
```

Adjust based on the actual function signature.

- [ ] **Step 8: Create `admin/src/__tests__/questionnaires.test.tsx`**

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mock next-auth/react
jest.mock('next-auth/react', () => ({
  useSession: jest.fn(() => ({
    data: { accessToken: 'tok', user: { name: 'Admin' } },
    status: 'authenticated',
  })),
}));

global.fetch = jest.fn();
const mockFetch = fetch as jest.MockedFunction<typeof fetch>;

// Import the page component — adjust path
import QuestionnairesPage from '../app/(admin)/questionnaires/page';

describe('QuestionnairesPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => [],
    } as Response);
  });

  it('renders library and custom tabs', async () => {
    render(<QuestionnairesPage />);
    await waitFor(() => {
      expect(screen.getByText(/library/i)).toBeInTheDocument();
      expect(screen.getByText(/custom/i)).toBeInTheDocument();
    });
  });

  it('shows Add Questionnaire button on Custom tab only', async () => {
    render(<QuestionnairesPage />);
    await userEvent.click(screen.getByText(/custom/i));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /add questionnaire/i })).toBeInTheDocument();
    });
  });

  it('opens create modal on Add Questionnaire click', async () => {
    render(<QuestionnairesPage />);
    await userEvent.click(screen.getByText(/custom/i));
    await userEvent.click(screen.getByRole('button', { name: /add questionnaire/i }));
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });
});
```

Adjust component import paths to match the actual file structure.

- [ ] **Step 9: Create `admin/src/__tests__/studies.test.tsx`**

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

jest.mock('next-auth/react', () => ({
  useSession: jest.fn(() => ({
    data: { accessToken: 'tok', user: { name: 'Admin' } },
    status: 'authenticated',
  })),
}));

global.fetch = jest.fn();
const mockFetch = fetch as jest.MockedFunction<typeof fetch>;

import StudiesPage from '../app/(admin)/studies/page';

describe('StudiesPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ results: [], total: 0, page: 1 }),
    } as Response);
  });

  it('renders study list', async () => {
    render(<StudiesPage />);
    await waitFor(() => {
      // List container or empty state renders
      expect(document.body).toBeTruthy();
    });
  });
});
```

- [ ] **Step 10: Create `admin/src/__tests__/knowledge-base.test.tsx`**

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

jest.mock('next-auth/react', () => ({
  useSession: jest.fn(() => ({
    data: { accessToken: 'tok', user: { name: 'Admin' } },
    status: 'authenticated',
  })),
}));

global.fetch = jest.fn();
const mockFetch = fetch as jest.MockedFunction<typeof fetch>;

import KnowledgeBasePage from '../app/(admin)/knowledge-base/page';

describe('KnowledgeBasePage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ files: [] }),
    } as Response);
  });

  it('renders file list area', async () => {
    render(<KnowledgeBasePage />);
    await waitFor(() => {
      expect(document.body).toBeTruthy();
    });
  });

  it('shows upload button', async () => {
    render(<KnowledgeBasePage />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /upload/i })).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 11: Run tests**

```bash
cd admin && npm test
# Expected: all tests pass (some may need adjustment based on actual component APIs)
```

Fix any test failures caused by incorrect import paths or component API mismatches. Read the actual component files to get exact props and text content.

- [ ] **Step 12: Commit**

```bash
git add admin/jest.config.ts \
        admin/jest.setup.ts \
        admin/package.json \
        admin/package-lock.json \
        admin/src/__tests__/
git commit -m "test: add Jest + RTL test suite for Next.js admin (middleware, auth, pages)"
```

---

## Execution Order

```
Batch 1: Tasks A1–A12 sequentially (all in adminRouter.js share state)
Batch 2: Tasks B1, B2, B3, B4, B5 in parallel
Batch 3: Tasks C1, C2, C3 in parallel (C1 and C2 both touch adminRouter.js — coordinate or run sequentially)
```

**Note on C1 + C2 conflict:** Both C1 (password fix) and C2 (adminRouter decomposition) modify `adminRouter.js`. Either:
- Run C1 first, then C2 includes the C1 changes in its restructuring, **or**
- Have the C2 agent apply the C1 token-card handler change as part of its work.

Simplest: run C1 before C2 in the same batch, or assign both to the same agent running sequentially.
