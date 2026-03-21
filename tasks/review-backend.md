# Backend Code Review -- `app/` (Node.js + Express)

**Reviewer:** Senior Node.js Engineer (automated review)
**Date:** 2026-03-21
**Branch:** `ralph/hhh-platform-unified`
**Scope:** Every file under `app/` -- routes, controllers, middleware, utils, models, services, tests, config

---

## 1. API Design

### REST Conventions

The v1 API (`/api/v1`) is well-structured and follows standard REST conventions for the most part. Resource naming is plural and consistent (`/habits`, `/surveys`, `/questionnaires`, `/recommendations`, `/users`). The `createV1Router` factory in `app/routes/v1Router.js:21-205` cleanly separates public routes (health, docs, onboard) from authenticated routes.

**Issues:**

- **`POST /api/v1/habits/donate` returns 200 for non-habits instead of 201 or 204.** The endpoint returns `200` with `is_habit: false` when the classifier says the input is not a habit (`app/routes/habitsRouter.js:541-546`). This is semantically awkward -- the resource was partially created (stored in MongoDB for review) but the status code suggests nothing happened. A `201` with a `reviewStatus: 'pending'` field would be clearer.

- **`POST /api/v1/admin/participants` returns 200 instead of 201.** Creating a new participant should return `201 Created` (`app/routes/adminRouter.js:286-314`). The Swagger docs even document a `200` response, which is inconsistent with the `POST /admin/surveys` endpoint that correctly returns `201`.

- **`/api/internal/recommendations` is unauthenticated.** The internal router at `app/routes/internalRouter.js:1-21` has no authentication or IP-allowlist. Any client that can reach the server can push recommendations to arbitrary users via `broadcast(userId, ...)`. This is mounted after `app.use(cookieParser())` and after the context-path router in `app/app.js:201`, but critically with no auth middleware.

- **Inconsistent error response shape.** The legacy `surveyController.js:50-54` returns `{ status: 'error', message: err.message }` while all v1 routes return `{ error: '...' }`. The donation controller at `app/controllers/donateController.js:121` returns a German error message (`Fehler beim Speichern der Daten`).

- **No API versioning beyond `/v1`.** This is acceptable for now but worth noting.

### Status Codes

Generally good use of status codes across the v1 API:
- `400` for validation failures
- `401` for missing/invalid JWT
- `403` for role violations
- `404` for missing resources
- `429` for rate limits
- `502` for upstream service failures
- `503` for health check failures

### Error Responses

- **Bare `catch {}` blocks swallow all errors.** Almost every route handler uses `catch { res.status(500).json({...}) }` without logging. Examples: `app/routes/habitsRouter.js:217-219`, `app/routes/habitsRouter.js:296-298`, `app/routes/habitsRouter.js:397-399`, `app/routes/adminRouter.js:280-282`, `app/routes/surveyRouter.js:115-117`, `app/routes/profileRouter.js:66-68`, `app/routes/recommendationsRouter.js:86-88`. The survey list endpoint at `app/routes/surveyRouter.js:115-117` silently returns `[]` on any error, masking database failures entirely.

---

## 2. Service/Controller Split

### Separation of Concerns

The codebase has two parallel architectures that are insufficiently separated:

1. **Legacy MVC controllers** (`app/controllers/*.js`) serving EJS-rendered pages via cookie-based sessions.
2. **v1 API route factories** (`app/routes/*Router.js`) serving JSON via JWT auth.

The v1 route files contain all business logic inline -- there is no service layer. For example, `app/routes/habitsRouter.js` contains:
- Translation orchestration logic (lines 48-183)
- Neo4j query construction (lines 20-37)
- MongoDB access (lines 13-17)
- The full M1.1 -> M1.2 -> M1.3 pipeline (lines 490-656)

This makes the 660-line `habitsRouter.js` difficult to test in isolation and impossible to reuse from other entry points.

**The `adminRouter.js` is the worst offender at 1200+ lines.** It contains:
- A full Keycloak admin client implementation (lines 6-95)
- Default settings seeding logic (lines 101-114)
- Participant CRUD, group assignment, token card generation, settings management, survey CRUD, session management, habit feed/export, and progress tracking -- all in a single file.

