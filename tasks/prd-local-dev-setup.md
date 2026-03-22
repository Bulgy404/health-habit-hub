# PRD: Local Development Setup (iOS Simulator + Mac Backend)

## Introduction

Enable a developer to run the full Health Habit Hub stack locally on a Mac and
connect to it from the iOS Simulator — without touching the production server.
`AppConfig` already defaults to `http://localhost:3000/api/v1` and the iOS
Simulator shares the Mac's network stack, so the pieces are almost there.
What is missing: a local-optimised Docker Compose file, hot-reload for the
backend, a single-command launcher, a complete seed script, and a setup guide.

---

## Goals

- One command (`make dev`) starts all required services on Mac.
- The iOS Simulator connects to the locally running backend with no
  `--dart-define` overrides required (defaults already point to localhost).
- All app features work end-to-end locally: auth (Keycloak), habit donation,
  explore, recommendations, questionnaires.
- Seed data is ready after `make seed` — a test user exists and can log in
  immediately.
- A developer who has never run the project can follow `docs/guides/local-dev.md`
  and be fully running within 30 minutes.

---

## User Stories

---

### US-157: Create docker-compose.local.yml optimised for Mac development

**Description:** As a developer, I want a Docker Compose file tuned for local
Mac development so I can start all services quickly without Traefik, TLS, or
production-only overhead.

**Acceptance Criteria:**
- [ ] `docker-compose.local.yml` created at repo root.
- [ ] Includes only the services needed for local feature development:
  `app`, `mongo`, `neo4j`, `keycloak`, `translate`, `recommender`, `fuseki`.
  Excludes: `proxy` (Traefik), `backup`, `admin`, `mongo-express`.
- [ ] All services expose ports directly to the Mac host (no reverse proxy):
  - `app` → `3000:3000`
  - `mongo` → `27017:27017`
  - `neo4j` → `7474:7474`, `7687:7687`
  - `keycloak` → `8080:8080`
  - `translate` → `5000:5000`
  - `recommender` → `8001:8001`
  - `fuseki` → `3030:3030`
- [ ] `app` service uses `command: node --watch app.js` (Node.js built-in
  watch mode, no extra dependency) so backend restarts on file save.
- [ ] All services use the `.env` file via `env_file: .env`.
- [ ] `docker-compose.local.yml` validated with `docker compose -f docker-compose.local.yml config`.

---

### US-158: Add nodemon dev script to backend package.json

**Description:** As a developer, I want `npm run dev` in `app/` to start the
backend with file-watching so code changes take effect immediately without
manually restarting the container.

**Acceptance Criteria:**
- [ ] `nodemon` added to `app/package.json` `devDependencies`.
- [ ] `"dev": "nodemon app.js"` added to `scripts` section.
- [ ] `nodemon.json` created in `app/` with:
  ```json
  {
    "watch": ["app.js", "controllers/", "routes/", "services/", "middleware/", "utils/"],
    "ext": "js,json",
    "ignore": ["tests/", "node_modules/"],
    "delay": "500"
  }
  ```
- [ ] `npm run dev` starts the server and restarts within 1 second of saving
  any `.js` file under `app/`.
- [ ] `npm run lint` still passes after adding nodemon.

---

### US-159: Create full local seed script

**Description:** As a developer, I want a single seed command that populates
MongoDB, Neo4j, and creates a Keycloak test user so the app is immediately
usable after starting services.

**Acceptance Criteria:**
- [ ] `scripts/seed-local.js` created that sequentially:
  1. **MongoDB** — runs existing `mongo/seed/seed-questionnaires.js` logic
     (upserts SLIQ and RAND-36 questionnaire definitions).
  2. **Neo4j** — applies `neo4j/init/constraints.cypher` via the HTTP API,
     then seeds:
     - 4 `hhh__ExperimentalSetting` + group label nodes (Group1–Group4).
     - 1 test `hhh__Donor` node (`userId: 'dev-user-1'`, `hhh__group: 'G1'`).
     - 2 `Habit` nodes with `sentence`, `language: 'en'`, `uuid` set.
  3. **Keycloak** — uses the Keycloak Admin REST API to create a test user:
     - Username: `testuser`, Password: `testpass123`, Email: `test@local.dev`.
     - Assigns `participant` realm role.
     - Prints `"Test user created: testuser / testpass123"`.
- [ ] Script reads connection details from environment variables (same as
  `.env`): `MONGO_HOST`, `NEO4J_HTTP`, `NEO4J_USER`, `NEO4J_PASSWORD`,
  `KEYCLOAK_URL`, `KEYCLOAK_ADMIN`, `KEYCLOAK_ADMIN_PASSWORD`.
- [ ] Script is idempotent — safe to run multiple times without duplicating data.
- [ ] Script exits with code 0 on success, 1 with a clear error message on
  failure.
- [ ] `"seed": "node ../scripts/seed-local.js"` added to `app/package.json`
  scripts for convenience.

---

### US-160: Create Makefile with dev, seed, stop, and logs targets

**Description:** As a developer, I want a `Makefile` at the repo root so I can
start, seed, stop, and tail logs with single memorable commands.

