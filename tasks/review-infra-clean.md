# Clean Code Review — CI/CD and Infrastructure Scripts

**Date:** 2026-03-21
**Scope:** `.github/workflows/ci.yml`, `.github/workflows/deploy.yml`, `Makefile`, all files under `scripts/`
**Reviewer:** Ralph (automated)

---

## Summary

| Severity | Count |
|----------|-------|
| Critical | 3     |
| Major    | 8     |
| Minor    | 9     |
| Total    | 20    |

---

## Critical Findings

### CI-C1 — `deploy.yml:47` — Non-existent action version
**File:** `.github/workflows/deploy.yml`, line 47
**Type:** Broken reference / production-breaking
**Finding:** `actions/checkout@v6` is used in the `release` job. The latest stable release action version is `v4`; v6 does not exist. This will cause the release job to fail at runtime whenever a `v*` tag is pushed.
**Suggested fix:** Change `uses: actions/checkout@v6` → `uses: actions/checkout@v4` (consistent with all 11 other uses across both workflow files).

---

### CI-C2 — `deploy-keycloak.sh:52-53` — Brittle token extraction
**File:** `scripts/deploy-keycloak.sh`, lines 52–53
**Type:** Reliability / silent failure risk
**Finding:** The admin token is extracted with `| grep -o '"access_token":"[^"]*"' | cut -d'"' -f4`. This breaks silently (empty `$TOKEN`) if the JSON response is pretty-printed, has a different key order, or uses unicode. The immediately following `if [ -z "$TOKEN" ]` check at line 55 does catch an empty token, but the cause is opaque. Compare to `restore.sh:97` which correctly uses `jq -r '.access_token // empty'`.
**Suggested fix:**
```bash
TOKEN=$(curl -sf -X POST \
  "${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "client_id=admin-cli&grant_type=password&username=${KEYCLOAK_ADMIN}&password=${KEYCLOAK_ADMIN_PASSWORD}" \
  | jq -r '.access_token // empty')
```

---

### CI-C3 — `deploy-backend.sh:43-44`, `deploy-recommender.sh:24-25`, `deploy-keycloak.sh:86` — Deprecated `docker-compose` (v1)
**Files:** `scripts/deploy-backend.sh` lines 43–44, `scripts/deploy-recommender.sh` lines 24–25, `scripts/deploy-keycloak.sh` line 86
**Type:** Portability / production-breaking on modern Docker
**Finding:** Three deploy scripts call `docker-compose` (hyphen, v1 CLI). The v1 CLI was deprecated in 2023 and removed from the official Docker packages; servers running Docker 27+ will see `command not found: docker-compose`. The CI workflow and `Makefile` already use the correct `docker compose` (space, v2 plugin).
**Suggested fix:** Replace every `docker-compose` with `docker compose` in the three files above.

---

## Major Findings

