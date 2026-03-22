# PRD: Audit Findings Fixes (OF-01 – OF-12)

## Introduction

Resolves all 4 Critical and 8 Major open findings from the system audit
(`AUDIT.md`, dated 2026-03-21).  The most impactful fix is the Neo4j dual-schema
problem (OF-01): all legacy `hhh__Habit` nodes are migrated into the new `Habit`
schema, with new fields left `null` where no source data exists, and the backend
endpoints that were still querying the old schema are updated to the new one.

Each story maps 1-to-1 to an open finding.  Stories are ordered by severity
(Critical first) then impact.

---

## Goals

- Zero Critical open findings after this cycle.
- Zero Major open findings after this cycle.
- Newly donated habits visible in public listing and stats for participants.
- Production deploy is gated on CI passing.
- SPARQL and Cypher injection risks eliminated.
- All CI jobs cover the full application surface (Python service, admin panel).
- `AUDIT.md` updated to mark all OF-xx as resolved.

---

## User Stories

---

### US-145: Neo4j — migrate legacy hhh__Habit nodes into the new Habit schema

**Description:** As a developer, I want all existing `hhh__Habit` nodes copied
into the new `Habit` schema so that historical donations are not lost and
endpoints can be unified on a single schema.

**Acceptance Criteria:**
- [ ] Migration script created at `scripts/migrate-hhh-habit-to-habit.cypher`.
- [ ] Script maps fields as follows (leave unmapped fields `null`):

  | Old property (`hhh__Habit`) | New property (`Habit`) |
  |---|---|
  | `hhh:id` or `uri` (last path segment) | `uuid` |
  | `hhh:value` | `value` |
  | `hhh:language` | `language` |
  | `hhh:habitStrength` | `habitStrength` |
  | *(not present)* | `translationEN` → `null` |
  | *(not present)* | `translationDE` → `null` |
  | *(not present)* | `bcioClass` → `null` |
  | *(not present)* | `dimension` → `null` |
  | *(not present)* | `confidence` → `null` |
  | *(not present)* | `createdAt` → `datetime()` at migration time |

- [ ] For each migrated `hhh__Habit`, the existing donor relationship is
  preserved: if `(d:hhh__Donor)-[:hhh__donates]->(h:hhh__Habit)` exists, create
  `(d)-[:DONATED]->(newHabit:Habit)`.  The `hhh__Donor` node is **not**
  removed.
- [ ] Script uses `MERGE` on `uuid` so it is fully idempotent — running it
  twice produces no duplicates.
- [ ] Script prints a summary line: `"Migrated X habits, skipped Y (already
  exist)"`.
- [ ] A companion Node.js runner `scripts/run-migration.js` executes the Cypher
  file against the configured Neo4j instance and logs the summary.
- [ ] `DEPLOYMENT.md` updated with a "Post-deploy migration" step that runs
  `node scripts/run-migration.js` once after first deploy of this branch.
- [ ] Running the script against a local Neo4j with seeded `hhh__Habit` data
  produces the correct `Habit` nodes (verified manually or via a test).

---

### US-146: Backend — update stats and public-list endpoints to query new Habit schema

**Description:** As a participant, I want the habit explore feed and stats to
show all donated habits including those migrated from the old schema, so the app
does not appear empty.

**Acceptance Criteria:**
- [ ] Identify every backend route that contains `MATCH (h:hhh__Habit)` or
  `MATCH (d:hhh__Donor)-[:hhh__donates]` — list them in a comment at the top
  of this story's PR.
- [ ] Each identified route updated to query `(h:Habit)` and
  `(d)-[:DONATED]->(h:Habit)` instead.
- [ ] `GET /api/v1/habits` (public list) returns both newly donated habits and
  migrated legacy habits.
- [ ] `GET /api/v1/stats` (habit count, donor count) reflects the merged dataset.
- [ ] Existing integration tests updated to seed `Habit` nodes (not `hhh__Habit`)
  and still pass.
- [ ] No route in the codebase still references `hhh__Habit` after this story
  (verified with `grep -r 'hhh__Habit' app/`).
- [ ] Lint passes.

---

### US-147: Neo4j — add uniqueness constraint on Habit.uuid and index on Context

**Description:** As a developer, I want Neo4j to enforce uniqueness on
`Habit.uuid` and index `Context(text, dimension)` so duplicate nodes are
impossible and context MERGE performance does not degrade as the dataset grows.

