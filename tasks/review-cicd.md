# CI/CD Pipeline Review — Health Habit Hub

**Reviewer:** Ralph (senior DevOps engineer perspective)
**Date:** 2026-03-21
**Files reviewed:** `.github/workflows/ci.yml`, `.github/workflows/deploy.yml`

---

## 1. Correctness

### C1 — `actions/checkout@v6` does not exist (Critical)
**File:** `ci.yml:21, 48, 115, 149, 172, 193, 219, 335` and `deploy.yml:40`
**Finding:** All jobs use `actions/checkout@v6`. As of the knowledge cutoff the latest stable release is `actions/checkout@v4`. `@v6` will fail at runtime with "Unable to resolve action `actions/checkout`, the action version is invalid". This would make every single CI job fail immediately.
**Fix:** Pin to `actions/checkout@v4`.

### C2 — `actions/setup-node@v6` does not exist (Critical)
**File:** `ci.yml:23, 51, 119, 153`
**Finding:** Same issue as C1 — `actions/setup-node@v6` does not exist. The latest stable is `actions/setup-node@v4`.
**Fix:** Pin to `actions/setup-node@v4`.

### C3 — `actions/upload-artifact@v6` does not exist (Critical)
**File:** `ci.yml:73, 209`
**Finding:** Same issue — `upload-artifact@v6` does not exist; latest stable is `@v4`.
**Fix:** Pin to `actions/upload-artifact@v4`.

### C4 — Deploy workflow trigger is unreliable for the `ci-passed` gate job (Major)
**File:** `deploy.yml:5-9`
**Finding:** The deploy job triggers on `workflow_run` for the `"CI"` workflow on branch `master`. However, `workflow_run` receives the conclusion of the outermost workflow, not the `ci-passed` gate job. If `ci-passed` is skipped or the workflow name changes, deploys will proceed on partial CI success. The `ci-passed` gate job exists in `ci.yml` but is not referenced by the deploy trigger — the deploy only checks `github.event.workflow_run.conclusion == 'success'`, which means the entire CI workflow must succeed. This is correct *in principle*, but relies on the CI workflow name matching exactly `"CI"` (it does — `name: CI` on line 1 of ci.yml). This is fragile: a rename breaks the link silently.
**Fix:** Document this coupling. Consider using `workflow_dispatch` with status check requirements on the branch protection rule instead.

### C5 — `deploy.yml` tag-push path bypasses CI entirely (Major) ✅ Resolved (US-149)
**File:** `deploy.yml:10-12, 19-21`
**Finding:** When triggered by a `push` on `refs/tags/v*`, the deploy job runs unconditionally — it does not check that CI passed on the commit the tag points to. An engineer can push a tag on a broken commit and trigger a production deploy with zero CI gating.
**Fix:** Remove the direct tag-push deploy trigger or add a mandatory environment protection rule that blocks deployment until CI passes on the tagged commit.
**Resolution:** CI workflow now runs on tag pushes (`tags: ["v*"]` added to ci.yml). The `deploy` job's `push: tags` trigger is removed; it now runs exclusively via `workflow_run` with an explicit check that `conclusion == 'success'` and that `head_branch` is either `master` or a `v*` tag. The `release` job (artifact build/upload) retains its `push: tags` trigger since it does not deploy to production infrastructure.

### C6 — `Fuseki` service not started for integration tests (Major)
**File:** `ci.yml:81-139`
**Finding:** The integration test job starts `mongodb` and `neo4j` services, but the progress log (US-003) notes pre-existing Fuseki integration test failures. The `FUSEKI_*` environment variables are absent from the integration test step. Tests that exercise Fuseki-backed routes will always fail in CI.
**Fix:** Add a Fuseki service container (`stain/jena-fuseki:4`) and pass `FUSEKI_URL`, `FUSEKI_USER`, `FUSEKI_PASSWORD` env vars to the integration test step. Or explicitly mark Fuseki tests as `--test-skip` in CI until the service is available.

### C7 — `deploy.yml` has no `admin` Next.js image in the `release` job (Minor)
**File:** `deploy.yml:40-71`
**Finding:** The release job builds a Flutter APK and a Flutter web bundle, but does not build or publish the Next.js admin panel image (added in US-105). The Docker image for the admin service will not be included in release artifacts.
**Fix:** Add a step to build and push `admin` Docker image to a registry as part of the release job.

---

## 2. Reliability

### R1 — No retry or timeout on integration tests (Major)
**File:** `ci.yml:127-139`
**Finding:** The integration test step runs with no timeout. A single hanging test will consume the full 6-hour default GitHub Actions job timeout, blocking the runner and burning minutes. Node.js test runner supports `--test-timeout` and the job itself should have a `timeout-minutes` cap.
**Fix:** Add `timeout-minutes: 15` to the `backend-integration` job. Pass `--test-timeout 30000` to the `node --test` invocations.

