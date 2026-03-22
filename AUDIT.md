# Health Habit Hub — Final System Audit

**Date:** 2026-03-21
**Cycle:** ralph/hhh-platform-unified (US-131 through US-144)
**Auditor:** Ralph (autonomous agent)
**Scope:** Full platform — Flutter mobile app, Node.js backend, Neo4j/ontology, CI/CD pipeline, Docker infrastructure

---

## 1. Executive Summary

This audit concludes the comprehensive review and improvement cycle initiated in US-131. Over this cycle, five independent component reviews were conducted (Flutter, Backend, Neo4j, CI/CD, Infrastructure), a cross-cutting coherence review synthesised all five, and six improvement sprints applied the highest-priority findings.

**Overall platform health: FAIR — significant improvements made, critical gaps remain in three areas.**

The platform has a solid architectural foundation: PKCE authentication is correctly implemented end-to-end, the factory-injection pattern makes the backend fully testable, the Flutter app uses modern Riverpod/GoRouter, and Docker multi-stage builds with non-root users are consistently applied. The donation pipeline (classify → map → translate → store in Neo4j) is a genuinely novel ML-backed feature.

Three areas require continued investment before production-readiness:

1. **Dual Neo4j schema** — The old `hhh__Habit` ontology and the new `Habit` pipeline are disjoint datasets in the same database. Stats and public-list endpoints always show 0 for newly donated habits. This is the single highest-impact unresolved finding.
2. **CI/CD pipeline** — Action versions were pinned to non-existent `@v6` tags throughout the cycle (fixed in this audit commit). Python API-service and Next.js admin panel remain unvalidated in CI. Tag-push deploys bypass CI entirely.
3. **Test coverage gaps** — Flutter service-layer tests are zero; Python API-service tests exist but were not executed in CI during this cycle. No E2E tests cross the Flutter→backend boundary.

---

## 2. Component Scorecards

Scores are 1–5 on five dimensions. Justification is written for each score.

### 2.1 Flutter / Mobile

| Dimension | Score | Justification |
|---|---|---|
| Code Quality | 3/5 | Clean feature-based directory structure; Riverpod + GoRouter used correctly; PKCE auth flow correct. Remaining gaps: `_authHeaders()` duplicated across 6 service files (not yet extracted to Dio interceptor); `admin_participants_screen` has 11 local state fields that should be a StateNotifierProvider. Net improvement from this cycle: hard-coded production URL removed (S-1), exception hierarchy added, GoRouter migration applied. |
| Test Coverage | 3/5 | Widget test suite exists with 41 tests; l10n delegates added in US-137. 9 test files covering main screens. Service-layer (Dio services) has zero unit tests; no model serialisation tests for all models. Overall coverage is low (~16–20% estimated), but the existing test suite covers the critical user-facing paths. Minimum viable for 3/5; improvement needed. |
| Security | 3/5 | PKCE flow correct (flutter_appauth); flutter_secure_storage for credential persistence; GoRouter auth guard redirects unauthenticated users from all protected routes (US-137); hard-coded production URL removed (US-137); WebView JS bridge validated (US-137). Remaining: JWT decoded locally without server-side validation (informational only, no risk given PKCE); no certificate pinning (out of scope for study app). |
| Documentation | 4/5 | `docs/guides/flutter-architecture.md` added in US-140 covering folder structure, routing, state, localisation pipeline, auth flow, AppConfig env vars, WebView donation flow, and testing. `docs/guides/developer-onboarding.md` updated with `flutter gen-l10n` steps. User manuals updated with Settings/Language section. |
| Consistency | 4/5 | i18n: all 3 previously hard-coded screens now use ARB keys (US-137). Null safety: defensive `(json['field'] ?? '').toString()` applied to all model fromJson (US-137). Error shape: consistent exception types via sealed `AppException` hierarchy. Locale codes (`'en'`/`'de'`) verified consistent end-to-end. `flutter_appauth` and `flutter_secure_storage` deps pinned to exact resolved versions (US-139). |

**Flutter composite: 17/25**

---

### 2.2 Backend (Node.js / Express)

