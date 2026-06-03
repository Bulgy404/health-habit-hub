# Full-Repo Clean Sweep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove all dead code, apply clean code principles, and add comprehensive doc comments across all four stacks (Node.js, Python, Next.js, Flutter) in a single quality pass.

**Architecture:** Stack-by-stack sequential execution — `app/` → `API-service/` → `admin/` → `mobile/`. Each stack is completed in full before moving to the next, and each produces a focused commit. The post-implementation pass verifies tests across all stacks and updates CHANGELOG.

**Tech Stack:** Node.js 20 + Express, Python 3.11 + FastAPI + Pydantic v2, Next.js 14 + TypeScript, Flutter 3 + Dart 3 + Riverpod + GoRouter

---

## Pre-flight checks

- [ ] Confirm working directory is the repo root
- [ ] Confirm `npm test` passes in `app/` before starting
- [ ] Confirm `cd API-service && pytest` passes before starting
- [ ] Confirm `cd admin && npm test` passes before starting
- [ ] Confirm `cd mobile && flutter test` passes before starting

---

# STACK 1 — `app/` (Node.js/Express)

---

## Task 1: Rename `token_card_service.js` → `tokenCardService.js`

**Files:**
- Rename: `app/services/token_card_service.js` → `app/services/tokenCardService.js`
- Rename: `app/tests/unit/token_card_service.test.js` → `app/tests/unit/tokenCardService.test.js`
- Modify: `app/routes/adminRouter.js`
- Modify: `app/routes/admin/participantsRouter.js`
- Modify: `app/routes/v1Router.js`
- Modify: `app/services/adminParticipantService.js`
- Modify: `app/tests/integration/admin.participants.test.js`

- [ ] **Step 1: Rename the service file**

```bash
mv app/services/token_card_service.js app/services/tokenCardService.js
mv app/tests/unit/token_card_service.test.js app/tests/unit/tokenCardService.test.js
```

- [ ] **Step 2: Update all import references**

In every file that imports `token_card_service`, change the import path:

```js
// Before
import { generateTokenCard } from '../services/token_card_service.js';
// After
import { generateTokenCard } from '../services/tokenCardService.js';
```

Run this to find every reference:
```bash
grep -rn "token_card_service" app/ --include="*.js"
```
Expected: 0 results after updating all files.

- [ ] **Step 3: Verify tests still pass**

```bash
cd app && npm test -- --testPathPattern=tokenCardService
```
Expected: all tokenCardService tests green.

- [ ] **Step 4: Commit**

```bash
git add app/services/tokenCardService.js app/tests/unit/tokenCardService.test.js \
        app/routes/adminRouter.js app/routes/admin/participantsRouter.js \
        app/routes/v1Router.js app/services/adminParticipantService.js \
        app/tests/integration/admin.participants.test.js
git commit -m "refactor(app): rename token_card_service to tokenCardService"
```

---

## Task 2: Verify controllers are active; audit for any truly dead API routes

**Files:**
- Read: `app/controllers/*.js`, `app/routes/v1Router.js`, `app/app.js`

> **Note:** The 11 controllers in `app/controllers/` (about, donate, imprint, etc.) ARE active — they
> serve a server-side-rendered web frontend mounted on the `router` (non-API) path in `app.js`.
> Do NOT remove them. Confirm this by verifying each controller is imported by a router that is
> mounted on `app` or `router` in `app.js`.

- [ ] **Step 1: Confirm all controllers have active consumers**

```bash
for f in app/controllers/*.js; do
  name=$(basename "$f" .js)
  echo -n "$name: "
  grep -rl "$name" app/routes/ | tr '\n' ' '
  echo
done
```
Expected: every controller appears in at least one router file.

- [ ] **Step 2: Verify every v1Router route has at least one test or documented caller**

```bash
grep -n "router\.use\|router\.get\|router\.post" app/routes/v1Router.js | \
  awk '{print $NF}' | sed "s/[',]//g"
```

Cross-reference against the test files:
```bash
find app/tests -name "*.test.js" | xargs grep -l "api/v1"
```
If any route prefix appears in `v1Router.js` but has zero test coverage AND zero documentation, flag it for potential removal (do not auto-delete — confirm with the project owner first).

---

## Task 3: Remove unused imports across `app/`

**Files:**
- Modify: all `app/routes/*.js`, `app/services/*.js`, `app/db/*.js`, `app/middleware/*.js`

- [ ] **Step 1: Audit unused imports with ESLint**

```bash
cd app && npx eslint --rule '{"no-unused-vars": "error"}' \
  routes/ services/ db/ middleware/ --ext .js 2>&1 | grep "no-unused-vars\|is defined but never used"
```

Also check for unused `require`/`import` statements manually for any that ESLint misses:
```bash
grep -rn "^import " app/routes/ app/services/ --include="*.js" | awk '{print $2}' | sort | uniq -c | sort -rn | head -20
```

- [ ] **Step 2: Remove each flagged unused import**

For each file with an unused import, delete that import line. Example pattern:

```js
// Remove any line like this where the symbol is never used in the file:
import { unusedFunction } from './someModule.js';
```

- [ ] **Step 3: Verify no import breakage**

```bash
cd app && node --check app.js && node --check routes/v1Router.js
```
Expected: no syntax errors.

- [ ] **Step 4: Run full test suite**

```bash
cd app && npm test
```
Expected: all tests green.

- [ ] **Step 5: Commit**

```bash
git add app/
git commit -m "refactor(app): remove unused imports across routes, services, middleware"
```

---

## Task 4: Split `habitsRouter.js` (888 lines) into focused modules

**Files:**
- Create: `app/routes/habits/habitsCrudRouter.js`
- Create: `app/routes/habits/habitsStatsRouter.js`
- Create: `app/routes/habits/habitsGraphRouter.js`
- Modify: `app/routes/habitsRouter.js` (becomes thin orchestrator)

The current `habitsRouter.js` contains 9 route groups. Split by concern:

| File | Routes |
|------|--------|
| `habitsCrudRouter.js` | `GET /`, `GET /public`, `POST /:id/annotate`, `POST /share`, `POST /donate` |
| `habitsStatsRouter.js` | `GET /stats`, `GET /my-stats` |
| `habitsGraphRouter.js` | `GET /graph`, `GET /bubble-graph` |

- [ ] **Step 1: Read `app/routes/habitsRouter.js` in full before touching it**

Identify exact line ranges for each group:
```bash
grep -n "router\.\(get\|post\|put\|patch\|delete\)" app/routes/habitsRouter.js
```

- [ ] **Step 2: Create `app/routes/habits/habitsCrudRouter.js`**

Extract the factory function pattern and move CRUD routes there:

```js
import express from 'express';
// copy only the imports required by CRUD routes

/**
 * CRUD routes for the habits collection.
 * Mounts under /api/v1/habits by the parent habitsRouter.
 *
 * @param {object} opts
 * @param {Function} opts.getDb - MongoDB connection factory
 * @param {Function} opts.queryNeo4j - Neo4j query helper
 * @param {string} opts.apiServiceUrl - URL of the Python API service
 * @param {string} opts.libreTranslateUrl - URL of the LibreTranslate service
 * @returns {express.Router}
 */
export function createHabitsCrudRouter({ getDb, queryNeo4j, apiServiceUrl, libreTranslateUrl } = {}) {
  const router = express.Router();
  // ... move CRUD route handlers here verbatim
  return router;
}
```

