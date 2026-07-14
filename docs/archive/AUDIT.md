> **Archived 2026-07-12.** This audit's backlog is resolved (see the
> "Backlog verification" section of [`BUG_AUDIT.md`](../../BUG_AUDIT.md)) —
> kept here for historical context only, not a living document. For current,
> open findings see [`BUG_AUDIT.md`](../../BUG_AUDIT.md).

# Health Habit Hub — Full System Audit

**Date:** 2026-04-10
**Branch:** ralph/hhh-platform-unified
**Auditor:** Claude (Sonnet 4.6)
**Scope:** Fresh full-codebase review — Infrastructure, Node.js backend, Python API service, Next.js admin, Flutter mobile

---

## 1. Executive Summary

The platform is in reasonably healthy shape for a research-stage system. The most significant issues were a timing-unsafe shared secret comparison on the internal API (P0, fixed), missing security response headers (P1, fixed), an IDOR on the recommendations feedback endpoint (P1, fixed), silent failure of scheduled notifications (P1, fixed), and eleven unbounded request fields and two path-traversal vulnerabilities in the Python API service (all P1, all fixed). The highest-risk item remaining is a plaintext participant password stored in MongoDB and returned in POST responses — this is tracked as a P1 backlog item requiring a dedicated refactor. The second remaining concern is the Python API service having no authentication layer, mitigated only by Docker network isolation.

---

## 2. Fixes Applied This Session

| Commit    | Description                                                                                       |
| --------- | ------------------------------------------------------------------------------------------------- |
| `c77f22d` | fix: remove hardcoded Mongo credentials from docker-compose app service                           |
| `d697fc9` | fix: correct scratch doc justification for kept compose env vars                                  |
| `47ccb44` | fix: timing-safe secret comparison; security headers middleware; remove dead auth ready promise   |
| `d381e28` | fix: validate ObjectId params and fix status codes in admin router                                |
| `ee6394c` | docs: expand admin router findings — plaintext password scope and POST 200 sweep                  |
| `a56cd5d` | fix: redact PII from survey log; add secure/sameSite cookie flags; strip _id from API responses   |
| `11f8b02` | docs: add insertedId leak finding in questionnaireResponsesRouter                                 |
| `e0c5bb9` | fix: close IDOR on recommendations feedback endpoint; add route-5 review findings                 |
| `36554ea` | docs: add recommend router quality findings — IDOR test gap, privileged-role inconsistency        |
| `c6891e6` | fix: prevent failed scheduled notifications from being silently marked sent                       |
| `1ca79af` | fix: add notification identity to dispatch error log                                              |
| `e2212b9` | fix: add field length limits to API request models; set LLM call timeout; guard KB path traversal |

---

## 3. Component Scorecards

### 3.1 Infrastructure

| Dimension     | Score | Justification                                                                                                                                                                                                                    |
| ------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Code Quality  | 3/5   | Many weak-default credential patterns (Fuseki, Mongo, Keycloak, Neo4j all use `:-admin` or known-string fallbacks); unpinned `libretranslate:latest` image; docker.sock without `:ro` in dev                                     |
| Security      | 3/5   | One P1 fixed (hardcoded Mongo credentials); five P1 weak-default patterns documented but require operator action; prod compose is meaningfully hardened; real infrastructure values (domain, IP, email) committed to `stack.env` |
| Documentation | 3/5   | Compose files have inline comments explaining intentions; operator setup requirements are not consolidated in one place                                                                                                          |
| Consistency   | 3/5   | Dev/local/prod compose configurations differ significantly; port binding conventions vary across services                                                                                                                        |

**Infrastructure composite: 12/20**

### 3.2 Node.js Backend