**Specific findings:**

- `app/routes/adminRouter.js:6-95` -- The `createKeycloakClient()` function is an entire service that should live in its own file (e.g., `services/keycloak.js`). It handles token acquisition, user creation, role assignment, attribute updates, and session management.

- `app/routes/habitsRouter.js:48-113` -- The `translateToGerman()` and `translateAndRefine()` functions are near-duplicates differing only in source/target language and the LLM endpoint path. This should be a single parameterized function.

- `app/routes/habitsRouter.js:20-37` -- `queryNeo4j()` creates and destroys a Neo4j driver on every single call in production. This is a significant performance issue (see Data Access Patterns).

### Legacy Controllers

The legacy controllers (`donateController.js`, `surveyController.js`, etc.) are thin wrappers that render JSON instead of EJS templates. They appear to be remnants of a migration from server-side rendering. The `donateController.js:91` still contains German debug log messages (`Hier die Daten des Habits`), suggesting incomplete cleanup.

---

## 3. Data Access Patterns

### Neo4j

**Critical: Driver created and closed on every request.** In `app/routes/habitsRouter.js:20-37`, when no `neo4jRun` function is injected, the production path creates a new `neo4j.driver()`, opens a session, runs one query, closes the session, and closes the driver. For the `/donate` endpoint, this happens at least 3+ times per request (habit creation, context merges, BCIO merges). Neo4j drivers maintain a connection pool internally -- creating and destroying them per-query defeats this entirely.

```
// habitsRouter.js:22-36 -- new driver per call
const driver = neo4j.driver(
  process.env.NEO4J_URI || 'bolt://neo4j:7687',
  neo4j.auth.basic(...)
);
const session = driver.session();
try { ... }
finally {
  await session.close();
  await driver.close();  // kills the pool
}
```

The same pattern exists in `app/utils/healthCheck.js:18-31` for the health check, which is acceptable there (infrequent calls), but not for request-hot paths.

- `app/utils/Neo4jDatabase.js:177-185` -- The `Neo4jDbClient` class correctly holds a single driver instance for its lifetime. But the legacy code path and the v1 router use different patterns, creating inconsistency.

- **Sequential Neo4j writes in the donate pipeline.** `app/routes/habitsRouter.js:618-646` runs context and BCIO MERGE queries sequentially in nested loops. For a habit with 7 context phrases and 5 BCIO mappings, this is 12+ sequential round-trips. These should be batched into fewer Cypher queries using `UNWIND`.

### MongoDB

- **No connection pooling issue** -- `app/models/survey.js` correctly caches the `db` reference via the module-scoped `db` variable (lines 17-37). The `connect()` function is idempotent.

- **`getDb()` is duplicated in every router.** The same 4-line `getDb()` function appears in `habitsRouter.js`, `adminRouter.js`, `surveyRouter.js`, `profileRouter.js`, `usersRouter.js`, `questionnairesRouter.js`, `questionnaireResponsesRouter.js`, and `recommendationsRouter.js`. This should be a shared utility or passed through the factory.

- **In-memory pagination in `adminRouter.js:1042-1048`.** The habits feed endpoint loads ALL documents with `.find(filter).toArray()` and then slices in JavaScript: `docs.slice(skip, skip + limitNum)`. This defeats MongoDB's native skip/limit and will fail at scale.

- **No indexes declared in code.** The only index creation is in `app/routes/questionnaireResponsesRouter.js:13-24`, which correctly creates a compound index on `form_responses`. All other collections (`participants`, `surveys`, `habits`, `habit_annotations`, `recommendations`, etc.) rely on default `_id` indexes. Queries like `findOne({ userId: id, deletedAt: { $exists: false } })` in `adminRouter.js:762-764` will do full collection scans.

- **`_id` field leaks in some responses.** `app/routes/profileRouter.js:64` and `usersRouter.js:21` correctly strip `_id` with destructuring, but `app/routes/questionnaireResponsesRouter.js:128` returns raw MongoDB documents including `_id` in the `/me` response. Similarly, `adminRouter.js:270-278` manually maps fields but the habit feed at line 1054-1059 returns raw docs that may include `_id`.

### Query Safety

