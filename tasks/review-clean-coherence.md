# Cross-Component Clean Code Coherence Review

**Date:** 2026-03-21
**Stories covered:** US-162 (Flutter), US-163 (Backend), US-164 (Neo4j), US-165 (CI/CD)
**Input files:** `review-flutter-clean.md`, `review-backend-clean.md`, `review-neo4j-clean.md`, `review-infra-clean.md`

---

## 1. Cross-Cutting Smell Patterns (3+ Components)

### Pattern A — Hardcoded Configuration / Magic Values
**Components:** Flutter · Backend · Neo4j · CI/CD (all four)

| Component | Example | Reference |
|---|---|---|
| Flutter | Hardcoded production API URL in `profile_screen.dart:28` | C-1 |
| Backend | `SUPPORTED_LANGUAGES` array allocated inside handler | BK-m1 (lines 476–487) |
| Neo4j | RDF namespace URI `http://example.com/hhh#` inline 20+ times | C2 |
| CI/CD | `NEO4J_PASSWORD: password` hardcoded in 2 YAML locations | CI-m6 |

**Impact:** Configuration drift, environment-specific bugs, brittle tests. Any deploy-time change requires code edits across multiple layers.

---

### Pattern B — Code Duplication (Identical/Near-Identical Functions)
**Components:** Flutter · Backend · Neo4j · CI/CD (all four)

| Component | What is duplicated | Count |
|---|---|---|
| Flutter | `_authHeaders()` across 6 service files | ×6 |
| Flutter | `_OfflineBanner` private widget | ×2 screens |
| Backend | `getDb()` factory in route files | ×8 |
| Backend | JWKS caching/fetch logic in `auth.js` | ×2 functions |
| Backend | Keycloak admin token fetch | ×2 files |
| Neo4j | `translate()` function verbatim | ×2 database classes |
| Neo4j | Domain model classes (`ExperimentalSetting`, `Donor`, etc.) | ×2 files |
| CI/CD | Node.js setup steps in workflow YAML | ×4 jobs |
| CI/CD | Flutter setup steps in workflow YAML | ×3 jobs |
| CI/CD | `wait_healthy()` helper | ×4 deploy scripts |
| CI/CD | `parseCypherStatements()` function | ×2 JS files |

**Impact:** A single logic change (e.g., adding an auth header) requires touching 6–8 files. Drift accumulates silently — role strings get renamed in some files but not others; auth headers evolve differently per service.

---

### Pattern C — Silent Error Swallowing / Missing Logging
**Components:** Flutter · Backend · Neo4j

| Component | Location | Example |
|---|---|---|
| Flutter | `explore_screen.dart`, `recommend_screen.dart`, `admin_habits_screen.dart` | Empty `catch (_) {}` — M-9 |
| Backend | `usersRouter.js`, `profileRouter.js` | `catch (_err)` with no log — BK-M6 |
| Backend | Redis error event | Empty error handler — BK-M8 |
| Neo4j | `_importTurtle` | Non-OK HTTP status silently ignored — m3 |

**Impact:** Production debugging relies on user complaints. Errors vanish without trace. Incident response cannot distinguish "never reached" from "failed silently."

---

### Pattern D — God Functions / God Classes (SRP Violations)
**Components:** Flutter · Backend · Neo4j

| Component | Symbol | Size |
|---|---|---|
| Flutter | `AdminParticipantsScreen` | 661 lines — C-2 |
| Flutter | `AdminHabitsScreen` | 500 lines — C-3 |
| Flutter | `AdminService` | 16 methods across 6 domains — M-8 |
| Backend | `POST /habits/donate` handler | 143 lines — BK-C1 |
| Backend | Keycloak client factory | 88 lines, 5 methods, each fetching a fresh token — BK-M3 |
| Neo4j | `_buildDonationTurtle` | 149 lines — M1 |

**Impact:** These units are practically untestable. Changing one concern risks breaking others. Reviewers cannot reason about the code within one screen height.

---

### Pattern E — Deep Nesting / Long Methods
**Components:** Flutter · Backend · Neo4j

| Component | Method | Lines | Max Depth |
|---|---|---|---|
| Flutter | `_showNodeDetail()` | 118 | 5+ |
| Flutter | `_initSurvey()` | 52 | 4 |
| Backend | `translate()` | 80 | 4 |
| Backend | `getParticipantProgress` | 80 | 3 |
| Neo4j | `_buildDonationTurtle` | 149 | 3+ |

