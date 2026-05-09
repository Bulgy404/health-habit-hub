# Health Habit Hub — Developer Onboarding Guide

Welcome to the Health Habit Hub project. This guide takes you from zero to a fully working local development environment.

---

## Table of Contents

1. [Required Tools](#1-required-tools)
2. [Clone and Branch Setup](#2-clone-and-branch-setup)
3. [Create stack.env](#3-create-stackenv)
4. [Start Services with Docker Compose](#4-start-services-with-docker-compose)
5. [Run Flutter App in Chrome](#5-run-flutter-app-in-chrome)
6. [Run Flutter App in Android Emulator](#6-run-flutter-app-in-android-emulator)
7. [Run the Admin App Locally](#7-run-the-admin-app-locally)
8. [Run All Tests](#8-run-all-tests)
9. [Common Pitfalls](#9-common-pitfalls)
10. [Verify Your Setup Checklist](#10-verify-your-setup-checklist)

---

## 1. Required Tools

Install the following tools before proceeding. The table shows the minimum required version and how to verify your installation.

| Tool | Minimum Version | Verify |
|------|----------------|--------|
| **Flutter** | 3.22.0 | `flutter --version` |
| **Docker** | 24.0.0 | `docker --version` |
| **Docker Compose** | 2.20.0 | `docker compose version` |
| **Node.js** | 22.0.0 | `node --version` |
| **npm** | 10.0.0 | `npm --version` |
| **Git** | 2.40.0 | `git --version` |

### Installation links

- Flutter: https://docs.flutter.dev/get-started/install
- Docker Desktop (includes Compose): https://docs.docker.com/get-docker/
- Node.js (LTS): https://nodejs.org/en/download/

### Verify Flutter setup

Run `flutter doctor` to confirm your environment is ready. You should see no critical errors for the Chrome and Android targets you plan to use:

```
Doctor summary (to see all details, run flutter doctor -v):
[v] Flutter (Channel stable, 3.22.x)
[v] Android toolchain
[v] Chrome - develop for the web
[v] Android Studio
[v] VS Code
[v] Connected device (3 available)
```

---

## 2. Clone and Branch Setup

```bash
# Clone the repository
git clone https://github.com/your-org/health-habit-hub.git
cd health-habit-hub

# Switch to the unified development branch
git checkout ralph/hhh-platform-unified

# Verify you are on the correct branch
git branch --show-current
# Expected output: ralph/hhh-platform-unified
```

---

## 3. Create stack.env

The Docker stack reads all secrets and configuration from a `stack.env` file at the repo root. Copy the template and fill in your local values:

```bash
cp stack.env stack.env.local
```

Edit `stack.env.local` with values suitable for local development. Below is a minimal template that works out-of-the-box for local development (all `CHANGE_THIS_*` values replaced with safe defaults):

```ini
# ── Domain ─────────────────────────────────────────────────────────────
DOMAIN=localhost
SERVER_IP=127.0.0.1
ACME_EMAIL=dev@localhost

# ── App ────────────────────────────────────────────────────────────────
APP_BASE_PATH=/
NODE_ENV=development

# ── Fuseki ─────────────────────────────────────────────────────────────
FUSEKI_PATH=fuseki
DB_HOST=fuseki
DB_PORT=3030
DB_USER=admin
DB_PASSWORD=devpassword
DB_PATH=hhh

# ── MongoDB ─────────────────────────────────────────────────────────────
MONGO_HOST=mongo
MONGO_PORT=27017
MONGO_USER=admin
MONGO_PASSWORD=devpassword
MONGO_DB=surveyjs
MONGO_AUTH_SOURCE=admin
MONGO_SERVER_SELECTION_TIMEOUT_MS=30000
MONGO_SOCKET_TIMEOUT_MS=30000

# ── Graph backend ───────────────────────────────────────────────────────
GRAPH_BACKEND=neo4j

# ── Neo4j ───────────────────────────────────────────────────────────────
NEO4J_URI=bolt://neo4j:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=devpassword

# ── Keycloak ─────────────────────────────────────────────────────────────
KEYCLOAK_ADMIN=admin
KEYCLOAK_ADMIN_PASSWORD=devpassword

# ── Recommender ──────────────────────────────────────────────────────────
RECOMMENDER_URL=http://recommender:8000

# ── API Service ───────────────────────────────────────────────────────────
API_SERVICE_SECRET=dev-secret-change-in-production

# ── LightRAG Knowledge Base ───────────────────────────────────────────────
LIGHTRAG_URL=http://lightrag:9621
LIGHTRAG_API_KEY=dev-lightrag-secret
LIGHTRAG_HOST_PORT=9622

# ── LibreTranslate ───────────────────────────────────────────────────────
LT_LOAD_ONLY=de,en
LT_REQ_LIMIT=0
LT_DEBUG=false
LT_DISABLE_WEB_UI=false

# ── Backup ───────────────────────────────────────────────────────────────
BACKUP_RETENTION_DAYS=7
BACKUP_EMAIL=dev@localhost
ALERT_WEBHOOK_URL=

# ── Admin app password ───────────────────────────────────────────────────
ADMIN_PASSWORD=devpassword

# ── reCAPTCHA (dev — set to empty to disable) ────────────────────────────
RECAPTCHA_SITEKEY=
RECAPTCHA_SECRETKEY=
RECAPTCHA_USE_RECAPTCHA_DOMAIN=false

# ── Mail (dev — set to empty to disable) ─────────────────────────────────
MAIL_USER=
MAIL_PASS=
MAIL_FROM=noreply@localhost
MAIL_RECEIVER=dev@localhost

# ── Traefik ──────────────────────────────────────────────────────────────
TRAEFIK_DASHBOARD_AUTH=admin:$$apr1$$devhash
```

`API_SERVICE_SECRET` is the shared secret between the Node.js backend and the Python API service (recommender). `LIGHTRAG_API_KEY` is the bearer token that protects the LightRAG REST API — it must match between the `lightrag`, `knowledge-mcp`, and `recommender` containers. Any non-empty string works locally; use strong random values in production.

> **Note:** Never commit `stack.env.local` to Git — it is listed in `.gitignore`. For production deployments use the values in `stack.env` overridden in Portainer.

---

## 4. Start Services with Docker Compose

```bash
# Start all backend services in detached mode
docker compose --env-file stack.env.local up -d

# Watch logs during startup (Ctrl+C to stop following)
docker compose logs -f
```

Wait approximately 60–90 seconds for Keycloak and Neo4j to initialise. Then verify all services are healthy:

```bash
curl -s http://localhost:3000/api/v1/health | python3 -m json.tool
```

Expected output:

```json
{
  "status": "ok",
  "version": "1.0.0",
  "services": {
    "neo4j":    { "status": "ok", "latencyMs": 12 },
    "mongo":    { "status": "ok", "latencyMs": 5  },
    "fuseki":   { "status": "ok", "latencyMs": 18 },
    "keycloak": { "status": "ok", "latencyMs": 22 },
    "recommender": { "status": "ok", "latencyMs": 8 }
  }
}
```

Confirm Docker containers are running:

```bash
docker compose ps
```

Expected — all services should show status **running** or **healthy**:

```
NAME                  STATUS
h3-app               running
h3-keycloak          healthy
h3-mongo             running
h3-neo4j             healthy
h3-fuseki            running
h3-recommender       running
h3-lightrag          running
h3-knowledge-mcp     running
h3-traefik           running
```

---

## 5. Run Flutter App in Chrome

The Flutter app lives in the `mobile/` directory. All backend URLs are injected at compile time via `--dart-define` flags (defined in `mobile/lib/config/app_config.dart`):

| Flag | Default (localhost) | Description |
|------|--------------------|-|
| `API_BASE_URL` | `http://localhost:3000/api/v1` | REST API base URL |
| `KEYCLOAK_URL` | `http://localhost:8080` | Keycloak base URL (no realm path) |
| `WS_BASE_URL` | `ws://localhost:3000/ws` | WebSocket base URL |

```bash
cd mobile

# Fetch Flutter dependencies
flutter pub get

# Regenerate localisation files (must run whenever app_en.arb or app_de.arb change)
flutter gen-l10n

# List available devices — confirm Chrome is available
flutter devices
# Expected line: Chrome (web)    • chrome  • web-javascript • Google Chrome ...

# Run in Chrome with the local backend
flutter run -d chrome \
  --dart-define=API_BASE_URL=http://localhost:3000/api/v1 \
  --dart-define=KEYCLOAK_URL=http://localhost:8080 \
  --dart-define=WS_BASE_URL=ws://localhost:3000/ws \
  --dart-define=KEYCLOAK_REALM=hhh \
  --dart-define=KEYCLOAK_CLIENT_ID=hhh-flutter
```

Flutter will compile the web app (first run takes ~60–90 s) and open Chrome automatically.

### Donation flow (WebView)

The **Donate** tab renders the habit-donation survey inside a `WebView` (package `webview_flutter`). The flow is:

1. Flutter calls `GET /api/v1/surveys/habit-donation` to resolve the survey ID.
2. The WebView loads `GET /api/v1/surveys/:id/render?lang=<en|de>` — a server-rendered SurveyJS page.
3. When the participant submits, the SurveyJS page fires a `window.SurveyComplete.postMessage(json)` JS bridge message.
4. Flutter validates the JSON payload and calls `POST /api/v1/surveys/:id/results` with the Bearer token.
5. On success, GoRouter navigates to `/explore`.

Because the donation form is server-rendered, changes to the survey definition only require redeploying the backend — no Flutter rebuild is needed. The `lang` query parameter selects the survey language, which follows the locale chosen in the Settings screen.

Participant survey targeting is explicit:

- `habit-donation` stays available to every participant.
- `group_assigned` surveys are filtered by the participant's study group.
- `unassigned_only` surveys are shown only to participants without a group.
- `all_participants` surveys are visible to everyone.

The API also resolves stable aliases by survey `type`, so the mobile app can request `/surveys/profile` or `/surveys/habit-donation` even if the stored survey document uses a UUID `id`.

| Platform | Screenshot |
|----------|-----------|
| Chrome (local) | ![Flutter web running locally in Chrome](../assets/screenshots/developer/flutter-web-chrome.png) |

---

## 6. Run Flutter App in Android Emulator

### Prerequisites

1. Install **Android Studio** and open **Virtual Device Manager**.
2. Create an AVD (Android Virtual Device) — any Pixel device with API 33+ works.
3. Start the emulator from Android Studio or run:

```bash
# List available emulators
flutter emulators

# Launch one (replace <emulator_id> with the ID shown above)
flutter emulators --launch <emulator_id>
```

### Run the app

```bash
cd mobile

# Confirm emulator is listed as a connected device
flutter devices
# Expected: Android SDK built for x86_64 • emulator-5554 • android ...

# Run on the emulator
flutter run \
  --dart-define=API_BASE_URL=http://10.0.2.2:3000/api/v1 \
  --dart-define=KEYCLOAK_URL=http://10.0.2.2:8080 \
  --dart-define=WS_BASE_URL=ws://10.0.2.2:3000/ws \
  --dart-define=KEYCLOAK_REALM=hhh \
  --dart-define=KEYCLOAK_CLIENT_ID=hhh-flutter
```

> **Note:** Inside an Android emulator, `10.0.2.2` maps to your host machine's `localhost`.

---

## 7. Run the Admin App Locally

The admin app is a Next.js application that lives in the `admin/` directory. It provides a researcher/admin interface for managing studies, participants, and questionnaires.

### Install and start

```bash
cd admin
npm install
npm run dev  # starts Next.js dev server on http://localhost:3001
```

The dev server starts on port **3001** (separate from the Node.js backend on 3000).

### Authentication

The admin app connects to Keycloak for authentication. You need a Keycloak user with the `admin` or `researcher` realm role in the `hhh` realm. The Docker stack's `keycloak-init` service configures the realm automatically on first start.

The following environment variables control the admin app's auth behaviour (already set in `docker-compose.local.yml` for the containerised version; set them in a local `.env.local` file inside `admin/` when running outside Docker):

```ini
NEXTAUTH_URL=http://localhost:3001
NEXTAUTH_SECRET=any-random-string-for-local-dev
KEYCLOAK_CLIENT_ID=hhh-admin
KEYCLOAK_CLIENT_SECRET=hhh-admin-secret-change-me
KEYCLOAK_ISSUER=http://localhost:8080/realms/hhh
KEYCLOAK_BROWSER_URL=http://localhost:8080
KEYCLOAK_INTERNAL_URL=http://localhost:8080
```

### Run the admin test suite

```bash
cd admin
npm test
```

This runs the Jest + React Testing Library test suite located in `admin/src/__tests__/`. Tests cover middleware, auth session handling, and key page components.

---

## 8. Run All Tests

### Seed the local database

After services are up, run the idempotent seed script to create test users, questionnaires, Neo4j constraints, and default groups:

```bash
cd app
npm run seed
```

This creates a Keycloak test account (`testuser` / `testpass123` in the `hhh` realm), seeds SLIQ, RAND-36, and SRHI questionnaires into MongoDB, creates the four `hhh__ExperimentalSetting` Group nodes in Neo4j, and applies Neo4j constraints. The script is safe to re-run — all steps use MERGE or upsert semantics.

> **Admin UI management:** After initial seeding, researchers can create and manage custom questionnaires entirely through the admin panel (web portal → **Questionnaires**, or Flutter admin → **Questionnaires**). No further seed script edits are needed. Library instruments (SLIQ, RAND-36, SRHI) are read-only and cannot be modified through the UI.

### Node.js backend tests

```bash
cd app
npm install
npm test
```

Expected output:

```
Tests:       265 passed, 265 total
```

| Terminal | Screenshot |
|----------|-----------|
| npm test passing | ![npm test output showing all tests passing](../assets/screenshots/developer/npm-test-passing.png) |

### Flutter tests

```bash
cd mobile

# Always regenerate l10n before running tests
flutter gen-l10n

flutter test
```

Expected output ends with a line like:

```
All tests passed!
```

> **Note:** A small number of widget tests that omit `AppLocalizations.delegate` will report failures. These are pre-existing gaps not caused by your changes. Run `flutter analyze` to confirm no analysis errors.

### Admin app tests

```bash
cd admin
npm test
```

This runs the Jest + React Testing Library suite in `admin/src/__tests__/`. Expected output:

```
Tests:       X passed, X total
```

### Python API service tests

The recommender/API service has its own test suite under `API-service/tests/`. Run it inside the service's Python environment:

```bash
cd API-service
API_SERVICE_SECRET=test pytest tests/
```

The knowledge-base retrieval tests (`tests/test_retrieve.py`) mock LightRAG's HTTP endpoints using `respx` — no running LightRAG instance is needed. To run only those tests:

```bash
cd API-service
API_SERVICE_SECRET=test pytest tests/test_retrieve.py -v
```

### Ontology / SPARQL tests

```bash
cd tests
bash test-ontology.sh
```

Expected output (each line is a PASS):

```
[PASS] Ontology loads into Fuseki without errors
[PASS] owl:Class count > 100 (found: 134)
[PASS] No duplicate URIs
[PASS] G3/G4 groups are distinct
[PASS] HHH core classes present
```

---

## 9. Common Pitfalls

### Port conflicts

If `docker compose up` fails with "address already in use", find and stop the conflicting process:

```bash
# Find what is using port 3000
lsof -i :3000
# Kill it (replace <PID> with the actual PID)
kill -9 <PID>
```

Common conflicting ports: **3000** (Node.js), **3001** (Admin app), **8080** (Keycloak), **7474/7687** (Neo4j), **27017** (MongoDB), **3030** (Fuseki).

### Keycloak not ready

Keycloak takes 30–60 s to start. If the health endpoint returns `"keycloak": {"status": "error"}`:

```bash
# Watch Keycloak logs
docker compose logs -f keycloak

# Wait until you see:
# ... Keycloak 26.5.5 on JVM ... started in ...ms
```

Then retry `curl http://localhost:3000/api/v1/health`.

### Admin app cannot authenticate

If the admin app redirects to Keycloak but login fails or loops, check that:

1. Keycloak is healthy (`docker compose ps` shows `h3-keycloak` as healthy).
2. The `hhh-admin` client exists in the `hhh` realm.
3. Your Keycloak user has the `admin` or `researcher` realm role assigned.
4. `KEYCLOAK_ISSUER` in your `admin/.env.local` matches the issuer claim in the Keycloak token (use `http://localhost:8080/realms/hhh` for local dev).

### Flutter web CORS errors

If the Flutter web app shows network errors in Chrome DevTools, the backend CORS origin is not configured for `localhost`.

Set the `CORS_ORIGIN` variable in your `stack.env.local`:

```ini
CORS_ORIGIN=http://localhost:8080
```

Restart the app container:

```bash
docker compose restart app
```

### Keycloak realm not imported

If you see `404` on Keycloak realm endpoints, the realm import may have failed on first start:

```bash
# Inspect Keycloak startup logs
docker compose logs keycloak | grep -i "import\|error\|realm"

# Re-import manually
docker compose exec keycloak \
  /opt/keycloak/bin/kc.sh import --dir /opt/keycloak/data/import
```

### Flutter dependencies out of date

After a `git pull`, run `flutter pub get` in `mobile/` to refresh packages.

### Missing localisation methods after editing ARB files

If you add a key to `lib/l10n/app_en.arb` or `lib/l10n/app_de.arb` without regenerating, `flutter analyze` or `flutter test` will fail with `undefined method` errors:

```bash
cd mobile && flutter gen-l10n
```

This regenerates `lib/l10n/app_localizations.dart` and its language variants. Always run this step before `flutter analyze` or `flutter test` when ARB files have changed.

### Node.js version too old

The backend and admin app require Node.js **22 or later**. If you see syntax errors or unsupported feature warnings, check your version:

```bash
node --version
# Must be v22.x.x or higher
```

Use a version manager such as `nvm` or `fnm` to switch versions:

```bash
nvm install 22
nvm use 22
```

---

## 10. Verify Your Setup Checklist

Work through each check in order. Each shows the command and expected output.

**Check 1 — Docker services healthy**

```bash
curl -s http://localhost:3000/api/v1/health | python3 -c "import sys,json; d=json.load(sys.stdin); print('OK' if d['status']=='ok' else 'FAIL')"
```

Expected: `OK`

---

**Check 2 — Backend responds with JSON**

```bash
curl -s http://localhost:3000/api/v1/health | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])"
```

Expected: `ok`

---

**Check 3 — Keycloak realm accessible**

```bash
curl -s http://localhost:8080/realms/hhh/.well-known/openid-configuration | python3 -c "import sys,json; print(json.load(sys.stdin)['issuer'])"
```

Expected: `http://localhost:8080/realms/hhh`

---

**Check 4 — MongoDB reachable from app container**

```bash
docker compose exec app node -e "const {MongoClient}=require('mongodb'); MongoClient.connect(process.env.MONGO_HOST?'mongodb://'+process.env.MONGO_USER+':'+process.env.MONGO_PASSWORD+'@'+process.env.MONGO_HOST+':'+process.env.MONGO_PORT:'mongodb://localhost:27017').then(()=>{console.log('OK');process.exit(0)}).catch(e=>{console.log('FAIL',e.message);process.exit(1)})"
```

Expected: `OK`

---

**Check 5 — Neo4j reachable**

```bash
docker compose exec neo4j cypher-shell -u neo4j -p devpassword "RETURN 'OK' AS status;"
```

Expected:

```
status
"OK"
```

---

**Check 6 — Fuseki SPARQL endpoint responding**

```bash
curl -s -u admin:devpassword "http://localhost:3030/hhh/query?query=SELECT+%28COUNT%28*%29+AS+%3Fc%29+WHERE+%7B%3Fs+a+%3Chttp%3A%2F%2Fwww.w3.org%2F2002%2F07%2Fowl%23Class%3E%7D" | python3 -c "import sys,json; r=json.load(sys.stdin)['results']['bindings'][0]['c']['value']; print('OK ('+r+' classes)' if int(r)>100 else 'FAIL')"
```

Expected: `OK (134 classes)` (or similar — must be > 100)

---

**Check 7 — npm tests pass**

```bash
cd app && npm test -- --passWithNoTests 2>&1 | tail -5
```

Expected last lines:

```
Tests:       265 passed, 265 total
```

---

**Check 8 — Admin app tests pass**

```bash
cd admin && npm test 2>&1 | tail -5
```

Expected last lines contain:

```
Tests:       X passed, X total
```

---

**Check 9 — Flutter web compiles**

```bash
cd mobile && flutter build web --dart-define=API_BASE_URL=http://localhost:3000/api/v1 2>&1 | tail -3
```

Expected:

```
Built build/web
```

---

## Further Reading

- System architecture: [docs/architecture.md](../architecture.md)
- API specification: [docs/api/openapi.yaml](../api/openapi.yaml)
- Data model reference: [docs/data-model.md](../data-model.md)
- Operations runbook: [docs/runbook.md](../runbook.md)
- Admin guide: [docs/guides/admin-guide.md](admin-guide.md)
