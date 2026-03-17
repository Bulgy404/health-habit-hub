# Repository Audit

**Audit Date:** 2026-03-17
**Auditor:** Ralph autonomous agent
**Scope:** Full codebase — Node.js backend, Flutter app, Python recommender, Docker/compose, shell scripts, CI/CD, documentation

---

## AUDIT-001 — Committed .env file contains real credentials
**File:** `.env`
**Problem:** The `.env` file containing real passwords and API keys (database passwords, Mailjet credentials, reCAPTCHA secret key, Neo4j password, Mongo Express password) is committed to version control.
**Why it violates best practice:** Hardcoded secrets in version control are a critical security vulnerability. Anyone with repository access can read and misuse credentials. Credentials must be treated as compromised.
**Suggested fix:** Delete `.env` from git history (BFG Repo-Cleaner or `git filter-repo`), rotate all credentials immediately, keep only `stack.env` as a template with `CHANGE_THIS_*` placeholders.

---

## AUDIT-002 — Hardcoded production API URLs in Flutter services
**Files:**
- `mobile/lib/services/auth_service.dart`
- `mobile/lib/services/recommendation_service.dart`
- `mobile/lib/services/habit_service.dart`
- `mobile/lib/services/admin_service.dart`
- `mobile/lib/services/survey_service.dart`
- `mobile/lib/services/recommendation_ws_service.dart`
**Problem:** Production URLs (`https://api.hhh.tu-dresden.de`, `https://keycloak.hhh.tu-dresden.de`, `wss://api.hhh.tu-dresden.de/ws/recommendations`) are hardcoded as static constants in service files.
**Why it violates best practice:** Impossible to switch between development, staging, and production environments without code changes. Violates 12-factor app methodology.
**Suggested fix:** Replace hardcoded URLs with `const String.fromEnvironment('API_BASE_URL', defaultValue: 'http://localhost:3000')` and pass values via `--dart-define` at build time or flutter_dotenv.

---

## AUDIT-003 — Docker images pinned to `latest` tag
**Files:** `docker-compose.yml`, `docker-compose.prod.yml`, `backup-service/Dockerfile`
**Problem:**
- `docker-compose.yml`: `mongo-express:latest`, `libretranslate/libretranslate:latest`
- `docker-compose.prod.yml`: `mongo:latest`, `mongo-express:latest`, `libretranslate/libretranslate:latest`
- `backup-service/Dockerfile`: `FROM alpine:latest`
**Why it violates best practice:** Using `:latest` is non-reproducible. A new image release can introduce breaking changes or regressions without warning.
**Suggested fix:** Pin to specific versions: `mongo:7.0`, `mongo-express:1.0`, `libretranslate/libretranslate:1.5`, `alpine:3.21`.

---

## AUDIT-004 — Missing health checks on app, mongo, and neo4j services
**Files:** `docker-compose.yml`, `docker-compose.prod.yml`
**Problem:** The `app`, `mongo`, and `neo4j` services have no `healthcheck` directive. Only `keycloak` has one.
**Why it violates best practice:** Docker Compose cannot detect unhealthy containers; `depends_on` without `condition: service_healthy` provides no startup ordering guarantee. Monitoring cannot detect silent failures.
**Suggested fix:** Add healthchecks:
- `app`: `curl -f http://localhost:3000/api/v1/health`
- `mongo`: `mongosh --eval 'db.runCommand({ping:1})'`
- `neo4j`: `wget -q -O /dev/null http://localhost:7474`

---

## AUDIT-005 — Unused npm dependencies `fs` and `path`
**File:** `app/package.json`
**Problem:** `"fs": "^0.0.1-security"` and `"path": "^0.12.7"` are listed as runtime dependencies. These are Node.js built-in modules; the npm packages are ancient browser polyfills that should never be used in a Node.js server.
**Why it violates best practice:** Adds unnecessary packages with old version numbers. The npm `fs` package is marked as a security placeholder (version 0.0.1-security). Code should `import fs from 'node:fs'` instead.
**Suggested fix:** Remove both from `dependencies` in `package.json`; verify no code imports them as npm packages.

---