**Acceptance Criteria:**
- [ ] `neo4j/init/constraints.cypher` gains two new statements:
  ```cypher
  CREATE CONSTRAINT habit_uuid IF NOT EXISTS
    FOR (h:Habit) REQUIRE h.uuid IS UNIQUE;

  CREATE INDEX context_text_dim IF NOT EXISTS
    FOR (c:Context) ON (c.text, c.dimension);
  ```
- [ ] Statements are idempotent (`IF NOT EXISTS` guards present).
- [ ] Ontology test suite (`tests/ontology/test-ontology.sh`) still passes after
  the constraint file change.
- [ ] Verified locally: attempting to `CREATE (:Habit {uuid: 'duplicate'})` twice
  raises a constraint violation.

---

### US-148: Infrastructure — migrate Keycloak to PostgreSQL in production

**Description:** As an operator, I want Keycloak in production to use a
PostgreSQL database instead of the embedded dev-file store so user and realm data
survives container restarts and is backup-safe.

**Acceptance Criteria:**
- [ ] `docker-compose.prod.yml` adds a `keycloak-db` service:
  ```yaml
  keycloak-db:
    image: postgres:16-alpine
    restart: always
    env_file: .env
    environment:
      POSTGRES_DB: keycloak
      POSTGRES_USER: ${KC_DB_USERNAME}
      POSTGRES_PASSWORD: ${KC_DB_PASSWORD}
    volumes:
      - keycloak-db-data:/var/lib/postgresql/data
    networks:
      - h3-proxy
  ```
- [ ] Keycloak service in `docker-compose.prod.yml` updated:
  - `KC_DB=postgres`
  - `KC_DB_URL=jdbc:postgresql://keycloak-db:5432/keycloak`
  - `KC_DB_USERNAME` and `KC_DB_PASSWORD` read from env.
  - `depends_on: keycloak-db: condition: service_healthy`.
- [ ] `keycloak-db-data` volume declared in the top-level `volumes` block.
- [ ] `.env.example` gains `KC_DB_USERNAME` and `KC_DB_PASSWORD` with
  placeholder values and a comment.
- [ ] `DEPLOYMENT.md` updated with a "Keycloak DB migration" note: existing
  realm config must be re-imported on first deploy with this change (realm JSON
  export path documented).
- [ ] `docs/runbook.md` gains a "Keycloak DB unavailable" troubleshooting entry.

---

### US-149: CI/CD — gate tag-push deploys on CI passing

**Description:** As a team lead, I want production deploys to only happen after
all CI checks pass so a broken tagged commit cannot reach production.

**Acceptance Criteria:**
- [ ] `deploy.yml` `on.push.tags` trigger removed or subordinated.
- [ ] Deploy job restructured to trigger via `workflow_run` on the `CI` workflow
  completing successfully on the same commit:
  ```yaml
  on:
    workflow_run:
      workflows: ["CI"]
      types: [completed]
  ```
- [ ] Deploy job has a first step that exits if
  `github.event.workflow_run.conclusion != 'success'`.
- [ ] Deploy only runs when the triggering ref is a `v*` tag (checked via
  `github.event.workflow_run.head_branch`).
- [ ] Verified: pushing a failing commit with a `v*` tag does not trigger a
  deploy (can be verified by checking the Actions tab).
- [ ] `tasks/review-cicd.md` updated marking OF-04 as resolved.

---

### US-150: Backend — fix SPARQL injection in SparqlDatabase.js

**Description:** As a security engineer, I want all SPARQL queries in
`SparqlDatabase.js` to use parameterised or whitelist-validated values so an
attacker cannot inject malicious SPARQL through user-controlled input.

**Acceptance Criteria:**
- [ ] Every location in `SparqlDatabase.js` where a user-controlled string is
  interpolated into a SPARQL query is identified and listed in the PR
  description.
- [ ] Each identified location fixed using one of:
  - Bind parameters if the SPARQL endpoint supports them, **or**
  - A strict whitelist/allowlist validation that returns 400 for any value not
    in the whitelist before the query is built.
- [ ] No string concatenation of user input into SPARQL query strings remains.
- [ ] Existing integration tests still pass.
- [ ] `tasks/review-backend.md` updated marking OF-05 as resolved.
- [ ] Lint passes.

---

### US-151: Backend — fix Cypher label injection in admin group-change