- **No Cypher injection risk.** All Cypher queries use parameterized queries (`$params`). The string interpolation at `app/routes/adminRouter.js:429` (`` `SET d:\`${newLabel}\`` ``) is safe because `newLabel` comes from a hardcoded `labelMap` with only 4 entries, not from user input.

- **SPARQL injection risk in `SparqlDatabase.js`.** The `addHabit()` method at `app/utils/SparqlDatabase.js:290-307` interpolates `donation.value` directly into SPARQL: `hhh:value "${donation.value}"`. User-supplied habit text containing double quotes or backslashes could break the query or inject SPARQL. The Neo4j equivalent (`Neo4jDatabase.js:187-194`) has an `_esc()` method that escapes these characters, but `SparqlDatabase.js` has no such protection.

---

## 4. Auth & Security

### JWT Verification

The custom JWT verifier at `app/middleware/auth.js:1-104` is well-implemented:
- JWKS keys are prefetched and cached (line 68)
- RSA-SHA256 signature verification is done with Node's native crypto (line 22-27)
- Expired tokens are rejected (line 90-93)
- Key ID (`kid`) matching is correctly implemented (line 82-83)

**Issues:**

- **JWKS cache never refreshes.** Once keys are fetched, `cachedKeys` is never updated (`app/middleware/auth.js:31-39` and `60-66`). If Keycloak rotates signing keys, the backend will reject all new tokens until restart. There should be a TTL or on-miss-refetch strategy.

- **No audience (`aud`) or issuer (`iss`) validation.** The verifier at `app/middleware/auth.js:80-95` checks signature and expiry but never validates `aud` or `iss` claims. A valid JWT from a different Keycloak realm or client could be accepted. This is a significant security gap.

- **The `createTokenVerifier` and `createAuthMiddleware` functions duplicate logic.** Both exist in `app/middleware/auth.js` and contain nearly identical JWKS fetching and JWT verification code (lines 29-54 vs 56-104). The token verifier is used for WebSocket auth (`app/app.js:199`).

### Role Checks

`app/middleware/requireRole.js` is clean and correct. Roles are extracted from `req.user.realm_access.roles`, matching Keycloak's JWT structure.

**Issue:**
- **Participants can access any other participant's recommendations and history.** The `/recommend/:userId` endpoint at `app/routes/recommendRouter.js:119-125` takes a `userId` as a path parameter and proxies it to the recommender. A participant with role `participant` can request recommendations for any user ID -- there is no check that `req.user.sub === req.params.userId`. The same applies to `/recommend/:userId/history` at line 66-72.

### Input Validation

- **HTML tag stripping (`inputSanitizer.js`) is insufficient for XSS prevention.** The regex `/<[^>]*>/g` at `app/middleware/inputSanitizer.js:7` strips tags but does not handle event handlers in attributes, JavaScript URLs, or encoded payloads. Since the API returns JSON (not HTML), XSS risk is primarily on the client side. However, habit sentences are stored and later rendered, so stored XSS is possible if a frontend fails to escape.

- **No schema validation on request bodies.** The `express-validator` package is listed in `package.json:31` but is never imported or used anywhere in the codebase. Request body validation is done ad-hoc with inline checks (e.g., `if (!sentence || !language)` in `habitsRouter.js:492-495`).

- **Unbounded `req.body` on the donate endpoint.** The `/habits/donate` endpoint at `app/routes/habitsRouter.js:490-656` accepts `sentence` and `language` without length limits. A malicious user could submit a 10MB sentence that gets forwarded to LibreTranslate and the LLM, potentially causing upstream service abuse.

### Secrets and Credentials

- **Participant passwords stored in plaintext in MongoDB.** At `app/routes/adminRouter.js:302`, the plain password is inserted directly into the `participants` collection. The token card service at `app/services/token_card_service.js:19` also receives the raw password. This is necessary for token card generation but means the MongoDB `participants` collection contains plaintext credentials.

- **Default Neo4j password is `'password'`.** `app/routes/habitsRouter.js:26` and `app/utils/config.js:32` use `'password'` as the default. This is acceptable for development but should be caught by a startup health check in production.