| Dimension     | Score | Justification                                                                                                                                                                                                    |
| ------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Code Quality  | 3/5   | `adminRouter.js` is ~2050 lines with inline business logic; stale comment in `requestParser.js`; `config.js` has a dead `getDbHeader()` with wrong property name; `healthCheck.js` duplicates Mongo URI assembly |
| Test Coverage | 2/5   | Missing IDOR regression test for the recommendations feedback fix; no evidence of broad route-level test coverage; integration tests exist for some paths                                                        |
| Security      | 4/5   | P0 fixed (timing-safe secret); three P1 fixed (security headers, IDOR, PII logging, cookie flags, ObjectId validation); one P1 backlog (plaintext participant password in DB and API response)                   |
| Documentation | 3/5   | Some routes have good JSDoc/Swagger annotations; dead code and stale comments found                                                                                                                              |
| Consistency   | 3/5   | Mixed HTTP status codes on POST endpoints; two sources of truth for Mongo config; `_id` stripping applied inconsistently across routes (GET routes fixed, POST response still leaks `insertedId`)                |

**Backend composite: 15/25**

### 3.3 Python API Service

| Dimension     | Score | Justification                                                                                                                                                                                     |
| ------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Code Quality  | 3/5   | Singleton dependencies duplicated across every router (`_redis`, `_mongo_client`, `_openai_client`); no central `deps.py`; LLM parse failures return silent defaults without a `parse_error` flag |
| Test Coverage | 3/5   | Dependency contract tests added in a previous sprint; no integration tests covering LLM timeout or parse-failure paths                                                                            |
| Security      | 3/5   | 11 P1s fixed (all field length limits, two path-traversal guards, LLM timeout); one P1 documented (no auth — network-isolation only); prompt injection inherent to LLM architecture               |
| Documentation | 3/5   | FastAPI auto-generates OpenAPI docs; inline comments are sparse; no explicit network-isolation guarantee recorded at the code level                                                               |
| Consistency   | 3/5   | Field validation pattern now uniform after this session; but singleton patterns remain inconsistent between routers                                                                               |

**Python API composite: 15/25**

### 3.4 Next.js Admin

| Dimension     | Score | Justification                                                                                                                                                                                                |
| ------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Code Quality  | 4/5   | Clean component structure; consistent error handling; no XSS risks; minor issue (PARTICIPANTS_API URL inside component body)                                                                                 |
| Test Coverage | 1/5   | No test files found under `admin/src`; no unit or integration tests for admin UI                                                                                                                             |
| Security      | 5/5   | Server-side auth gate in `middleware.ts` using `getToken` (edge-runtime JWT verification); role check enforced before any page; no client-side-only auth; no hardcoded secrets; no `dangerouslySetInnerHTML` |
| Documentation | 3/5   | Minimal inline docs; component purposes are reasonably self-evident                                                                                                                                          |
| Consistency   | 4/5   | Consistent patterns across all pages; access token sourced from session uniformly; minor constant placement inconsistency                                                                                    |

**Admin composite: 17/25**

### 3.5 Flutter Mobile

| Dimension     | Score | Justification                                                                                                                                            |
| ------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Code Quality  | 4/5   | Well-structured with clear separation (services, providers, screens); PKCE flow correctly implemented; secure storage throughout                         |
| Test Coverage | 3/5   | `redirect.dart` is testable (dependency injection pattern); some test coverage exists; WebView bridge paths are not tested                               |
| Security      | 4/5   | Tokens in `flutter_secure_storage`; PKCE via `flutter_appauth`; no hardcoded production secrets; WebView JS bridges lack origin restriction (P2 backlog) |
| Documentation | 3/5   | Good doc comments on `auth_service.dart` and `redirect.dart`; many widgets and screens have minimal docs                                                 |
| Consistency   | 4/5   | Consistent token access pattern via `authServiceProvider`; admin guard missing login check (P2)                                                          |

**Flutter composite: 18/25**

---

## 4. All Findings