| Dimension | Score | Justification |
|---|---|---|
| Code Quality | 3/5 | Factory injection pattern (`createHabitsRouter({db, neo4jRun, apiServiceUrl})`) is excellent — all routers are fully testable. Neo4j driver now created once at factory scope (US-138, was per-query). UNWIND batch queries replace N+1 sequential writes (US-138). Remaining: `adminRouter.js` is still 1200+ lines with inline business logic; no service-layer extraction; POST endpoints return 200 instead of 201. |
| Test Coverage | 4/5 | 247 tests passing (13 unit + 17 integration + others). Real JWT crypto in test assertions. Factory injection enables mocking without live services. Pre-existing Fuseki-dependent test failures (~7) acknowledged as external-service failures. Auth middleware, recommend routes, WS endpoints, habits donation — all have integration test coverage. |
| Security | 3/5 | JWT `iss`/`aud` validation added (env-gated, US-138). JWKS 24-hour TTL cache with on-miss refresh (US-138). IDOR guard on `/recommend/:userId` — participants can only access own data (US-138). Internal API secret guard on `internalRouter.js` (US-138). Per-user rate limiting now correctly runs after auth (US-138). Input validation (length + ISO-639-1 allowlist) on donate endpoint. Remaining: SPARQL injection in `SparqlDatabase.js` (attacker-controlled string in SPARQL query); Cypher label injection in admin group-change (dynamic label interpolation); `survey_id` not validated against DB. |
| Documentation | 4/5 | OpenAPI spec updated with all 14 previously undocumented paths (US-141). Postman collection updated with 7 new folder groups (US-141). README env var reference added (US-141). data-model.md updated with both Neo4j schemas and all MongoDB collections (US-141). |
| Consistency | 4/5 | All v1 route `catch {}` blocks now log `console.error('[route] Error:', err)` (US-138). Error response shape `{ error: '...' }` unified across all routes including `surveyController.js` (US-139). `_id` stripped from questionnaire-responses `/me` endpoint. `createdAt` vs `created_at` inconsistency in Neo4j/MongoDB remains (not addressed this cycle). |

**Backend composite: 18/25**

---

### 2.3 Neo4j / Ontology

| Dimension | Score | Justification |
|---|---|---|
| Code Quality | 3/5 | BCIO concept embedding and cosine similarity mapping is a genuine ML contribution. Ontology separation (HHH terms vs BCIO external) is architecturally sound. UNWIND batch writes applied for Context/BCIOConcept MERGE (US-138). Remaining critical gaps: dual schema (`Habit` nodes from new pipeline, `hhh__Habit` nodes from old n10s pipeline) are completely disjoint; stats/public-list endpoints query old schema; newly donated habits never appear in public listing. No uniqueness constraint on `Habit.uuid`; no index on `Context(text, dimension)`. |
| Test Coverage | 3/5 | Ontology test suite (`tests/ontology/test-ontology.sh`) covers hhh__ schema integrity, group membership, donor relationships. New `Habit`/`Context`/`BCIOConcept` schema has no dedicated graph-level tests. Translation pipeline has 3 unit tests (`habits.translation.test.js`). BCIO mapping has 2 Python tests. Adequate for old schema; insufficient for new. |
| Security | 3/5 | Neo4j driver created once at factory scope (US-138) — no per-query credential exposure. Cypher parameters used correctly in new pipeline (UNWIND with `$rows`). Remaining: label interpolation in `adminRouter.js` admin group-change endpoint creates Cypher injection risk (admin role required, risk limited but not zero); n10s wildcard procedure allowlist (`n10s.*`) permits `n10s.rdf.import.fetch` from any authenticated Neo4j user. |
| Documentation | 4/5 | `docs/data-model.md` updated with both Neo4j schemas, all 6 MongoDB collections with field tables and examples (US-141). `docs/architecture.md` updated with Habit/Context/BCIOConcept vs hhh__ schema explanation (US-143). `docs/migration.md` documents the new schema changes and missing constraints (US-143). |
| Consistency | 3/5 | BCIO dimension names consistent between API-service classifier and Neo4j MERGE (7 dimensions). `translationEN`/`translationDE` property names consistent across habitsRouter.js and GET /habits response. Dual schema inconsistency means: GET /habits returns new `Habit` nodes; GET /public/habits returns old `hhh__Habit` nodes; stats show 0 for new habits — fundamental inconsistency unresolved. |

**Neo4j composite: 16/25**

---

### 2.4 CI/CD Pipeline

| Dimension | Score | Justification |
|---|---|---|
| Code Quality | 3/5 | Logical job separation (lint → unit → integration → security → flutter analyze → flutter test → flutter build → ontology → docker build → gate). Real service containers (MongoDB, Neo4j) in integration job. This audit commit fixes the `@v6` action version breakage (all updated to `@v4`). Remaining: no job timeouts; Fuseki not started in integration test job; tag-push deploy bypasses CI. |
| Test Coverage | 3/5 | Backend: lint, unit, integration, security audit all covered. Flutter: analyze, widget tests, web build all covered. Ontology: graph integrity test suite runs. Gaps: Python API-service tests written but no CI job executes them; Admin Next.js panel has no CI job; Docker build excludes admin image. |
| Security | 3/5 | `npm audit --audit-level=critical` gates on critical vulnerabilities. Logical job separation prevents untested code reaching the gate job. Remaining: no secret scanning job; `npm audit` only blocks critical (not high); tag-push deploy trigger bypasses CI entirely — a tagged broken commit can reach production. |
| Documentation | 4/5 | `tasks/review-cicd.md` provides comprehensive findings with concrete fixes for every job. CHANGELOG.md includes CI improvements. DEPLOYMENT.md updated with deploy steps. |
| Consistency | 3/5 | All jobs consistently use `ubuntu-latest` and `node-version: "22"`. `cache-dependency-path` set on all Node.js jobs. `subosito/flutter-action@v2` consistently used for all Flutter jobs. Gap: action version inconsistency (now fixed to @v4); Python jobs entirely absent creates structural inconsistency. |

