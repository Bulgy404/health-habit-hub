# Design: Fix All AUDIT.md Backlog Items

**Date:** 2026-04-13
**Branch:** ralph/hhh-platform-unified
**Scope:** All P1 and P2 backlog items from the 2026-04-10 full system audit

---

## Approach

Risk-ordered batches with parallelism within each batch:

- **Group A** — Small targeted fixes (all layers, one batch, one commit per layer)
- **Group B** — Medium complexity (independent items, run in parallel across layers)
- **Group C** — Large refactors (sequential within each item, parallel across items)

---

## Group A — Small Targeted Fixes

All changes are one-to-five lines. One commit.

| Finding | File | Change |
|---------|------|--------|
| F-029 | `app/utils/config.js` | `getDbHeader()`: `this.db.name` → `this.db.path` |
| F-030 | `app/middleware/requestParser.js` | Remove stale `"doesnt work need to fix"` comment; add `{ limit: '100kb' }` to `bodyParser.json()` |
| F-031 | `app/app.js` | Move `app.use('/api/internal', internalRouter)` before `httpServer.listen()` |
| F-032 | `app/utils/SparqlDatabase.js` | Add explicit allowlist assertion at top of `_appendContext` and `_appendBehavior` using `LABEL_TYPE_MAP` keys |
| F-033 | `app/routes/adminRouter.js` + `app/services/adminStatsService.js` | `const VALID_SETTINGS_KEYS = new Set(['token_card_format'])`; reject unknown keys with 400 at route and service |
| F-034 | `app/routes/adminRouter.js` | `POST /studies/:id/codes`: validate `count` is a positive integer ≤ 100 |
| F-035 | `app/routes/adminRouter.js` | Sweep all `POST` creation endpoints → `res.status(201)` |
| F-037 | `app/routes/questionnaireResponsesRouter.js` | `POST /questionnaire-responses`: return `{ ok: true }` instead of `{ id: result.insertedId }` |
| F-041 | `app/services/notificationService.js` | Before setting `dispatched = true`: `if (result.sent === 0 && result.failed > 0) console.warn(...)` |
| F-046 | `admin/package.json` | Bump `"next"` to latest 14.x patch (check `npm view next versions` at implementation time) |
| F-050 | `mobile/lib/router/redirect.dart` | Admin guard: call `getIsLoggedIn()` first; redirect unauthenticated to `/onboarding/welcome` before checking roles |

**Commit:** `fix: group-A backlog — config bug, body limits, SPARQL allowlist, settings whitelist, count validation, 201 sweep, misc`

---

## Group B — Medium Complexity

Five independent items. B1/B3/B4/B5 can run in parallel; B2 is also independent.

### B1 — Python API service authentication (F-022)

**New file:** `API-service/auth.py`

```python
import hmac, os
from fastapi import Header, HTTPException

async def verify_service_token(x_service_auth_token: str = Header(...)):
    secret = os.environ["API_SERVICE_SECRET"]
    if not hmac.compare_digest(x_service_auth_token, secret):
        raise HTTPException(status_code=403, detail="Forbidden")
```

- Applied to every router: `router = APIRouter(dependencies=[Depends(verify_service_token)])`
- `API-service/main.py`: validate `API_SERVICE_SECRET` is set at startup; raise `RuntimeError` if missing
- `app/routes/recommendRouter.js`: `proxyToRecommender` injects `'X-Service-Auth-Token': process.env.API_SERVICE_SECRET`
- `app/app.js`: log a startup warning if `API_SERVICE_SECRET` is absent
- `stack.env` + all `docker-compose*.yml` env blocks: add `API_SERVICE_SECRET` (placeholder value for dev; real value via Portainer for prod)

**Commit:** `fix: add shared-secret auth between Node and Python API service`

---

### B2 — Recommendations IDOR hardening + regression test (F-038/039)

**`app/routes/recommendationsRouter.js`:**