### CI-M1 — `ci.yml` — Node.js setup steps copy-pasted across 4 jobs
**File:** `.github/workflows/ci.yml`, jobs `backend-lint` (lines 19–41), `backend-unit` (lines 46–78), `backend-integration` (lines 83–141), `backend-security` (lines 146–164)
**Type:** DRY violation
**Finding:** All four jobs repeat an identical 3-step block: `actions/checkout@v4` → `actions/setup-node@v4` (node 22, cache on `app/package-lock.json`) → `npm ci` in `app/`. That's 12 nearly identical steps. A Node.js version change requires 4 edits; a cache-key change requires 4 edits.
**Suggested fix:** Extract into a [composite action](https://docs.github.com/en/actions/creating-actions/creating-a-composite-action) at `.github/actions/setup-node-app/action.yml`, then replace each block with:
```yaml
- uses: ./.github/actions/setup-node-app
```

---

### CI-M2 — `ci.yml` — Flutter setup steps copy-pasted across 3 jobs
**File:** `.github/workflows/ci.yml`, jobs `flutter-analyze` (lines 169–186), `flutter-test` (lines 191–214), `flutter-build-web` (lines 219–236)
**Type:** DRY violation
**Finding:** All three Flutter jobs repeat: `actions/checkout@v4` → `subosito/flutter-action@v2` (stable, cache: true) → `flutter pub get`. Any Flutter channel change requires 3 edits.
**Suggested fix:** Extract a `.github/actions/setup-flutter-mobile/action.yml` composite action in the same pattern as M1.

---

### CI-M3 — `deploy-backend.sh:18-33` / `deploy-full.sh:59-74` — `wait_healthy()` duplicated
**Files:** `scripts/deploy-backend.sh` lines 18–33, `scripts/deploy-full.sh` lines 59–74
**Type:** DRY violation
**Finding:** The `wait_healthy()` function is copy-pasted verbatim (15 lines) between both files. A bug fix or changed timeout must be applied in two places.
**Suggested fix:** Move `wait_healthy()` to a shared library `scripts/lib/common.sh` and source it: `source "$(dirname "$0")/lib/common.sh"`.

---

### CI-M4 — All 4 deploy scripts — `run()` helper duplicated
**Files:** `scripts/deploy-backend.sh` lines 10–16, `scripts/deploy-recommender.sh` lines 8–14, `scripts/deploy-flutter-web.sh` lines 11–17, `scripts/deploy-keycloak.sh` lines 14–20
**Type:** DRY violation
**Finding:** The `run()` dry-run wrapper (6 lines each) is copy-pasted into all four sub-deploy scripts. The same `scripts/lib/common.sh` library (see M3) should define it once.
**Suggested fix:** Define `run()`, `run_in_dir()`, and `wait_healthy()` in `scripts/lib/common.sh`; source in each deploy script.

---

### CI-M5 — `ci.yml:263-322` — Complex logic embedded inline in YAML
**File:** `.github/workflows/ci.yml`, `ontology-test` job, steps "Wait for Neo4j HTTP API" (lines 263–268), "Apply constraints" (lines 270–289), "Seed minimal test data" (lines 292–322)
**Type:** SRP / readability
**Finding:** The ontology-test job embeds 65 lines of logic (Bash one-liner + two Python scripts) directly in YAML. This logic: (1) can't be unit-tested in isolation, (2) is invisible to IDE syntax checkers, (3) must be reformatted if the YAML indentation changes.
**Suggested fix:** Move to `tests/ontology/setup.py` (covering wait + apply constraints + seed) and call with `python3 tests/ontology/setup.py` from the job step. The existing `tests/ontology/test-ontology.sh` sets a good precedent.

---

### CI-M6 — `scripts/run-migration.js:29-41` and `scripts/seed-local.js:130-142` — `parseCypherStatements()` duplicated
**Files:** `scripts/run-migration.js` lines 29–41, `scripts/seed-local.js` lines 130–142
**Type:** DRY violation
**Finding:** The `parseCypherStatements()` function (13 lines) is copy-pasted verbatim between both files. A change to comment-stripping logic must be applied twice.
**Suggested fix:** Extract to `scripts/lib/cypher-utils.mjs` and import in both files:
```js
export function parseCypherStatements(filePath) { /* ... */ }
```

---

### CI-M7 — `deploy-full.sh:96-120` — Wrong health URL used after Keycloak/Recommender deploy
**File:** `scripts/deploy-full.sh`, lines 96–120
**Type:** Correctness / silent failure
**Finding:** After deploying Keycloak (step 2) and Recommender (step 3), the script polls `HEALTH_URL` (the backend Node.js health endpoint), not the Keycloak or Recommender health endpoints. This means Keycloak and Recommender could be unhealthy without the health check detecting it — the deploy would still "pass" as long as the already-running backend is healthy.
**Suggested fix:** Add `KEYCLOAK_HEALTH_URL` and `RECOMMENDER_HEALTH_URL` variables; poll the correct URL after each service deployment. At minimum, add a comment documenting that the current check is intentionally backend-only.

---

### CI-M8 — `scripts/generate-spec.js:18-61` — Custom `toYaml()` is dead code
**File:** `scripts/generate-spec.js`, lines 18–61 and 63–71
**Type:** Dead code / confusing
**Finding:** A 44-line custom `toYaml()` serialiser is defined and never called. The actual YAML output at lines 65–71 uses `js-yaml` (imported via dynamic `import()`), falling back to `JSON.stringify()` if `js-yaml` is unavailable — both of which are better options. The custom function is only referenced in the definition block and is unreachable at runtime.
**Suggested fix:** Delete lines 18–61 (the entire `toYaml` function definition).

---

## Minor Findings

### CI-m1 — `restore.sh:1` — Non-portable shebang
**File:** `scripts/restore.sh`, line 1
**Type:** Portability
**Finding:** `#!/bin/bash` hard-codes the bash path. All other shell scripts use `#!/usr/bin/env bash`.
**Suggested fix:** Change to `#!/usr/bin/env bash`.

---

### CI-m2 — `restore.sh:63` — Magic `sleep 2`
**File:** `scripts/restore.sh`, line 63
**Type:** Magic value
**Finding:** `sleep 2` waits an arbitrary 2 seconds after stopping Neo4j before copying the dump file. No comment explains the value; it has no relation to any measured startup/shutdown time.
**Suggested fix:** Extract to `NEO4J_STOP_WAIT_SECS="${NEO4J_STOP_WAIT_SECS:-2}"` at the top of the file.

---

### CI-m3 — `deploy-*.sh` — Inline timestamp instead of a `ts()` helper
**Files:** `scripts/deploy-backend.sh` lines 42/52, `scripts/deploy-recommender.sh` lines 23/27, `scripts/deploy-keycloak.sh` lines 30/48/85/88
**Type:** DRY / readability
**Finding:** `date -u '+%Y-%m-%dT%H:%M:%SZ'` is repeated inline in sub-deploy scripts instead of using a `ts()` helper. `deploy-full.sh` correctly defines `ts()` — the sub-scripts should do the same (or inherit from a shared library, see M3/M4).

---

### CI-m4 — `deploy-full.sh:28-57` — `check_version_bump()` duplicates `scripts/version-check.js`
**File:** `scripts/deploy-full.sh`, lines 28–57
**Type:** DRY violation
**Finding:** The 30-line `check_version_bump()` shell function implements the same logic as `scripts/version-check.js`. Any change to version-parsing rules needs to be applied in two places.
**Suggested fix:** Replace the function with: `node "$(dirname "$0")/version-check.js" || true` (the `|| true` preserves the current warn-but-continue behaviour).

---

### CI-m5 — `deploy-recommender.sh` — No health check after deploy
**File:** `scripts/deploy-recommender.sh`
**Type:** Missing safeguard
**Finding:** Unlike `deploy-backend.sh` and the orchestration in `deploy-full.sh`, the recommender deploy script does not verify the service is healthy after starting it. A failed recommender start is only caught (indirectly) by the backend health URL in `deploy-full.sh`, which is testing the wrong service (see M7).
**Suggested fix:** Add a `RECOMMENDER_HEALTH_URL` and call `wait_healthy` at the end of the script.

---

### CI-m6 — `ci.yml:101,249` — Hard-coded `NEO4J_PASSWORD: password` in two jobs
**File:** `.github/workflows/ci.yml`, lines 101, 249
**Type:** Magic value
**Finding:** `NEO4J_AUTH: neo4j/password` and `NEO4J_PASSWORD: password` are magic strings duplicated in both `backend-integration` and `ontology-test` job definitions. A password change requires two edits.
**Suggested fix:** While test credentials don't need to be secrets, extracting them to a YAML anchor (`x-neo4j-password: &neo4j-password password`) or a workflow-level env block makes the coupling explicit and reduces the edit surface.

---

### CI-m7 — `Makefile:23` — `-d iPhone` simulator flag
**File:** `Makefile`, line 23
**Type:** Magic value / fragile
**Finding:** `flutter run -d iPhone` requires a simulator named exactly "iPhone", which is not a standard simulator name in Xcode. The command will fail unless the developer has that exact name, which varies by Xcode version.
**Suggested fix:** Use `flutter run -d "iPhone 16 Simulator"` or parameterise with `SIMULATOR ?= "iPhone 16 Simulator"` so developers can override with `make ios SIMULATOR="iPhone SE (3rd generation)"`.

---

### CI-m8 — `Makefile:26-29` — `reset` runs `docker compose down` twice
**File:** `Makefile`, lines 26–29
**Type:** Inefficiency
**Finding:** `reset: stop` causes `docker compose down` to run first (via the `stop` target), then `docker compose down -v` immediately after — the first call is redundant since `down -v` supersedes `down`.
**Suggested fix:**
```makefile
reset: ## Stop services, wipe volumes, restart, and re-seed
	docker compose -f docker-compose.local.yml down -v
	$(MAKE) dev
	$(MAKE) seed
```
Remove the `stop` prerequisite; document that volumes are wiped.

---

### CI-m9 — `add-mongo-validators.js:8-10` — Long one-liner MONGO_URI
**File:** `scripts/add-mongo-validators.js`, lines 8–10
**Type:** Readability
**Finding:** The `MONGO_URI` fallback construction is a 3-line template literal with 5 nested `process.env` lookups inline. Other scripts (e.g., `seed-local.js`) read env vars into named constants first, then compose the URI — this is more readable.
**Suggested fix:** Extract individual env vars to named constants first:
```js
const MONGO_HOST = process.env.MONGO_HOST || 'localhost';
const MONGO_PORT = process.env.MONGO_PORT || '27017';
// ...
const MONGO_URI = process.env.MONGO_URI || `mongodb://${MONGO_USER}:${MONGO_PASSWORD}@${MONGO_HOST}:${MONGO_PORT}/hhh?authSource=admin`;
```

---

## Positive Findings

- **`set -euo pipefail`** — every shell script except `restore.sh` (which has it) uses `set -euo pipefail`; this is an excellent baseline.
- **`#!/usr/bin/env bash` / `#!/usr/bin/env node`** — all shell scripts (except `restore.sh`) and all Node.js scripts use the portable env-based shebangs.
- **Node.js `process.exit(1)`** — all Node.js scripts call `process.exit(1)` in their top-level `.catch()` handlers, preventing silent failure.
- **Idempotency** — `seed-local.js` is fully idempotent (MERGE + replaceOne+upsert); `run-migration.js` uses MERGE correctly. Re-running either script is safe.
- **Driver lifecycle** — migration scripts (`run-migration.js`, `migrate-habits-bcio.js`) properly close the Neo4j session and driver in `finally` blocks.
- **`--dry-run` support** — all four deploy sub-scripts and `deploy-full.sh` support `--dry-run` mode with a consistent `run()` wrapper pattern, enabling safe deployment rehearsal.
- **`trap` for cleanup** — `restore.sh` uses `trap 'rm -rf "$WORK_DIR"' EXIT` to clean up the temp extraction directory on any exit path.
- **CI gate job** — `ci-passed` aggregates all 11 jobs; the deploy workflow correctly depends on it, preventing deploys when any check fails.
- **Makefile `help` target** — the `help` target uses `grep -E` on `## ` comments to generate self-documenting output; all targets have documentation.
- **`check_version_bump`** — `deploy-full.sh` warns before deploying if the CHANGELOG version has no git tag, preventing accidental deploys without a version bump.

---

## Prioritised Fix Order

| Priority | ID    | Finding                                              | Effort |
|----------|-------|------------------------------------------------------|--------|
| 1        | CI-C1 | `actions/checkout@v6` — will break release job       | 1 line |
| 2        | CI-C3 | `docker-compose` v1 in 3 deploy scripts              | 3 lines |
| 3        | CI-C2 | Brittle token extraction in `deploy-keycloak.sh`     | 4 lines |
| 4        | CI-M6 | `parseCypherStatements()` duplicated in 2 scripts    | ~20 lines (extract) |
| 5        | CI-M3 | `wait_healthy()` duplicated between deploy scripts   | ~30 lines (shared lib) |
| 6        | CI-M4 | `run()` helper duplicated in 4 deploy scripts        | bundled with M3 |
| 7        | CI-M7 | Wrong health URL after Keycloak/Recommender deploy   | ~10 lines |
| 8        | CI-M1 | Node.js CI steps copy-pasted × 4                    | composite action |
| 9        | CI-M2 | Flutter CI steps copy-pasted × 3                    | composite action |
| 10       | CI-M8 | Dead `toYaml()` function in `generate-spec.js`       | delete 44 lines |
| 11       | CI-M5 | Embedded Python in CI YAML                          | extract to script file |
| 12       | CI-m1 | `#!/bin/bash` in `restore.sh`                        | 1 line |
| 13       | CI-m5 | No health check in `deploy-recommender.sh`           | ~5 lines |
| 14       | CI-m4 | `check_version_bump()` duplicates `version-check.js` | ~30 lines (delete + 1 line) |
| 15       | CI-m2–m9 | Remaining minor issues                            | trivial |
