# Cross-Component Coherence Review — Health Habit Hub

**Reviewer:** Ralph (autonomous agent, team-lead / senior architect perspective)
**Date:** 2026-03-21
**Branch:** `ralph/hhh-platform-unified`
**Depends on:** US-131 (Flutter), US-132 (Backend), US-133 (Neo4j/Ontology), US-134 (CI/CD), US-135 (Infrastructure)

---

## Executive Overview

This review cross-references all five individual component reviews (Flutter, Node.js backend, Neo4j/ontology, CI/CD, and infrastructure) against each other and against the running codebase. It identifies integration seams and inconsistencies that only become visible when the full picture is assembled.

The system shows genuine architectural coherence in several areas — particularly in how auth roles flow from Keycloak through JWT to both the Flutter app and the backend, and in how language codes are passed end-to-end. However, three serious systemic issues emerge when the components are viewed together:

1. **A split graph schema** that causes the Flutter app to display data from a different pipeline than the one the backend writes to — stats are always 0, public habit lists are empty for new donations.
2. **Broken CI** means none of the quality improvements introduced in this branch have ever been automatically verified, including the Python API-service tests written expressly for that purpose.
3. **Error handling is silent at every layer** — the backend swallows errors without logging, and the Flutter app swallows the 500 responses it receives without surfacing them, creating an end-to-end black hole for production debugging.

---

## 1. API Contract Alignment

### What is aligned

- **Habit list shape:** Flutter `habit_node.dart:60–62` reads `displayText` and falls back to `original`. The backend `GET /api/v1/habits?lang=` produces exactly this shape — `uuid`, `original`, `language`, `translationEN`, `translationDE`, and the `displayText` convenience field when a `lang` parameter is supplied. The contract between the server and the Flutter `HabitNode.fromJson` is consistent.
- **`preferredLanguage` field:** The backend stores and returns `preferredLanguage` in the `users` collection (`usersRouter.js:25,47`). Flutter `locale_provider.dart:46,74` reads and writes this field using the same key name. The PUT/GET round-trip is clean.
- **Questionnaire response format:** Flutter `questionnaire_service.dart` submits `{questionnaireSlug, answers}` and the backend `questionnaireResponsesRouter.js` accepts the same shape. No mismatch observed.

### Cross-cutting issues

**[Critical] `donate_screen.dart:26` hard-codes the production API URL, bypassing `AppConfig`.**

```dart
// donate_screen.dart:26 — bypasses AppConfig.apiBaseUrl
static const _baseUrl = 'https://api.hhh.tu-dresden.de/api/v1';
```

This means the donation WebView in the Flutter app always talks to the production backend regardless of the `--dart-define=API_BASE_URL` build flag. In staging or local development, every donation attempt silently hits production. Found in Flutter review (C-3 / S-1).

**[Critical] Stats and public habit list expose zero habits from the new donation pipeline.**

The Flutter explore screen (`explore_screen.dart`) calls `GET /api/v1/habits/public` (old schema — queries `hhh__Habit`) and `GET /api/v1/habits/stats` (old schema — counts `hhh__Habit`). The donation pipeline (`POST /api/v1/habits/donate`) creates `Habit` nodes (new schema). These are two disjoint datasets in the same Neo4j database. Any user who donates a habit via the new pipeline will never see it appear in the public graph or the stats counter. Found in Neo4j review (C1) and Backend review section 3.

**[Major] `translationEN`/`translationDE` fields are returned by `GET /api/v1/habits` but are never consumed by Flutter.**

The `HabitNode` model only reads `displayText` (the server-resolved convenience field). If the client ever needs to switch language display locally (without a round-trip), it cannot — it does not retain the raw translation values. The server-resolved `displayText` approach is simpler but means a locale change requires a fresh API call. This is a product decision gap that should be explicitly documented rather than left implicit.

**[Minor] `GET /api/v1/questionnaire-responses/me` returns raw MongoDB documents including `_id`.**

`questionnaireResponsesRouter.js:128` returns the document without stripping `_id`. Flutter's `QuestionnaireService` does not attempt to parse this field, so there is no runtime crash, but the Flutter model and the server response contract are informally mismatched (the server sends a field the client ignores silently).

---

## 2. Auth Flow End-to-End

### What is aligned