Change:
```js
const rec = await db.collection('recommendations').findOne({ recommendation_id });
```
To:
```js
const rec = await db.collection('recommendations').findOne({ recommendation_id, userId });
```

A wrong owner now gets 404 (implicit auth — record's existence is not revealed).

**New test file:** `app/tests/integration/recommendations.idor.test.js`

- Assert USER_B receives 404 on `POST /:id/feedback` for USER_A's recommendation ID
- Follows existing integration test harness pattern in the repo

**Commit:** `fix: scope recommendation feedback query by userId; add IDOR regression test`

---

### B3 — Notification cron Redis lock (F-040)

**`app/services/notificationService.js`:**

`startNotificationScheduler` accepts optional `redisUrl` (defaults to `process.env.REDIS_URL`).

At the top of each cron tick:
```js
const lockSet = await redis.set('hhh:notif-lock', '1', { NX: true, PX: 55000 });
if (!lockSet) return; // previous tick still running — skip
```

After dispatch completes (success or error):
```js
await redis.del('hhh:notif-lock');
```

**Degradation:** If Redis is unavailable, log a warning and proceed unlocked (same behaviour as today — non-fatal).

`app/app.js`: pass `redisUrl: process.env.REDIS_URL` to `startNotificationScheduler`.

**Commit:** `fix: add Redis distributed lock to notification cron to prevent duplicate dispatch`

---

### B4 — Python singleton cleanup (F-044)

**New file:** `API-service/deps.py`

```python
from contextlib import asynccontextmanager
from fastapi import FastAPI
import redis.asyncio as aioredis
from motor.motor_asyncio import AsyncIOMotorClient
from llm_client import get_openai_client  # expose existing client (same package)

_redis: aioredis.Redis | None = None
_mongo: AsyncIOMotorClient | None = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global _redis, _mongo
    _redis = aioredis.from_url(os.environ["REDIS_URL"])
    _mongo = AsyncIOMotorClient(os.environ["MONGO_URI"])
    yield
    await _redis.aclose()
    _mongo.close()

async def get_redis() -> aioredis.Redis:
    return _redis

async def get_mongo_db():
    return _mongo[os.environ["MONGO_DB_NAME"]]
```

- `API-service/main.py`: `app = FastAPI(lifespan=lifespan)`
- All routers that had `_redis` / `_mongo_client` module-level singletons: remove them; add `redis: aioredis.Redis = Depends(get_redis)` / `db = Depends(get_mongo_db)` to affected endpoint functions
- `map_bcio.py` and `retrieve.py`: remove their own `_openai_client`; import the shared client from `llm_client.py`

**Commit:** `fix: consolidate Python API singletons into shared lifespan-managed deps.py`

---

### B5 — Flutter WebView origin guard (F-047/048)

In **`mobile/lib/screens/donate_screen.dart`** and **`mobile/lib/screens/profile_screen.dart`**, add `onNavigationRequest` to the `NavigationDelegate`:

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

`legal_document_screen.dart` uses `loadHtmlString` with JS disabled — no change needed.

**Commit:** `fix: restrict WebView navigation to app origin in donate and profile screens`

---

## Group C — Large Refactors

### C1 — Plaintext participant password (F-005)

**Dependency:** Add `bcryptjs` to `app/package.json`.

**`app/services/adminParticipantService.js` — `createParticipant` changes:**

```
Before:
  store { userId, username, password, ... }
  return { userId, username, password, tokenCardUrl }

After:
  1. Generate userId, username, password (unchanged)
  2. Call generateTokenCard(userId, username, password, 'both') → pdfBuffer
  3. Hash: const passwordHash = await bcrypt.hash(password, 10)
  4. Store { userId, username, passwordHash, tokenCardPdf: pdfBuffer, ... }
     — no plaintext password in DB
  5. Return { userId, username, tokenCardUrl }
     — no plaintext password in response
```

`generateTokenCard` is imported directly into the service (it is already used by the route; moving the call to service layer is cleaner).

**`app/routes/adminRouter.js` — `GET /participants/:id/token-card`:**

```
Before: re-generate PDF from participant.password
After:  serve participant.tokenCardPdf directly from MongoDB

If participant.tokenCardPdf is absent → 404 with message "Token card not available"
```

**JSDoc and response type updated** to reflect that `POST /participants` no longer returns `password`.

**Commit:** `fix: store bcrypt hash instead of plaintext password; generate token card PDF at creation time`

---

### C2 — adminRouter decomposition (F-036)

**New directory:** `app/routes/admin/`

**Four new sub-router files:**

| File | Routes |
|------|--------|
| `surveysRouter.js` | `/surveys`, `/questionnaires` CRUD |
| `notificationsRouter.js` | `/notifications/schedule`, `/notifications/scheduled` |
| `studiesRouter.js` | `/studies`, `/studies/:id/*` (codes, participants, groups) |
| `participantsRouter.js` | `/participants`, `/participants/:id`, `/participants/:id/token-card` |

**`app/routes/adminRouter.js` becomes a thin parent:**
- Keeps `createAdminRouter` factory signature (no API changes)
- Imports and mounts the four sub-routers
- Keeps shared middleware (auth, role check, sanitizeBody, Swagger tag definitions)
- All inline business logic stays in place — this task is file organisation only, no logic changes

**`app/app.js`:** Update `swagger-jsdoc` glob to include `app/routes/admin/*.js`.

**Commit:** `refactor: split adminRouter.js into domain sub-routers under app/routes/admin/`

---

### C3 — Next.js admin test coverage

**Framework:** Jest + `@testing-library/react` + `@testing-library/user-event` + `jest-environment-jsdom`

**New config files:**
- `admin/jest.config.ts`
- `admin/jest.setup.ts` (extends `@testing-library/jest-dom`)

**New test files:**

| File | What it covers |
|------|----------------|
| `admin/src/__tests__/middleware.test.ts` | Unauthenticated → redirect to sign-in; correct role → passes through; wrong role → `/access-denied` |
| `admin/src/__tests__/auth.test.ts` | `jwt` callback extracts roles from `realm_access.roles`; missing `realm_access` → `[]`; `accessToken` forwarded |
| `admin/src/__tests__/apiFetch.test.ts` | Success returns JSON; non-ok throws with message + status; body without `error` falls back to `HTTP ${status}` |
| `admin/src/__tests__/questionnaires.test.tsx` | Library/custom tabs render; "Add Questionnaire" only on Custom tab; create modal opens; delete dialog appears; 409 shows "assigned to study" message |
| `admin/src/__tests__/studies.test.tsx` | Study list renders; detail tabs reachable; codes generate form validates group |
| `admin/src/__tests__/knowledge-base.test.tsx` | File list renders; upload modal opens; delete confirmation appears; non-PDF rejected |

All tests mock `fetch` and `useSession` — no real network calls.

**`admin/package.json`:** Add `jest`, `@testing-library/react`, `@testing-library/user-event`, `jest-environment-jsdom`, `@types/jest`, `ts-jest` to `devDependencies`. Add `"test": "jest"` script.

**Commit:** `test: add Jest + RTL test suite for Next.js admin (middleware, auth, pages)`

---

## Execution Order

```
Batch 1 (parallel):
  - Group A (all small fixes — single agent)

Batch 2 (parallel):
  - B1: Python auth
  - B2: Recommendations IDOR + test
  - B3: Notification cron lock
  - B4: Python singleton cleanup
  - B5: Flutter WebView guard

Batch 3 (parallel):
  - C1: Plaintext password fix
  - C2: adminRouter decomposition
  - C3: Next.js tests
```

Each item in a batch is independent — no shared files except Group A items which share `adminRouter.js` (handled within a single agent sequentially).