| ID    | Severity | Layer   | File                                                   | Description                                                                                                                                 | Status                                                                    |
| ----- | -------- | ------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| F-001 | P0       | Backend | `app/routes/internalRouter.js`                         | Timing-unsafe string equality on shared internal secret                                                                                     | Fixed                                                                     |
| F-002 | P1       | Infra   | `docker-compose.yml`                                   | Hardcoded `MONGO_USER=admin` and `MONGO_PASSWORD=admin` in `app` service override env_file values                                           | Fixed                                                                     |
| F-003 | P1       | Backend | `app/app.js`                                           | No security response headers (X-Content-Type-Options, X-Frame-Options, Referrer-Policy)                                                     | Fixed                                                                     |
| F-004 | P1       | Backend | `app/routes/adminRouter.js`                            | `new ObjectId(studyId/groupId)` without try/catch in `POST /notifications/schedule` produces 500 on malformed input                         | Fixed                                                                     |
| F-005 | P1       | Backend | `app/services/adminParticipantService.js`              | Plaintext participant password stored in MongoDB and returned in `POST /participants` response body                                         | **Backlog**                                                               |
| F-006 | P1       | Backend | `app/controllers/surveyController.js`                  | Full submission object (including user answers) logged to stdout — PII exposure                                                             | Fixed                                                                     |
| F-007 | P1       | Backend | `app/routes/surveyRouter.js`                           | `userId` and `demographicsCompleted` cookies set without `secure` or `sameSite` flags                                                       | Fixed                                                                     |
| F-008 | P1       | Backend | `app/routes/recommendationsRouter.js`                  | IDOR on `POST /:id/feedback` — any authenticated user could submit feedback on another user's recommendation                                | Fixed                                                                     |
| F-009 | P1       | Backend | `app/services/notificationService.js`                  | Failed notification dispatch silently marked as `sent: true` — notification never retried                                                   | Fixed                                                                     |
| F-010 | P1       | Python  | `API-service/llm_client.py`                            | No timeout on LLM HTTP calls — hung OpenAI call blocks asyncio worker indefinitely                                                          | Fixed                                                                     |
| F-011 | P1       | Python  | `API-service/routers/recommend.py`                     | Unbounded `goal`, `user_id`, `session_id` fields — inflates prompt size and cost                                                            | Fixed                                                                     |
| F-012 | P1       | Python  | `API-service/routers/classify_habit.py`                | Unbounded `sentence`, `language`, `user_id` fields                                                                                          | Fixed                                                                     |
| F-013 | P1       | Python  | `API-service/routers/classify_context.py`              | Unbounded `uuid`, `sentence`, `language` fields                                                                                             | Fixed                                                                     |
| F-014 | P1       | Python  | `API-service/routers/extract_habits.py`                | Unbounded `user_id`, `goal` fields                                                                                                          | Fixed                                                                     |
| F-015 | P1       | Python  | `API-service/routers/extract_profile.py`               | Unbounded `user_id`, `goal` fields                                                                                                          | Fixed                                                                     |
| F-016 | P1       | Python  | `API-service/routers/map_bcio.py`                      | Unbounded `uuid`; no per-phrase length limit on `context_phrases`                                                                           | Fixed                                                                     |
| F-017 | P1       | Python  | `API-service/routers/retrieve.py`                      | Unbounded `rag_query` field                                                                                                                 | Fixed                                                                     |
| F-018 | P1       | Python  | `API-service/routers/retrieve.py`                      | `filename` path parameter in `delete_kb` fed to `rglob()` without sanitization — path traversal                                             | Fixed                                                                     |
| F-019 | P1       | Python  | `API-service/routers/retrieve.py`                      | `category` form field used as directory path component without sanitization — path traversal                                                | Fixed                                                                     |
| F-020 | P1       | Python  | `API-service/routers/refine_translation.py`            | Unbounded `original`, `raw_translation`, `language` fields                                                                                  | Fixed                                                                     |
| F-021 | P1       | Python  | `API-service/routers/refine_translation_de.py`         | Unbounded `original`, `raw_translation` fields                                                                                              | Fixed                                                                     |
| F-022 | P1       | Python  | `API-service/main.py`                                  | No authentication on any endpoint — relies on Docker network isolation only                                                                 | **Backlog**                                                               |
| F-023 | P2       | Infra   | `docker-compose.yml`                                   | Five services (Fuseki, Mongo, Neo4j, Keycloak, mongo-express) use `:-admin` or known-string credential fallback defaults                    | Documented                                                                |
| F-024 | P2       | Infra   | `docker-compose.yml`                                   | Multiple dev-compose ports bound to `0.0.0.0` (Mongo, Neo4j, Keycloak, Redis, mongo-express)                                                | Documented                                                                |
| F-025 | P2       | Infra   | `docker-compose.yml`                                   | `backup` service mounts Docker socket without `:ro` flag                                                                                    | Documented                                                                |
| F-026 | P2       | Infra   | `docker-compose.yml`                                   | `libretranslate:latest` unpinned image tag                                                                                                  | Documented                                                                |
| F-027 | P2       | Infra   | `stack.env`                                            | Traefik dashboard hashed password committed to git; real domain, server IP, and admin email committed                                       | Documented                                                                |
| F-028 | P2       | Infra   | `docker-compose.prod.yml`                              | Neo4j ports 7474 and 7687 exposed on production compose                                                                                     | Documented                                                                |
| F-029 | P2       | Backend | `app/utils/config.js`                                  | `getDbHeader()` references `this.db.name` instead of `this.db.path` — silent undefined if called                                            | Documented                                                                |
| F-030 | P2       | Backend | `app/middleware/requestParser.js`                      | Stale "doesnt work need to fix" comment; body parser size limits not explicitly set                                                         | Documented                                                                |
| F-031 | P2       | Backend | `app/app.js`                                           | `/api/internal` router registered after `httpServer.listen()` — fragile ordering                                                            | Documented                                                                |
| F-032 | P2       | Backend | `app/utils/SparqlDatabase.js`                          | User-controlled `context.value` interpolated into SPARQL IRI — defended in practice by `LABEL_TYPE_MAP` but no explicit allowlist assertion | Documented                                                                |
| F-033 | P2       | Backend | `app/routes/adminRouter.js`                            | `PUT /settings/:key` allows arbitrary key insertion into `admin_settings` collection                                                        | Fixed                                                                     |
| F-034 | P2       | Backend | `app/routes/adminRouter.js`                            | `POST /studies/:id/codes` — `count` not validated as positive integer                                                                       | Fixed                                                                     |
| F-035 | P2       | Backend | `app/routes/adminRouter.js`                            | Multiple POST endpoints return 200 instead of 201                                                                                           | Backlog                                                                   |
| F-036 | P2       | Backend | `app/routes/adminRouter.js`                            | ~2050-line file with inline business logic; dynamic `import('mongodb')` inside route handler                                                | Partially fixed — split into admin sub-routers; root file still 505 lines |
| F-037 | P2       | Backend | `app/routes/questionnaireResponsesRouter.js`           | `POST /questionnaire-responses` returns `insertedId` — MongoDB internal ObjectId leaked                                                     | Backlog                                                                   |
| F-038 | P2       | Backend | `app/routes/recommendationsRouter.js`                  | IDOR guard has no `isPrivileged` bypass; `findOne` not scoped by `userId`                                                                   | Backlog                                                                   |
| F-039 | P2       | Backend | `app/tests/integration/recommendations.routes.test.js` | No negative IDOR regression test for F-008 fix                                                                                              | Backlog                                                                   |
| F-040 | P2       | Backend | `app/services/notificationService.js`                  | No concurrency guard on 60s cron — duplicate dispatch if loop exceeds 60s                                                                   | Fixed — Redis distributed lock with 55s TTL                               |
| F-041 | P2       | Backend | `app/services/notificationService.js`                  | Zero-delivery case (all tokens fail softly) not distinguished from successful dispatch                                                      | Backlog                                                                   |
| F-042 | P2       | Backend | `app/services/adminParticipantService.js`              | Plaintext password already tracked under F-005                                                                                              | (see F-005)                                                               |
| F-043 | P2       | Python  | `API-service/routers/*.py`                             | Prompt injection: user-controlled text interpolated into prompt templates without delimiters                                                | Documented                                                                |
| F-044 | P2       | Python  | `API-service/routers/*.py`                             | `_redis` / `_mongo_client` / `_openai_client` singletons duplicated across routers                                                          | Fixed — consolidated into `API-service/deps.py`                           |
| F-045 | P2       | Admin   | `admin/src/lib/auth.ts`                                | `session.accessToken` exposed to client via `useSession()` — visible in React DevTools                                                      | Documented                                                                |
| F-046 | P2       | Admin   | `admin/package.json`                                   | `next: "14.2.4"` — not latest patch; should be kept up-to-date                                                                              | Backlog                                                                   |
| F-047 | P2       | Flutter | `mobile/lib/screens/donate_screen.dart`                | WebView JS bridge (`SurveyComplete`) lacks `onNavigationRequest` origin guard                                                               | Backlog                                                                   |
| F-048 | P2       | Flutter | `mobile/lib/screens/profile_screen.dart`               | WebView JS bridge (`ProfileSurveyComplete`) lacks `onNavigationRequest` origin guard                                                        | Backlog                                                                   |
| F-049 | P2       | Flutter | `mobile/lib/screens/legal_document_screen.dart`        | API-supplied HTML injected into WebView; JS is disabled but raw HTML injection possible                                                     | Documented                                                                |
| F-050 | P2       | Flutter | `mobile/lib/router/redirect.dart`                      | Admin guard redirects unauthenticated users to `/` instead of `/onboarding/welcome`                                                         | Backlog                                                                   |

