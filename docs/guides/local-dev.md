# Local Development Setup Guide

This guide walks you through running the full Health Habit Hub stack locally — backend, databases, and Flutter iOS Simulator — on a clean Mac.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [First-Time Setup](#2-first-time-setup)
3. [Running the iOS Simulator](#3-running-the-ios-simulator)
4. [Test Login Credentials](#4-test-login-credentials)
5. [Hot Reload](#5-hot-reload)
6. [Stopping and Resetting](#6-stopping-and-resetting)
7. [Troubleshooting](#7-troubleshooting)

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

### Step 3 — Start all backend services

```bash
make dev
```

This runs `docker compose -f docker-compose.local.yml up -d`, starting:

- **app** — Node.js/Express backend on `localhost:3000`
- **neo4j** — Graph database on `localhost:7474` (browser) / `7687` (bolt)
- **mongo** — MongoDB on `localhost:27017`
- **keycloak** — Identity provider on `localhost:8080`
- **libretranslate** — Translation service on `localhost:5000`

> **Note:** On first start, Neo4j and Keycloak each take 30–60 seconds to become healthy. Wait before running the next step.

### Step 4 — Verify the backend is up

```bash
curl localhost:3000/health
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

## 4. Test Login Credentials

After running `make seed`, these credentials work in both the app and the Keycloak admin UI:

| Account | Username | Password | Role |
|---|---|---|---|
| Test participant | `testuser` | `testpass123` | `participant` |
| Keycloak admin | `admin` | (value of `KEYCLOAK_ADMIN_PASSWORD` in `.env`) | master admin |

Keycloak admin UI: `http://localhost:8080/admin`

---

## 5. Hot Reload

Flutter hot reload is available while the app is running in the simulator.

| Action | Key |
|---|---|
| Hot reload (update UI without restart) | `r` in the terminal where `flutter run` is running |
| Hot restart (restart app, reset state) | `R` |
| Quit | `q` |

Backend hot reload (Node.js with nodemon):

```bash
make logs
```

The backend uses `nodemon` in development mode — saving any file in `app/` automatically restarts the server. Watch the logs to confirm the restart completed before testing.

---

## 6. Stopping and Resetting

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

## 7. Troubleshooting

### Port conflict — address already in use

**Symptom:** `docker compose up` fails with `Bind for 0.0.0.0:3000 failed: port is already allocated`

**Fix:** Find and kill the process using the port:

```bash
lsof -i :3000 | grep LISTEN
kill -9 <PID>
```

Common conflicting ports: `3000` (app), `7474`/`7687` (neo4j), `8080` (keycloak), `27017` (mongo), `5000` (libretranslate).

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

### iOS Simulator cannot reach localhost

**Symptom:** Network requests fail in the simulator with `Connection refused` or `Could not connect to the server`.

**Fix 1:** Confirm the backend is running and healthy:

```bash
curl localhost:3000/health
```

**Fix 2:** Confirm the simulator is using the correct base URL. In development builds, `AppConfig.apiBaseUrl` resolves to `http://localhost:3000/api/v1`. If you customised the `APP_HOST_PORT` in `.env`, update the value accordingly.

**Fix 3:** iOS Simulator App Transport Security (ATS) blocks plain HTTP to non-localhost addresses. The default config uses `localhost` which is ATS-exempt. Do not change the URL to `127.0.0.1` — use `localhost`.

---

### LibreTranslate — out of memory during model download

**Symptom:** The `libretranslate` container crashes on startup, Docker Desktop shows high memory usage, or you see `MemoryError` in the logs.

**Fix:** LibreTranslate downloads language models (~1 GB per language pair) on first start. Give it time and memory:

1. Increase Docker Desktop memory limit to at least 6 GB (Docker Desktop → Settings → Resources → Memory).
2. Watch progress: `docker compose -f docker-compose.local.yml logs -f libretranslate`
3. Wait for `Running on http://0.0.0.0:5000` before using translation features.

If translation is not needed for your current work, you can disable it by commenting out the `libretranslate` service in `docker-compose.local.yml`.

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