### R2 — `deploy-full.sh` referenced but not reviewed or validated (Major)
**File:** `deploy.yml:33`
**Finding:** The deploy script runs `bash scripts/deploy-full.sh` on the production server after `git pull`. If this script does not exist, is not executable, or fails mid-way through, `set -euo pipefail` will abort but there is no rollback mechanism. No health check is performed post-deploy to confirm the new version is running.
**Fix:** Add a post-deploy health check step (e.g., `curl -f https://app.example.com/api/health`) that fails the job if the application does not respond after deploy.

### R3 — Neo4j plugin loading unreliable without explicit APOC JAR mounting (Minor)
**File:** `ci.yml:100-104`
**Finding:** `NEO4J_PLUGINS: '["apoc", "n10s"]'` triggers Neo4j's lab plugin download mechanism, which fetches JARs from the internet at CI time. This makes CI non-deterministic and susceptible to upstream CDN outages. Plugin versions are unpinned.
**Fix:** Pin APOC and n10s versions explicitly or pre-download JARs and bind-mount them into the container via a Docker volume in the service definition.

---

## 3. Security

### S1 — No secret scanning step (Major)
**File:** `ci.yml` — missing
**Finding:** There is no secret scanning job (e.g., `truffleHog`, `gitleaks`, `git-secrets`). An accidental commit of a Keycloak client secret, Neo4j password, or SSH key would be committed to history and detected only manually.
**Fix:** Add a `gitleaks` or `truffleHog` step as a fast first job in CI.

### S2 — `npm audit` only blocks on `critical` severity (Minor)
**File:** `ci.yml:162`
**Finding:** `npm audit --audit-level=critical` ignores high-severity vulnerabilities. Given that the backend handles JWTs and personal health data, high-severity vulnerabilities in dependencies (e.g., ReDoS in validation libraries) should also block.
**Fix:** Change to `--audit-level=high`.

### S3 — SSH private key used directly in deploy action with no IP restriction (Minor)
**File:** `deploy.yml:28-33`
**Finding:** `appleboy/ssh-action@v1` accepts `key: ${{ secrets.SERVER_SSH_KEY }}`. The secret is a raw private key, and there is no `allowed_payload` or IP-allowlist visible in the step. If the secret is leaked, anyone can deploy arbitrary code to the server.
**Fix:** Restrict the production server's `~/.ssh/authorized_keys` entry for the deploy user with `from="<GitHub Actions IP range>"` or use a deploy token with a short-lived certificate instead of a static key.

---

## 4. Speed

### SP1 — Three separate Flutter jobs each run `flutter pub get` independently (Minor)
**File:** `ci.yml:167-234`
**Finding:** `flutter-analyze`, `flutter-test`, and `flutter-build-web` each call `flutter pub get` separately. Although `subosito/flutter-action@v2` caches the Flutter SDK, the `pub get` downloads are not shared between jobs.
**Fix:** Use `actions/cache` to cache `~/.pub-cache` keyed on `pubspec.lock`. All three jobs will restore from cache after the first run.

### SP2 — Backend jobs repeat `npm ci` across four jobs with no shared cache (Minor)
**File:** `ci.yml:29-31, 56-58, 123-125, 153-155`
**Finding:** `backend-lint`, `backend-unit`, `backend-integration`, and `backend-security` each run `npm ci`. While `setup-node` caches the npm module cache, the install step still runs in full for each job. The `node_modules` themselves are not cached — only the npm download cache.
**Fix:** This is acceptable for most setups, but for further speed gains consider a matrix strategy or a single install step with artifact upload of `node_modules`.

---

## 5. Coverage

### CV1 — Python API-service has no CI coverage (Critical) ✅ Resolved (US-152)
**File:** `ci.yml` — missing
**Finding:** `API-service/` (the Python FastAPI recommender) has no CI job at all — no lint, no type-check, no tests. The test files written in US-098, US-099, US-114 exist but are never executed in CI. Bugs in the LLM classification, BCIO mapping, or translation refinement routes will not be caught automatically.
**Fix:** Add a `python-test` job that:
```yaml
- uses: actions/setup-python@v5
  with:
    python-version: "3.12"
- run: pip install -r requirements.txt
  working-directory: API-service
- run: pytest tests/ -v
  working-directory: API-service
```
**Resolution:** Added `python-api-test` job (job 10) to `ci.yml` using Python 3.11, pip cache, `pip install -r API-service/requirements.txt`, and `pytest tests/ -v` with `OPENAI_API_KEY=placeholder`. Job added to `ci-passed` gate needs list.