## AUDIT-006 — TODO comments indicating incomplete refactoring in SparqlDatabase.js
**File:** `app/utils/SparqlDatabase.js`
**Problem:** Eight `// TODO: Refactor` comments remain (lines ~67, 129, 155, 208, 310, 329, 356, 379). Line 208 specifically flags that a value should be moved to config/env.
**Why it violates best practice:** TODO comments in production code indicate incomplete work. Line 208 may be a configuration or security issue.
**Suggested fix:** Resolve each TODO: either implement the refactor, create a GitHub Issue and remove the inline comment, or accept the current code and delete the comment.

---

## AUDIT-007 — Python recommender Dockerfile runs as root (no USER directive)
**File:** `API-service/Dockerfile`
**Problem:** No `USER` directive is set; the container process runs as root.
**Why it violates best practice:** Running application containers as root violates the principle of least privilege. A compromised application process would have full root access to the container filesystem.
**Suggested fix:** Add a non-root user after installing dependencies:
```dockerfile
RUN addgroup --system app && adduser --system --ingroup app app
USER app
```

---

## AUDIT-008 — backup.sh missing `set -euo pipefail`
**File:** `backup-service/backup.sh`
**Problem:** The script begins with `#!/bin/bash` but lacks `set -euo pipefail`.
**Why it violates best practice:** Without `-e` the script continues after errors. Without `-u` undefined variable references silently expand to empty string. Without `-o pipefail` a failing command in a pipeline is masked by the last command's exit code. This can cause partial backups to be silently marked as successful.
**Suggested fix:** Add `set -euo pipefail` on line 2.

---

## AUDIT-009 — Rate limiter does not configure Express `trust proxy`
**File:** `app/middleware/rateLimiter.js`, `app/app.js`
**Problem:** The rate limiter uses `req.ip` as the fallback key, but the app runs behind Traefik. Without `app.set('trust proxy', 1)`, `req.ip` will always be Traefik's internal Docker network IP, making the rate limiter treat all users as the same client.
**Why it violates best practice:** Rate limiting becomes completely ineffective behind a reverse proxy if the app does not read `X-Forwarded-For`. All requests appear to come from one IP.
**Suggested fix:** Add `app.set('trust proxy', 1)` in `app/app.js` before the rate limiter middleware is applied.

---

## AUDIT-010 — Keycloak production config uses `start-dev` mode
**File:** `docker-compose.prod.yml`
**Problem:** The Keycloak service command is `start-dev --import-realm`. Development mode (`start-dev`) disables production hardening, uses an in-memory cache, and is explicitly documented by Keycloak as unsuitable for production.
**Why it violates best practice:** `start-dev` disables many security and performance features. Keycloak's own documentation states it must not be used in production.
**Suggested fix:** Change to `start --import-realm` and set the required production configuration options (hostname, proxy, etc.). If H2 file DB must stay: `start --db=dev-file` is still allowed but `start-dev` is not.

---

## AUDIT-011 — .gitignore missing entries for generated/log files
**File:** `.gitignore`
**Problem:** The root `.gitignore` lacks entries for common generated and temporary files: `*.log`, `dist/`, `tmp/`, `.cache/`, IDE files (`.idea/`, `*.swp`), and OS files (`Thumbs.db`, `.DS_Store`).
**Why it violates best practice:** Without these entries, generated artifacts or local developer IDE configuration may accidentally be committed.
**Suggested fix:** Add the missing patterns to `.gitignore`.

---

## AUDIT-012 — mongo-express hardcoded credentials in docker-compose.yml
**File:** `docker-compose.yml`
**Problem:** `ME_CONFIG_MONGODB_ADMINUSERNAME=admin`, `ME_CONFIG_MONGODB_ADMINPASSWORD=admin`, and `ME_CONFIG_MONGODB_URL=mongodb://admin:admin@mongo:27017/` are hardcoded with the default "admin" password.
**Why it violates best practice:** Hardcoded credentials in compose files are readable by anyone with repo access and are not overridable without editing the file.
**Suggested fix:** Replace with environment variable references: `ME_CONFIG_MONGODB_ADMINUSERNAME=${MONGO_USER:-admin}`, etc., consistent with the pattern already used in `docker-compose.prod.yml`.