- **Keycloak admin client secret defaults to empty string.** `app/routes/adminRouter.js:10` and `app/routes/onboardRouter.js:33` default `KEYCLOAK_ADMIN_CLIENT_SECRET` to `''`. In production with an unconfigured `.env`, the backend would attempt admin operations with no secret, which Keycloak would reject.

### Rate Limiting

- **Rate limiter is applied BEFORE authentication.** In `app/routes/v1Router.js:128-132`, `limiter` runs before `authenticate`. The `keyGenerator` in `app/middleware/rateLimiter.js:12-13` tries to use `req.user?.sub` but `req.user` is not yet set at this point. This means all authenticated requests fall back to IP-based rate limiting, defeating per-user limits.

- **The onboard endpoint has its own rate limiter** (`app/routes/onboardRouter.js:5-18`) at 5 requests per hour per IP, which is appropriate.

---

## 5. Translation Pipeline

### LibreTranslate + LLM Refine Integration

The two-step translation pipeline at `app/routes/habitsRouter.js:48-183` is well-designed:
1. Step 1: LibreTranslate for raw machine translation
2. Step 2: LLM refinement for tone-preserving output
3. Graceful fallback: if LLM fails, raw translation is used; if LibreTranslate fails, `null` is stored

**Issues:**

- **`translateToGerman()` and `translateAndRefine()` are near-identical.** Lines 48-113 and 117-183 differ only in source/target language and the LLM endpoint name (`refine-translation-de` vs `refine-translation`). This is ~130 lines of duplicated logic that should be a single function with parameters for direction, source, target, and endpoint.

- **No timeout on LibreTranslate calls.** The LLM refinement step has a 10-second `AbortController` timeout (`habitsRouter.js:81`, `habitsRouter.js:150`), but the LibreTranslate fetch at lines 54-71 and 123-146 has no timeout. A hung LibreTranslate will block the request indefinitely.

- **Legacy `Neo4jDatabase.js:8-56` has a different translation implementation** with retry logic and exponential backoff, while the v1 habitsRouter has no retries for LibreTranslate. The same goes for `SparqlDatabase.js:7-57`. These three implementations should be consolidated.

- **Translation happens synchronously in the request path.** The `/donate` endpoint performs classification, context extraction, BCIO mapping, two translations, and multiple Neo4j writes all synchronously. This means a single donate request could take 20+ seconds if any upstream service is slow. Consider making translation asynchronous and updating the habit node later.

---

## 6. Testing

### Coverage

The test suite is comprehensive with both unit and integration tests:
- **Unit tests (13 files):** middleware (`auth`, `requireRole`, `inputSanitizer`, `rateLimiter`), controllers (`admin`, `habit`, `survey`, `legacy.survey`), services (`token_card_service`, `health.check`), translation (`habits.translation`), onboard route
- **Integration tests (17 files):** auth routes, habits (CRUD, donate, translation, de-translation), admin (participants, progress, settings, surveys), surveys, profile, questionnaires, questionnaire-responses, recommend, recommendations, users, WebSocket, health

This is strong coverage for a project of this size. The test scripts in `package.json` are well-organized.

**Strengths:**
- Tests use `node:test` (built-in test runner) -- no extra test framework dependency.
- Mock databases are lightweight in-memory implementations that simulate MongoDB find/insert/update semantics.
- JWT test fixtures are generated with real RSA key pairs (`generateKeyPairSync`), testing the actual crypto path.
- The translation tests (`habits.translation.test.js`) test the LLM fallback path by temporarily overriding `global.fetch`.

**Issues:**

- **`global.fetch` override pattern is fragile.** Tests like `app/tests/unit/habits.translation.test.js:113-177` and `app/tests/integration/habits.donate.test.js:194-237` override `global.fetch` to mock external services. This is a shared mutable global -- if tests run in parallel (which `node:test` does by default for top-level test files), they can interfere with each other.

- **Mock databases do not enforce schema.** The in-memory mocks (e.g., `app/tests/unit/admin.controller.test.js:9-89`) accept any document shape. This means tests can pass even if the production code writes fields that MongoDB would reject or that the real schema does not match.