**Impact:** Cognitive overload. Methods exceed "fit on one screen" rule. Deep nesting hides control flow and makes extraction of testable units difficult.

---

### Pattern F — Inline Queries / Raw Strings in Route/Service Layer
**Components:** Backend · Neo4j · CI/CD

| Component | Example |
|---|---|
| Backend | 4+ inline Cypher strings in `habitsRouter.js` — BK-C3 |
| Neo4j | Inline Cypher in `adminParticipantService.js` and `adminStatsService.js` — M6 |
| CI/CD | 65-line Python + Bash block embedded in `ci.yml` YAML — CI-M5 |

**Impact:** Data access logic couples to the business layer. Queries cannot be reused. Auditing for injection vulnerabilities requires reading router files instead of a query layer.

---

## 2. Naming Inconsistencies Across Layers

| Inconsistency | Locations | Impact |
|---|---|---|
| Auth headers | Flutter: `_authHeaders()` · Backend: implicit in router closures · Neo4j: none | Cannot share; renaming token header requires 6+ edits |
| Role strings | Backend: `'admin'`, `'researcher'`, `'participant'` duplicated across 3+ files | Role rename silently breaks some files |
| UUID generation | Backend: `crypto.randomUUID` · `donateRouter.js`: `uuid` (npm package) | Inconsistent dependency; hash variance possible |
| Timestamp format | Scripts: `date -u '+%Y-%m-%dT%H:%M:%SZ'` inline · `restore.sh`: `ts()` helper | Deploy logs have inconsistent timestamps |
| API URL access | Flutter: `AppConfig.apiBaseUrl` (correct) vs `profile_screen.dart:28` (hardcoded) | Same config accessed via two paths |
| Database class names | `Neo4jDbClient` vs `DbClient` (Fuseki) for the same abstraction concept | Confusing which class handles what |
| Service file naming | `adminParticipantService.js` exists; `habitDonationService.js` does not yet | Naming implies complete service layer but enforcement is inconsistent |

---

## 3. Most Impactful Single Refactoring

**Centralise `getDb()` in the backend and `_authHeaders()` in Flutter simultaneously.**

### Why these two are #1:

1. **Scope multiplier**: `getDb()` affects 8 backend route files. `_authHeaders()` affects 6 Flutter service files. Combined, one PR touches 14 call sites.
2. **Pure extraction — zero behaviour change**: Each instance is already identical; extraction introduces no new logic.
3. **Unblocks testability**: Once `getDb()` is a shared factory, unit tests can inject a mock database without modifying router files. This unblocks the god handler refactoring (Pattern D above).
4. **Stops ongoing drift**: Every new route or service added before this fix copies the pattern again. Fixing it now caps the duplication.

### Concrete actions:

**Backend** — create `app/db/getDb.js`:
```js
// app/db/getDb.js
import { getDatabase } from '../models/database.js';
let _db;
export const getDb = () => (_db ??= getDatabase());
```
Import in all 8 routers. Delete 8 local copies.

**Flutter** — create `lib/services/auth_headers_mixin.dart`:
```dart
mixin AuthHeadersMixin {
  String get _accessToken; // implemented by host class
  Map<String, String> authHeaders() => {
    'Authorization': 'Bearer $_accessToken',
    'Content-Type': 'application/json',
  };
}
```
Apply to all 6 service classes. Delete 6 local `_authHeaders()` copies.

**Effort:** 2–3 hours. **Risk:** Low. **Tests required:** existing unit + integration suite.

---

## 4. Recommended Fix Order (Max Improvement / Min Risk)

### Phase 1 — Critical Bugs & Zero-Risk Quick Wins (1 week)

| # | Component | Finding | Effort | Risk |
|---|---|---|---|---|
| 1 | CI/CD | `actions/checkout@v6` → `@v4` (breaks release job) | 5 min | None |
| 2 | CI/CD | `docker-compose` → `docker compose` in 3 deploy scripts | 10 min | None |
| 3 | CI/CD | Keycloak token: `grep\|cut` → `jq -r '.access_token'` | 15 min | None |
| 4 | Flutter | `profile_screen.dart:28` hardcoded URL → `AppConfig.apiBaseUrl` | 15 min | None |
| 5 | Neo4j | Group assignment bug: add `()` to 3 method references in SparqlDatabase.js | 5 min | None |
| 6 | Backend | Remove debug `console.log` in `app.js` (lines 107–172) and `donateRouter.js:35–45` | 10 min | None |
| 7 | Backend | Add `console.error` to 4 silent `catch` blocks in usersRouter + profileRouter | 15 min | None |
| 8 | Backend | Remove dead `/submit-form` route with `console.log(req.body)` | 5 min | None |