- [ ] **Step 3: Create `app/routes/habits/habitsStatsRouter.js`**

```js
import express from 'express';

/**
 * Stats routes for habit analytics.
 * Mounts under /api/v1/habits by the parent habitsRouter.
 *
 * @param {object} opts
 * @param {Function} opts.getDb - MongoDB connection factory
 * @param {Function} opts.queryNeo4j - Neo4j query helper
 * @returns {express.Router}
 */
export function createHabitsStatsRouter({ getDb, queryNeo4j } = {}) {
  const router = express.Router();
  // ... move GET /stats and GET /my-stats here verbatim
  return router;
}
```

- [ ] **Step 4: Create `app/routes/habits/habitsGraphRouter.js`**

```js
import express from 'express';

/**
 * Graph visualisation routes (Neo4j-backed).
 * Mounts under /api/v1/habits by the parent habitsRouter.
 *
 * @param {object} opts
 * @param {Function} opts.queryNeo4j - Neo4j query helper
 * @returns {express.Router}
 */
export function createHabitsGraphRouter({ queryNeo4j } = {}) {
  const router = express.Router();
  // ... move GET /graph and GET /bubble-graph here verbatim
  return router;
}
```

- [ ] **Step 5: Rewrite `app/routes/habitsRouter.js` as a thin orchestrator**

```js
import express from 'express';
import neo4j from 'neo4j-driver';
import { makeGetDb } from '../utils/getDb.js';
import { createHabitsCrudRouter } from './habits/habitsCrudRouter.js';
import { createHabitsStatsRouter } from './habits/habitsStatsRouter.js';
import { createHabitsGraphRouter } from './habits/habitsGraphRouter.js';

/**
 * Top-level habits router. Composes CRUD, stats, and graph sub-routers.
 * Shared infrastructure (Neo4j driver, DB factory) is created once here
 * and passed down to each sub-router.
 *
 * @param {object} opts
 * @param {object} [opts.db] - MongoDB connection (injected in tests)
 * @param {Function} [opts.neo4jRun] - Neo4j run function (injected in tests)
 * @param {string} [opts.apiServiceUrl]
 * @param {string} [opts.libreTranslateUrl]
 * @returns {express.Router}
 */
export function createHabitsRouter({ db, neo4jRun, apiServiceUrl, libreTranslateUrl } = {}) {
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

  router.use('/', createHabitsCrudRouter({ getDb, queryNeo4j, apiServiceUrl, libreTranslateUrl }));
  router.use('/', createHabitsStatsRouter({ getDb, queryNeo4j }));
  router.use('/', createHabitsGraphRouter({ queryNeo4j }));

  return router;
}
```

- [ ] **Step 6: Run habits integration tests**

```bash
cd app && npm test -- --testPathPattern=habits
```
Expected: all habits tests green.

- [ ] **Step 7: Commit**

```bash
git add app/routes/habitsRouter.js app/routes/habits/
git commit -m "refactor(app): split habitsRouter.js into crud, stats, graph modules"
```

---

## Task 4b: Convert `.then()` chains to `async/await`

**Files:**
- Modify: `app/routes/questionnaireResponsesRouter.js` (has `.then(ensureIndex)`)
- Modify: `app/routes/adminRouter.js` (has `.then(seedDefaultSettings)`)
- Modify: `app/services/token_card_service.js` (has `new Promise` — acceptable for PDFDocument stream wrapping, document WHY)

- [ ] **Step 1: Read each file and locate the `.then()` chains**

```bash
grep -n "\.then(" app/routes/questionnaireResponsesRouter.js app/routes/adminRouter.js
```

- [ ] **Step 2: Convert `questionnaireResponsesRouter.js`**

Find the `.then(ensureIndex)` pattern and convert:
```js
// Before
someInit().then(ensureIndex);

// After
await someInit();
await ensureIndex();
```
Make sure the containing function is `async`.

- [ ] **Step 3: Convert `adminRouter.js`**

Find the `.then(seedDefaultSettings)` pattern and convert:
```js
// Before
init().then(seedDefaultSettings);

// After
await init();
await seedDefaultSettings();
```

- [ ] **Step 4: Document the `new Promise` in `tokenCardService.js`**

The `new Promise` wrapper around `PDFDocument` stream events is legitimate (PDFKit uses Node.js streams, not promises). Add a WHY comment:

```js
// PDFKit uses a writable stream model; we wrap it in a Promise so callers
// can use async/await rather than passing callbacks.
return new Promise((resolve, reject) => {
  // ...existing code unchanged...
});
```

- [ ] **Step 5: Run tests**

```bash
cd app && npm test
```
Expected: all tests green.

- [ ] **Step 6: Commit**

```bash
git add app/routes/questionnaireResponsesRouter.js app/routes/adminRouter.js \
        app/services/tokenCardService.js
git commit -m "refactor(app): convert .then() chains to async/await; document PDFKit Promise wrapper"
```

---

## Task 5: Standardise error response shapes across all routes

**Files:**
- Modify: any route file returning non-standard error shapes

- [ ] **Step 1: Audit inconsistent error shapes**

```bash
grep -rn "res\.status.*\.json\|res\.send(" app/routes/ --include="*.js" | \
  grep -v "//\|swagger" | grep -v '{ error:' | head -30
```

The standard shape is `{ error: '<message>' }`. Fix any that deviate — e.g., `res.send('Unauthorized')` should become `res.status(401).json({ error: 'Unauthorized' })`, and `res.json({ message: '...' })` on error paths should become `{ error: '...' }`.

- [ ] **Step 2: Apply fixes**

For each non-conforming error response found, update to:
```js
return res.status(4xx_or_5xx).json({ error: 'Descriptive message' });
```

- [ ] **Step 3: Run tests**

```bash
cd app && npm test
```
Expected: all tests green. If any test was asserting on the old shape, update the assertion to match the new `{ error: '...' }` shape.

- [ ] **Step 4: Commit**

```bash
git add app/routes/
git commit -m "refactor(app): standardise error response shape to { error: string } across all routes"
```

---

## Task 6: Add JSDoc to all exported service functions

**Files:**
- Modify: all `app/services/*.js`

- [ ] **Step 1: Read each service file and add JSDoc to every exported function**

Use this template for each exported function:

```js
/**
 * One-line summary of what this function does.
 *
 * @param {string} userId - The authenticated user's Keycloak subject ID
 * @param {object} db - MongoDB database connection
 * @returns {Promise<object>} The created/updated document
 * @throws {Error} If the database operation fails
 */
export async function someServiceFunction(userId, db) {
```

Go through each of these files:
- `app/services/adminHabitService.js`
- `app/services/adminParticipantService.js`
- `app/services/adminStatsService.js`
- `app/services/cuePoolService.js`
- `app/services/dailyLogService.js`
- `app/services/exportService.js`
- `app/services/habitConfigService.js`
- `app/services/habitDonationService.js`
- `app/services/intentionService.js`
- `app/services/keycloakAdminClient.js`
- `app/services/notificationCampaignService.js`
- `app/services/notificationService.js`
- `app/services/srhiService.js`
- `app/services/studyAnalyticsService.js`
- `app/services/studyCodeService.js`
- `app/services/studyService.js`
- `app/services/tokenCardService.js`