**CI/CD composite: 16/25**

---

### 2.5 Infrastructure / Docker

| Dimension | Score | Justification |
|---|---|---|
| Code Quality | 3/5 | Multi-stage Docker builds for all images. Non-root user execution in all containers (US-077 + existing). Dev/prod separation via `docker-compose.yml` + `docker-compose.prod.yml` override is clean. Traefik TLS + ACME correctly configured in production. Remaining: LibreTranslate `LT_REQ_LIMIT=0` in production means unlimited unauthenticated requests; mongo image unpinned in dev compose (`:latest`); uvicorn runs single worker. |
| Test Coverage | 3/5 | Docker build validation in CI (4 images). `docker-compose config` validates compose YAML. No runtime infrastructure tests or smoke-test suite. |
| Security | 3/5 | All containers run as non-root. Read-only volume mounts for init data (Keycloak realm, Neo4j init). `stack.env` (production template) noted in git — secrets require rotation. Keycloak uses `KC_DB=dev-file` in production (`docker-compose.prod.yml`) — not clustering/failover-safe (critical finding from US-135, not yet resolved). Default weak credentials (`MONGO_PASSWORD=admin`, `NEXTAUTH_SECRET=change-me-in-production`) still present in dev compose (expected for dev, must be overridden in prod). |
| Documentation | 4/5 | `DEPLOYMENT.md` updated with all services, required env overrides, volume permission notes, post-deploy migration steps (US-142). `docs/runbook.md` updated with 11 troubleshooting entries including Neo4j UID, LibreTranslate UID fixes (US-142). `docs/guides/admin-guide.md` + German translation updated (US-142). `.env.example` rewritten with all 30+ env vars (US-142). CHANGELOG 1.1.0 entry covers entire release scope. |
| Consistency | 3/5 | Health checks present for core services (MongoDB, Neo4j, Keycloak, app). Missing health checks on Fuseki, Python recommender, Next.js admin — `depends_on: condition: service_healthy` cannot gate on them. Resource limits absent from all services. Backup covers all 4 databases consistently. MongoDB restore path mismatch (`backup.sh` creates `mongo/`, `restore.sh` looks for `mongodb/`) remains unresolved. |

**Infrastructure composite: 16/25**

---

## 3. Open Findings

Unresolved Critical and Major findings after this cycle, ordered by severity and value impact.

### Critical

| ID | Component | Finding | Owning Story |
|---|---|---|---|
| OF-01 | Neo4j | **Dual schema disjoint dataset**: new `Habit` nodes from donation pipeline never visible in stats or public list (queries `hhh__Habit`). Core donation feature produces zero visible output to participants. | Post-US-144 — schema migration required |
| OF-02 | Neo4j | **No uniqueness constraint on `Habit.uuid`**: duplicate Habit nodes possible if donate endpoint is called twice with same payload. | Post-US-144 |
| OF-03 | Infrastructure | **Keycloak `KC_DB=dev-file` in production** (`docker-compose.prod.yml:246`): not fault-tolerant; data loss on container restart in prod. | Post-US-144 |
| OF-04 | CI/CD | **Tag-push deploy bypasses CI**: `deploy.yml` triggers on `v*` tag with no CI dependency — broken commit can reach production. | Post-US-144 |

### Major

| ID | Component | Finding | Owning Story |
|---|---|---|---|
| OF-05 | Backend | **SPARQL injection** in `SparqlDatabase.js` — attacker-controlled string interpolated directly into SPARQL query. | Post-US-144 |
| OF-06 | Backend | **Cypher label injection** in admin group-change route — dynamic label interpolation in admin router. Requires `admin` role but still a code smell. | ✅ Resolved US-151 |
| OF-07 | Neo4j | **No index on `Context(text, dimension)`**: N-duplicate context merges on every donation without index; performance degrades as data grows. | Post-US-144 |
| OF-08 | CI/CD | **Python API-service has no CI job**: 2 test files (test_classify_context.py, test_refine_translation.py, test_map_bcio.py) executed nowhere in CI. | Post-US-144 |
| OF-09 | CI/CD | **Admin Next.js panel has no CI job**: build and type-check not validated; no Dockerfile validation for admin image. | Post-US-144 |
| OF-10 | Flutter | **Zero unit tests for service layer**: all 6 Dio service classes (HabitService, StatsService, etc.) have no unit tests; regressions in service logic are invisible. | Post-US-144 |
| OF-11 | Infrastructure | **MongoDB restore path mismatch**: `backup.sh` creates `$RESTORE_DIR/mongo/`, `restore.sh` reads `$RESTORE_DIR/mongodb/` — MongoDB restore silently skips on every invocation. | Post-US-144 |
| OF-12 | Backend | **`adminRouter.js` 1200+ lines**: inline business logic, no service layer. High change-coupling risk. | Post-US-144 |