### CV2 — Admin Next.js panel has no CI coverage (Major)
**File:** `ci.yml` — missing
**Finding:** The `admin/` Next.js application (added in US-105) has no lint, typecheck, or build job in CI. TypeScript errors and broken builds will not be caught.
**Fix:** Add an `admin-build` job:
```yaml
- uses: actions/setup-node@v4
  with:
    node-version: "22"
    cache: npm
    cache-dependency-path: admin/package-lock.json
- run: npm ci
  working-directory: admin
- run: npm run build
  working-directory: admin
```

### CV3 — `docker-build` job does not build the `admin` image (Major)
**File:** `ci.yml:331-348`
**Finding:** The Docker build validation job builds `app`, `API-service`, `fuseki`, and `backup-service` but omits `admin`. The admin Dockerfile will never be validated in CI.
**Fix:** Add `docker build ./admin` to the `docker-build` job.

### CV4 — No coverage threshold enforcement (Minor)
**File:** `ci.yml:62-76`
**Finding:** Backend unit tests upload coverage as an artifact but there is no threshold check. Coverage can drop to 0% without blocking CI.
**Fix:** Add `--branches 80 --lines 80` (or appropriate thresholds) to the `c8` invocation to fail if coverage drops below the target.

---

## 6. Action Versions

| Action | Used version | Latest stable | Status |
|---|---|---|---|
| `actions/checkout` | `@v6` | `@v4` | **Non-existent — will fail** |
| `actions/setup-node` | `@v6` | `@v4` | **Non-existent — will fail** |
| `actions/upload-artifact` | `@v6` | `@v4` | **Non-existent — will fail** |
| `subosito/flutter-action` | `@v2` | `@v2` | OK |
| `appleboy/ssh-action` | `@v1` | `@v1` | OK |
| `softprops/action-gh-release` | `@v2` | `@v2` | OK |

**Critical:** Three actions reference `@v6` which does not exist. Every job using checkout or setup-node will fail at the action resolution step before any code runs.

---

## 7. What Is Done Well

1. **Logical job separation** — lint, unit, integration, security, Docker build, and gate jobs are cleanly separated with appropriate `needs` dependencies. The `ci-passed` gate job is a textbook pattern.
2. **Real service containers for integration tests** — running MongoDB and Neo4j as service containers in CI rather than mocking them at the driver level is excellent practice that would have caught the schema issues identified in US-133.
3. **Coverage artifact upload** — both backend and Flutter upload coverage reports as artifacts, enabling future dashboarding even without a threshold gate.
4. **`set -euo pipefail` in deploy script** — the deploy step uses strict bash mode, which will abort on any error rather than silently continuing in a broken state.
5. **Ontology test suite in CI** — running `tests/ontology/test-ontology.sh` in a real Neo4j container is an unusual and valuable choice that validates graph constraints at the schema level.
6. **`flutter build web` as a dedicated CI gate** — building the web target separately ensures the Flutter app compiles for web on every push, catching web-incompatible APIs early.

---

## 8. Prioritised Improvements

### Critical

| ID | Location | Issue |
|---|---|---|
| C1 | `ci.yml` everywhere | `actions/checkout@v6` does not exist — all jobs broken |
| C2 | `ci.yml` everywhere | `actions/setup-node@v6` does not exist — all Node.js jobs broken |
| C3 | `ci.yml:73,209` | `actions/upload-artifact@v6` does not exist |
| CV1 | `ci.yml` missing | No CI coverage for Python API-service | ✅ Resolved (US-152) |

### Major

| ID | Location | Issue |
|---|---|---|
| C4 | `deploy.yml:5-9` | Deploy trigger fragile — coupled to CI workflow name string |
| C5 | `deploy.yml:10-12` | Tag-push deploy bypasses CI gating entirely | ✅ Resolved (US-149) |
| C6 | `ci.yml:81-139` | Fuseki not started in integration tests — Fuseki routes untested |
| R1 | `ci.yml:127-139` | No timeout on integration tests — runaway test blocks runner |
| R2 | `deploy.yml:33` | No post-deploy health check — broken deploys go undetected |
| S1 | `ci.yml` missing | No secret scanning step |
| CV2 | `ci.yml` missing | Admin Next.js has no CI job | ✅ Resolved (US-153) |
| CV3 | `ci.yml:331-348` | `docker-build` job omits admin image | ✅ Resolved (US-153) |

### Minor

| ID | Location | Issue |
|---|---|---|
| C7 | `deploy.yml` | Admin image not in release artifacts |
| R3 | `ci.yml:100-104` | Neo4j plugins downloaded from internet — non-deterministic |
| S2 | `ci.yml:162` | `npm audit` only blocks on critical, not high |
| S3 | `deploy.yml:28-33` | Deploy SSH key has no IP restriction |
| SP1 | `ci.yml:167-234` | Three Flutter jobs each run `pub get` without cache |
| SP2 | `ci.yml:29-31` | Four backend jobs each run `npm ci` without sharing |
| CV4 | `ci.yml:62-76` | No coverage threshold enforcement |