- [ ] **Step 2: Add JSDoc to exported middleware functions**

```js
/**
 * Express middleware that verifies the JWT Bearer token on incoming requests.
 * Attaches the decoded token payload to `req.user`.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export function createAuthMiddleware(...) {
```

Go through: `app/middleware/auth.js`, `app/middleware/requireRole.js`, `app/middleware/rateLimiter.js`, `app/middleware/inputSanitizer.js`, `app/middleware/securityHeaders.js`.

- [ ] **Step 3: Run tests to confirm nothing broke**

```bash
cd app && npm test
```
Expected: all tests green.

- [ ] **Step 4: Commit**

```bash
git add app/services/ app/middleware/
git commit -m "docs(app): add JSDoc to all exported service and middleware functions"
```

---

## Task 7: Break up long functions (>40 lines) in services

**Files:**
- Modify: `app/services/habitDonationService.js` (367 lines)
- Modify: `app/services/studyService.js` (331 lines)
- Modify: `app/services/studyCodeService.js` (328 lines)
- Modify: `app/services/notificationService.js` (266 lines)

- [ ] **Step 1: Find functions longer than 40 lines in each service**

```bash
# For each service file, print function names and their line spans
grep -n "^export\|^async function\|^function" app/services/habitDonationService.js \
  app/services/studyService.js app/services/studyCodeService.js \
  app/services/notificationService.js
```

- [ ] **Step 2: For each long function, extract named helpers for discrete steps**

Example pattern — a function that validates, transforms, and persists should become three:

```js
// Before: one 80-line function doing everything
export async function createStudyCode(studyId, groupId, options, db) {
  // 15 lines of validation
  // 20 lines of code generation
  // 25 lines of DB writes
  // 20 lines of side-effects
}

// After: composed from focused helpers
/**
 * Validates the study and group exist and the code limit is not exceeded.
 * @param {string} studyId
 * @param {string} groupId
 * @param {object} db
 * @returns {Promise<void>}
 * @throws {Error} If validation fails
 */
async function _validateStudyCodeRequest(studyId, groupId, db) { ... }

/**
 * Generates a unique, URL-safe study code.
 * @returns {string} 8-character alphanumeric code
 */
function _generateCode() { ... }

/**
 * Creates a new study code granting access to the specified group.
 *
 * @param {string} studyId
 * @param {string} groupId
 * @param {object} options
 * @param {number|null} options.maxRedemptions
 * @param {Date|null} options.expiresAt
 * @param {object} db
 * @returns {Promise<object>} The created study code document
 */
export async function createStudyCode(studyId, groupId, options, db) {
  await _validateStudyCodeRequest(studyId, groupId, db);
  const code = _generateCode();
  return _persistStudyCode(code, studyId, groupId, options, db);
}
```

- [ ] **Step 3: Ensure all helper functions are prefixed with `_` (private convention)**

Helpers that are not exported should be named `_camelCase` to signal they are module-private.

- [ ] **Step 4: Run tests**

```bash
cd app && npm test
```
Expected: all tests green.

- [ ] **Step 5: Commit**

```bash
git add app/services/habitDonationService.js app/services/studyService.js \
        app/services/studyCodeService.js app/services/notificationService.js
git commit -m "refactor(app): extract single-responsibility helpers from long service functions"
```

---

## Task 8: Stack 1 final verification and commit

- [ ] **Step 1: Run full app test suite**

```bash
cd app && npm test
```
Expected: all tests green, no regressions.

- [ ] **Step 2: Static check**

```bash
cd app && npx eslint routes/ services/ middleware/ db/ --ext .js
```
Expected: 0 errors.

- [ ] **Step 3: Verify server starts**

```bash
cd app && node --check app.js
```
Expected: no errors.

---

# STACK 2 — `API-service/` (Python/FastAPI)

---

## Task 9: Extract shared Redis helper into `_cache.py`

Both `extract_habits.py` and `extract_profile.py` duplicate an identical Redis lazy-initialisation pattern (47 lines each). Extract it.

**Files:**
- Create: `API-service/routers/_cache.py`
- Modify: `API-service/routers/extract_habits.py`
- Modify: `API-service/routers/extract_profile.py`

- [ ] **Step 1: Create `API-service/routers/_cache.py`**

```python
"""Shared Redis cache utilities for LLM router modules."""
from __future__ import annotations

import logging
import os
from typing import Optional

import redis.asyncio as aioredis

logger = logging.getLogger(__name__)

_REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379")
_REDIS_TTL: int = int(os.getenv("REDIS_TTL_SECONDS", "86400"))

_redis: Optional[aioredis.Redis] = None


async def get_redis() -> Optional[aioredis.Redis]:
    """Return a shared Redis client, initialising lazily on first call.

    Returns None (and logs a warning) if Redis is unavailable so callers
    can degrade gracefully rather than failing hard.

    Returns:
        A connected aioredis.Redis instance, or None if the connection failed.
    """
    global _redis
    if _redis is not None:
        return _redis
    try:
        client: aioredis.Redis = aioredis.from_url(_REDIS_URL, decode_responses=True)
        await client.ping()  # type: ignore[misc]
        _redis = client
        return _redis
    except Exception as exc:  # noqa: BLE001
        logger.warning("Redis unavailable (%s) — caching disabled.", exc)
        return None


def make_cache_key(prefix: str, *parts: str) -> str:
    """Build a namespaced Redis key from prefix and variable parts.

    Args:
        prefix: Key namespace, e.g. ``"extract_habits"``.
        *parts: Values to hash into the key.

    Returns:
        A ``prefix:<sha256_hex>`` string safe for use as a Redis key.
    """
    import hashlib
    digest = hashlib.sha256("||".join(parts).encode()).hexdigest()
    return f"{prefix}:{digest}"
```

- [ ] **Step 2: Update `extract_habits.py` to use `_cache.py`**

Remove the duplicated `_REDIS_URL`, `_REDIS_TTL`, `_redis`, and `_get_redis()` block. Replace with:

```python
from routers._cache import get_redis as _get_redis, _REDIS_TTL, make_cache_key
```

Update the cache key construction to use `make_cache_key("extract_habits", user_id, goal)`.

- [ ] **Step 3: Update `extract_profile.py` to use `_cache.py`**

Same substitution as above, using `make_cache_key("extract_profile", user_id, goal)`.

- [ ] **Step 4: Run tests**

```bash
cd API-service && pytest tests/ -v
```
Expected: all tests green.

- [ ] **Step 5: Commit**

```bash
git add API-service/routers/_cache.py API-service/routers/extract_habits.py \
        API-service/routers/extract_profile.py
git commit -m "refactor(api-service): extract shared Redis cache helper to _cache.py"
```

---

## Task 10: Extract shared LLM call base from `refine_translation` pair

Both `refine_translation.py` and `refine_translation_de.py` expose distinct endpoints (`/llm/refine-translation` vs `/llm/refine-translation-de`) with different request models — keep both endpoints. However, the LLM invocation pattern (load prompt template, call `chat_complete`, handle empty response) is identical. Extract it.

**Files:**
- Create: `API-service/routers/_llm_helpers.py`
- Modify: `API-service/routers/refine_translation.py`
- Modify: `API-service/routers/refine_translation_de.py`

- [ ] **Step 1: Create `API-service/routers/_llm_helpers.py`**