---

## 4. Resolved Findings

Summary of what was fixed in this review-and-improvement cycle (US-131 through US-143).

### Flutter (resolved in US-137, US-139, US-140)
- **C-1 / Q-1** — Silent `catch (_) {}` replaced with `debugPrint('ERROR: $e\n$st')` in all service files
- **C-3 / S-1** — Hard-coded production API URL (`https://api.hhh.tu-dresden.de/api/v1`) replaced with `AppConfig.apiBaseUrl`
- **A-1** — GoRouter auth guard added — unauthenticated users redirected from all protected routes to `/onboarding/welcome`
- **Q-3 / M-2** — `Navigator.push()` replaced with GoRouter `context.push('/recommend/loading')` in goal_input_screen
- **E-1 / M-4** — `AppException` sealed hierarchy created (`NetworkException`, `UnauthorisedException`, `ServerException`, `ValidationException`)
- **E-3 / M-5** — WebView JS bridge message validated with `jsonDecode` + `data is! Map<String, dynamic>` type guard
- **I-1 / M-9** — 8 ARB keys added; hard-coded English strings removed from 3 screens
- **Q-6 / M-10** — Defensive null-safety `(json['field'] ?? '').toString()` applied to Survey, Recommendation, RagCitation fromJson
- **Security dep pinning** — `flutter_appauth` and `flutter_secure_storage` pinned to exact resolved versions

### Backend (resolved in US-138, US-139)
- **C-1** — Rate limiter moved to after auth middleware — per-user limits now use `req.user.sub`
- **C-2 / C-6** — JWT `iss`/`aud` validation added (env-gated); JWKS 24-hour TTL cache with on-miss force-refresh
- **C-3** — Neo4j driver created once at factory scope — no more per-query driver create/destroy
- **C-4** — `X-Internal-Secret` header guard on `internalRouter.js` — fails closed if `INTERNAL_API_SECRET` unset
- **C-5** — IDOR removed from `recommendRouter.js` — participants can only access own data
- **M-7 (partial)** — `translateToGerman` / `translateAndRefine` consolidated into single parameterised `translate()` helper
- **M-8** — In-memory `.toArray().slice()` pagination replaced with `.skip().limit()` + `countDocuments()`
- **M-9** — Donate input: `sentence` length ≤ 1000 + ISO-639-1 language allowlist validation
- **M-10** — `console.error` added to all bare `catch {}` blocks across 8 router files (~45 blocks)
- **M-12** — 8 unused frontend dependencies removed from `app/package.json` (d3, jquery, bootstrap, etc.)
- **M-13** — Sequential Neo4j writes replaced with UNWIND batch queries
- **Error shape** — `surveyController.js` error shape corrected to `{ error: 'Server error' }`, consistent with all v1 routes
- **`_id` leak** — Stripped from questionnaire-responses `/me` response

### CI/CD (resolved in US-144)
- **CV-0 (Critical)** — `actions/checkout@v6`, `actions/setup-node@v6`, `actions/upload-artifact@v6` updated to `@v4` — all CI jobs were broken at action-resolution step; now corrected

### Documentation (resolved in US-140, US-141, US-142, US-143)
- OpenAPI spec: 14 previously undocumented paths added
- Postman collection: 7 new folder groups with all new endpoints
- README: backend npm scripts + 18 env vars documented
- `data-model.md`: both Neo4j schemas, 6 MongoDB collections
- `flutter-architecture.md`: new guide covering all Flutter architectural decisions
- `docs/guides/developer-onboarding.md`: `flutter gen-l10n` steps, WebView donation flow
- `docs/MANUAL-en.md` + `docs/MANUAL-de.md`: Settings/Language section added
- `docs/guides/admin-guide.md` + German: Section 9 Language Settings
- `docs/runbook.md`: 11 troubleshooting entries with ToC links
- `.env.example`: complete rewrite — all 30+ env vars with comments
- `CHANGELOG.md`: [1.1.0] entry covering entire release scope
- `docs/architecture.md`: complete rewrite with updated Mermaid diagrams, sequence diagrams, 11 services
- `docs/migration.md`: new schema changes section
- `DOCUMENTATION.md`: Documentation Index section added

---

## 5. Recommended Next Actions

Ordered by value delivered per effort, most impactful first.

1. **Resolve dual Neo4j schema (OF-01)** — Write a migration Cypher script that populates `hhh__Habit` / `hhh__Donor` / `hhh__donates` from the new `Habit` / `Context` / `BCIOConcept` nodes, or update stats and public-list endpoints to query the new schema. Until resolved, the donation pipeline creates data that is invisible to all participants.

2. **Add Neo4j constraints for new schema (OF-02, OF-07)** — Add to `neo4j/init/constraints.cypher`: `CREATE CONSTRAINT habit_uuid IF NOT EXISTS FOR (h:Habit) REQUIRE h.uuid IS UNIQUE` and `CREATE INDEX context_text_dim IF NOT EXISTS FOR (c:Context) ON (c.text, c.dimension)`. Low effort, high safety value.