**Total Phase 1:** ~80 min, fixes 3 prod-breaking bugs (CI, Docker, data corruption) and removes a secret-leaking debug log.

---

### Phase 2 — Strategic Deduplication (2–3 weeks)

| # | Component | Finding | Effort | Risk |
|---|---|---|---|---|
| 9 | Backend | Extract shared `getDb()` → used in 8 routers | 1–2 hrs | Low |
| 10 | Flutter | Extract `AuthHeadersMixin` → used in 6 services | 1 hr | Low |
| 11 | Neo4j | Extract shared `translateText()` utility → used in both DB classes | 1 hr | Low |
| 12 | Neo4j | Move domain models to `app/models/donation.js` | 1.5 hrs | Low |
| 13 | Backend | Deduplicate JWKS caching in `auth.js` (compose `createAuthMiddleware` from `createTokenVerifier`) | 1 hr | Medium |
| 14 | Backend | Extract `keycloakAdminClient.js` with token cache | 1.5 hrs | Medium |
| 15 | CI/CD | Extract `scripts/lib/common.sh` (`wait_healthy`, `run`, `ts`) | 1.5 hrs | Low |
| 16 | CI/CD | Extract `scripts/lib/cypher-utils.mjs` (`parseCypherStatements`) | 45 min | Low |

**Total Phase 2:** ~11 hrs, eliminates ~1,000 duplicate LOC, aligns naming across layers.

---

### Phase 3 — SRP & Long Method Refactoring (3–4 weeks)

| # | Component | Finding | Effort | Risk |
|---|---|---|---|---|
| 17 | Backend | Split `translate()` into `fetchLibreTranslation()` + `refineLLMTranslation()` | 2 hrs | Medium |
| 18 | Neo4j | Extract 6 private methods from `_buildDonationTurtle` | 2.5 hrs | Medium |
| 19 | Backend | Extract `habitDonationService.js` from 143-line POST /donate handler | 2 hrs | High |
| 20 | Flutter | Split `AdminService` (16 methods) into domain-specific services | 3 hrs | Medium-High |
| 21 | Flutter | Refactor `AdminParticipantsScreen` (661 lines) → pagination notifier + dialogs | 3 hrs | Medium-High |
| 22 | Flutter | Refactor `AdminHabitsScreen` (500 lines) → filter notifier + feed manager | 2.5 hrs | Medium-High |
| 23 | Backend | Move all inline Cypher to `habitQueryService.js` (after BK-C1 done) | 2 hrs | Medium |

**Total Phase 3:** ~17 hrs, makes all major god objects independently testable.

---

### Phase 4 — Configuration Centralisation (1–2 weeks)

| # | Component | Finding | Effort |
|---|---|---|---|
| 24 | Backend | Move `SUPPORTED_LANGUAGES`, `DIMENSIONS` constants to `app/constants/habits.js` | 1 hr |
| 25 | Backend | Replace `uuid` npm import with `crypto.randomUUID` | 15 min |
| 26 | CI/CD | Extract 65-line YAML Python block to `tests/ontology/setup.py` | 1 hr |
| 27 | CI/CD | Convert copy-pasted Node.js/Flutter setup steps to composite actions | 1.5 hrs |
| 28 | Flutter | Move all hardcoded UI strings to ARB files | 1 hr |
| 29 | Neo4j | Extract RDF namespace constant; memoize `iri()` helper | 30 min |

---

## Summary by Component

| Component | Critical | Major | Duplications | Est. Effort (full) |
|---|---|---|---|---|
| Flutter | 1 | 11 | 3 major | 8–10 hrs |
| Backend | 6 | 8 | 5 major | 10–12 hrs |
| Neo4j | 3 | 7 | 4 major | 6–8 hrs |
| CI/CD | 3 | 8 | 6 major | 4–6 hrs |
| **Total** | **13** | **34** | **18 major** | **28–36 hrs** |

---

## Resolution Notes (US-170 — 2026-03-22)

