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
| OF-06 | Backend | **Cypher label injection** in admin group-change route — dynamic label interpolation in admin router. Requires `admin` role but still a code smell. | Post-US-144 |
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