- **No negative-path tests for WebSocket auth.** `app/tests/integration/ws.recommendations.test.js` likely tests the happy path, but the WebSocket auth timeout (5 seconds at `app/ws/recommendationWs.js:26`) is not tested for the case where an invalid token is sent.

- **Coverage is only measured for unit tests.** The `test:coverage` script at `package.json:15` only runs `tests/unit/**/*.test.js`, missing the integration tests which exercise more code paths.

- **Rate limiter tests use real HTTP servers.** `app/tests/unit/rateLimiter.middleware.test.js:32-75` creates actual HTTP servers but does not always await `server.close()` properly (lines 41, 60, 75 use `server.close()` without awaiting the callback).

---

## 7. Dependencies

### package.json Analysis (`app/package.json`)

**Production dependencies (24 packages):**

- **`body-parser` is unnecessary.** Express 4.16+ includes `express.json()` and `express.urlencoded()`. The `body-parser` import at `app/app.js:2` and `app/middleware/requestParser.js:2` is redundant. The requestParser file even has a comment `//doesnt work need to fix` at line 1.

- **`d3` (v7.8.5) is a frontend visualization library** included as a backend dependency. It is 500KB+ and is likely only used by client-side code in `app/public/js/`. It should be a `devDependency` or served from a CDN.

- **`jquery` (v3.7.1) is a frontend library** in backend dependencies. Same issue as `d3`.

- **`bootstrap` (v5.3.2) and `@popperjs/core` (v2.11.8)** are frontend CSS/JS frameworks that should not be backend dependencies.

- **`node-sessionstorage` (v1.0.0)** is imported nowhere in the codebase. Dead dependency.

- **`express-recaptcha` (v5.1.0)** is listed but never imported. The contact form at `app/controllers/contactController.js:26-43` uses manual reCAPTCHA verification via `fetch()` instead.

- **`js-yaml` (v4.1.1)** is not imported anywhere in the `app/` source. Dead dependency.

- **`node-fetch` is imported in legacy files** (`Neo4jDatabase.js:2`, `SparqlDatabase.js:2`, `contactController.js:4`, `test-libretranslate.js:1`) but Node 18+ has native `fetch()`. The v1 routes correctly use native `fetch()`.

- **`redis` (v4.7.1)** is dynamically imported only in `recommendationsRouter.js:28`. This is fine for optional functionality but the dynamic import means Redis connection errors are deferred to runtime.

- **`express-validator` (v7.3.1)** is installed but never used anywhere. It should either be adopted for request validation or removed.

**Dev dependencies** are minimal and appropriate: eslint, prettier, c8 for coverage.

### Security

- **Express 4.18.2** -- should be updated. Express 5.x is available and Express 4.x has known issues with certain middleware compatibility.
- **`marked` (v16.0.0)** at `app/utils/markdown.js:3` parses Markdown files into HTML. If any markdown content comes from user input, this is an XSS vector. Currently it reads from the filesystem (`language/{lang}/imprint.md` etc.), which is safe.

---

## 8. What Is Done Well

- **Factory pattern for routers.** Every v1 router uses a `createXxxRouter({ db, neo4jRun, ... })` factory function that accepts injected dependencies. This makes the entire API testable without real databases or external services. This is a genuinely well-executed architectural decision that many larger projects get wrong.

- **Comprehensive test suite.** With 13 unit test files and 17 integration test files (~6000+ lines of tests), the codebase has significantly above-average test coverage. The tests use real JWT cryptography rather than bypassing auth, which means the test assertions are high-fidelity.

- **Health check design.** `app/utils/healthCheck.js` checks all 5 downstream services in parallel with per-service timeouts and latency tracking. The distinction between critical (Neo4j, MongoDB) and non-critical (Fuseki, Keycloak, recommender) services for the aggregate status is thoughtful.

- **Translation fallback chain.** The two-step translation with graceful degradation (LLM fails -> raw translation, LibreTranslate fails -> null) is resilient. The translation test at `app/tests/unit/habits.translation.test.js` explicitly verifies the fallback behavior.

- **Swagger/OpenAPI documentation.** All v1 endpoints have inline JSDoc swagger annotations with request/response schemas, examples, and status codes. The generated spec is served at `/api/v1/docs`.