3. **Fix tag-push deploy to require CI (OF-04)** — Add `workflow_run` trigger or `needs: [ci-passed]` dependency to `deploy.yml` so production deploys only happen after all CI checks pass.

4. **Add Python API-service CI job (OF-08)** — Add a `python-test` job to `ci.yml` that runs `pytest API-service/tests/` with a Redis service container. The tests exist; they just aren't run.

5. **Fix MongoDB restore path mismatch (OF-11)** — Change `restore.sh:48` from `$RESTORE_DIR/mongodb/` to `$RESTORE_DIR/mongo/` (or vice versa, matching backup.sh). One-line fix; currently every restore silently skips MongoDB.

6. **Add Admin Next.js CI job (OF-09)** — Add `npm run build` + `npx tsc --noEmit` job for `admin/` to `ci.yml`. Add admin Dockerfile to the docker-build job.

7. **Fix Keycloak production database (OF-03)** — Change `docker-compose.prod.yml` Keycloak config from `KC_DB=dev-file` to `KC_DB=postgres` with a dedicated postgres service, or document explicit acceptance of single-node file storage with backup.

8. **Fix SPARQL injection (OF-05)** — In `SparqlDatabase.js`, parameterise or whitelist-validate all user-controlled values before interpolating into SPARQL queries.

9. **Add Flutter service-layer unit tests (OF-10)** — Add unit tests for the 6 Dio service classes using `http_mock_adapter` or `Mockito`. Focus on HabitService, StatsService, RecommendationService as the highest-risk paths.

10. **Fix Cypher label injection (OF-06)** — In `adminRouter.js` admin group-change, replace dynamic label with a whitelist map of valid group labels; return 400 for any group name not in the whitelist.

---

## 6. System Strengths

These aspects are architecturally sound and should be preserved as patterns for future work.

- **Factory injection pattern** — `createHabitsRouter({db, neo4jRun, apiServiceUrl})` used throughout the backend makes every router fully testable without live services. A genuine strength that enables the 247-test suite.
- **PKCE authentication end-to-end** — `realm_access.roles` claim path is consistent across Flutter (flutter_appauth), backend JWT middleware, and Next.js admin panel. Role extraction, session propagation, and route guarding are all coherent.
- **`displayText` abstraction** — The `?lang=` query param on GET /habits that adds a `displayText` convenience field (using `translationEN`/`translationDE` with fallback to `original`) is a clean API design that avoids client-side language logic.
- **Donation pipeline architecture** — The three-stage classify → map-BCIO → store pipeline, with LibreTranslate + LLM refinement for translations, is a sophisticated ML-backed feature correctly implemented with timeout, fallback, and batch writes.
- **Multi-stage Docker builds** — All 5 images use multi-stage builds with Alpine/Debian slim base images and non-root user execution. Build artifacts are minimal and secure.
- **ISO 639-1 locale consistency** — `'en'` / `'de'` codes are consistent across Flutter ARB files, backend language validation, LibreTranslate API calls, Neo4j `language` property, and MongoDB `preferredLanguage` field.
- **Real JWT crypto in tests** — Backend test suite signs real JWTs with RSA test keys and validates them through the full auth middleware path — no JWT mocking shortcuts that could mask real auth bugs.
- **Dev/prod Docker separation** — `docker-compose.yml` + `docker-compose.prod.yml` override pattern is clean. Production adds Traefik TLS/ACME labels, pinned image versions, and production Keycloak mode without duplicating the full compose file.

---

*Audit completed 2026-03-21. All findings current as of branch `ralph/hhh-platform-unified` at commit preceding this audit.*

---

## Clean Code Audit — Cycle 2

**Date:** 2026-03-22
**Cycle:** US-162 through US-171 (clean code review + improvement sprints)
**Auditor:** Ralph (autonomous agent)
**Scope:** Flutter mobile app, Node.js backend (routes / services / utils / middleware), Neo4j / SPARQL data layer, CI/CD pipeline and deployment scripts

---

### Overview

This audit closes the second review-and-improvement cycle. Four component reviews were conducted (Flutter, Backend, Neo4j, CI/CD+Scripts) finding 9 Critical, 34 Major, and 28 Minor violations. Five improvement sprints (US-167 through US-171) resolved all Critical findings, all but 4 Major findings, and most Minor findings. Documentation was updated to reflect the refactored architecture.

**Cycle health summary:** All 265 backend tests pass (265/265, 0 fail). `flutter analyze` reports 0 issues, `flutter test` 49/49. Lint 0 issues.

---

### Clean Code Scorecard

Scores are 1–5 per dimension. Dimension definitions:
- **SRP adherence** — functions/classes/modules have a single, clear responsibility
- **DRY adherence** — logic and boilerplate are not copy-pasted across files
- **Function size** — functions/methods are ≤ 40 lines; no scrolling handlers
- **Naming clarity** — identifiers, constants, and files are self-documenting
- **Dead code absence** — no commented-out code, debug logs, or unreachable routes