### Scripts — Shebang and set -euo pipefail
- `restore.sh` changed from `#!/bin/bash` → `#!/usr/bin/env bash` ✅
- All bash scripts (deploy-backend.sh, deploy-recommender.sh, deploy-keycloak.sh, deploy-full.sh, restore.sh) already had `set -euo pipefail` ✅
- All node scripts (add-mongo-validators.js, backfill-de-translations.js, generate-spec.js, migrate-habits-bcio.js, run-migration.js, seed-local.js, version-check.js) already had `#!/usr/bin/env node` ✅
- `generate-spec.js` wrapped in try/catch with `process.exit(1)` on error ✅

### Dead Code Removed
- `generate-spec.js`: Removed dead 44-line `toYaml()` function (js-yaml was imported and used instead) ✅

### Naming Inconsistencies Resolved
- **UUID generation**: Replaced `import { v4 as uuid } from 'uuid'` with `import { randomUUID } from 'node:crypto'` in `app/utils/Neo4jDatabase.js` and `app/routes/surveyRouter.js` ✅
- **Database class names**: Renamed `DbClient` → `SparqlDbClient` in `app/utils/SparqlDatabase.js`, `app/controllers/donateController.js`, `app/tests/SparqlDatabase.test.js`, `app/tests/FusekiDatabase.integration.test.js` ✅
- **Timestamp format**: Updated `restore.sh` from local-time `date +'%Y-%m-%d %H:%M:%S'` to UTC ISO `date -u '+%Y-%m-%dT%H:%M:%SZ'` to match all other scripts ✅
- **Profile URL**: Already resolved in US-167 ✅

### Deploy Scripts — docker-compose → docker compose (Docker v2 CLI)
- `deploy-backend.sh`: `docker-compose` → `docker compose` ✅
- `deploy-recommender.sh`: `docker-compose` → `docker compose` ✅
- `deploy-keycloak.sh`: `docker-compose` → `docker compose` + token extraction `grep|cut` → `jq -r '.access_token'` ✅

### Deploy Orchestrator — Wrong Health Check URLs Fixed
- `deploy-full.sh`: After Keycloak deploy now polls `${KEYCLOAK_HEALTH_URL:-http://localhost:8080/health/ready}` instead of backend URL ✅
- After Recommender deploy: health check removed (recommender has no public health endpoint) ✅

### CI — Checkout Version Fixed
- `deploy.yml`: `actions/checkout@v6` → `actions/checkout@v4` ✅

### CI — Composite Actions Extracted
- Created `.github/actions/setup-node-app/action.yml`: parameterized `working-directory` input (default: `app`), replaces 3 copy-pasted steps (checkout@v4 + setup-node@v4 + npm ci) across 5 jobs ✅
- Created `.github/actions/setup-flutter/action.yml`: replaces 3 copy-pasted steps (checkout@v4 + flutter-action@v2 + flutter pub get) across 3 jobs ✅
- Updated `ci.yml`: jobs `backend-lint`, `backend-unit`, `backend-integration`, `backend-security`, `admin-build` now use `setup-node-app` composite action; jobs `flutter-analyze`, `flutter-test`, `flutter-build-web` now use `setup-flutter` composite action ✅

### Quality Checks
- `npm test`: 265/265 pass ✅
- `flutter analyze`: 0 issues ✅
- `npx eslint .`: 0 issues ✅

### Deferred (not in US-170 scope)
- Phase 2 deduplication (getDb, AuthHeadersMixin, translateText shared util): addressed in US-167/168/169
- Phase 3 SRP refactoring (god handlers, AdminService split): higher risk, deferred to future cycle
- Phase 4 config centralisation (SUPPORTED_LANGUAGES → constants.js): addressed in US-169

---

## Key Interdependencies

1. **Phase 1 must complete first** — fixes the three prod-breaking bugs (broken CI, Docker v1, group data corruption).
2. **`getDb()` dedup (Phase 2 #9) unblocks Phase 3** — centralised DB access makes it safe to inject mocks and split god handlers.
3. **Neo4j C3 (group bug) is the single highest-urgency fix** — it causes silent data corruption on every donation to a non-Group-1 participant.
4. **Backend BK-C4 + BK-C1 pairing** — extract `getDb()` first, then extract `habitDonationService.js`; the opposite order couples the new service to the old boilerplate.
5. **Flutter C-1 + M-7** — fix the hardcoded URL (C-1) first, then deduplicate `_authHeaders()` (M-7); both touch the same service files.