```python
"""Shared LLM invocation helpers for router modules."""
from __future__ import annotations

import logging
from pathlib import Path

from llm_client import chat_complete

logger = logging.getLogger(__name__)


def load_prompt_template(relative_path: str) -> str:
    """Load a prompt template from the prompts directory.

    Args:
        relative_path: Path relative to the repo root, e.g.
            ``"prompts/refine_translation.txt"``.

    Returns:
        The prompt template string with ``{placeholder}`` slots.
    """
    path = Path(__file__).parent.parent / relative_path
    return path.read_text(encoding="utf-8")


async def call_llm_with_fallback(
    prompt: str,
    fallback: str,
    temperature: float = 0.3,
) -> str:
    """Call the LLM and return its stripped response, falling back on empty output.

    Args:
        prompt: The fully-formatted prompt to send.
        fallback: Value to return if the LLM produces an empty response.
        temperature: Sampling temperature (default 0.3 for refinement tasks).

    Returns:
        The LLM response string, or ``fallback`` if the response was empty.
    """
    raw = await chat_complete(
        messages=[{"role": "user", "content": prompt}],
        temperature=temperature,
    )
    result = raw.strip()
    if not result:
        logger.warning("LLM returned empty response — using fallback.")
        return fallback
    return result
```

- [ ] **Step 2: Update `refine_translation.py` to use `_llm_helpers`**

```python
from routers._llm_helpers import load_prompt_template, call_llm_with_fallback

_PROMPT_TEMPLATE = load_prompt_template("prompts/refine_translation.txt")

@router.post("/llm/refine-translation", response_model=RefineTranslationResponse)
async def refine_translation(body: RefineTranslationRequest) -> RefineTranslationResponse:
    prompt = _PROMPT_TEMPLATE.format(
        language=body.language,
        original=body.original,
        raw_translation=body.raw_translation,
    )
    refined = await call_llm_with_fallback(prompt, fallback=body.raw_translation)
    return RefineTranslationResponse(refined_translation=refined)
```

- [ ] **Step 3: Update `refine_translation_de.py` to use `_llm_helpers`**

```python
from routers._llm_helpers import load_prompt_template, call_llm_with_fallback

_PROMPT_TEMPLATE = load_prompt_template("prompts/refine_translation_de.txt")

@router.post("/llm/refine-translation-de", response_model=RefineTranslationDeResponse)
async def refine_translation_de(body: RefineTranslationDeRequest) -> RefineTranslationDeResponse:
    prompt = _PROMPT_TEMPLATE.format(
        original=body.original,
        raw_translation=body.raw_translation,
    )
    refined = await call_llm_with_fallback(prompt, fallback=body.raw_translation)
    return RefineTranslationDeResponse(refined_translation=refined)
```

- [ ] **Step 4: Run tests**

```bash
cd API-service && pytest tests/ -v
```
Expected: all tests green.

- [ ] **Step 5: Commit**

```bash
git add API-service/routers/_llm_helpers.py \
        API-service/routers/refine_translation.py \
        API-service/routers/refine_translation_de.py
git commit -m "refactor(api-service): extract shared LLM invocation helper to _llm_helpers.py"
```

---

## Task 11: Remove unused imports and fix `Any` types across all routers

**Files:**
- Modify: `API-service/routers/recommend.py`
- Modify: `API-service/routers/retrieve.py`
- Modify: `API-service/routers/map_bcio.py`
- Modify: `API-service/routers/extract_habits.py`
- Modify: `API-service/routers/extract_profile.py`

- [ ] **Step 1: Find all `Any` usages**

```bash
grep -rn ": Any\b\|-> Any\b\|Dict\[str, Any\]\|List\[Any\]" API-service/routers/ | grep -v "^Binary"
```

- [ ] **Step 2: Replace `Any` with concrete types in `recommend.py`**

```python
# Before
async def _fetch_prior_feedback(user_id: str, goal: str, db: Any) -> List[str]:
async def _store_recommendation(..., db: Any = None) -> None:
async def recommend(body: RecommendRequest, redis_client: Optional[Any] = ..., db: Any = ...):

# After — import AsyncIOMotorDatabase from motor
from motor.motor_asyncio import AsyncIOMotorDatabase
import redis.asyncio as aioredis

async def _fetch_prior_feedback(user_id: str, goal: str, db: AsyncIOMotorDatabase) -> list[str]:
async def _store_recommendation(..., db: AsyncIOMotorDatabase | None = None) -> None:
async def recommend(
    body: RecommendRequest,
    redis_client: aioredis.Redis | None = Depends(get_redis),
    db: AsyncIOMotorDatabase = Depends(get_mongo_db),
) -> RecommendResponse:
```

- [ ] **Step 3: Replace `Any` in `retrieve.py`**

```bash
grep -n ": Any\b" API-service/routers/retrieve.py
```
For `httpx.Response`-like objects, use `httpx.Response`. For dict payloads use `dict[str, object]`.

- [ ] **Step 4: Replace `Any` in `map_bcio.py`**

```bash
grep -n ": Any\b\|Dict\[str, Any\]" API-service/routers/map_bcio.py
```
Replace generic dicts with typed `TypedDict` or `BaseModel` where possible.

- [ ] **Step 5: Remove unused imports**

```bash
cd API-service && python -m py_compile routers/*.py && \
  pip install pyflakes -q && python -m pyflakes routers/
```
Remove any flagged unused imports.

- [ ] **Step 6: Run tests**

```bash
cd API-service && pytest tests/ -v
```
Expected: all tests green.

- [ ] **Step 7: Commit**

```bash
git add API-service/routers/
git commit -m "refactor(api-service): replace Any types with concrete types; remove unused imports"
```

---

## Task 12: Standardise `HTTPException` error handling across all routers

**Files:**
- Modify: any router that raises exceptions inconsistently

- [ ] **Step 1: Audit exception patterns**

```bash
grep -rn "raise\|HTTPException\|except" API-service/routers/*.py | grep -v "^Binary\|#"
```

The standard pattern is:
```python
from fastapi import HTTPException, status

raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="message")
```

Any bare `raise ValueError(...)` or `except Exception: return {}` patterns need to become `HTTPException` raises or proper logging + re-raise.

- [ ] **Step 2: Fix each non-standard exception path found**

Example:
```python
# Before
except Exception:
    return {"error": "failed"}

# After
except Exception as exc:
    logger.error("Operation failed: %s", exc)
    raise HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail="Operation failed — see server logs for details.",
    ) from exc
```

- [ ] **Step 3: Run tests**

```bash
cd API-service && pytest tests/ -v
```
Expected: all tests green.

- [ ] **Step 4: Commit**

```bash
git add API-service/routers/
git commit -m "refactor(api-service): standardise HTTPException error handling across all routers"
```

---

## Task 12b: Add Google-style docstrings and module docstrings to all Python files

**Files:**
- Modify: all `API-service/routers/*.py`, `API-service/deps.py`, `API-service/llm_client.py`, `API-service/auth.py`

- [ ] **Step 1: Add module-level docstring to each file that lacks one**

```bash
grep -L '"""' API-service/routers/*.py API-service/deps.py API-service/llm_client.py API-service/auth.py
```

For each file without a top-level docstring, add:
```python
"""<Module name> — <one sentence describing its role in the LLM pipeline>."""
```