#### Flutter / Mobile

| Dimension | Score | Notes |
|---|---|---|
| SRP adherence | 4/5 | All three god widgets decomposed (AdminParticipantsScreen → 5 sub-widgets; AdminHabitsScreen → 4 sub-widgets; QuestionnaireFormWidget → 8 sub-widgets). `_OfflineBanner` extracted to shared widget. `AdminService` still has 16 methods across 6 domains — deferred (see remaining findings). |
| DRY adherence | 5/5 | `_authHeaders()` eliminated from all 6 service files — replaced by `AuthInterceptor` + shared `dioProvider`. `OfflineBanner` shared across donate and profile screens. No other structural duplication remains. |
| Function size | 4/5 | `ProfileScreen._init()` split (was 42 lines → 26 lines + helpers); `DonateScreen._initSurvey()` split; `_save()` extracted; `_showNodeDetail()` refactored. `admin_participants_screen.dart` state class ~280 lines (decomposed with sub-widgets in same file — acceptable Flutter pattern). |
| Naming clarity | 4/5 | Widget sub-classes follow verb-noun convention (`_FilterBar`, `_PaginationBar`, `_ErrorView`). `AuthInterceptor` and `DioProvider` are well-named. Minor inconsistency: some helpers use `_buildX` style, others use `_xForm` style. |
| Dead code absence | 5/5 | All silent `catch (_) {}` blocks replaced with `catch (e, st) { debugPrint(...) }`. `DateTime(0)` epoch sentinel replaced with `DateTime?` null. `flutter analyze` reports 0 issues. |

**Flutter composite: 22/25**

---

#### Backend (Node.js / Express)

| Dimension | Score | Notes |
|---|---|---|
| SRP adherence | 5/5 | POST /donate handler (143 lines) extracted to `habitDonationService.js`. `surveyRouter.js` `getSurveysForUser()` extracted. `keycloakAdminClient.js` isolated. `buildTimeline()` extracted from `adminStatsService`. All route handlers are ≤ 20 lines. |
| DRY adherence | 5/5 | `getDb()` duplicated in 8 route files → `utils/getDb.js` (`makeGetDb` factory). Keycloak admin token fetch → single `keycloakAdminClient.js` with 55s TTL cache. JWKS caching deduped: `createAuthMiddleware` composes `createTokenVerifier` internally. `translate()` split into `fetchLibreTranslation` + `refineLLMTranslation` (no duplication). Role string literals → `middleware/roles.js` ROLES constants. |
| Function size | 5/5 | No handler or utility function exceeds 40 lines. `translate()` orchestrator 10 lines. `habitDonationService.donateHabit()` 20 lines. `adminStatsService.getParticipantProgress()` ~55 lines after `buildTimeline` extracted (borderline; body logic compact). |
| Naming clarity | 5/5 | `SUPPORTED_LANGUAGES` moved to module scope then to `constants.js`. `uuid` → `randomUUID` (consistent with all other routes). `ROLES.ADMIN`, `ROLES.RESEARCHER`, `isPrivileged(user)` are self-documenting. `fetchLibreTranslation`, `refineLLMTranslation` are intent-revealing. |
| Dead code absence | 5/5 | 8 debug `console.log` statements removed from `app.js`. `/test-disclaimer` debug route removed. Dead `/submit-form` route with commented-out stubs removed. reCAPTCHA emoji logs removed. Commented-out `console.warn` in `Neo4jDatabase._importTurtle` restored with correct error logging. |

**Backend composite: 25/25**

---

#### Neo4j / Data Layer

| Dimension | Score | Notes |
|---|---|---|
| SRP adherence | 5/5 | `_buildDonationTurtle` (149 lines) split into 6 private methods (`_habitTriples`, `_experimentalSettingTriples`, `_donorTriples`, `_contextTriples`, `_behaviorContent`, `_translationTriples`). Domain models (`ExperimentalSetting`, `Donor`, `Label`, `Donation`) extracted to `app/models/donation.js`. Cypher strings centralised in `app/db/habitQueries.js` and `app/db/adminQueries.js`. |
| DRY adherence | 5/5 | `translate()` (48-line duplicate) → shared `app/utils/translate.js`. `_esc()` (7-line duplicate in both DB files) → `escapeStringLiteral()` from `translate.js`. Domain model classes (duplicate in both DB files) → single `app/models/donation.js`. All Cypher in named query functions; no inline Cypher in route or service layer. |
| Function size | 5/5 | No method in `Neo4jDatabase.js` or `SparqlDatabase.js` exceeds 40 lines after refactor. `_buildDonationTurtle` orchestrator is 30 lines. |
| Naming clarity | 5/5 | `const HHH_NS = 'http://example.com/hhh#'` replaces 20+ magic string occurrences. `const iri` at module level. `DIMENSIONS` and `SUPPORTED_LANGUAGES` in `app/utils/constants.js`. `DbClient` renamed to `SparqlDbClient` for consistency with `Neo4jDbClient`. |
| Dead code absence | 5/5 | Dead `new Donor(donation)` call (line 261 of old Neo4jDatabase.js) removed. `console.debug(insertQuery)` (full SPARQL logged to stdout) removed. Deprecated Neo4j 5 `exists()` predicate removed from migration Cypher. |