**Acceptance Criteria:**
- [ ] `Makefile` created at repo root with the following targets:

  | Target | Command | Description |
  |--------|---------|-------------|
  | `make dev` | `docker compose -f docker-compose.local.yml up -d --build` | Start all local services |
  | `make stop` | `docker compose -f docker-compose.local.yml down` | Stop all local services |
  | `make seed` | `cd app && npm run seed` | Seed MongoDB, Neo4j, Keycloak |
  | `make logs` | `docker compose -f docker-compose.local.yml logs -f app` | Tail backend logs |
  | `make logs-all` | `docker compose -f docker-compose.local.yml logs -f` | Tail all service logs |
  | `make ios` | `cd mobile && flutter run -d iPhone` | Run app on iOS Simulator |
  | `make reset` | `make stop && docker volume rm ... && make dev && make seed` | Full reset — wipe volumes and restart |

- [ ] Each target has a `##` comment describing it (shown by `make help`).
- [ ] `make help` target prints all available targets and their descriptions.
- [ ] `Makefile` validated by running `make help` successfully.

---

### US-161: Write local development setup guide

**Description:** As a new developer, I want a step-by-step guide to running
the iOS Simulator against a local backend so I can test the full app flow
without needing server access.

**Acceptance Criteria:**
- [ ] `docs/guides/local-dev.md` created with the following sections:

  **Prerequisites**
  - macOS with Xcode installed (`xcode-select --install`)
  - Xcode iOS Simulator (`open -a Simulator` to verify)
  - Docker Desktop for Mac (with at least 6 GB RAM allocated)
  - Flutter SDK (`flutter doctor` shows iOS toolchain as OK)
  - Node.js 22 (`node --version`)

  **Setup (first time)**
  1. Copy `.env.example` to `.env` and fill in required values (list which ones
     are mandatory for local dev vs optional).
  2. `make dev` — starts all services (expected output shown).
  3. `make seed` — populates test data (expected output shown).
  4. Verify backend: `curl http://localhost:3000/health` → `{"status":"ok"}`.
  5. Verify Keycloak: open `http://localhost:8080` in browser.

  **Running the iOS Simulator**
  - `make ios` or manually:
    `flutter run -d iPhone --dart-define=API_BASE_URL=http://localhost:3000/api/v1`
  - Note: iOS Simulator shares the Mac's network — `localhost` works directly.
  - How to pick a specific simulator device: `flutter devices`, then
    `flutter run -d <device-id>`.

  **Test login**
  - Username: `testuser` / Password: `testpass123` (created by `make seed`)

  **Hot reload**
  - Backend: file changes in `app/` restart the server automatically (Node
    watch mode in the local compose).
  - Flutter: press `r` in the terminal running `flutter run` for hot reload,
    `R` for hot restart.

  **Stopping**
  - `make stop` — stops all Docker services (data is preserved in volumes).
  - `make reset` — wipes all volumes and starts fresh.

  **Troubleshooting** (at least 5 entries):
  - Port already in use.
  - Neo4j takes > 60s to start.
  - Keycloak realm not found.
  - iOS Simulator cannot reach localhost (firewall / network extension issue).
  - Translation service OOM on first run (model download).

- [ ] Guide reviewed: every command in it works on a clean Mac from scratch.

---

## Functional Requirements

- FR-1: `make dev` starts all 7 local services and they are all healthy within
  90 seconds on a Mac with 16 GB RAM.
- FR-2: iOS Simulator can reach `http://localhost:3000/api/v1` without any
  extra network configuration.
- FR-3: `make seed` is idempotent and completes in under 30 seconds.
- FR-4: Backend source file changes are reflected within 2 seconds without
  restarting Docker.
- FR-5: A developer with prerequisites installed can reach the login screen in
  the iOS Simulator within 30 minutes of cloning the repo.

---

## Non-Goals

- Android emulator setup (Android uses `10.0.2.2` for localhost — different
  approach, separate story if needed).
- Staging environment setup.
- Remote debugging / attach debugger to Docker container.
- Automated UI tests against the iOS Simulator.

---

## Technical Considerations

- iOS Simulator shares the Mac host network stack — `localhost` in the
  simulator resolves to the Mac. No special IP (`10.0.2.2`) needed.
- `AppConfig` defaults are already `http://localhost:3000/api/v1` and
  `http://localhost:8080` — no `--dart-define` flags needed for the default
  local setup.
- LibreTranslate downloads language models on first run (~500 MB). The
  `docker-compose.local.yml` should use the same `translate-data` named
  volume as the dev compose so models are cached across restarts.
- Keycloak `24` in dev mode (`start-dev`) is sufficient for local testing;
  no PostgreSQL needed locally.
- Neo4j `5-community` can take 40–60 seconds to become ready — the seed
  script should poll the HTTP API with retries before proceeding.

---

## Success Metrics

- All 7 services healthy within 90 seconds of `make dev` on a standard
  MacBook Pro.
- `testuser` can log in, donate a habit, and browse the explore feed in the
  iOS Simulator with zero production server calls.
- `docs/guides/local-dev.md` requires zero clarifying questions to follow.