**Description:** As a security engineer, I want the admin group-change endpoint
to validate the group label against a whitelist before using it in a Cypher
query so dynamic label interpolation cannot be exploited even by admin users.

**Acceptance Criteria:**
- [ ] Identify the exact location in `adminRouter.js` where the group label is
  interpolated into a Cypher string.
- [ ] A `VALID_GROUPS` constant defined:
  ```js
  const VALID_GROUPS = new Set(['hhh__Group1','hhh__Group2','hhh__Group3','hhh__Group4']);
  ```
- [ ] Route returns HTTP 400 `{ error: 'Invalid group' }` if the supplied label
  is not in `VALID_GROUPS` before any Cypher is constructed.
- [ ] The Cypher string is only built after the whitelist check passes.
- [ ] Unit test: supplying `'; DROP DATABASE neo4j; //'` as group name returns
  400 and executes no Cypher.
- [ ] Lint passes.

---

### US-152: CI/CD — add Python API-service CI job

**Description:** As a CI maintainer, I want the Python API-service tests to run
in CI on every push so regressions in the classifier, BCIO mapper, and
translation refiner are caught before merge.

**Acceptance Criteria:**
- [ ] New job `python-api-test` added to `ci.yml`:
  - Runs on `ubuntu-latest`.
  - Sets up Python 3.11 with pip cache.
  - Installs dependencies: `pip install -r API-service/requirements.txt`.
  - Starts a Redis service container (if Redis is required by any test).
  - Runs `pytest API-service/tests/ -v`.
- [ ] All existing Python tests pass in the new job (`test_classify_context.py`,
  `test_refine_translation.py`, `test_map_bcio.py`).
- [ ] `ci-passed` gate job gains `python-api-test` in its `needs` list.
- [ ] Job added to `tasks/review-cicd.md` as resolved for OF-08.

---

### US-153: CI/CD — add Admin Next.js panel CI job

**Description:** As a CI maintainer, I want the admin Next.js panel to be
type-checked and built in CI on every push so TypeScript errors and broken builds
are caught before merge.

**Acceptance Criteria:**
- [ ] New job `admin-build` added to `ci.yml`:
  - Sets up Node 22 with npm cache pointing to `admin/package-lock.json`.
  - `npm ci` in `admin/`.
  - `npx tsc --noEmit` — TypeScript type-check with zero errors.
  - `npm run build` — production Next.js build succeeds.
- [ ] The Docker build job in `ci.yml` (or `deploy.yml`) gains an admin image
  build step: `docker build -f admin/Dockerfile -t hhh-admin admin/`.
- [ ] `ci-passed` gate gains `admin-build` in its `needs` list.
- [ ] Job added to `tasks/review-cicd.md` as resolved for OF-09.

---

### US-154: Flutter — add unit tests for service layer

**Description:** As a developer, I want unit tests for all Flutter Dio service
classes so regressions in API call logic, response parsing, and error handling
are caught without running a live backend.

**Acceptance Criteria:**
- [ ] Test files created using `http_mock_adapter` (or `Mockito` with code-gen)
  for the following services (at minimum):
  - `HabitService` — test `fetchHabits(lang)`, assert `?lang=` param sent;
    test 401 throws `UnauthorisedException`.
  - `StatsService` — test successful parse of stats response shape.
  - `RecommendationService` — test happy path and 500 error path.
- [ ] Each test file lives at `mobile/test/services/<service>_test.dart`.
- [ ] `flutter test mobile/test/services/` passes with zero failures.
- [ ] `tasks/review-flutter.md` updated marking OF-10 as resolved.

---

### US-155: Infrastructure — fix MongoDB restore path mismatch

**Description:** As an operator, I want `restore.sh` to look in the same
directory that `backup.sh` creates so MongoDB data is actually restored when the
script is run.

**Acceptance Criteria:**
- [ ] Locate the mismatch: `backup.sh` writes to `$RESTORE_DIR/mongo/`,
  `restore.sh` reads from `$RESTORE_DIR/mongodb/`.
- [ ] Fix by aligning both scripts to the same path (change `restore.sh` to
  read from `$RESTORE_DIR/mongo/`, matching `backup.sh`).
- [ ] Verify fix with a dry-run: `bash restore.sh --dry-run` (or equivalent)
  no longer prints "directory not found" / silently skips MongoDB.
- [ ] Add a comment above the path in both files noting they must stay in sync.
- [ ] `tasks/review-infrastructure.md` updated marking OF-11 as resolved.

---