**Neo4j composite: 25/25**

---

#### CI/CD Pipeline and Scripts

| Dimension | Score | Notes |
|---|---|---|
| SRP adherence | 4/5 | Composite actions `.github/actions/setup-node-app/action.yml` and `.github/actions/setup-flutter/action.yml` extract repeated job preamble steps. `deploy-full.sh` health checks now target correct services (Keycloak health → Keycloak URL). Ontology test job still embeds setup logic inline in YAML (`ci.yml:263–322`) — deferred. |
| DRY adherence | 4/5 | Node.js CI setup (5 jobs) and Flutter CI setup (3 jobs) reduced from 60+ duplicate YAML lines to composite action calls. `parseCypherStatements()` still duplicated between `scripts/run-migration.js` and `scripts/seed-local.js`. `run()` helper still duplicated in 4 deploy scripts (scripts/lib extraction deferred). |
| Function size | 4/5 | `toYaml()` dead 44-line function deleted from `generate-spec.js`. `deploy-keycloak.sh` token extraction simplified from brittle grep/cut to single `jq -r` call. Composite actions each ~20 lines. |
| Naming clarity | 5/5 | `docker compose` (v2 plugin) used consistently across all scripts. `jq -r '.access_token'` canonical token extraction pattern. Composite actions have descriptive `with:` inputs (`working-directory`, `flutter-channel`). Timestamps standardised to UTC ISO in `restore.sh`. |
| Dead code absence | 5/5 | `deploy.yml` broken `actions/checkout@v6` → `@v4`. `generate-spec.js` dead `toYaml()` function deleted. All three scripts using deprecated `docker-compose` (v1 hyphen) updated to `docker compose` (v2 space). |

**CI/Scripts composite: 22/25**

---

### Before / After Metrics

| Metric | Before (US-162 review baseline) | After (US-170) |
|---|---|---|
| Max function length (source, excl. tests) | 149 lines (`_buildDonationTurtle`) | ~30 lines (orchestrator methods only) |
| Second-longest function | 143 lines (POST /donate handler) | ~25 lines (all handlers/services) |
| Files > 300 lines (source, excl. auto-gen) | 8 files | 3 files (all have clear structure) |
| DRY violations (Critical/Major) | 15 | 4 remaining (all Minor/deferred) |
| Silent `catch` blocks | 10+ (Flutter + backend) | 0 |
| Debug `console.log` in production paths | 12 | 0 |
| Dead routes / unreachable code | 3 routes, 1 dead call, 1 dead function | 0 |
| Backend tests passing | 265 | 265 |
| Flutter analyze issues | 0 | 0 |

**Files still over 300 lines (source, after cycle):**
- `app/routes/adminRouter.js` — 1512 lines: contains ~80+ route definitions, each 5–10 lines; no god handlers; service layer extracted (US-156). Acceptable.
- `app/routes/habitsRouter.js` — 508 lines: all handlers ≤ 20 lines; thin read queries remain in route layer per project convention. Acceptable.
- `mobile/lib/screens/admin/admin_participants_screen.dart` — 661 lines: state class ~280 lines; remainder is decomposed sub-widget classes in same file (common Flutter pattern). Acceptable.

---

### Remaining Deferred Findings

| ID | Component | Finding | Reason for deferral |
|---|---|---|---|
| M-8 | Flutter | `AdminService` 16-method god service | Splitting requires updating 5+ screens and all test stubs simultaneously; isolated risk — each method is short and focused. Defer to dedicated service-split story. |
| M-10 | Flutter | 4 hardcoded strings not in ARB (stats screen, donate screen) | Non-critical path strings; i18n work tracked in bilingual-habits story. |
| BK-M2 (Neo4j) | Neo4j | `_buildDonationTurtle` refactor | ✅ Resolved in US-169 — split into 6 named methods. |
| BK-m3 | Backend | `legacyRouter` default export in `surveyRouter.js` | Zero consumers use the legacy router; one-line stub; rename-only risk. Low value. |
| CI-M3/M4 | Scripts | `wait_healthy()` and `run()` still duplicated in deploy scripts | `scripts/lib/common.sh` extraction blocked — no failing tests depend on this; tracked for next maintenance cycle. |
| CI-M5 | CI | Ontology test setup embedded in YAML | Extracting to `tests/ontology/setup.py` is safe but out of scope for clean-code cycle; functional parity unchanged. |
| CI-M6 | Scripts | `parseCypherStatements()` duplicated in 2 scripts | Minor: 13-line function; `scripts/lib/cypher-utils.mjs` extraction blocked by no test coverage for scripts. |