- [ ] **Step 2: Add Google-style docstrings to every function/class**

Template:
```python
async def some_router_function(body: SomeRequest, db: AsyncIOMotorDatabase) -> SomeResponse:
    """One-line summary of what this endpoint does.

    Longer description if needed (optional — only for complex orchestration).

    Args:
        body: Validated request payload from the caller.
        db: Injected MongoDB connection from FastAPI's dependency system.

    Returns:
        SomeResponse with the processed result.

    Raises:
        HTTPException: 422 if the input fails business validation.
        HTTPException: 500 if the LLM call or DB write fails.
    """
```

Go through every function in:
- `routers/classify_context.py`
- `routers/classify_habit.py`
- `routers/extract_habits.py`
- `routers/extract_profile.py`
- `routers/map_bcio.py`
- `routers/recommend.py`
- `routers/refine_translation.py`
- `routers/refine_translation_de.py`
- `routers/retrieve.py`
- `deps.py`
- `llm_client.py`
- `auth.py`

- [ ] **Step 3: Run tests**

```bash
cd API-service && pytest tests/ -v
```
Expected: all tests green.

- [ ] **Step 4: Commit**

```bash
git add API-service/
git commit -m "docs(api-service): add Google-style docstrings and module docstrings throughout"
```

---

# STACK 3 — `admin/` (Next.js 14)

---

## Task 13: Remove unused imports, state, and props across all admin pages

**Files:**
- Modify: all `admin/src/app/**/*.tsx`, `admin/src/components/*.tsx`, `admin/src/lib/*.ts`

- [ ] **Step 1: Run TypeScript compiler to surface unused symbols**

```bash
cd admin && npx tsc --noEmit 2>&1 | grep "declared but never\|is defined but never\|imported but never"
```

Also run ESLint:
```bash
cd admin && npx eslint src/ --ext .ts,.tsx --rule '{"@typescript-eslint/no-unused-vars": "error"}' 2>&1 | grep "no-unused-vars"
```

- [ ] **Step 2: Remove each flagged unused import**

Pattern to fix:
```tsx
// Remove any import whose identifier never appears in the file body
import { UnusedComponent } from '../components/UnusedComponent';
```

- [ ] **Step 3: Remove unused `useState` variables**

Find `useState` values set but never read:
```bash
grep -rn "useState" admin/src --include="*.tsx" | head -20
```

Example fix:
```tsx
// Before — `isOpen` is set but never read in JSX
const [isOpen, setIsOpen] = useState(false);

// After — remove if truly unused, or rename to _ if setter is used by effects
```

- [ ] **Step 4: Remove commented-out JSX blocks**

```bash
grep -rn "{/\*.*\*/}" admin/src --include="*.tsx" | head -20
```
Delete any multi-line commented-out code blocks.

- [ ] **Step 5: Run tests**

```bash
cd admin && npm test
```
Expected: all tests green.

- [ ] **Step 6: Commit**

```bash
git add admin/src/
git commit -m "refactor(admin): remove unused imports, state variables, and commented-out JSX"
```

---

## Task 14: Remove dead CSS classes from all `.module.css` files

**Files:**
- Modify: all `admin/src/**/*.module.css`

- [ ] **Step 1: For each CSS module, cross-reference with its component**

List all CSS modules:
```bash
find admin/src -name "*.module.css" -print
```

For each file, list its classes and check usage:
```bash
# Example for cue-pools
grep "^\." admin/src/app/\(admin\)/cue-pools/page.module.css | sed 's/[.{].*//'
grep -n "styles\." admin/src/app/\(admin\)/cue-pools/page.tsx | sed 's/.*styles\.\([a-zA-Z]*\).*/\1/' | sort -u
```

Any class in the CSS file not referenced as `styles.className` in the component is dead.

- [ ] **Step 2: Delete each dead CSS class**

Remove the full rule block (selector + declaration) for each unused class.

- [ ] **Step 3: Run tests**

```bash
cd admin && npm test
```
Expected: all tests green.

- [ ] **Step 4: Commit**

```bash
git add admin/src/
git commit -m "refactor(admin): remove dead CSS classes from all module.css files"
```

---

## Task 15: Move `analytics-tab.tsx` from route folder to `components/`

**Files:**
- Move: `admin/src/app/(admin)/studies/analytics-tab.tsx` → `admin/src/components/studies-analytics-tab.tsx`
- Modify: `admin/src/app/(admin)/studies/page.tsx` (update import path)
- Modify: `admin/src/__tests__/studies-analytics.test.tsx` (update import path if needed)

- [ ] **Step 1: Move the file**

```bash
mv "admin/src/app/(admin)/studies/analytics-tab.tsx" \
   admin/src/components/studies-analytics-tab.tsx
```

- [ ] **Step 2: Update the import in `studies/page.tsx`**

```tsx
// Before
import { AnalyticsTab } from './analytics-tab';

// After
import { AnalyticsTab } from '../../../components/studies-analytics-tab';
```

- [ ] **Step 3: Update the test import path if needed**

```bash
grep -rn "analytics-tab" admin/src/__tests__/ --include="*.tsx"
```

Fix any test imports found.

- [ ] **Step 4: Run tests**

```bash
cd admin && npm test
```
Expected: all tests green.

- [ ] **Step 5: Commit**

```bash
git add admin/src/components/studies-analytics-tab.tsx \
        "admin/src/app/(admin)/studies/page.tsx" \
        admin/src/__tests__/
git commit -m "refactor(admin): move analytics-tab into components/"
```

---

## Task 16: Fix TypeScript and add JSDoc across all admin files

**Files:**
- Modify: all `admin/src/**/*.ts`, `admin/src/**/*.tsx`

- [ ] **Step 1: Audit remaining TypeScript issues**

```bash
cd admin && npx tsc --noEmit 2>&1
```
Expected: 0 errors. If any remain, fix them before proceeding.

- [ ] **Step 2: Ensure no `any` types remain**

```bash
grep -rn ": any\b\|as any\b\|<any>" admin/src --include="*.ts" --include="*.tsx" | grep -v "node_modules\|test"
```

For any found, define a proper interface:
```ts
// Before
function handleResponse(data: any) { ... }

// After
interface ApiResponse {
  id: string;
  name: string;
  createdAt: string;
}
function handleResponse(data: ApiResponse) { ... }
```

- [ ] **Step 3: Add JSDoc to all exported components**

Template:
```tsx
/**
 * Displays a paginated table of cue pools for the current study.
 * Allows researchers to create, edit, and delete cue pools inline.
 *
 * @returns The cue pools management page.
 */
export default function CuePoolsPage() {
```

Go through all page components and the sidebar component.

- [ ] **Step 4: Add JSDoc to all `lib/` utilities**

```tsx
/**
 * Performs an authenticated fetch to the HHH admin API.
 * Attaches the NextAuth session token as a Bearer header.
 *
 * @param url - The full URL to fetch.
 * @param token - The NextAuth session access token.
 * @param options - Additional fetch options (method, body, etc.).
 * @returns The parsed JSON response body.
 * @throws {Error} If the response status is not 2xx.
 */
export async function apiFetch(url: string, token: string, options?: RequestInit): Promise<unknown> {
```

- [ ] **Step 5: Run tests**