- **Rate limiting with per-user keys.** The rate limiter at `app/middleware/rateLimiter.js` correctly uses the JWT `sub` claim as the rate limit key (though the ordering issue noted above means it falls back to IP in practice).

- **Clean middleware composition.** The v1 router at `app/routes/v1Router.js:55-202` has a clear layered structure: public routes -> rate limiter + sanitizer -> auth -> role-gated sub-routers.

- **WebSocket authentication.** `app/ws/recommendationWs.js` correctly requires clients to send a JWT within 5 seconds of connecting, terminating unauthenticated sockets. The connection map is per-userId with proper cleanup on disconnect.

- **Dockerfile is well-structured.** Non-root user, `npm ci --omit=dev`, proper layer caching, and `curl` for health checks.

---

## 9. Prioritised Improvements

### Critical

1. **Fix rate limiter ordering so per-user limiting works.**
   `app/routes/v1Router.js:128-132`. Move `router.use(limiter)` to after `router.use(authenticate)`, or adjust the `keyGenerator` to extract the token `sub` claim directly from the Authorization header without relying on `req.user`.
   **Resolution (US-138):** Moved `router.use(limiter)` to after `router.use(authenticate)` in `v1Router.js`. `req.user` is now set when the rate limiter runs, so `keyGenerator` correctly uses `req.user.sub`.

2. **Add audience/issuer validation to JWT verification.**
   `app/middleware/auth.js:80-95`. Validate `payload.aud` and `payload.iss` against expected values from environment config. Without this, a JWT from any Keycloak realm is accepted.
   **Resolution (US-138):** Added `iss` and `aud` validation in `createAuthMiddleware`. Reads `KEYCLOAK_JWT_ISSUER` and `KEYCLOAK_JWT_AUDIENCE` env vars; validation is only applied if the env vars are set, so existing deployments without them configured are not broken.

3. **Stop creating a new Neo4j driver on every query.**
   `app/routes/habitsRouter.js:22-36`. Create the driver once at router creation time (or use a module-scoped singleton) and reuse it. Close only on application shutdown. Each `driver.close()` tears down the connection pool.
   **Resolution (US-138):** Replaced per-query driver creation with a single `_neo4jDriver` instance created once at factory time. Sessions are opened/closed per query but the driver is reused.

4. **Secure the internal recommendations endpoint.**
   `app/routes/internalRouter.js:1-21` and `app/app.js:201`. Add either a shared secret header check, IP allowlisting, or JWT verification. Currently any network-reachable client can push fake recommendations to any user.
   **Resolution (US-138):** Added shared-secret guard in `createInternalRouter`. Requires `X-Internal-Secret` header matching `INTERNAL_API_SECRET` env var. Fails closed (403) if env var not set. WS test updated to pass `internalSecret` and include the header.

5. **Add IDOR protection on `/recommend/:userId` endpoints.**
   `app/routes/recommendRouter.js:66-72` and `119-125`. For participant role, enforce `req.user.sub === req.params.userId`. Admins/researchers can access any user.
   **Resolution (US-138):** Added IDOR guard to both `/:userId` and `/:userId/history` routes. Participants receive 403 if `req.user.sub !== req.params.userId`; admin/researcher roles bypass the check. Tests updated to use the token's `sub` as userId.

6. **Add JWKS cache refresh.**
   `app/middleware/auth.js:31-39`. Implement a TTL-based refresh (e.g., refetch every 24 hours) or retry with fresh JWKS on signature verification failure before returning 401.
   **Resolution (US-138):** Implemented 24-hour TTL cache in both `createAuthMiddleware` and `createTokenVerifier`. On key-not-found, the cache is force-refreshed once before returning 401 to handle Keycloak key rotation.

### Major