---

## 5. Backlog (Unfixed — Priority Order)

1. **[P2] SPARQL IRI injection defence-in-depth** (F-032) — add an explicit allowlist assertion in `SparqlDatabase.js:_appendContext` / `_appendBehavior` even though `LABEL_TYPE_MAP` provides a practical guard today.

2. **[P2] Recommendations IDOR hardening** (F-038) — scope `findOne({ recommendation_id, userId })` so 404 masks IDOR attempts; decide whether to add `isPrivileged` bypass; add IDOR regression test (F-039).

3. **[P2] Flutter WebView origin guard** (F-047, F-048) — add `NavigationDelegate.onNavigationRequest` to block navigation outside of `AppConfig.apiBaseUrl` in `donate_screen.dart` and `profile_screen.dart`.

4. **[P2] `adminRouter.js` further decomposition** (F-036) — root file still ~505 lines; extract remaining inline business logic to service layer.

**Previously backlogged, now fixed:** F-005 (bcrypt passwords), F-022 (Python auth via `auth.py`), F-033 (settings key allowlist in `adminStatsService.js`), F-034 (count validation in `studiesRouter.js`), F-040 (Redis cron lock), F-044 (consolidated into `deps.py`).

---

## 6. Recommended Next Steps

1. **Create a US for F-005 (plaintext password)** — this is the highest-risk unresolved item. The fix requires changing the participant creation flow, updating the token card generation pipeline, and migrating existing records.

2. **Harden the Python API service** (F-022) — add a shared-secret header check between the Node backend and the Python service; verify no port is exposed in prod compose.

3. **Add IDOR regression test** (F-039) — a single integration test asserting that `USER_B` receives 403 on `POST /:id/feedback` for `USER_A`'s recommendation. This prevents silent regression of F-008.

4. **Address Neo4j prod port exposure** (F-028) — remove host port bindings for ports 7474 and 7687 from `docker-compose.prod.yml`; route Neo4j Browser through Traefik if browser access is needed.

5. **Notification cron lock** (F-040) — implement a Redis-based distributed lock to prevent duplicate notification dispatch when a cron tick overruns 60 seconds.