```bash
cd admin && npm test && npx tsc --noEmit
```
Expected: all tests green, 0 TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add admin/src/
git commit -m "docs(admin): add JSDoc to all exported components and lib utilities; remove any types"
```

---

## Task 16b: Split large page components and standardise data fetching

**Files:**
- Modify: `admin/src/app/(admin)/studies/page.tsx`
- Modify: `admin/src/app/(admin)/cue-pools/page.tsx`
- Modify: `admin/src/app/(admin)/questionnaires/page.tsx`
- Modify: any other page file mixing data fetching + rendering + business logic in one component

- [ ] **Step 1: Audit each page component for mixed concerns**

For each page in `admin/src/app/(admin)/`:
```bash
for f in admin/src/app/\(admin\)/*/page.tsx; do
  lines=$(wc -l < "$f")
  echo "$lines $f"
done | sort -rn
```
Any page over 200 lines is a candidate for splitting.

- [ ] **Step 2: Check which data fetching pattern each page uses**

```bash
grep -rn "useEffect\|useSWR\|getServerSideProps\|fetch(" admin/src/app --include="*.tsx" | \
  grep -v "test\|node_modules" | head -30
```

The project uses `"use client"` pages with `useEffect`+`fetch` — this is the established pattern. Do not introduce SWR or server components unless a page is clearly better served by them. The goal is **consistency within the existing pattern**, not switching paradigms.

- [ ] **Step 3: For each page over 200 lines, extract a data-fetching hook**

Move the `useEffect` + state declarations into a named `use<FeatureName>Data` hook in the same directory:

```tsx
// admin/src/app/(admin)/studies/useStudiesData.ts
import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';

interface StudyData {
  studies: StudySummary[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * Fetches and manages the list of studies for the studies page.
 *
 * @returns Study list state and a refetch callback.
 */
export function useStudiesData(): StudyData {
  const { data: session } = useSession();
  const [studies, setStudies] = useState<StudySummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ... move useEffect + fetch logic here verbatim
  return { studies, isLoading, error, refetch };
}
```

Then the page component becomes a thin shell:
```tsx
export default function StudiesPage() {
  const { studies, isLoading, error, refetch } = useStudiesData();
  // ... only JSX rendering here
}
```

- [ ] **Step 4: Extract large inline components into named components**

If a page has an inline function component (e.g., `const StudyCard = ...` defined inside the page), move it to its own file `admin/src/components/study-card.tsx`.

- [ ] **Step 5: Run tests**

```bash
cd admin && npm test
```
Expected: all tests green.

- [ ] **Step 6: Commit**

```bash
git add admin/src/
git commit -m "refactor(admin): extract data hooks from page components; split large inline components"
```

---

# STACK 4 — `mobile/` (Flutter)

---

## Task 17: Remove unused imports and dead code across all Dart files

**Files:**
- Modify: any Dart file with unused imports or dead code

- [ ] **Step 1: Run Flutter analyzer to find all issues**

```bash
cd mobile && flutter analyze 2>&1 | grep -E "unused_import|dead_code|unused_local|unused_field"
```

- [ ] **Step 2: Remove each flagged unused import**

Flutter analyzer output includes file paths and line numbers. For each:
```dart
// Remove lines like:
import 'package:some_package/some_package.dart';  // flagged as unused
```

- [ ] **Step 3: Remove flagged dead code paths**

Dead code is typically unreachable branches after an early return. Example:
```dart
// Before
if (condition) {
  return result;
}
// dead: this code is never reached
doSomething();

// After — remove dead block
if (condition) {
  return result;
}
```

- [ ] **Step 4: Remove TODO/FIXME stubs that were never implemented**

```bash
grep -rn "TODO\|FIXME" mobile/lib/ --include="*.dart"
```

For each: if the feature is genuinely missing, either implement it now (only if trivial — 5 lines or fewer) or delete the stub entirely. Do not leave half-finished code in place.

- [ ] **Step 5: Run tests**

```bash
cd mobile && flutter test
```
Expected: all tests green.

- [ ] **Step 6: Commit**

```bash
git add mobile/lib/
git commit -m "refactor(mobile): remove unused imports, dead code, and unimplemented stubs"
```

---

## Task 18: Split `main.dart` (592 lines) into focused files

**Files:**
- Create: `mobile/lib/router/app_router.dart`
- Create: `mobile/lib/app.dart`
- Modify: `mobile/lib/main.dart` (shrink to ~30 lines)

`main.dart` currently contains: Firebase init, a `routerProvider` (GoRouter config with all routes), and `HhhApp` widget with theme/locale setup.

- [ ] **Step 1: Create `mobile/lib/router/app_router.dart`**

Move `routerProvider` and all `GoRoute` definitions here:

```dart
/// GoRouter configuration for the HHH mobile app.
///
/// The router is a Riverpod [Provider] so the redirect guard can read
/// auth state without relying on [BuildContext].
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../providers/auth_provider.dart';
import '../router/redirect.dart';
// ... all screen imports needed for routes

/// Provides the app's [GoRouter] instance.
///
/// Declared as a [Provider] so the [redirectGuard] can access
/// [userRolesProvider] synchronously via [Ref.read].
final routerProvider = Provider<GoRouter>((ref) {
  // ... verbatim from main.dart
});
```

- [ ] **Step 2: Create `mobile/lib/app.dart`**

Move `HhhApp` widget here:

```dart
/// Root application widget for HHH.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'router/app_router.dart';
// ... locale imports

/// Root [ConsumerWidget] that wires together the router, theme, and
/// localisation delegates.
class HhhApp extends ConsumerWidget {
  const HhhApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // ... verbatim from main.dart
  }
}
```

- [ ] **Step 3: Rewrite `mobile/lib/main.dart` as a thin entry point**

```dart
/// App entry point — Firebase init + Riverpod scope.
library;

import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'firebase_options.dart';
import 'app.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  try {
    await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);
  } catch (_) {
    // Firebase not configured — push notifications unavailable.
  }
  runApp(const ProviderScope(child: HhhApp()));
}
```

- [ ] **Step 4: Run tests**

```bash
cd mobile && flutter test
```
Expected: all tests green.

- [ ] **Step 5: Commit**

```bash
git add mobile/lib/main.dart mobile/lib/app.dart mobile/lib/router/app_router.dart
git commit -m "refactor(mobile): split main.dart into app.dart and router/app_router.dart"
```

---

## Task 19: Split `bubble_graph_widget.dart` (529 lines)

**Files:**
- Create: `mobile/lib/widgets/bubble_graph/bubble_graph_painter.dart`
- Create: `mobile/lib/widgets/bubble_graph/bubble_graph_gesture_handler.dart`
- Create: `mobile/lib/widgets/bubble_graph/bubble_graph_data.dart`
- Modify: `mobile/lib/widgets/bubble_graph_widget.dart`

- [ ] **Step 1: Read the file to identify the three concerns**

```bash
grep -n "class \|void \|Widget \|CustomPainter\|GestureDetector\|double \|List<" mobile/lib/widgets/bubble_graph_widget.dart | head -40
```

Identify which lines contain: data transformation logic, gesture/interaction logic, and CustomPainter drawing logic.

- [ ] **Step 2: Create `bubble_graph_painter.dart`**

Move the `CustomPainter` subclass and all drawing helpers:

```dart
/// CustomPainter implementation for the habit bubble graph.
library;