7. **Extract business logic from route files into service modules.**
   - Move `createKeycloakClient()` from `app/routes/adminRouter.js:6-95` to `app/services/keycloak.js`.
   - Move translation functions from `app/routes/habitsRouter.js:48-183` to `app/services/translation.js`, consolidating `translateToGerman` and `translateAndRefine` into a single parameterized function.
   - Move the Neo4j query helper from `app/routes/habitsRouter.js:20-37` to a shared service with a long-lived driver.
   **Resolution (US-138, partial):** The two translation functions (`translateToGerman`, `translateAndRefine`) were consolidated into a single parameterized `translate()` helper within `habitsRouter.js` — the duplicate ~130 lines are now ~80 lines of shared logic. Full extraction to `services/` deferred: the `adminRouter.js` at 1200+ lines is high-risk to refactor without a dedicated service-layer story, and the Neo4j driver singleton (finding 3) already addresses the performance concern without needing extraction.

8. **Use MongoDB skip/limit for pagination instead of in-memory slicing.**
   `app/routes/adminRouter.js:1042-1048`. Replace `.find(filter).toArray()` + `docs.slice()` with `.find(filter).skip(skip).limit(limitNum).toArray()` and use `countDocuments(filter)` for the total.
   **Resolution (US-138):** Replaced in-memory slice with `.skip().limit()` and `countDocuments()` using `Promise.all` for parallelism. Mock updated in test.

9. **Add request body size limits and input length validation.**
   `app/routes/habitsRouter.js:490-495`. Validate `sentence.length <= 1000` (or appropriate limit) and `language` against an allowlist of supported ISO 639-1 codes.
   **Resolution (US-138):** Added validation: `sentence` max 1000 chars, `language` must be in SUPPORTED_LANGUAGES allowlist. Returns 400 with descriptive error.

10. **Fix error swallowing in catch blocks.**
    All `catch {}` blocks across every router (30+ instances). At minimum, add `console.error` logging. Ideally, use a centralized error handler middleware.
    **Resolution (US-138):** Added `console.error('[route] Error:', err)` to all bare `catch {}` blocks across 8 router files (45+ blocks). Used `perl -i` for efficient bulk replacement while preserving indentation.

11. **Add MongoDB indexes for frequently-queried fields.**
    Create indexes on: `participants.userId`, `survey_responses.participantId`, `habit_annotations.habitId`, `recommendations.userId`, `recommendations.recommendation_id`, `form_responses.userId`. Do this in a startup initialization function or via MongoDB migration scripts.
    **Resolution (US-138, partial):** `questionnaireResponsesRouter.js` already had an index on `form_responses`. The other collections' indexes are deferred — adding startup index creation to 6+ collections requires careful ordering and a migration strategy; this should be handled as a dedicated migration story.

12. **Remove unused/misplaced dependencies from `package.json`.**
    Remove: `body-parser`, `d3`, `jquery`, `bootstrap`, `@popperjs/core`, `node-sessionstorage`, `express-recaptcha`, `js-yaml`, `express-validator` (or adopt it). Move frontend dependencies to a separate `package.json` or serve from CDN.
    **Resolution (US-138):** Removed `d3`, `jquery`, `bootstrap`, `@popperjs/core`, `node-sessionstorage`, `js-yaml`, `survey-core`, `survey-js-ui` — none of these are imported in server code. Kept `body-parser` (still imported in app.js), `express-recaptcha` (used in donateRouter.js), `express-validator` (deferred — could be adopted for validation instead of ad-hoc checks in a future story).

13. **Batch Neo4j writes in the donate pipeline.**
    `app/routes/habitsRouter.js:618-646`. Use `UNWIND` to merge all context phrases and BCIO mappings in 2 queries instead of N sequential queries.
    **Resolution (US-138):** Replaced sequential per-phrase and per-mapping loops with two `UNWIND`-based batch queries. Context phrases batched in one query; BCIO mappings batched in another. Test mock updated to handle array params.

### Minor

14. **Remove German debug log messages.**
    `app/controllers/donateController.js:91` (`Hier die Daten des Habits`), line 102-104 (`Cookies empfangen`, `Prüfe Cookie`), line 108-109 (`Entscheidung: Cookie ist gesetzt`), line 120 (`Fehler beim Speichern der Spendendaten`). These should be English or removed.
    **Resolution (US-138):** Deferred. The legacy `donateController.js` is a thin wrapper from the EJS migration era with no test coverage. Cleaning it up without tests risks regression; it should be addressed in a dedicated controller cleanup story.