### US-156: Backend — extract adminRouter.js business logic into a service layer

**Description:** As a developer, I want the 1200+ line `adminRouter.js` split
into focused service modules so the file is maintainable, testable, and
consistent with the factory-injection pattern used by other routers.

**Acceptance Criteria:**
- [ ] Business logic extracted into at minimum three service files:
  - `app/services/adminParticipantService.js` — participant management (list,
    assign group, export).
  - `app/services/adminHabitService.js` — habit moderation (flag, remove,
    review queue).
  - `app/services/adminStatsService.js` — dashboard stats aggregation.
- [ ] Each service is a plain function or class that accepts a `{ neo4jRun, db }`
  dependency object (matching the factory-injection pattern).
- [ ] `adminRouter.js` reduced to route definitions + thin controller calls only;
  no inline business logic or Cypher strings remain in the router file.
- [ ] All existing admin integration tests pass unchanged.
- [ ] New unit tests added for at least one function in each service file using
  mocked `neo4jRun`.
- [ ] `tasks/review-backend.md` updated marking OF-12 as resolved.
- [ ] Lint passes.

---

## Functional Requirements

- FR-1: `scripts/migrate-hhh-habit-to-habit.cypher` runs idempotently and
  produces zero duplicates on repeated execution.
- FR-2: After migration, `GET /api/v1/habits` returns all habits regardless of
  whether they originated from the old or new donation pipeline.
- FR-3: `GET /api/v1/stats` reflects the merged dataset count.
- FR-4: No `hhh__Habit` references remain in `app/` after US-146.
- FR-5: Production deploy only triggers after CI workflow completes
  successfully.
- FR-6: All user-controlled strings are either parameterised or whitelist-
  validated before use in SPARQL or Cypher.
- FR-7: `ci-passed` gate blocks unless `python-api-test` and `admin-build`
  both pass.
- FR-8: `restore.sh` and `backup.sh` use the same directory name for MongoDB
  dumps.

---

## Non-Goals

- Removing the old `hhh__Habit` nodes after migration — they are left in place
  as a historical record and may be cleaned up in a separate story.
- Migrating `Context` or `BCIOConcept` data from the old schema (there is none
  to migrate; old schema did not have these).
- Migrating Keycloak realm configuration between database backends (operator
  re-imports realm JSON manually per DEPLOYMENT.md instructions).
- Refactoring the entire admin panel UI (only `adminRouter.js` backend logic is
  in scope for US-156).

---

## Technical Considerations

- **US-145 migration script** must be Cypher only (no application code) so it
  can be run directly via `cypher-shell` or the HTTP API in any environment.
- **US-146**: use `grep -rn 'hhh__Habit\|hhh__donates' app/` to find all
  affected routes before starting.
- **US-149**: `workflow_run` triggers do not receive `pull_request` context —
  the deploy job must extract the tag from
  `github.event.workflow_run.head_branch`.
- **US-150**: Fuseki's SPARQL endpoint may not support bind parameters in all
  query forms — the whitelist approach is the safe fallback.
- **US-152**: Check whether `API-service/tests/` requires environment variables
  (e.g. `REDIS_URL`, model paths) and set them in the CI job env block.

---

## Execution Order

```
US-145 → US-146 → US-147   (Neo4j schema — sequential)

US-148                      (Infrastructure — independent)
US-149                      (CI/CD — independent)
US-150                      (Security — independent)
US-151                      (Security — independent)
US-152                      (CI/CD — independent)
US-153                      (CI/CD — independent)
US-154                      (Flutter — independent)
US-155                      (Infrastructure — independent)
US-156                      (Backend — independent)
```

US-145 must complete before US-146.  US-147 can run alongside US-146.
All other stories are independent.

---

## Success Metrics

- `GET /api/v1/habits` returns > 0 habits for a database with only legacy
  `hhh__Habit` data after migration.
- `AUDIT.md` updated with all 12 OF-xx findings marked **Resolved**.
- CI pipeline green on `ralph/hhh-platform-unified` with all new jobs included
  in the `ci-passed` gate.
- Zero Critical or Major open findings remain after this cycle.

---

## Open Questions

- Should the migration script also attempt to back-fill `translationEN` for
  migrated habits using the existing `hhh:value` of any linked translation
  Donation node?  (Currently: no — left null to keep scope tight.)
- What is the intended fate of the original `hhh__Habit` nodes?  Archive,
  delete, or keep indefinitely?
