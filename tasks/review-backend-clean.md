# Clean Code Review — Node.js Backend

**Reviewed by:** Ralph
**Date:** 2026-03-21
**Scope:** All files under `app/` (routes, services, middleware, utils, controllers, models, app.js)

---

## Table of Contents

1. [Fat Routes / Handlers Doing Too Much](#1-fat-routes--handlers-doing-too-much)
2. [Long Functions (>40 lines)](#2-long-functions-40-lines)
3. [Inline Cypher/Mongo Queries in Routes](#3-inline-cyphermongo-queries-in-routes)
4. [Copy-Pasted Error Handling and Boilerplate](#4-copy-pasted-error-handling-and-boilerplate)
5. [Naming Violations](#5-naming-violations)
6. [Dead Code](#6-dead-code)
7. [What Follows Clean Code Well](#7-what-follows-clean-code-well)
8. [Prioritised Findings](#8-prioritised-findings)

---

## 1. Fat Routes / Handlers Doing Too Much

### BK-C1 — `POST /habits/donate` is a 143-line god handler
**File:** `app/routes/habitsRouter.js`, lines 467–661
**Violation type:** Fat route — handler does validate + call API 1 + call API 2 + call API 3 + translate (2 calls) + 3 Neo4j writes
**Suggested fix:** Extract to `app/services/habitDonationService.js` with a single `donateHabit({ sentence, language, userId, neo4jRun, apiBase, translateUrl })` function. Route handler reduces to: validate input → call service → respond.

### BK-M1 — `surveyRouter.js` GET / mixes role logic, DB lookup, and mapping inline
**File:** `app/routes/surveyRouter.js`, lines 70–119
**Violation type:** Fat handler — checks role, conditionally fetches participant group, filters surveys, maps results, all inline (50 lines)
**Suggested fix:** Extract a `getSurveysForUser({ db, userId, roles })` service function. Route handler becomes: extract userId+roles → call service → respond.

---

## 2. Long Functions (>40 lines)

### BK-C2 — `translate()` in habitsRouter is 80 lines with double-nested try/catch
**File:** `app/routes/habitsRouter.js`, lines 54–133
**Violation type:** Long function (80 lines), >3 levels of nesting, does two distinct things (LibreTranslate call + LLM refinement call)
**Suggested fix:** Split into `fetchLibreTranslation(sentence, sourceLang, targetLang, url)` and `refineLLMTranslation(draft, sentence, sourceLang, llmEndpoint, apiBase)`. Both are ≤30 lines each. `translate()` becomes a 10-line orchestrator.

### BK-M2 — `_buildDonationTurtle()` is 149 lines with repeated string interpolation
**File:** `app/utils/Neo4jDatabase.js`, lines 327–476
**Violation type:** Long function (149 lines), `iri()` helper redefined inside the method on every call (line 337), hardcoded RDF namespace URI `http://example.com/hhh#` repeated 20+ times
**Suggested fix:** Define `iri()` as a module-level or class-level helper. Extract sub-functions: `buildHabitTriples()`, `buildContextTriples()`, `buildBehaviorTriples()`, `buildTranslationTriples()`. Each is ≤30 lines.

### BK-M3 — `createKeycloakClient()` is 88 lines at module scope
**File:** `app/routes/adminRouter.js`, lines 22–111
**Violation type:** Long module-scope factory (88 lines) not reused elsewhere; the returned object has 5 methods, each fetching a fresh admin token (no token caching — every Keycloak method makes 2 HTTP calls)
**Suggested fix:** Extract to `app/services/keycloakAdminClient.js`. Cache the admin token with a short TTL (e.g. 55 seconds) rather than fetching on every operation.

### BK-M4 — `getParticipantProgress()` in adminStatsService is 80 lines
**File:** `app/services/adminStatsService.js`, lines 7–88
**Violation type:** Long function (80 lines), loads participants + survey responses + habits count + recommendations + builds timeline all in one function
**Suggested fix:** Extract `buildTimeline(participant, surveyResponses, recDocs)` helper (lines 50–72). Function body drops to ≈55 lines — borderline, but the timeline builder is the most reusable part.

---

## 3. Inline Cypher/Mongo Queries in Routes

### BK-C3 — Four inline Cypher queries in habitsRouter route handlers
**File:** `app/routes/habitsRouter.js`
**Violation type:** Inline Cypher strings directly in route handlers:
- GET `/` — lines 166–173: `MATCH (h:Habit) RETURN ...`
- GET `/public` — lines 241–247: `MATCH (h:Habit) RETURN ...`
- GET `/stats` — lines 425–430: two `MATCH (h:Habit)` queries
- POST `/donate` — lines 605–649: three `CREATE`/`UNWIND`/`MERGE` Cypher strings

**Suggested fix:** Extract to a `app/services/habitQueryService.js` (or the planned `habitDonationService`). Route handlers call named service methods — no Cypher visible at the route layer.

### BK-M5 — Three inline Cypher/Mongo queries scattered across adminStatsService and adminParticipantService
**File:** `app/services/adminStatsService.js`, lines 24–28; `app/services/adminParticipantService.js`, lines 98–104
**Violation type:** Inline Cypher strings inside services (better than routes, but still not abstracted)
**Note:** These are already in the service layer, so lower priority. Still, extracting a `participantNeo4jQueries.js` would complete the separation.

---

## 4. Copy-Pasted Error Handling and Boilerplate

### BK-C4 — `getDb()` helper duplicated verbatim in 8 route files
**Files and lines:**
- `app/routes/habitsRouter.js` lines 13–17
- `app/routes/recommendationsRouter.js` lines 19–23
- `app/routes/questionnaireResponsesRouter.js` lines 6–10
- `app/routes/questionnairesRouter.js` lines 6–10
- `app/routes/usersRouter.js` lines 8–12
- `app/routes/profileRouter.js` lines 6–10
- `app/routes/surveyRouter.js` lines 32–36
- `app/routes/adminRouter.js` lines 136–140

**Violation type:** 8 identical copies of `async function getDb() { if (db) return db; const { connect } = await import('../models/survey.js'); return connect(); }`
**Suggested fix:** Export a `makeGetDb(injectedDb)` factory from `app/models/survey.js` or a new `app/utils/getDb.js`. Each router calls `const getDb = makeGetDb(db)` once.

### BK-C5 — JWKS caching/fetching logic duplicated inside auth.js
**File:** `app/middleware/auth.js`, lines 32–72 (`createTokenVerifier`) and lines 74–158 (`createAuthMiddleware`)
**Violation type:** Both exported functions contain nearly identical `cachedKeys`, `lastFetchedAt`, `fetchJwks()`, `getKeys()` implementations. The `createAuthMiddleware` also re-implements JWT parsing and signature verification that duplicates `createTokenVerifier` logic — yet the two are not composed.
**Suggested fix:** `createAuthMiddleware` should use `createTokenVerifier` internally for the actual verification step. Shared JWKS state should live in one place.

### BK-C6 — Keycloak admin token fetch duplicated in onboardRouter.js and adminRouter.js
**Files and lines:**
- `app/routes/onboardRouter.js` lines 28–50: `getAdminToken()` using `client_credentials`
- `app/routes/adminRouter.js` lines 22–44: `createKeycloakClient().getAdminToken()` using `client_credentials`

**Violation type:** Two separate implementations of Keycloak admin token acquisition with identical HTTP logic
**Suggested fix:** Both should import from `app/services/keycloakAdminClient.js` (see BK-M3).

### BK-M6 — Silent error swallowing in usersRouter.js and profileRouter.js
**Files and lines:**
- `app/routes/usersRouter.js` lines 26, 58: `catch (_err) { res.status(500)... }` — error discarded, no log
- `app/routes/profileRouter.js` lines 66, 145: same pattern

**Violation type:** 4 catch blocks that discard errors entirely — no `console.error`, no context. Impossible to diagnose production failures.
**Suggested fix:** Replace `catch (_err)` with `catch (err) { console.error('[usersRouter] Error:', err); }` minimum. Compare with the correct pattern in most other routes: `console.error('[route] Error:', err)`.

### BK-M7 — Role check logic duplicated across three route files
**Files and lines:**
- `app/routes/recommendRouter.js` lines 68–72: `roles.includes('admin') || roles.includes('researcher')`
- `app/routes/surveyRouter.js` lines 74–76: same pattern
- `app/routes/v1Router.js` lines 137–202: role names as string literals in 10 `requireRole()` calls

**Violation type:** Magic string role names duplicated across files — renaming 'researcher' to 'admin_researcher' requires changes in 3+ files
**Suggested fix:** Extract `app/middleware/roles.js` with `const ROLES = { PARTICIPANT: 'participant', ADMIN: 'admin', RESEARCHER: 'researcher' }` and a helper `isPrivileged(user)`.

### BK-M8 — `getRedis()` in recommendationsRouter swallows ALL Redis errors silently
**File:** `app/routes/recommendationsRouter.js`, line 31
**Code:** `client.on('error', () => {})` — no logging whatsoever
**Violation type:** Any Redis misconfiguration (wrong URL, auth failure) is silently swallowed. The `getRedis()` function also `console.error`s on initial connection failure (line 35), but the event listener at line 31 swallows all subsequent errors.
**Suggested fix:** `client.on('error', (err) => console.warn('[redis] client error:', err.message))`.

---

## 5. Naming Violations

### BK-m1 — `SUPPORTED_LANGUAGES` constant defined inside the route handler on every request
**File:** `app/routes/habitsRouter.js`, lines 476–487
**Violation type:** A 10-element array is re-allocated on every POST /habits/donate call. Semantically it is a module-level constant.
**Suggested fix:** Move to module top level: `const SUPPORTED_LANGUAGES = ['en', 'de', 'fr', ...]`.

### BK-m2 — `donateRouter.js` uses `uuid` npm package while all other files use `node:crypto.randomUUID`
**Files:**
- `app/routes/donateRouter.js` line 4: `import { v4 as uuid } from 'uuid'`
- All other routes: `import { randomUUID } from 'node:crypto'`

**Violation type:** Inconsistent UUID generation — two different sources for the same operation
**Suggested fix:** Replace with `import { randomUUID } from 'node:crypto'` and remove the `uuid` dependency from `donateRouter.js`.

### BK-m3 — `legacyRouter` exported as `default` from surveyRouter.js alongside a named factory
**File:** `app/routes/surveyRouter.js`, lines 7–25 and 29+
**Violation type:** The file exports two routers — `legacyRouter` as default and `createSurveyRouter` as named. The default export is the legacy cookie-based router, but the file name suggests it is the survey router. This is confusing.
**Suggested fix:** Move `legacyRouter` to `app/routes/legacySurveyRouter.js`. The primary survey router (`createSurveyRouter`) should be the default export of `surveyRouter.js`.

---

## 6. Dead Code

### BK-C7 — Debug `console.log` statements at module load time in donateRouter.js
**File:** `app/routes/donateRouter.js`, lines 35–45
**Code:**
```js
console.log('🔑 reCAPTCHA Config:', {
  siteKey: config.recaptcha.siteKey ? `${config.recaptcha.siteKey.substring(0, 10)}...` : 'MISSING',
  ...
});
```
**Violation type:** Debug logging at module import time — logs secret key length to stdout in production on every server start.
**Suggested fix:** Remove entirely. Key validation should be a startup check that throws on missing config, not a log statement.

### BK-C8 — Debug `console.log` statements in POST /data middleware chain
**File:** `app/routes/donateRouter.js`, lines 69–71 and 79, 83
**Code:** `console.log('📨 Received reCAPTCHA token: ...')`, `console.log('✅ reCAPTCHA verification passed')`, `console.error('❌ reCAPTCHA verification failed: ...')`
**Violation type:** Emoji debug logs left in production route handlers. These fire on every POST /donate/data request.
**Suggested fix:** Remove the first two (success/presence logs). Keep only the error path, and change it to a structured `console.warn` without emoji.

### BK-C9 — Dead `/submit-form` route with commented-out stub functions
**File:** `app/routes/donateRouter.js`, lines 92–110
**Code:**
```js
router.post('/submit-form', recaptcha.middleware.verify, async (req, res) => {
  if (!req.recaptcha.error) {
    try {
      // await insertDataClosed(); // Example of a function for data processing
      // await insertDataOpen();   // Example of a function for data processing
      console.log(req.body);
      res.send('Form submitted successfully!');
    ...
```
**Violation type:** Route with fully commented-out business logic, `console.log(req.body)` (logs raw form data to stdout), `res.send` returning plain text (API uses JSON), and a `// Also probably needs to be changed like the ones on top` comment. This route has never worked.
**Suggested fix:** Remove the route entirely, or implement it properly with a service function.

### BK-m4 — Test route left in production app.js
**File:** `app/app.js`, line 101–103
**Code:** `app.get('/test-disclaimer', (req, res) => { res.send('Disclaimer Test Route Reached ✅'); });`
**Violation type:** Debug test route exposed in production. No auth, returns plain text.
**Suggested fix:** Remove.

### BK-m5 — Commented-out Ontology import log in Neo4jDatabase.js
**File:** `app/utils/Neo4jDatabase.js`, lines 212, 238
**Code:** `// console.warn('n10s: constraint creation warning');`, `// console.warn('n10s: Ontology.ttl import failed');`
**Violation type:** Commented-out debug logs inside broad catch blocks — the catch blocks are now completely silent. If the Ontology import fails in production, there is no indication.
**Suggested fix:** Restore `console.warn` calls or add structured logging; do not silence errors from the n10s setup path.

### BK-m6 — Excessive `console.log` debug noise in app.js middleware chain
**File:** `app/app.js`, lines 107, 108, 126, 144, 165, 167, 170, 172
**Code:** `console.log('Disclaimer route middleware hit')`, `console.log('Language use: ...')`, `console.log('Redirecting')`, etc. — 8 debug log statements fire on every request
**Violation type:** Debug-level logs left in production — these print to stdout on every HTTP request.
**Suggested fix:** Remove or replace with `console.debug` guarded by `process.env.DEBUG`.

### BK-m7 — Unused import `createInternalRouter` in app.js (conditional usage)
**File:** `app/app.js`, line 184
**Note:** `createInternalRouter` is imported and used (line 201), but `broadcast` (from the WS server) is also available on line 200 — however `createRecommendationWsServer` is imported but `broadcast` return value is referenced inline. Minor, no dead code strictly, but worth noting that the `broadcast` destructuring is the only usage.

---

## 7. What Follows Clean Code Well

- **v1Router.js is a clean orchestration layer**: thin routing, all business logic delegated, role checks at route mount, no inline handlers. The factory pattern with dependency injection is consistent and testable. ✅

- **Admin service layer (US-156)**: `adminHabitService.js`, `adminParticipantService.js`, `adminStatsService.js` are focused, well-documented with JSDoc, and properly separated from route concerns. Route handlers after refactoring follow the "validate → service → respond" pattern. ✅

- **adminRouter.js route handlers are now thin** after US-156: each handler is 5–10 lines — validate input → call service → check result → respond. ✅

- **`middleware/requireRole.js`, `middleware/rateLimiter.js`, `middleware/inputSanitizer.js`**: single-responsibility, well-named, dependency-injectable. ✅

- **`kbRouter.js`**: consistent proxy pattern across all 4 operations with identical error handling shape. ✅

- **`recommendRouter.js`**: `proxyToRecommender()` helper eliminates repetition across the 4 proxy routes. IDOR guard is explicit and consistent. ✅

- **`onboardRouter.js`**: rate limiting applied at route level, clear two-step Keycloak flow, good error messages that don't leak internals. ✅

- **`adminParticipantService.js:assignGroup`**: Cypher label injection prevention via `VALID_GROUPS` Set whitelist — correct defensive coding for a string being interpolated into a Cypher label. ✅

- **Factory pattern for all v1 sub-routers**: enables constructor injection in tests (pass `db`, `neo4jRun` as mocks). All integration tests exploit this. ✅

- **`habitsRouter.js` Neo4j driver lifecycle**: long-lived driver (created once, sessions created per query, driver NOT closed per query) is the correct pattern. ✅

---

## 8. Prioritised Findings

### Critical (fix before next production deploy)

| ID | File | Lines | Issue |
|----|------|-------|-------|
| BK-C1 | `routes/habitsRouter.js` | 467–661 | POST /habits/donate is a 143-line god handler — violates SRP, untestable |
| BK-C2 | `routes/habitsRouter.js` | 54–133 | `translate()` is 80 lines with 4 levels of nesting — splits into two functions |
| BK-C4 | 8 route files | various | `getDb()` helper copy-pasted 8 times — single change breaks all if not synced |
| BK-C5 | `middleware/auth.js` | 32–158 | JWKS caching logic duplicated in two exports of the same security-critical file |
| BK-C6 | `onboardRouter.js:28`, `adminRouter.js:28` | — | Keycloak admin token fetch implemented twice independently |
| BK-C7 | `routes/donateRouter.js` | 35–45 | reCAPTCHA key printed to stdout at module load time (logs secret key length) |
| BK-C8 | `routes/donateRouter.js` | 69, 79, 83 | Emoji debug logs fire on every POST /donate/data request |
| BK-C9 | `routes/donateRouter.js` | 92–110 | Dead `/submit-form` route with commented-out stubs, `console.log(req.body)` |

### Major

| ID | File | Lines | Issue |
|----|------|-------|-------|
| BK-M1 | `routes/surveyRouter.js` | 70–119 | GET /surveys mixes role check + DB lookup + filter + map inline (50 lines) |
| BK-M2 | `utils/Neo4jDatabase.js` | 327–476 | `_buildDonationTurtle` is 149 lines; `iri()` redefined on every call |
| BK-M3 | `routes/adminRouter.js` | 22–111 | `createKeycloakClient` is 88 lines at module scope; fetches admin token on every KC operation (no caching) |
| BK-M4 | `services/adminStatsService.js` | 7–88 | `getParticipantProgress` is 80 lines — timeline builder extractable |
| BK-M5 | `routes/habitsRouter.js` | 166–649 | 4+ inline Cypher strings in route handlers (violates route/data-access separation) |
| BK-M6 | `routes/usersRouter.js`, `routes/profileRouter.js` | 26, 58, 66, 145 | 4 `catch (_err)` blocks discard errors with no logging |
| BK-M7 | multiple | — | Role strings ('admin', 'researcher', 'participant') as magic strings across 3+ files |
| BK-M8 | `routes/recommendationsRouter.js` | 31 | Redis error event suppressed with empty handler — all Redis errors silently swallowed |

### Minor

| ID | File | Lines | Issue |
|----|------|-------|-------|
| BK-m1 | `routes/habitsRouter.js` | 476–487 | `SUPPORTED_LANGUAGES` array allocated inside handler on every request |
| BK-m2 | `routes/donateRouter.js` | 4 | Uses `uuid` npm package while all other routes use `node:crypto.randomUUID` |
| BK-m3 | `routes/surveyRouter.js` | 7–25 | `legacyRouter` and `createSurveyRouter` in same file with mismatched default export |
| BK-m4 | `app.js` | 101–103 | Debug test route `/test-disclaimer` exposed in production |
| BK-m5 | `utils/Neo4jDatabase.js` | 212, 238 | Commented-out `console.warn` silences n10s setup errors completely |
| BK-m6 | `app.js` | 107, 108, 126, 144, 165, 167, 170, 172 | 8 debug `console.log` statements fire on every request |

---

## Recommended Fix Order (max improvement / min risk)

1. **BK-C4** (`getDb()` dedup) — pure extraction, no behavior change, 8 files improved immediately
2. **BK-C7, BK-C8, BK-C9** (debug logs + dead route in donateRouter) — pure deletions, zero risk
3. **BK-m4** (test route in app.js), **BK-m6** (debug logs in app.js) — pure deletions
4. **BK-M6** (silent error swallowing) — add `console.error` to 4 catch blocks
5. **BK-M8** (Redis error swallowing) — one-line fix
6. **BK-m1** (`SUPPORTED_LANGUAGES` to module scope) — one-line refactor
7. **BK-m2** (`uuid` → `randomUUID`) — swap import
8. **BK-C5** (JWKS dedup in auth.js) — compose `createAuthMiddleware` around `createTokenVerifier`
9. **BK-C6** (Keycloak admin client dedup) — extract to `services/keycloakAdminClient.js`
10. **BK-M3** (Keycloak client token caching) — add TTL cache after extraction
11. **BK-C2** (`translate()` split) — extract two named functions
12. **BK-C1** (POST /donate god handler) — extract `habitDonationService.js`
13. **BK-M5** (inline Cypher) — move to service layer after BK-C1
14. **BK-M7** (role magic strings) — extract `roles.js` constants
15. **BK-M2** (`_buildDonationTurtle` split) — large but isolated to `Neo4jDatabase.js`
16. **BK-m3** (legacySurveyRouter file split) — low risk rename
17. **BK-M1** (surveyRouter.js GET / extract) — after BK-C4 is done