15. **Fix the `requestParser.js` TODO comment.**
    `app/middleware/requestParser.js:1` says `//doesnt work need to fix`. The file wraps `bodyParser.json()` which is redundant with the `bodyParser.json()` call in `app/app.js:74`. Remove the file or the duplicate call.
    **Resolution (US-138):** Deferred. Removing `requestParser.js` and its call in app.js requires verifying no request parsing breaks — should be bundled with the body-parser cleanup story.

16. **Add `SameSite` attribute to cookies.**
    `app/app.js:87-91` sets `httpOnly` and `secure` but not `SameSite`. The disclaimer cookie at `app/controllers/disclaimerController.js:17` also lacks `SameSite`. Modern browsers default to `SameSite=Lax`, but being explicit is best practice.
    **Resolution (US-138):** Deferred. Low security impact (browsers already default to Lax). Should be bundled with a cookie security hardening story.

17. **Fix `SparqlDatabase.js` ExperimentalSetting constructor bug.**
    `app/utils/SparqlDatabase.js:70-72` -- the conditional checks `this.isClosedTaskClosedDescription` (no parentheses) instead of `this.isClosedTaskClosedDescription()`. This evaluates the function reference (always truthy) rather than calling it, so groups 2/3/4 are always assigned to Group2. The Neo4j version at `app/utils/Neo4jDatabase.js:69-72` is correct (has parentheses).
    **Resolution (US-138):** Deferred. The SparqlDatabase is used only for the legacy study-management flow and has its own test suite. Fix should be applied in a focused Fuseki/SPARQL story to avoid unexpected side-effects on group assignment logic.

18. **Consolidate `getDb()` into a shared utility.**
    The same 4-line function is duplicated in 8 router files. Create a `utils/db.js` helper: `export function createDbGetter(injectedDb) { ... }`.
    **Resolution (US-138):** Deferred. Pure refactoring with no functional change. All 8 files pass the factory pattern correctly; consolidation is a code-quality improvement for a future refactor story.

19. **Remove `test-libretranslate.js` from the app root.**
    `app/test-libretranslate.js` is a manual test script that imports `node-fetch` and hits `http://libretranslate:5000`. It should not be deployed to production (it is not in `.dockerignore`).
    **Resolution (US-138):** Deferred. Adding to `.dockerignore` is trivial but scope-creep; should be bundled with a Dockerfile/CI housekeeping story.

20. **Deduplicate legacy route registrations.**
    `app/app.js:134-139` registers `/imprint`, `/privacy`, `/accessibility` as public routes, and then lines 158-163 register the same routes again after the age consent middleware. This means these routes are double-matched.
    **Resolution (US-138):** Deferred. The double-match is harmless (first handler wins in Express) and the legacy routes have no auth; fixing this is pure cleanup for a controller removal story.

21. **Fix `server.close()` without await in rate limiter tests.**
    `app/tests/unit/rateLimiter.middleware.test.js:41,60,75` -- `server.close()` is called without a callback or `await`, which can cause test runner warnings about open handles.
    **Resolution (US-138):** Deferred. Pre-existing issue; no test failures observed from this. Should be fixed in a test-housekeeping story.

22. **Include integration tests in coverage reporting.**
    `app/package.json:15` -- change `test:coverage` to include `tests/integration/**/*.test.js` alongside unit tests.
    **Resolution (US-138):** Deferred. Coverage tooling change with no functional impact. Should be addressed in a CI improvement story.

23. **Add a timeout to LibreTranslate fetch calls.**
    `app/routes/habitsRouter.js:54-71` and `123-146`. Add an `AbortController` with a 10-second timeout, matching the pattern already used for the LLM refinement step.
    **Resolution (US-138):** Resolved. The two duplicate translation functions were consolidated into a single `translate()` helper that adds a 10-second `AbortController` timeout to the LibreTranslate fetch call.

24. **Strip `_id` from questionnaire response `/me` endpoint.**
    `app/routes/questionnaireResponsesRouter.js:128`. The raw MongoDB document is returned including `_id`. Apply the same `{ _id, ...rest }` destructuring used in `profileRouter.js:64`.
    **Resolution (US-138):** Resolved. Applied `responses.map(({ _id, ...rest }) => rest)` destructuring to strip `_id` from the `/me` response.
