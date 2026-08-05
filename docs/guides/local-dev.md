# Local Development Setup Guide

This guide walks you through running the full Health Habit Hub stack locally — backend, databases, admin panel, and Flutter iOS Simulator — on a clean Mac.

> **vs. [`developer-onboarding.md`](developer-onboarding.md):** this guide is `Makefile`-driven (`make dev`, `make seed`, `make ios`) and assumes macOS + Xcode for the iOS Simulator. If you're not on a Mac, or want to run the Flutter app in Chrome/Android Emulator instead, use `developer-onboarding.md` — the two guides cover overlapping ground from different angles, pick whichever matches your setup rather than reading both.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [First-Time Setup](#2-first-time-setup)
3. [Running the iOS Simulator](#3-running-the-ios-simulator)
4. [Running the Admin App](#4-running-the-admin-app)
5. [Test Login Credentials](#5-test-login-credentials)
6. [Hot Reload](#6-hot-reload)
7. [Stopping and Resetting](#7-stopping-and-resetting)
8. [Troubleshooting](#8-troubleshooting)

---

## 1. Prerequisites

Install the following tools before proceeding.

| Tool               | Minimum Version | Install                                            |
| ------------------ | --------------- | -------------------------------------------------- |
| **Xcode**          | 15.0            | Mac App Store                                      |
| **Docker Desktop** | 4.25.0          | https://docs.docker.com/desktop/install/mac/       |
| **Flutter SDK**    | 3.22.0          | https://docs.flutter.dev/get-started/install/macos |
| **Node.js**        | 22.0.0          | https://nodejs.org/en/download/                    |
| **Git**            | 2.40.0          | `xcode-select --install`                           |

### Verify your environment

```bash
docker --version          # Docker version 24+
docker compose version    # Docker Compose version 2.20+
flutter --version         # Flutter 3.22+
node --version            # v22+
xcodebuild -version       # Xcode 15+
```

Run `flutter doctor` and confirm no critical errors for the iOS target:

```
[✓] Flutter (Channel stable, 3.22.x)
[✓] Xcode - develop for iOS and macOS
[✓] iOS Simulator
```

---

## 2. First-Time Setup

### Step 1 — Clone the repo and check out the branch

```bash
git clone https://github.com/felixreinsch/health-habit-hub.git
cd health-habit-hub
git checkout ralph/hhh-platform-unified
```

### Step 2 — Copy the environment file

```bash
cp .env.example .env
```

The default values in `.env.example` work for local development without changes. You do not need to fill in any `CHANGE_THIS_*` placeholders to run the local stack.

Add the following variables to your `.env` if they are not already present:

```
API_SERVICE_SECRET=dev-secret-change-in-production
LIGHTRAG_URL=http://lightrag:9621
LIGHTRAG_API_KEY=dev-lightrag-secret
LIGHTRAG_HOST_PORT=9622
```

`API_SERVICE_SECRET` is the shared secret for internal service-to-service calls. The `LIGHTRAG_*` variables configure the knowledge base service — the defaults work for local development without changes. The graph visualization UI is served at `http://localhost:9622` when the stack is running.

### Step 3 — Start all backend services

```bash
make dev
```

This runs `docker compose -f docker-compose.local.yml up -d`, starting:

| Service                 | Description                                                                          | Local address                                      |
| ----------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------- |
| **proxy**               | Traefik reverse proxy                                                                | `http://proxy.localhost` / port `8888` (dashboard) |
| **app**                 | Node.js/Express backend                                                              | `localhost:3000`                                   |
| **admin**               | Next.js admin panel                                                                  | `http://admin.localhost` / `localhost:3001`        |
| **mongo**               | MongoDB                                                                              | `localhost:27017`                                  |
| **neo4j**               | Neo4j graph database                                                                 | `localhost:7474` (browser) / `7687` (bolt)         |
| **keycloak**            | Identity provider (Keycloak)                                                         | `localhost:8080`                                   |
| **redis**               | Redis cache                                                                          | `localhost:6379`                                   |
| **recommender**         | Python FastAPI recommender                                                           | `localhost:8001`                                   |
| **lightrag**            | LightRAG knowledge base (REST API + graph UI)                                        | `localhost:9622`                                   |
| **knowledge-mcp**       | MCP server wrapping LightRAG                                                         | `localhost:8002`                                   |
| **translate**           | LibreTranslate                                                                       | `localhost:5001`                                   |
| **backup**              | Backup service (scheduled backups + internal API for the admin panel's Backups page) | internal only (backup-api on port `4100`)          |
| **docker-socket-proxy** | Scoped Docker API used only by `backup` (no direct `docker.sock` mount)              | internal only                                      |
| **prometheus**          | Metrics collection, scrapes `app`                                                    | `http://prometheus.localhost` / `localhost:9090`   |
| **grafana**             | Dashboards over Prometheus data, Keycloak SSO login                                  | `http://grafana.localhost` / `localhost:3002`      |

> The Apache Jena **Fuseki** triple store has been retired and is no longer part of the compose stack — see [`../migration.md`](../migration.md). BCIO mapping now runs on in-process embeddings in the recommender service.

> **Note:** On first start, Neo4j and Keycloak each take 30–60 seconds to become healthy, and `keycloak-init` must complete before the `admin` container starts. Wait before running the next step.

### Step 4 — Verify the backend is up

```bash
curl localhost:3000/api/v1/health
```

Expected response:

```json
{ "status": "ok" }
```

### Step 5 — Seed the database

```bash
make seed
```

This seeds:

- **MongoDB** — SLIQ and RAND-36 questionnaires
- **Neo4j** — Group nodes, a test Donor, and sample Habit nodes
- **Keycloak** — Test user `testuser` with password `testpass123` in the `hhh` realm

The seed script is idempotent — running it again is safe.

As part of `make seed`, the setup now verifies Keycloak OIDC default scopes for
the `hhh-flutter` client (`basic`, `openid`, `profile`, `email`, `roles`) to
ensure access tokens consistently include stable identity claims such as `sub`.

You can run this check manually at any time:

```bash
make verify-keycloak
```

If the check reports missing scopes, auto-fix them with:

```bash
make fix-keycloak
```

---

## 3. Running the iOS Simulator

### Using the Makefile

```bash
make ios
```

This runs `cd mobile && flutter run -d iPhone`, which selects the first available iPhone Simulator.

### Running manually from the Flutter project root

```bash
cd mobile
flutter pub get
dart analyze
flutter run -d iPhone
```

Use `flutter run` to start the app. `flutter pub run` and plain `dart run` do not launch this Flutter application.

### Selecting a specific simulator

```bash
# List available simulators
flutter devices

# Run on a specific simulator (use the device ID shown by flutter devices)
cd mobile && flutter run -d "iPhone 15 Pro"
```

### Network note

The iOS Simulator runs on your Mac and shares the Mac host network. `localhost` in the simulator resolves to your Mac's loopback address — no special IP configuration needed. The Flutter app's `AppConfig.apiBaseUrl` already defaults to `http://localhost:3000/api/v1` for development builds.

---

## 4. Running the Admin App

The admin panel is a Next.js application (in `admin/`) that provides a web UI for managing studies, participants, and questionnaires.

### Accessing the admin app

When the local Docker stack is running (`make dev`), the admin app is available at:

- **`http://admin.localhost/admin`** — via the Traefik proxy (recommended; matches the `NEXTAUTH_URL` configured for the container)
- **`http://localhost:3001/admin`** — direct port binding (useful for debugging, but NextAuth redirects target `admin.localhost`)

> The `/admin` suffix is required either way — the admin app has a Next.js `basePath` of `/admin` baked in at build time, so the bare host 404s.

> **Note:** `http://admin.localhost` requires that your browser resolves `.localhost` subdomains to `127.0.0.1`. All major browsers on macOS do this automatically — no `/etc/hosts` changes needed.

### Creating a local admin user in Keycloak

The `testuser` seeded by `make seed` is a regular `user` (study participant) — it does not have access to the admin panel. The admin panel requires a user with the `admin` (or `researcher`) realm role in the `hhh` realm.

**This is now done automatically.** When you run `make dev`, the `keycloak-init` container creates an admin user in the `hhh` realm using values from your `.env`:

| `.env` variable           | Used as              | Default |
| ------------------------- | -------------------- | ------- |
| `HHH_ADMIN_USER`          | Admin panel username | `admin` |
| `KEYCLOAK_ADMIN_PASSWORD` | Admin panel password | `admin` |

The created user is automatically assigned both `admin` and `researcher` roles, so it has full access to all admin panel features.

To log in to the admin panel:

1. Wait for `keycloak-init` to complete (it runs once on stack startup; check `docker compose -f docker-compose.local.yml logs keycloak-init`).
2. Open `http://admin.localhost/admin` in your browser.
3. Sign in with the username from `HHH_ADMIN_USER` and the password from `KEYCLOAK_ADMIN_PASSWORD`.

> **Note:** No manual Keycloak UI steps are required. If you want to change the admin username, edit `HHH_ADMIN_USER` in `.env` and re-run `make reset` (or restart the `keycloak-init` container after wiping the Keycloak volume).

### Running the admin app in watch mode (outside Docker)

For fast iteration on the admin UI, you can run it directly with Node.js instead of inside Docker:

```bash
cd admin
npm install
npm run dev
```

This starts the Next.js dev server on `http://localhost:3001` with hot reload — open `http://localhost:3001/admin` (the app has a `/admin` basePath, so the bare port 404s). The `admin` container in Docker must be stopped first to avoid a port conflict:

```bash
docker compose -f docker-compose.local.yml stop admin
```

The backend and Keycloak containers must still be running (`make dev` with the `admin` service excluded, or just leave them all running and stop the `admin` container separately).

---

## 5. Test Login Credentials

After running `make seed`, these credentials work in both the app and the Keycloak admin UI:

| Account                       | Username                                     | Password                                     | Role                               | Where to log in               |
| ----------------------------- | -------------------------------------------- | -------------------------------------------- | ---------------------------------- | ----------------------------- |
| Test user (study participant) | `testuser`                                   | `testpass123`                                | `user` (hhh realm)                 | Flutter app                   |
| Admin panel user              | value of `HHH_ADMIN_USER` (default: `admin`) | value of `KEYCLOAK_ADMIN_PASSWORD` in `.env` | `admin` + `researcher` (hhh realm) | `http://admin.localhost`      |
| Keycloak master admin         | `admin`                                      | value of `KEYCLOAK_ADMIN_PASSWORD` in `.env` | master realm admin                 | `http://localhost:8080/admin` |

> **Note:** The admin panel user and the Keycloak master admin happen to share the same username (`admin`) by default, but they live in different realms. The admin panel user is created in the `hhh` realm by `keycloak-init`. The master admin lives in the `master` realm and only manages Keycloak itself.

Keycloak admin UI: `http://localhost:8080/admin`

### Rich QA personas (`make seed-user`)

`testuser` above is a bare account with no habit history — useful for testing
onboarding, but not for testing screens that depend on existing data (My
Habits with real logs, the SRHI trajectory chart, achievements, the Explore
graph's donated habits). `make seed-user` fills that gap by seeding one or
more fully-fledged accounts with weeks of realistic history:

```bash
make seed-user            # just the "steady" persona (default)
make seed-user COUNT=5    # all five personas
```

| Persona      | Story |
| ------------ | ----- |
| `steady`     | Several habits at different stages, one graduated to full automaticity, several donated. |
| `beginner`   | Downloaded the app a few days ago — one tentative habit, minimal history. |
| `struggler`  | Adherence declining across the board; one habit abandoned outright. |
| `power_user` | Six habits, two graduated, heavy donation and community activity. |
| `returning`  | Strong start, three weeks of total silence, now rebuilding. |

Each persona gets its own deterministic account (same credentials every run —
see `scripts/seed-test-user.js`'s `deriveCredentials()`), so re-running is
safe: only the habit data is wiped and rebuilt each time, not the Keycloak
account. Credentials (userId, username, password, recovery phrase) print to
the terminal at the end of the run — use them to log into the app or restore
the account via the recovery-phrase flow.

`make seed-user` needs the local Docker stack already running; it's a
separate step from `make seed` and doesn't run automatically as part of it.

---

## 6. Hot Reload

Flutter hot reload is available while the app is running in the simulator.

| Action                                 | Key                                                |
| -------------------------------------- | -------------------------------------------------- |
| Hot reload (update UI without restart) | `r` in the terminal where `flutter run` is running |
| Hot restart (restart app, reset state) | `R`                                                |
| Quit                                   | `q`                                                |

Backend hot reload (Node.js with `--watch`):

```bash
make logs
```

The backend uses Node.js `--watch` in development mode — saving any file in `app/` automatically restarts the server. Watch the logs to confirm the restart completed before testing.

---

## 7. Stopping and Resetting

### Stop all services

```bash
make stop
```

### Full reset (wipe volumes and re-seed)

Use this when you want a completely fresh database state:

```bash
make reset
```

This stops services, removes all Docker volumes (deleting all data), restarts services, and re-seeds.

---

## 8. Troubleshooting

### Port conflict — address already in use

**Symptom:** `docker compose up` fails with `Bind for 0.0.0.0:3000 failed: port is already allocated`

**Fix:** Find and kill the process using the port:

```bash
lsof -i :3000 | grep LISTEN
kill -9 <PID>
```

Common conflicting ports: `3000` (app), `3001` (admin), `7474`/`7687` (neo4j), `8080` (keycloak), `27017` (mongo), `5001` (libretranslate), `6379` (redis), `9622` (lightrag), `8001` (recommender).

---

### Neo4j slow to start

**Symptom:** `make seed` fails with `Neo4j not ready after 30 attempts` or the health check times out.

**Fix:** Wait an additional 30 seconds and re-run `make seed`. Neo4j takes up to 90 seconds on first start (especially on Apple Silicon). You can watch it:

```bash
docker compose -f docker-compose.local.yml logs -f neo4j
```

Wait until you see `Started.` in the logs before seeding.

---

### Keycloak realm not found

**Symptom:** `make seed` fails with `404 Not Found` when calling the Keycloak admin API, or the app shows "Realm does not exist".

**Fix:** The realm is imported automatically on first start. If the import failed:

```bash
# Check Keycloak logs for import errors
docker compose -f docker-compose.local.yml logs keycloak | grep -i "import\|error\|realm"

# Restart Keycloak to re-trigger import
docker compose -f docker-compose.local.yml restart keycloak
```

If the realm still does not appear in the Keycloak admin UI after restart, run a full reset:

```bash
make reset
```

---

### Admin app cannot authenticate (NextAuth error)

**Symptom:** Clicking "Sign in" on `http://admin.localhost` redirects to an error page, the browser is stuck in a redirect loop, or login lands on a Keycloak "Access Denied" page.

The admin panel uses NextAuth + Keycloak with three Docker-specific environment variables. Most authentication problems trace to one of these:

| Env var                 | Where it points                    | Why it matters                                                                                                                                           |
| ----------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `KEYCLOAK_BROWSER_URL`  | `http://localhost:8080`            | Used by NextAuth as the **authorization** endpoint host — the browser must be able to reach it                                                           |
| `KEYCLOAK_INTERNAL_URL` | `http://keycloak:8080`             | Used by NextAuth for **token**, **userinfo**, and **JWKS** endpoints — server-to-server inside Docker                                                    |
| `KEYCLOAK_ISSUER`       | `http://localhost:8080/realms/hhh` | Must match the `iss` claim in the issued tokens. In `start-dev` mode, Keycloak stamps `iss` from the browser-side Host header, which is `localhost:8080` |

**Fix 1:** Confirm the `keycloak-init` container completed successfully. The `admin` container depends on it:

```bash
docker compose -f docker-compose.local.yml logs keycloak-init
```

If it exited with an error, restart it:

```bash
docker compose -f docker-compose.local.yml up keycloak-init
```

**Fix 2:** Make sure you are accessing the admin panel at `http://admin.localhost/admin` and not `http://localhost:3001` (without the path). NextAuth's `NEXTAUTH_URL` is set to `http://admin.localhost/admin/api/auth`, so redirect URIs will not match when using the direct port or omitting `/admin`.

**Fix 3:** Browser redirects to `http://keycloak:8080/...` and fails with "site can't be reached". This means OIDC discovery (`wellKnown`) is leaking the internal Docker hostname into the browser. The current `admin/src/lib/auth.ts` no longer uses `wellKnown` and instead sets the authorization endpoint explicitly to `KEYCLOAK_BROWSER_URL`. If you see this symptom, confirm `KEYCLOAK_BROWSER_URL=http://localhost:8080` is set on the admin container and rebuild.

**Fix 4:** Login succeeds at Keycloak but lands on `/access-denied`. Check the admin container logs:

```bash
docker logs hhh-admin
```

Common causes:

- **`iss` mismatch**: NextAuth rejects the token because `KEYCLOAK_ISSUER` does not match the `iss` claim. In `start-dev` mode the `iss` claim is `http://localhost:8080/realms/hhh`, so `KEYCLOAK_ISSUER` must use `localhost:8080` (not `keycloak:8080`).
- **Empty `realm_access` roles**: `realm_access` lives only in the access token, not in the ID token. The JWT callback in `admin/src/lib/auth.ts` decodes roles from `account.access_token` directly. If you have customised this and read from `profile`, roles will always be empty.
- **User has no `admin` or `researcher` role**: confirm the `keycloak-init` step ran (see Fix 1) and assigned both roles to the admin user.

**Fix 5:** If `NEXTAUTH_SECRET` is missing or empty in `.env`, NextAuth will fail silently. Confirm `.env` contains a non-empty value:

```
NEXTAUTH_SECRET=change-me-in-production
```

---

### Admin panel pages fail to load (studies, questionnaires, knowledge base)

**Symptom:** You can sign in to the admin panel, but pages such as Studies, Questionnaires, or Knowledge Base show empty data, spinners that never resolve, or browser console errors like `CORS policy: No 'Access-Control-Allow-Origin' header is present`.

**Cause:** The admin panel runs on `http://admin.localhost` and calls the backend API at `http://localhost:3000`. These are different origins, so the backend must explicitly allow them via CORS. The `app` service reads its allow-list from the `ALLOWED_ORIGINS` env var (comma-separated). If this is missing, every browser-side request from the admin panel is blocked.

**Fix:** Add the following line to `.env` (already present in `.env.example`):

```
ALLOWED_ORIGINS=http://admin.localhost,http://researcher.localhost,http://localhost:3001
```

Then restart the backend container:

```bash
docker compose -f docker-compose.local.yml restart app
```

Confirm the variable was picked up:

```bash
docker compose -f docker-compose.local.yml exec app printenv ALLOWED_ORIGINS
```

---

### iOS Simulator cannot reach localhost

**Symptom:** Network requests fail in the simulator with `Connection refused` or `Could not connect to the server`.

**Fix 1:** Confirm the backend is running and healthy:

```bash
curl localhost:3000/api/v1/health
```

**Fix 2:** Confirm the simulator is using the correct base URL. In development builds, `AppConfig.apiBaseUrl` resolves to `http://localhost:3000/api/v1`. If you customised `APP_HOST_PORT` in `.env`, update the value accordingly.

**Fix 3:** iOS Simulator App Transport Security (ATS) blocks plain HTTP to non-localhost addresses. The default config uses `localhost` which is ATS-exempt. Do not change the URL to `127.0.0.1` — use `localhost`.

---

### LibreTranslate — out of memory during model download

**Symptom:** The `translate` container crashes on startup, Docker Desktop shows high memory usage, or you see `MemoryError` in the logs.

**Fix:** LibreTranslate downloads language models (~1 GB per language pair) on first start. Give it time and memory:

1. Increase Docker Desktop memory limit to at least 6 GB (Docker Desktop → Settings → Resources → Memory).
2. Watch progress: `docker compose -f docker-compose.local.yml logs -f translate`
3. Wait for `Running on http://0.0.0.0:5000` before using translation features.

If translation is not needed for your current work, you can disable it by commenting out the `translate` service in `docker-compose.local.yml`.

---

### Flutter build errors after pulling new code

**Symptom:** `flutter run` fails with `pub get` errors or missing generated files.

**Fix:**

```bash
cd mobile
flutter pub get
flutter gen-l10n   # regenerate localisation files
dart analyze
flutter run -d iPhone
```