import 'package:flutter/material.dart';
import 'bubble_graph_data.dart';

/// Renders the bubble graph canvas — circles sized by habit frequency,
/// coloured by category, and labelled with habit names.
class BubbleGraphPainter extends CustomPainter {
  // ... verbatim from widget file
}
```

- [ ] **Step 3: Create `bubble_graph_data.dart`**

Move data model classes and transformation functions:

```dart
/// Data models and transformation utilities for the bubble graph.
library;

/// Holds the computed layout position and visual properties for one bubble.
class BubbleNode {
  // ... verbatim
}
```

- [ ] **Step 4: Create `bubble_graph_gesture_handler.dart`**

Move the gesture state and handler callbacks:

```dart
/// Gesture handling mixin for the bubble graph widget.
library;

import 'package:flutter/gestures.dart';

// ... verbatim gesture handling code
```

- [ ] **Step 5: Update `bubble_graph_widget.dart` to import and compose these**

The widget file should shrink to ~80 lines that wire together the three pieces.

- [ ] **Step 6: Run tests**

```bash
cd mobile && flutter test test/widget/habit_graph_widget_test.dart -v
```
Expected: all graph widget tests green.

- [ ] **Step 7: Commit**

```bash
git add mobile/lib/widgets/bubble_graph_widget.dart \
        mobile/lib/widgets/bubble_graph/
git commit -m "refactor(mobile): split bubble_graph_widget into painter, data, and gesture modules"
```

---

## Task 20: Split large admin screens (700+ lines each)

**Files:**
- Create: `mobile/lib/screens/admin/widgets/admin_data_table.dart`
- Modify: `mobile/lib/screens/admin/admin_questionnaires_screen.dart`
- Modify: `mobile/lib/screens/admin/admin_surveys_screen.dart`

Both screens share the same pattern: a paginated data table with row actions. Extract a reusable `AdminDataTable` widget.

- [ ] **Step 1: Read both files to identify the shared table pattern**

```bash
grep -n "DataTable\|DataRow\|DataCell\|ListView\|Column(" \
  mobile/lib/screens/admin/admin_questionnaires_screen.dart \
  mobile/lib/screens/admin/admin_surveys_screen.dart | head -30
```

- [ ] **Step 2: Create `mobile/lib/screens/admin/widgets/admin_data_table.dart`**

```dart
/// Reusable paginated data table for admin list views.
library;

import 'package:flutter/material.dart';

/// A generic scrollable data table for admin screens.
///
/// Displays [rows] under [columns] headers with optional [onRowTap] callback
/// and [actions] toolbar.
///
/// Type parameter [T] is the row data type.
class AdminDataTable<T> extends StatelessWidget {
  /// Column header labels.
  final List<String> columns;

  /// Row data items.
  final List<T> rows;

  /// Builds the cells for a single row from its data item.
  final List<DataCell> Function(T item) cellBuilder;

  /// Called when the user taps a row.
  final void Function(T item)? onRowTap;

  const AdminDataTable({
    super.key,
    required this.columns,
    required this.rows,
    required this.cellBuilder,
    this.onRowTap,
  });

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: DataTable(
        columns: columns.map((c) => DataColumn(label: Text(c))).toList(),
        rows: rows.map((item) => DataRow(
          cells: cellBuilder(item),
          onSelectChanged: onRowTap != null ? (_) => onRowTap!(item) : null,
        )).toList(),
      ),
    );
  }
}
```

- [ ] **Step 3: Refactor `admin_questionnaires_screen.dart` to use `AdminDataTable`**

Replace inline `DataTable` construction with `AdminDataTable<QuestionnaireSummary>`.

- [ ] **Step 4: Refactor `admin_surveys_screen.dart` to use `AdminDataTable`**

Replace inline `DataTable` construction with `AdminDataTable<AdminSurvey>`.

- [ ] **Step 5: Run tests**

```bash
cd mobile && flutter test test/widget/admin_questionnaires_screen_test.dart \
                          test/widget/admin_surveys_screen_test.dart -v
```
Expected: all tests green.

- [ ] **Step 6: Commit**

```bash
git add mobile/lib/screens/admin/
git commit -m "refactor(mobile): extract AdminDataTable widget; shrink admin screen files"
```

---

## Task 20b: Split `donate_screen.dart` (646 lines) into focused sub-widgets

**Files:**
- Create: `mobile/lib/screens/donate/widgets/donate_form_widget.dart`
- Create: `mobile/lib/screens/donate/widgets/donate_progress_widget.dart`
- Modify: `mobile/lib/screens/donate_screen.dart`

- [ ] **Step 1: Read the file to identify the logical sections**

```bash
grep -n "Widget\|class \|void \|Column\|Row\|Container\|Card" \
  mobile/lib/screens/donate_screen.dart | head -40
```

Identify the natural sub-sections (e.g., form inputs, progress indicators, confirmation UI, success state).

- [ ] **Step 2: Create `donate_form_widget.dart`**

```dart
/// Form inputs and submission logic for the habit donation flow.
library;

import 'package:flutter/material.dart';

/// Renders the donation form with habit selection and confirmation inputs.
///
/// Calls [onSubmit] with the selected habit ID when the user confirms.
class DonateFormWidget extends StatefulWidget {
  /// Called when the user submits the donation form.
  final void Function(String habitId) onSubmit;

  const DonateFormWidget({super.key, required this.onSubmit});

  @override
  State<DonateFormWidget> createState() => _DonateFormWidgetState();
}

class _DonateFormWidgetState extends State<DonateFormWidget> {
  // ... verbatim form logic from donate_screen.dart
}
```

- [ ] **Step 3: Create `donate_progress_widget.dart`**

```dart
/// Progress and status display for an in-flight habit donation.
library;

import 'package:flutter/material.dart';

/// Shows upload progress, success state, or error feedback for a donation.
class DonateProgressWidget extends StatelessWidget {
  /// Whether the donation upload is in progress.
  final bool isLoading;

  /// Error message to display, or null if no error.
  final String? error;

  const DonateProgressWidget({
    super.key,
    required this.isLoading,
    this.error,
  });

  @override
  Widget build(BuildContext context) {
    // ... verbatim from donate_screen.dart
  }
}
```

- [ ] **Step 4: Shrink `donate_screen.dart` to a thin coordinator**

The screen should only hold top-level state and compose the two widgets:
```dart
class DonateScreen extends ConsumerStatefulWidget {
  // ... thin shell that owns state and passes callbacks down
}
```

- [ ] **Step 5: Run tests**

```bash
cd mobile && flutter test test/widget/donate_screen_test.dart -v
```
Expected: all tests green.

- [ ] **Step 6: Commit**

```bash
git add mobile/lib/screens/donate_screen.dart \
        mobile/lib/screens/donate/
git commit -m "refactor(mobile): split donate_screen.dart into focused sub-widgets"
```

---

## Task 20c: Standardise state management and audit PascalCase naming

**Files:**
- Modify: any Dart file using an inconsistent state management pattern
- Modify: any Dart file with non-PascalCase class names

- [ ] **Step 1: Audit state management patterns in use**

```bash
grep -rn "setState\|ChangeNotifier\|StateNotifier\|ConsumerWidget\|ConsumerStatefulWidget\|ref\.watch\|ref\.read" \
  mobile/lib/ --include="*.dart" | grep -v "test\|l10n" | \
  awk -F: '{print $1}' | sort | uniq -c | sort -rn | head -20
