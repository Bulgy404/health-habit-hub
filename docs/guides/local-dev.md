# Local Development Setup Guide

This guide walks you through running the full Health Habit Hub stack locally — backend, databases, admin panel, and Flutter iOS Simulator — on a clean Mac.

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

| Tool | Minimum Version | Install |
|---|---|---|
| **Xcode** | 15.0 | Mac App Store |
| **Docker Desktop** | 4.25.0 | https://docs.docker.com/desktop/install/mac/ |
| **Flutter SDK** | 3.22.0 | https://docs.flutter.dev/get-started/install/macos |
| **Node.js** | 22.0.0 | https://nodejs.org/en/download/ |
| **Git** | 2.40.0 | `xcode-select --install` |

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

Add the following variable to your `.env` if it is not already present:

```
API_SERVICE_SECRET=dev-secret-change-in-production
```

This is the shared secret used between the Node.js backend and the Python recommender API service for internal service-to-service calls. In local development, any non-empty string works.

### Step 3 — Start all backend services

```bash
make dev
```

This runs `docker compose -f docker-compose.local.yml up -d`, starting:

| Service | Description | Local address |
|---|---|---|
| **proxy** | Traefik reverse proxy | `http://proxy.localhost` / port `8888` (dashboard) |
| **app** | Node.js/Express backend | `localhost:3000` |
| **admin** | Next.js admin panel | `http://admin.localhost` / `localhost:3001` |
| **mongo** | MongoDB | `localhost:27017` |
| **neo4j** | Neo4j graph database | `localhost:7474` (browser) / `7687` (bolt) |
| **keycloak** | Identity provider (Keycloak) | `localhost:8080` |
| **redis** | Redis cache | `localhost:6379` |
| **recommender** | Python FastAPI recommender | `localhost:8001` |
| **fuseki** | Apache Jena Fuseki (RDF/SPARQL) | `localhost:3030` |
| **translate** | LibreTranslate | `localhost:5001` |

> **Note:** On first start, Neo4j and Keycloak each take 30–60 seconds to become healthy, and `keycloak-init` must complete before the `admin` container starts. Wait before running the next step.

### Step 4 — Verify the backend is up

```bash
curl localhost:3000/api/v1/health
```

Expected response:

```json
{"status":"ok"}
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

- **`http://admin.localhost`** — via the Traefik proxy (recommended; matches the `NEXTAUTH_URL` configured for the container)
- **`http://localhost:3001`** — direct port binding (useful for debugging, but NextAuth redirects target `admin.localhost`)

> **Note:** `http://admin.localhost` requires that your browser resolves `.localhost` subdomains to `127.0.0.1`. All major browsers on macOS do this automatically — no `/etc/hosts` changes needed.

### Creating a local admin user in Keycloak

The `testuser` seeded by `make seed` is a regular participant. To log in to the admin panel, you need a user with the `admin` role in the `hhh` realm.

1. Open the Keycloak admin UI at `http://localhost:8080/admin` and log in with:
   - **Username:** `admin`
   - **Password:** the value of `KEYCLOAK_ADMIN_PASSWORD` in your `.env` (default: `admin`)

2. Switch to the **hhh** realm using the dropdown in the top-left corner.

3. Go to **Users** → **Add user**, fill in a username and email, and click **Create**.

4. On the **Credentials** tab, set a password and disable the "Temporary" toggle.

5. On the **Role mapping** tab, click **Assign role**, filter by **hhh** realm roles, and assign the `admin` role.

6. Navigate to `http://admin.localhost` and sign in with the new credentials.

### Running the admin app in watch mode (outside Docker)

For fast iteration on the admin UI, you can run it directly with Node.js instead of inside Docker:

```bash
cd admin
npm install
npm run dev
```

This starts the Next.js dev server on `http://localhost:3001` with hot reload. The `admin` container in Docker must be stopped first to avoid a port conflict:

```bash
docker compose -f docker-compose.local.yml stop admin
```

The backend and Keycloak containers must still be running (`make dev` with the `admin` service excluded, or just leave them all running and stop the `admin` container separately).

---

## 5. Test Login Credentials

After running `make seed`, these credentials work in both the app and the Keycloak admin UI:

| Account | Username | Password | Role |
|---|---|---|---|
| Test participant | `testuser` | `testpass123` | `participant` |
| Keycloak admin | `admin` | (value of `KEYCLOAK_ADMIN_PASSWORD` in `.env`) | master admin |

Keycloak admin UI: `http://localhost:8080/admin`

---

## 6. Hot Reload

Flutter hot reload is available while the app is running in the simulator.

| Action | Key |
|---|---|
| Hot reload (update UI without restart) | `r` in the terminal where `flutter run` is running |
| Hot restart (restart app, reset state) | `R` |
| Quit | `q` |

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

Common conflicting ports: `3000` (app), `3001` (admin), `7474`/`7687` (neo4j), `8080` (keycloak), `27017` (mongo), `5001` (libretranslate), `6379` (redis), `3030` (fuseki), `8001` (recommender).

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

**Symptom:** Clicking "Sign in" on `http://admin.localhost` redirects to an error page, or the browser is stuck in a redirect loop.

**Fix 1:** Confirm the `keycloak-init` container completed successfully. The `admin` container depends on it:

```bash
docker compose -f docker-compose.local.yml logs keycloak-init
```

If it exited with an error, restart it:

```bash
docker compose -f docker-compose.local.yml up keycloak-init
```

**Fix 2:** Make sure you are accessing the admin panel at `http://admin.localhost` and not `http://localhost:3001`. NextAuth's `NEXTAUTH_URL` is set to `http://admin.localhost`, so redirect URIs will not match when using the direct port.

**Fix 3:** If `NEXTAUTH_SECRET` is missing or empty in `.env`, NextAuth will fail silently. Confirm `.env` contains a non-empty value:

```
NEXTAUTH_SECRET=change-me-in-production
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