- **Role claim path is consistent.** All three clients extract roles from the same JWT claim: Flutter `auth_provider.dart:47` reads `realm_access.roles`; the Node.js backend `requireRole.js` reads `req.user.realm_access.roles`; and the Next.js admin panel `auth.ts` extracts `profile.realm_access.roles` in the NextAuth JWT callback. There is zero ambiguity about where roles live.
- **PKCE flow implementation.** Flutter `auth_service.dart` implements PKCE correctly, using `flutter_secure_storage` for token storage. Keycloak is configured with the `hhh` realm and two clients (`hhh-mobile` for Flutter PKCE, `hhh-admin` confidential for the admin panel).
- **WebSocket auth.** `recommendationWs.js` requires a JWT within 5 seconds of the WebSocket upgrade, terminating unauthenticated sockets — consistent with the HTTP auth model.

### Cross-cutting issues

**[Critical] Backend does not validate JWT `aud` or `iss` — any Keycloak realm's token is accepted.**

`app/middleware/auth.js:80–95` verifies the JWT signature and expiry but does not check `payload.aud` or `payload.iss`. A valid JWT from any other Keycloak realm on the same server would be accepted by the backend. The Flutter PKCE flow issues tokens for the `hhh` realm only, so in normal operation this is not exploited — but it is a security boundary gap. Found in Backend review (Critical #2).

**[Major] Rate limiter runs before authentication — per-user limits are never enforced.**

`v1Router.js:128–132` applies the rate limiter before `authenticate` runs. The `rateLimiter.js` key generator tries `req.user?.sub`, but `req.user` is undefined at that point. All requests fall back to IP-based rate limiting. The Flutter app can therefore submit unlimited donations per user (per IP). Found in Backend review (Critical #1).

**[Major] Flutter route guards only protect `/admin/*` — `/donate`, `/profile`, and `/questionnaire/:slug` are accessible unauthenticated.**

`main.dart:44–69` only guards admin routes. An unauthenticated deep link to `/donate` renders the screen, which then calls the backend and receives a 401. The user sees an opaque error (due to Q-1 silent catch) rather than a redirect to login. The backend correctly rejects the request; the gap is purely UX but affects the integration seam between Flutter routing and the backend auth requirement. Found in Flutter review (M-11 / A-1).

**[Minor] JWT decoded without signature validation in Flutter, used for access control decisions.**

`auth_provider.dart:20–52` base64-decodes the JWT to extract roles, which drive the admin tab visibility in `shell_screen.dart:33`. This is a client-side access control boundary, not a security boundary (the backend enforces roles), but the assumption is implicit and undocumented. Found in Flutter review (N-6 / S-2).

---

## 3. Language/Locale Consistency

### What is aligned

- **Locale codes `'en'` / `'de'` are used consistently.** Flutter `SUPPORTED_LANGUAGES` (`usersRouter.js:3`) and Flutter `locale_provider.dart` all use the same two-character ISO 639-1 lowercase codes. LibreTranslate calls (`habitsRouter.js:59–60,129`) use `source: 'en'` and `target: 'de'` — the same codes. There is no `en-US` / `EN` / `de-DE` mismatch in the live code paths.
- **Backend language skip logic is permissive.** `habitsRouter.js:49` uses `language.startsWith('en')` rather than `language === 'en'`. This allows `'en-GB'`, `'en-AU'` etc. to skip translation, which is the correct behaviour for variants.
- **`?lang=en|de` query parameter for habit list.** The Flutter `HabitService` passes the locale code directly as `?lang=`, matching the server's expected values exactly.

### Cross-cutting issues

**[Major] Three Flutter screens still display hard-coded English strings to German users.**

- `goal_input_screen.dart:46`: `'What health goal would you like to work on?'`
- `stats_screen.dart:72`: `'Failed to load stats'`
- `questionnaire_screen.dart:39`: `'Failed to load questionnaire.'`

These strings have no ARB counterparts. German users running the app in `de` locale see English text. Found in Flutter review (M-9 / I-1).

**[Major] Ontology `hhh:language` has an invalid range declaration.**

`Ontology.ttl:72` and `fuseki/init/schema.ttl:49–53` declare `hhh:language` with `rdfs:range rdf:langString`. The actual stored values are plain strings (`"en"^^xsd:string`). The OWL range declaration is incorrect. This does not affect runtime behaviour of the Node.js/Flutter stack, but any OWL reasoner or ontology validation tool will flag a range violation. Found in Neo4j review (Critical C2 / Major M3).

**[Minor] `translateToGerman()` only translates habits where `language.startsWith('en')`.**

A French user donating a French habit (`language: 'fr'`) will have `translationDE = null` — there is no French→German path. The translation pipeline is documented as English-origin only. This is a product scope decision but is undocumented anywhere in the codebase; German-language displays for third-language habits will silently fall back to the original foreign text.

---

## 4. Error Message Consistency

### What is aligned

All v1 API routes (`habitsRouter.js`, `questionnairesRouter.js`, `usersRouter.js`, `profileRouter.js`, `kbRouter.js`, `recommendationsRouter.js`) use a consistent `{ error: '...' }` JSON shape with appropriate HTTP status codes. The v1 API presents a uniform error interface.

### Cross-cutting issues

**[Critical] Flutter silently discards all error responses — the consistent backend error shape is never surfaced.**

The `{ error: '...' }` shape from the backend is never parsed or displayed in any Flutter service class. All catch blocks use `catch (_) { return null; }` or `catch (_) { return []; }`. The user sees no error message at all for network failures, 401s, 400 validation errors, or 500 server errors. Found in Flutter review (C-1 / Q-1, E-1).

**[Major] Legacy controllers use a different error shape from v1 API routes.**

`surveyController.js:51` returns `{ status: 'error', message: err.message }`. The v1 routes return `{ error: '...' }`. The legacy donate controller (`donateController.js:121`) returns `{ error: 'Fehler beim Speichern der Daten.' }` — both a different shape from v1 and in German. `contactController.js:42` also returns a German error. If Flutter ever calls these legacy routes (it currently does not), error handling would be entirely inconsistent. Found in Backend review (API Design section).

**[Major] Silent `catch {}` in the backend swallows errors with no logging.**

30+ catch blocks across the v1 routers log nothing before returning `500 Internal Server Error`. When the Flutter silent catch receives this 500, the error disappears completely with no trace in any system. The combination of silent-catch on both sides creates a complete production debugging blackout. Found in Backend review (Critical #3, Major #4).

---

## 5. Test Strategy Coherence

### What is coherent

- **Backend test architecture is strong.** 30 test files (13 unit + 17 integration), real JWT crypto, factory-injected dependencies, and mock MongoDB that simulates the real driver. The integration tests run against real Neo4j and MongoDB service containers in CI.
- **Flutter widget tests cover the main UI paths.** 9 test files cover widget rendering. The existing tests are not broken.
- **Python API-service tests were written for this branch.** `API-service/tests/` contains tests for classify, map_bcio, and refine_translation endpoints — written in US-098, US-099, and US-114.

### Cross-cutting issues

**[Critical] Python API-service tests are never executed in CI.**

`API-service/tests/` contains `test_classify.py`, `test_map_bcio.py`, and `test_refine_translation.py`, but `ci.yml` has no Python test job. The full M1.1→M1.2→M1.3 donation pipeline (classify→map-bcio→refine-translation) has zero automated verification. Found in CI review (CV1).

**[Critical] All GitHub Actions jobs fail before running any code.**

`ci.yml` references `actions/checkout@v6`, `actions/setup-node@v6`, and `actions/upload-artifact@v6` — none of which exist (latest stable is `@v4`). Every CI job fails at action resolution. The entire CI pipeline has been non-functional for the duration of this branch. Found in CI review (C1, C2, C3).

**[Major] Flutter has zero service-layer tests.**

`auth_service.dart`, `recommendation_ws_service.dart`, `survey_service.dart`, `habit_service.dart`, and `admin_service.dart` have no unit tests. The token-refresh path, WebSocket reconnection, and the PKCE flow are entirely untested. The backend's donation pipeline is tested end-to-end, but the Flutter path that triggers it has no coverage. Found in Flutter review (C-2 / T-1).

**[Major] No end-to-end test crosses the Flutter→backend boundary.**

There is no test that runs the full path: Flutter app → POST /api/v1/habits/donate → Neo4j Habit node creation → GET /api/v1/habits → Flutter `HabitNode.fromJson`. This means the API contract alignment noted in section 1 has never been automatically verified. Found in Flutter review (T-3).

**[Major] Coverage is only measured for backend unit tests.**

`package.json:15` runs `c8` only over `tests/unit/**`. The integration tests, which cover the actual route factory and factory injection patterns, are excluded from the coverage metric. Real coverage is significantly higher than reported but the measurement is misleading. Found in Backend review (issue #22).

---

## 6. Naming Consistency Across Flutter / Backend / Neo4j

### What is consistent

| Field | Neo4j property | Backend JSON key | Flutter field | Status |
|-------|---------------|-----------------|---------------|--------|
| Habit identifier | `Habit.uuid` | `uuid` | `HabitNode.uuid` | ✅ Consistent |
| Habit text | `Habit.sentence` | `original` | `HabitNode.original` | ✅ Consistent (aliased at DB→API boundary) |
| Language code | `Habit.language` | `language` | Not in HabitNode model | ⚠ Flutter drops it |
| Display text | — (server computed) | `displayText` | `HabitNode.name` (from `displayText`) | ✅ Consistent |
| User preference | `users.preferredLanguage` | `preferredLanguage` | `locale_provider` reads/writes `preferredLanguage` | ✅ Consistent |
| User identifier | `Habit.userID` | JWT `sub` → `req.user.sub` | `authProvider` reads `sub` | ✅ Consistent |

### Cross-cutting naming issues

**[Major] Dual Neo4j schema creates two names for the same concept.**

Old schema: `hhh__Habit` (n10s-mapped RDF node). New schema: `Habit` (raw Cypher node). Both exist in the live database. Backend routes use them inconsistently:
- `/habits` (list) → queries `Habit`
- `/habits/public` → queries `hhh__Habit`
- `/habits/stats` → counts `hhh__Habit`
- `/habits/donate` → creates `Habit`

This is not just a naming issue — it is a data consistency issue that causes the stats and public list to be permanently wrong. Found in Neo4j review (Critical C1) and Backend review (section 3).

**[Major] `createdAt` vs `created_at` inconsistency across Neo4j and MongoDB.**

Neo4j Habit nodes store `created_at` (ISO string, `habitsRouter.js:600`). The MongoDB `participants` collection uses the MongoDB-native `createdAt` via the default `insertOne` timestamp. The legacy Neo4j donor path (`Neo4jDatabase.js`) uses `hhh:created_at` RDF property. Backend API responses mix both forms depending on collection. Flutter models use whatever name the server sends, so the inconsistency is invisible to the client until a field is accessed by name. Found in Backend review (Major section).

**[Minor] MongoDB collection names are implicit and undocumented.**

Collections used: `participants`, `surveys`, `survey_responses`, `habits`, `habit_annotations`, `recommendations`, `users`, `form_responses`, `questionnaires`. None of these names are declared in a central schema file or documented. Finding which collection a query hits requires reading each router. A `collections.js` constants file would make naming explicit.

---

## 7. What Is Coherent and Well-Integrated

1. **Keycloak role propagation is correct and consistent end-to-end.** `realm_access.roles` flows from Keycloak → Flutter JWT parse → GoRouter admin guard → backend `requireRole` → Next.js admin session. All three clients read the claim identically.

2. **The language preference round-trip works.** A user changing their locale in Flutter → `PUT /api/v1/users/me` → MongoDB store → `GET /api/v1/users/me` returns the preference → `GET /api/v1/habits?lang=` returns translated display text. The design is clean and the field names are consistent end-to-end.

3. **The factory injection pattern makes the backend fully testable.** Every router accepts injected `db`, `neo4jRun`, `apiServiceUrl`, and `libreTranslateUrl`. This architectural decision is consistently applied across all 8+ routers and is the primary reason the 30-test test suite is meaningful.

4. **Multi-stage Docker builds and non-root execution are applied consistently.** All custom images (`app/`, `admin/`, `API-service/`) use multi-stage builds with non-root users. This security posture is coherent across the infrastructure.

5. **WebSocket + polling fallback is architecturally sound.** The `recommendation_ws_service.dart` fallback to 30-second polling when WebSocket drops is a conscious resilience decision that mirrors the backend `recommendationWs.js` architecture. Both sides understand the fallback model.

6. **The `displayText` API convention cleanly abstracts translation.** Returning a server-resolved `displayText` rather than forcing the client to choose between `translationEN` and `translationDE` is a well-designed abstraction. Flutter and the backend are in agreement on this pattern.

---

## 8. Prioritised Cross-Cutting Improvements

### Critical (must be resolved before any user-facing release)

| # | Area | Finding | Impact |
|---|------|---------|--------|
| X-C1 | CI/CD | `actions/checkout@v6`, `actions/setup-node@v6`, `actions/upload-artifact@v6` all non-existent — CI completely broken | All quality checks unverified; any commit could ship broken code |
| X-C2 | Backend + Flutter | Silent `catch {}` on both sides creates a production debugging blackout | Errors invisible in all environments |
| X-C3 | Neo4j + Backend + Flutter | Dual Neo4j schema — `Habit` (donate) vs `hhh__Habit` (public/stats) — disjoint datasets | Stats always 0; explore graph never shows donated habits |
| X-C4 | Flutter | `donate_screen.dart:26` hard-codes production URL — staging/dev donations hit production | Dev/staging tests corrupt production data |
| X-C5 | Backend | JWT `aud`/`iss` not validated — tokens from any Keycloak realm accepted | Security boundary gap across all backend endpoints |
| X-C6 | CI/CD | Python API-service tests never run in CI despite existing in the repo | Full M1.1→M1.2→M1.3 donation pipeline unverified |

### Major (address within the next sprint)

| # | Area | Finding | Impact |
|---|------|---------|--------|
| X-M1 | Backend + Flutter | Rate limiter runs before auth; per-user limits never enforced | Unlimited donations per user; DoS risk |
| X-M2 | Flutter | Zero service-layer tests — auth, survey, habit, recommendation services untested | Token refresh, WebSocket, PKCE failures invisible |
| X-M3 | Flutter + Backend | No E2E test crossing Flutter→backend boundary | API contract never automatically verified |
| X-M4 | Backend + Flutter | Error shape consistent on server (`{ error }`) but Flutter never parses it | 400/500 errors show no actionable message to users |
| X-M5 | Flutter | Hard-coded English strings in 3 screens visible to German users | Core i18n promise broken |
| X-M6 | Backend | Neo4j driver created and destroyed per query in production (no connection pooling) | 200-500ms overhead per request; connection leak under load |
| X-M7 | Infrastructure | Keycloak uses `dev-file` DB in production — no clustering, no failover | Auth system vulnerable to disk hiccup or JVM crash |
| X-M8 | Backend | Rate limiter ordering: `req.user` is undefined when `keyGenerator` runs | All rate limits are IP-based, not user-based |
| X-M9 | Neo4j + Backend | No constraint on `Habit.uuid`, no index on `Context(text, dimension)` | Concurrent duplicate Habit nodes; O(n) MERGE scans |
| X-M10 | Infrastructure | `.env` with real credentials present in Git history | All production secrets must be rotated |

### Minor (schedule in backlog)

| # | Area | Finding | Impact |
|---|------|---------|--------|
| X-N1 | Flutter | JWT role extraction from unverified payload — admin tab visibility based on unsigned claim | Client-side access control gap (not a backend security gap) |
| X-N2 | Flutter + Backend | Language field (`Habit.language`) dropped in Flutter `HabitNode` model | Client cannot display original language metadata |
| X-N3 | Neo4j + Backend | `createdAt` vs `created_at` naming inconsistency across Neo4j and MongoDB | Date sorting and field access requires knowing collection |
| X-N4 | Backend | MongoDB collection names undocumented — implicit strings across 8+ routers | Navigation and maintenance burden |
| X-N5 | Backend | Coverage measured only for unit tests — integration test coverage invisible | Coverage metric misleadingly low |
| X-N6 | Flutter + Backend | `GET /api/v1/questionnaire-responses/me` returns `_id` field Flutter ignores | Informal contract mismatch; noise in API response |
| X-N7 | Ontology | `hhh:language` declared `rdf:langString` but stored as `xsd:string` | OWL range violation flagged by any reasoner |
| X-N8 | Infra + Backend | Neo4j n10s wildcard `procedures.unrestricted=n10s.*` allows external URL imports | Any authenticated Neo4j user can import arbitrary RDF |
| X-N9 | Infra | LibreTranslate `LT_REQ_LIMIT=0` in production — unlimited requests per IP | Translation service saturation risk |
| X-N10 | Infra + Backend | backup/restore.sh MongoDB path mismatch (`mongo/` vs `mongodb/`) | MongoDB silently skipped on every restore |