```

The established pattern in this project is **Riverpod** (`ConsumerWidget`/`ConsumerStatefulWidget` + providers). `setState` is acceptable for purely local UI state (e.g., form field focus). Direct service calls in `build()` are not acceptable — they must go through a provider.

- [ ] **Step 2: Fix any screen that calls a service directly in build() or initState()**

```bash
grep -rn "Service()\." mobile/lib/screens/ mobile/lib/features/ --include="*.dart" | \
  grep -v "test\|//"
```

For each hit, move the service call into a `FutureProvider` or `StateNotifierProvider`, then have the widget `ref.watch` the provider:

```dart
// Before — direct service call in a widget
@override
void initState() {
  super.initState();
  HabitService().getHabits().then((h) => setState(() => habits = h));
}

// After — Riverpod provider
final habitsProvider = FutureProvider<List<HabitNode>>((ref) {
  return ref.read(habitServiceProvider).getHabits();
});

// Widget just watches:
final habits = ref.watch(habitsProvider);
```

- [ ] **Step 3: Audit class names for PascalCase compliance**

```bash
grep -rn "^class [a-z]" mobile/lib/ --include="*.dart"
```
Expected: 0 results. If any found, rename the class and update all references.

- [ ] **Step 4: Run tests**

```bash
cd mobile && flutter test
```
Expected: all tests green.

- [ ] **Step 5: Commit**

```bash
git add mobile/lib/
git commit -m "refactor(mobile): enforce Riverpod state management; fix PascalCase class names"
```

---

## Task 21: Add Dart doc comments to all public APIs

**Files:**
- Modify: all `mobile/lib/**/*.dart`

- [ ] **Step 1: Find all public classes and methods missing doc comments**

```bash
cd mobile && flutter analyze 2>&1 | grep "public_member_api_docs\|Missing documentation"
```

If the `public_member_api_docs` lint is not enabled, add it temporarily:
```bash
echo "analyzer:\n  rules:\n    public_member_api_docs: true" >> analysis_options.yaml
flutter analyze 2>&1 | grep "public_member_api_docs" | head -40
# Remove the added line after collecting the list
```

- [ ] **Step 2: Add `///` doc comments to every public class**

Template for a screen:
```dart
/// Displays the user's habit graph in an interactive bubble visualisation.
///
/// Allows the user to tap bubbles to see habit details, toggle habit
/// visibility, and switch between graph modes.
class ExploreScreen extends ConsumerStatefulWidget {
```

Template for a service method:
```dart
/// Fetches the current user's habit list from the backend API.
///
/// Returns an empty list if the user has no habits yet.
///
/// Throws a [ServiceException] if the network request fails.
Future<List<HabitNode>> getHabits() async {
```

Template for a Riverpod provider:
```dart
/// Provides the current user's authentication state.
///
/// Notifies listeners when the user signs in or out.
final authNotifierProvider = ChangeNotifierProvider<AuthNotifier>((ref) {
```

- [ ] **Step 3: Add section headers in large `build()` methods**

For any `build()` method over 60 lines, add section header comments:
```dart
@override
Widget build(BuildContext context) {
  // ── State reads ───────────────────────────────────────────────────────────
  final habits = ref.watch(habitsProvider);

  // ── Loading / error states ────────────────────────────────────────────────
  if (habits.isLoading) return const LoadingIndicator();

  // ── Main layout ───────────────────────────────────────────────────────────
  return Scaffold(
    // ...
  );
}
```

- [ ] **Step 4: Run tests**

```bash
cd mobile && flutter test
```
Expected: all tests green.

- [ ] **Step 5: Commit**

```bash
git add mobile/lib/
git commit -m "docs(mobile): add Dart doc comments to all public APIs; add build() section headers"
```

---

# POST-IMPLEMENTATION PASS

---

## Task 22: Quality review — re-read all changed files

- [ ] **Step 1: Review Stack 1 changes (`app/`)**

Re-read all modified files with fresh eyes. Check for:
- Any leftover `TODO` introduced during refactoring
- Inconsistent naming between old and new files
- Any route handler that lost its error handling during the split

```bash
git diff HEAD~8..HEAD -- app/ | head -200
```

- [ ] **Step 2: Review Stack 2 changes (`API-service/`)**

```bash
git diff HEAD~4..HEAD -- API-service/ | head -200
```
Check that all `Any` replacements are correct types (not just `object`), and all docstrings are accurate.

- [ ] **Step 3: Review Stack 3 changes (`admin/`)**

```bash
git diff HEAD~4..HEAD -- admin/ | head -200
```
Check that moved `analytics-tab.tsx` import path resolves correctly.

- [ ] **Step 4: Review Stack 4 changes (`mobile/`)**

```bash
git diff HEAD~5..HEAD -- mobile/ | head -200
```
Check that `main.dart` is clean and all router imports resolve.

---

## Task 23: Final test run across all stacks

- [ ] **Step 1: Run `app/` tests**

```bash
cd app && npm test 2>&1 | tail -20
```
Expected: all tests pass, 0 failures.

- [ ] **Step 2: Run `API-service/` tests**

```bash
cd API-service && pytest tests/ -v 2>&1 | tail -20
```
Expected: all tests pass, 0 failures.

- [ ] **Step 3: Run `admin/` tests**

```bash
cd admin && npm test 2>&1 | tail -20
```
Expected: all tests pass, 0 failures.

- [ ] **Step 4: Run `mobile/` tests**

```bash
cd mobile && flutter test 2>&1 | tail -20
```
Expected: all tests pass, 0 failures.

---

## Task 24: Update `CHANGELOG.md`

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Add a summary under `[Unreleased]`**

Add the following block (adjust specifics to match what was actually removed/changed):

```markdown
### Changed
- `app/`: split `habitsRouter.js` (888 lines) into focused CRUD, stats, and graph sub-routers
- `app/`: renamed `token_card_service.js` → `tokenCardService.js` for naming consistency
- `app/`: converted `.then()` chains to `async/await` in route initialisers
- `app/`: standardised all error responses to `{ error: string }` shape
- `app/`: extracted single-responsibility helpers from long service functions
- `app/`: added JSDoc to all exported service and middleware functions
- `API-service/`: extracted shared Redis cache helper into `routers/_cache.py`
- `API-service/`: replaced `Any` types with concrete types across all routers
- `API-service/`: standardised `HTTPException` error handling across all routers
- `API-service/`: added Google-style docstrings to all router functions and helpers
- `admin/`: removed unused imports, state variables, and dead CSS classes
- `admin/`: moved `analytics-tab.tsx` into `components/`
- `admin/`: added JSDoc to all exported components and `lib/` utilities
- `mobile/`: split `main.dart` into `app.dart` and `router/app_router.dart`
- `mobile/`: split `bubble_graph_widget.dart` into painter, data, and gesture modules
- `mobile/`: extracted `AdminDataTable` widget from large admin screens
- `mobile/`: added Dart doc comments to all public classes, methods, and providers

### Removed
- Dead imports across all four stacks
- Commented-out code blocks in `admin/`
- Unimplemented `TODO`/`FIXME` stubs in `mobile/`
```

- [ ] **Step 2: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs: update CHANGELOG for full-repo clean sweep"
```