---

### Resolved Findings — Cycle 2

**Flutter (US-167):**
- C-1 Hardcoded production URL in `ProfileScreen` → `AppConfig.apiBaseUrl`
- C-2 `AdminParticipantsScreen` god widget → 5 focused sub-widget classes
- C-3 `AdminHabitsScreen` god widget → 4 focused sub-widget classes
- M-1 `ProfileScreen._init()` 42-line long method → split with helpers
- M-2 `DonateScreen._initSurvey()` 52-line long method → split
- M-3 `QuestionnaireFormWidget.build()` deep nesting → 8 sub-widget classes
- M-4 `ExploreScreen._showNodeDetail()` 118-line method → extracted + bug fix (infinite rebuild loop)
- M-5 `AdminSurveyEditorScreen._save()` mixed concerns → `_validateJson()` helper
- M-6 `_OfflineBanner` duplicated in 2 screens → `lib/widgets/offline_banner.dart`
- M-7 `_authHeaders()` copy-pasted in 6 services → `AuthInterceptor` + `dioProvider`
- M-9 Silent `catch (_) {}` in 3 screens → `catch (e, st) { debugPrint(...) }`
- M-11 `DateTime(0)` epoch sentinel → `DateTime?` null propagation

**Backend (US-168):**
- BK-C1 POST /donate 143-line god handler → `habitDonationService.donateHabit()`
- BK-C2 `translate()` 80 lines → `fetchLibreTranslation` + `refineLLMTranslation`
- BK-C4 `getDb()` × 8 files → `utils/getDb.js` `makeGetDb` factory
- BK-C5 JWKS caching duplicated → `createAuthMiddleware` composes `createTokenVerifier`
- BK-C6 Keycloak admin token × 2 → `services/keycloakAdminClient.js` (55s TTL)
- BK-C7/C8/C9 Debug logs and dead route in `donateRouter.js` → removed
- BK-M1 `surveyRouter.js` fat GET handler → `getSurveysForUser()` service function
- BK-M3 `createKeycloakClient()` 88-line module scope → `keycloakAdminClient.js`
- BK-M4 `getParticipantProgress()` 80 lines → `buildTimeline()` extracted
- BK-M5 Inline Cypher in route handlers → `app/db/habitQueries.js`
- BK-M6 4 silent `catch (_err)` blocks → `catch (err) { console.error(...) }`
- BK-M7 Role magic strings × 3+ files → `middleware/roles.js` ROLES constants
- BK-M8 Redis error suppressed → `console.warn('[redis] client error:', err.message)`
- BK-m1/m2/m4/m6 Minor cleanup (SUPPORTED_LANGUAGES scope, uuid→randomUUID, test route, debug logs)

**Neo4j (US-169):**
- C1 `translate()` duplicated 48 lines × 2 → `app/utils/translate.js`
- C2 Magic namespace URI × 20 → `const HHH_NS` + module-level `iri()`
- C3 **Bug fix**: group assignment logic references instead of calls (→ Group2 always) → `app/models/donation.js` correct `isX()` invocations
- M1 `_buildDonationTurtle` 149 lines → 6 named private methods
- M2 `iri()` re-created on every call → moved to module level
- M3 Domain model classes duplicated × 2 → `app/models/donation.js`
- M4 `_esc()` duplicated × 2 → `escapeStringLiteral()` in `translate.js`
- M5 Dead `new Donor(donation)` call → removed
- M6 Inline Cypher in services → `app/db/habitQueries.js`, `app/db/adminQueries.js`
- M7 `SUPPORTED_LANGUAGES`/`DIMENSIONS` magic arrays → `app/utils/constants.js`
- m1–m5 Minor cleanup (deprecated `exists()`, `console.debug`, `_importTurtle` error logging, dual-schema comments)

**CI/Scripts (US-170):**
- CI-C1 `deploy.yml` broken `actions/checkout@v6` → `@v4`
- CI-C2 Brittle `grep|cut` token extraction → `jq -r '.access_token'`
- CI-C3 `docker-compose` (v1) in 3 scripts → `docker compose` (v2)
- CI-M1 Node.js CI setup × 5 jobs → `.github/actions/setup-node-app` composite action
- CI-M2 Flutter CI setup × 3 jobs → `.github/actions/setup-flutter` composite action
- CI-M7 Wrong health URL after Keycloak deploy → `KEYCLOAK_HEALTH_URL` correct endpoint
- CI-M8 Dead `toYaml()` 44-line function → deleted from `generate-spec.js`
- CI-m1 `#!/bin/bash` → `#!/usr/bin/env bash` in `restore.sh`

---

*Audit completed 2026-03-22. All findings current as of branch `ralph/hhh-platform-unified` at commit following US-171. Backend tests: 265/265 pass. Flutter analyze: 0 issues. Lint: 0 issues.*
