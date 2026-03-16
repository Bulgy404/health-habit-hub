# PRD: Health Habit Hub — Unified Platform (v2)

## Introduction

The Health Habit Hub (HHH) is a research platform for clinical habit-donation studies. Users donate their personal health habits, complete standardized questionnaires, and receive personalized habit recommendations powered by a knowledge-graph-backed recommender system. Researchers administrate study groups, track participant progress, and configure the study from a dedicated admin panel.

This PRD consolidates all existing branches into a single `rapid_dev` branch and defines the full platform rebuild: a cross-platform Flutter app (Android, iOS, Web), a unified shared backend, Keycloak authentication, a revised Neo4j/Fuseki ontology, and a sophisticated study administration panel.

---

## Goals

- Merge all existing branches into `rapid_dev` and resolve all conflicts
- Deliver a production-ready Flutter app running on Android, iOS, and Web (single codebase)
- Unify all services behind one shared backend API (Node.js + Python recommender)
- Integrate Keycloak as the self-hosted identity provider (OIDC/OAuth2)
- Revise and validate the Neo4j ontology — fix G3/G4 indistinguishability, integrate BCIO human behavior ontology
- Implement a sophisticated study admin panel: user management, group assignment, questionnaire config, habit monitoring
- Surface the habit recommender system with polished UI/UX in the Flutter app
- Provide live, anonymized Neo4j habit visualization for end users
- Ensure every service has dedicated test and deployment scripts, and full backup/restore coverage
- Refactor and clean up the codebase; consolidate all user-facing functionality into Flutter

---

## Existing System (baseline)

| Component | Location | Status |
|-----------|----------|--------|
| Node.js/Express web app | `app/` | Working (production) |
| MongoDB survey responses | `mongo/` | Working |
| Neo4j knowledge graph | Docker service `h3-neo4j` | Working, ontology has G3/G4 bug |
| Apache Fuseki SPARQL | `fuseki/` | Working |
| LibreTranslate | Docker service | Working |
| Traefik reverse proxy | Docker service | Working |
| Backup service | `backup-service/` | Partial |
| Flutter app skeleton | `mobile/`, branch `ralph/flutter-mobile-app` | Partial (US-018, US-019 done) |
| Python recommender API | `API-service/` in branch `feature/hjt-diplomarbeit-habit-recommendation-system` | Partial |
| Recommender Vue UI | `habit-recommendation-system-ui/` same branch | Partial |
| BCIO ontology | `API-service/src/openapi_server/Ontologies/bcio.owl` | Exists, not integrated |
| HHH ontology | `Ontology.ttl` (root + fuseki/init/) | Exists, has G3/G4 bug |

---

## User Stories

---

### PHASE 0 — Branch Consolidation

---

### US-000: Create `rapid_dev` branch and merge all branches
**Description:** As a developer, I need a single clean working branch that contains all work from all existing branches so that development can proceed without stale divergent code.

**Acceptance Criteria:**
- [ ] Create `rapid_dev` from `master`
- [ ] Merge in order: `development`, `feature/adminpanel`, `ralph/flutter-mobile-app`, `feature/hjt-diplomarbeit-habit-recommendation-system`, `feature/hjt-context-classifier`, `feature/backup`, `feature/neo4j`, `feature/server`, `feature/h3-proxy`, `feature/traeffic`, `feature/colorLaMarcel`, `contact-reward-language`, `docker-env`, `max-base-path`, `max-deployment-optionen`
- [ ] All merge conflicts resolved (no conflict markers remain)
- [ ] `docker-compose up` builds and starts without error
- [ ] Existing app accessible at configured URL

---

### PHASE 1 — Authentication (Keycloak)

---

### US-001: Deploy Keycloak as Docker service
**Description:** As a system administrator, I want a self-hosted Keycloak instance running in Docker so that all apps share one identity provider.

**Acceptance Criteria:**
- [ ] `keycloak` service added to `docker-compose.yml` and `docker-compose.prod.yml`
- [ ] Keycloak accessible at `/auth` via Traefik (or dedicated port in dev)
- [ ] Realm `hhh` created via exported realm JSON (committed to repo as `keycloak/hhh-realm.json`)
- [ ] Realm has client `hhh-flutter` (public, PKCE) and client `hhh-backend` (confidential)
- [ ] Realm configured with roles: `participant`, `admin`, `researcher`
- [ ] Keycloak admin credentials read from `stack.env`
- [ ] Health check passes in `docker-compose`

### US-002: Auto-generate participant accounts with token
**Description:** As an admin, I want Keycloak to automatically generate a participant account with a unique login token so that participants receive credentials without us knowing them.

**Acceptance Criteria:**
- [ ] Admin panel "Create Participant" action calls backend endpoint `POST /api/admin/participants`
- [ ] Backend creates Keycloak user with auto-generated username (`p-<uuid>`) and random secure password
- [ ] Token card format configurable in admin settings: options are QR code (deep-links to app login), printed username/password, or both
- [ ] Backend generates PDF token card in the configured format and returns it for download/print
- [ ] QR code deep-link format: `hhh://login?user=<username>&token=<password>` (app handles the scheme)
- [ ] Participant can log in with those credentials and immediately change password
- [ ] Participant role assigned automatically on creation

### US-003: Secure all backend API routes with Keycloak JWT
**Description:** As a developer, I want all existing and new backend routes protected by Keycloak tokens so that only authenticated users can access data.

**Acceptance Criteria:**
- [ ] Express middleware validates `Authorization: Bearer <token>` using Keycloak JWKS
- [ ] Public routes (landing page, health check) remain unauthenticated
- [ ] Admin routes require `admin` or `researcher` role claim
- [ ] 401 returned for missing/invalid token; 403 for insufficient role
- [ ] Existing survey/donate routes require `participant` role
- [ ] Tests: `tests/auth.test.js` covers protected + public routes

---

### PHASE 2 — Flutter App Foundation

---

### US-004: Configure Flutter app for Android, iOS, and Web
**Description:** As a developer, I need the Flutter project properly configured for all three platforms so that a single build pipeline covers all targets.

**Acceptance Criteria:**
- [ ] `flutter build apk`, `flutter build ios`, `flutter build web` all succeed without errors
- [ ] `flutter.gradle` / `pubspec.yaml` have correct package name `de.tu-dresden.hhh`
- [ ] iOS bundle ID `de.tu-dresden.hhh` set in `Runner.xcodeproj`
- [ ] Web `index.html` has correct PWA manifest
- [ ] `flutter test` passes
- [ ] CI script `scripts/build-flutter.sh` builds all three targets

### US-005: Implement OIDC login screen in Flutter (Keycloak)
**Description:** As a participant, I want to log in with my token credentials so that I can access my personal study data on any device.

**Acceptance Criteria:**
- [ ] Login screen shows username + password fields and "Login" button
- [ ] Uses `flutter_appauth` (PKCE flow) against Keycloak client `hhh-flutter`
- [ ] Access token and refresh token stored securely via `flutter_secure_storage`
- [ ] Automatic token refresh on expiry
- [ ] Failed login shows error message
- [ ] Logout clears tokens and returns to login screen
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-006: Implement bottom-navigation shell in Flutter app
**Description:** As a user, I want clear navigation between the app's main sections so that I can move between habit donation, recommendations, exploration, and profile quickly.

**Acceptance Criteria:**
- [ ] Bottom navigation bar with 4 tabs: Donate, Explore, Recommend, Profile
- [ ] Admin tab visible only when user has `admin` or `researcher` role
- [ ] Active tab highlighted
- [ ] Navigation state preserved on tab switch
- [ ] Works on Android, iOS, and Web
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

---

### PHASE 3 — Habit Donation (Flutter)

---

### US-007: Render SurveyJS questionnaires in Flutter WebView/native
**Description:** As a participant, I want to fill in the habit-donation questionnaire inside the Flutter app so that I don't need a separate browser.

**Acceptance Criteria:**
- [ ] Questionnaire fetched from backend `GET /api/surveys/:id`
- [ ] Rendered natively using `flutter_survey` or via in-app WebView for SurveyJS JSON
- [ ] Submission posts to `POST /api/surveys/:id/results` with JWT
- [ ] Offline state shown if no network
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-008: User profile questionnaire (demographics + health context)
**Description:** As a participant, I want to fill in a one-time profile questionnaire so that the recommender system can personalize suggestions for me.

**Acceptance Criteria:**
- [ ] Profile questionnaire survey fetched by type `profile` from backend
- [ ] Completed profile stored in MongoDB linked to userId
- [ ] If profile already completed, show summary instead of form
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

---

### PHASE 4 — Neo4j Ontology Revision

---

### US-009: Fix G3/G4 indistinguishability in Neo4j ontology
**Description:** As a researcher, I need group 3 and group 4 participants to be distinguishable in the knowledge graph so that study analyses are not confounded.

**Acceptance Criteria:**
- [ ] `Ontology.ttl` updated: `hhh__Group3` and `hhh__Group4` have distinct URIs and labels
- [ ] Neo4j seeding scripts updated to assign correct group labels on user creation
- [ ] Existing data migration script `scripts/migrate-group-labels.cypher` provided
- [ ] Cypher query `MATCH (u:hhh__Donor) RETURN u.hhh__group, count(*)` returns 4 distinct groups
- [ ] Test script `tests/ontology/test-groups.cypher` asserts all 4 groups distinguishable

### US-010: Integrate BCIO human behavior ontology into Fuseki + Neo4j
**Description:** As a developer, I want the BCIO ontology merged into the HHH ontology so that habit classification uses a validated behavioral science vocabulary.

**Acceptance Criteria:**
- [ ] BCIO class→HHH habit category mapping sourced from `feature/hjt-diplomarbeit-habit-recommendation-system` (file `API-service/src/openapi_server/Ontologies/concepts_all_merged.jsonl`); flagged for domain expert review before merge is finalised
- [ ] `bcio.owl` imported into `Ontology.ttl` via `owl:imports` or manually merged (no duplicate URIs)
- [ ] All BCIO classes relevant to habit context available in Fuseki SPARQL endpoint
- [ ] `fuseki/init/` updated files committed
- [ ] Neo4j nodes use BCIO URIs for behavior categories where applicable
- [ ] No broken references — SPARQL `SELECT * WHERE { ?s a owl:Class }` returns > 100 classes
- [ ] A `TODO: domain-review` comment is added in `Ontology.ttl` wherever mapping is uncertain

### US-011: Comprehensive ontology validation test suite
**Description:** As a developer, I need automated tests that verify every entity in the ontology is correctly modelled and retrievable so that ontology regressions are caught early.

**Acceptance Criteria:**
- [ ] Test script `tests/ontology/test-ontology.sh` runs against live Fuseki + Neo4j
- [ ] Tests cover: all 4 experiment groups retrievable, all habit classes have labels, all BCIO behavior classes present, all donor–habit–behavior triples well-formed, no orphaned nodes
- [ ] Tests cover Neo4j side: group assignments, habit donations, behavior + context links
- [ ] All tests green on clean seed
- [ ] CI pipeline runs this suite on `rapid_dev` push

---

### PHASE 5 — Shared Backend API

---

### US-012: Expose unified REST API for Flutter and web
**Description:** As a developer, I want a single versioned REST API (`/api/v1/`) that both the Flutter app and the existing web app consume so that there is no logic duplication.

**Acceptance Criteria:**
- [ ] All existing Express routes accessible under `/api/v1/` with JWT auth
- [ ] OpenAPI 3.1 spec generated at `/api/v1/docs`
- [ ] Existing web app refactored to call the same API internally (or via loopback)
- [ ] `GET /api/v1/health` returns service status for all downstream services (Neo4j, Mongo, Fuseki, Keycloak, Recommender)
- [ ] Tests in `tests/api/` cover all major endpoints

### US-013: Proxy Python recommender API through Node.js backend
**Description:** As a developer, I want the Python recommender service hidden behind the Node.js backend so that Flutter only talks to one API host.

**Acceptance Criteria:**
- [ ] `recommender` service added to `docker-compose.yml` (Python FastAPI, from `API-service/`)
- [ ] Node.js route `GET /api/v1/recommend/:userId` proxies to Python service
- [ ] Node.js route `POST /api/v1/recommend/classify` proxies habit classification
- [ ] Recommender service not directly exposed outside Docker network
- [ ] Integration test verifies round-trip recommendation

---

### PHASE 6 — Recommender System UI (Flutter)

---

### US-014: Habit recommendation screen with animated visualization
**Description:** As a participant, I want to see my personalized habit recommendations with a clear, engaging visualization so that I understand what habits are suggested and why.

**Acceptance Criteria:**
- [ ] Screen calls `GET /api/v1/recommend/:userId` and renders result
- [ ] Each recommendation card shows: habit name, category, confidence score, lay-language rationale (1–2 sentences in plain language)
- [ ] If the recommender returns a RAG citation, card shows source title + short excerpt (collapsible)
- [ ] Animated entry (fade/slide) for cards
- [ ] "Accept" / "Dismiss" actions on each card
- [ ] Empty state if no recommendations yet
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-015: Live habit recommendation feed (WebSocket or polling)
**Description:** As a participant, I want to see new recommendations appear live as they are generated so that the experience feels dynamic.

**Acceptance Criteria:**
- [ ] Backend emits recommendation events via WebSocket (`/ws/recommendations`)
- [ ] Flutter app subscribes to socket on screen open, unsubscribes on close
- [ ] New recommendation card animates into top of list
- [ ] Fallback: 30-second polling if WebSocket unavailable (Web platform)
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

---

### PHASE 7 — Anonymized Habit Explorer (Flutter)

---

### US-016: Live Neo4j habit graph visualization for users
**Description:** As a participant, I want to explore an anonymized view of all donated habits in the knowledge graph so that I can see what others have contributed.

**Acceptance Criteria:**
- [ ] Screen calls `GET /api/v1/habits/public` — returns anonymized habit nodes (no userId)
- [ ] Displayed as interactive graph using `flutter_force_directed_graph` or canvas widget
- [ ] Nodes colored by habit category (BCIO class)
- [ ] Tap on node shows habit name + category (no personal data) with annotation actions
- [ ] Annotation actions on a node: "I do this too" (thumb-up), "Helpful" (star) — stored anonymously, counts shown on node
- [ ] Filter by category chip row at top
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-017: Aggregated habit statistics dashboard
**Description:** As a participant, I want to see aggregated statistics about the donated habits so that I understand the study's scale and diversity.

**Acceptance Criteria:**
- [ ] Screen shows: total habits donated, habits by category (bar chart), habits by time (line chart)
- [ ] Charts use `fl_chart` or `syncfusion_flutter_charts`
- [ ] Data fetched from `GET /api/v1/habits/stats`
- [ ] Auto-refreshes every 60 seconds
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

---

### PHASE 8 — Admin Panel (Study Administration)

---

### US-018: Admin panel: participant management (list + create + assign group)
**Description:** As an admin, I want a participant management screen where I can view all enrolled participants, create new ones, and assign them to study groups so that study administration is self-contained.

**Acceptance Criteria:**
- [ ] Table lists all participants: username, group, enrollment date, last active, survey completion %
- [ ] "Create Participant" button → generates credentials (US-002) → shows printable token card
- [ ] "Assign Group" dropdown per participant (G1–G4); persists to Keycloak user attributes + Neo4j
- [ ] "Delete Participant" soft-deletes (anonymizes) with confirmation dialog
- [ ] Search + filter by group
- [ ] Pagination (50 per page)
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-019: Admin panel: per-participant progress tracker
**Description:** As a researcher, I want to click on any participant and see their full study progress so that I can track compliance and identify issues.

**Acceptance Criteria:**
- [ ] Detail view: profile questionnaire status, surveys completed (with timestamps), habits donated (count + list), recommendations accepted/dismissed
- [ ] Timeline view of all participant actions
- [ ] Export participant data as JSON (anonymized) for analysis
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-020: Admin panel: configurable questionnaire builder
**Description:** As an admin, I want to create, edit, and assign questionnaires from the admin panel so that study surveys can be updated without code changes.

**Acceptance Criteria:**
- [ ] List view of all surveys stored in MongoDB
- [ ] "New Survey" opens SurveyJS Creator (embedded or linked) or raw JSON editor
- [ ] Save/publish/archive survey actions
- [ ] Assign survey to group(s) — participants see only their group's surveys
- [ ] Drag-and-drop ordering for multi-step survey sequences
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-021: Admin panel: donated habits monitor
**Description:** As a researcher, I want a real-time view of recently donated habits so that I can monitor study data quality.

**Acceptance Criteria:**
- [ ] Live feed of latest habit donations (anonymized participant ID, habit, category, timestamp)
- [ ] Filter by group, date range, category
- [ ] Export filtered results as CSV
- [ ] Click habit opens Neo4j graph context for that habit node
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-022: Admin panel: device/session management
**Description:** As an admin, I want to see which devices and platforms are currently active in the study so that I have visibility over the deployed client types.

**Acceptance Criteria:**
- [ ] Table: participant ID, device type (Android/iOS/Web), app version, last seen, Keycloak session ID
- [ ] "Revoke session" button per device
- [ ] Count summary by platform
- [ ] Data sourced from Keycloak sessions API + app-reported device metadata
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

---

### PHASE 9 — Testing & Deployment

---

### US-023: Comprehensive backend test suite
**Description:** As a developer, I want a full automated test suite for the Node.js backend so that regressions are caught before deployment.

**Acceptance Criteria:**
- [ ] Unit tests for all controllers, models, middleware in `tests/unit/`
- [ ] Integration tests for all API routes in `tests/integration/` (uses test MongoDB + Neo4j containers)
- [ ] Auth middleware tested: valid JWT, expired JWT, missing token, wrong role
- [ ] Recommender proxy route tested with mock Python service
- [ ] `npm test` runs all tests and exits 0
- [ ] Coverage ≥ 80% on `app/` source

### US-024: Flutter widget + integration test suite
**Description:** As a developer, I want automated tests for the Flutter app so that UI regressions and business logic errors are caught.

**Acceptance Criteria:**
- [ ] Widget tests for all screens in `mobile/test/widget/`
- [ ] Integration tests for login, survey completion, recommendation flow in `mobile/integration_test/`
- [ ] `flutter test` passes
- [ ] `flutter test integration_test/` passes against test backend

### US-025: Deployment scripts per service
**Description:** As a developer, I want dedicated deploy scripts for each service so that I can deploy, rollback, or restart individual components independently.

**Acceptance Criteria:**
- [ ] `scripts/deploy-backend.sh` — builds + restarts `h3-app` container
- [ ] `scripts/deploy-flutter-web.sh` — builds Flutter web and copies to `app/public/flutter/`
- [ ] `scripts/deploy-recommender.sh` — rebuilds + restarts Python recommender container
- [ ] `scripts/deploy-keycloak.sh` — imports realm config + restarts Keycloak
- [ ] `scripts/deploy-full.sh` — orchestrates all of the above in order with health checks between steps
- [ ] Each script accepts `--dry-run` flag
- [ ] All scripts exit non-zero on failure

### US-026: CI/CD GitHub Actions pipeline
**Description:** As a developer, I want automated CI/CD so that every push to `rapid_dev` is tested and every push to `master` triggers deployment.

**Acceptance Criteria:**
- [ ] `.github/workflows/ci.yml`: runs `npm test`, `flutter test`, ontology tests on every PR
- [ ] `.github/workflows/deploy.yml`: runs `scripts/deploy-full.sh` on push to `master` (SSH to server)
- [ ] Build artifacts (Flutter APK, web bundle) uploaded to GitHub Releases on version tags
- [ ] Pipeline fails fast — first failure stops the run

---

### PHASE 10 — Backup, Recovery & Safeguards

---

### US-027: Automated daily backup for all data stores
**Description:** As an admin, I want all critical data backed up automatically every day so that study data is never permanently lost.

**Acceptance Criteria:**
- [ ] `backup-service/backup.sh` extended: MongoDB dump + Neo4j dump + Keycloak realm export
- [ ] Backups stored in `backups/` with timestamp directories
- [ ] Backup runs daily via Docker `healthcheck` cron or dedicated cron container
- [ ] `scripts/restore.sh <timestamp>` restores all three stores from a given backup
- [ ] Backup success/failure logged to file and optionally emailed (configurable in `stack.env`)
- [ ] Backups older than 30 days pruned automatically

### US-028: Data integrity safeguards
**Description:** As a developer, I want runtime safeguards that prevent data corruption or unauthorized access even if a bug exists.

**Acceptance Criteria:**
- [ ] MongoDB collections have JSON schema validation (no unknown fields accepted)
- [ ] Neo4j APOC constraints: `hhh__userId` unique, group labels constrained to G1–G4
- [ ] All DELETE operations soft-delete (set `deletedAt`), never hard-delete participant data
- [ ] Rate limiting on `/api/v1/` (max 100 req/min per token) via Express middleware
- [ ] Input sanitization on all POST/PUT body parameters

---

### PHASE 11 — Documentation

Documentation is the final gate before any release. It is written after all other phases are complete and verified. All screenshots are taken from the running production build; no mockups substituted.

---

### US-029: End-user participant guide (with screenshots)
**Description:** As a participant, I want a clear illustrated guide that explains every step of the study app so that I can use it confidently without external support.

**Acceptance Criteria:**
- [ ] Document saved as `docs/guides/participant-guide.md` (also exported as PDF `docs/guides/participant-guide.pdf`)
- [ ] Covers: downloading/accessing the app, logging in with token card, completing the profile questionnaire, donating a habit, browsing the habit explorer, understanding a recommendation card (including the RAG citation), annotating a habit node, updating profile
- [ ] Every screen mentioned has a corresponding screenshot in `docs/assets/screenshots/participant/`
- [ ] Screenshots taken on Android, iOS, and Web (browser); clearly labelled by platform
- [ ] Step-by-step numbered instructions; no assumed technical knowledge
- [ ] Available in English and German (LibreTranslate used for German draft, human-reviewed)

### US-030: Admin / researcher guide (with screenshots)
**Description:** As an admin, I want a complete illustrated reference for every admin panel function so that I can onboard new researchers without verbal explanation.

**Acceptance Criteria:**
- [ ] Document saved as `docs/guides/admin-guide.md` (also exported as PDF)
- [ ] Covers: logging in as admin, creating a participant + generating token card (both formats), assigning study group, configuring questionnaires (create/edit/publish/archive), monitoring donated habits, tracking participant progress, revoking a device session, configuring token card format in settings, exporting data
- [ ] Every admin screen has a screenshot in `docs/assets/screenshots/admin/`
- [ ] Screenshots annotated with numbered callouts matching the written steps
- [ ] Includes a "Quick Start" checklist for setting up a new study cohort from scratch

### US-031: System architecture documentation
**Description:** As a developer or future maintainer, I want a comprehensive architecture document so that I can understand the full system without reverse-engineering the code.

**Acceptance Criteria:**
- [ ] Document saved as `docs/architecture.md`
- [ ] Contains: system overview diagram (Mermaid or PNG) showing all Docker services, their ports, and data flows
- [ ] Per-service section: purpose, technology, key config, exposed API surface, dependencies
- [ ] Services covered: Traefik, Node.js backend, Flutter web, Python recommender, Keycloak, Neo4j, Fuseki, MongoDB, Mongo Express, LibreTranslate, backup service
- [ ] Sequence diagrams for: login flow (Keycloak PKCE), habit donation flow, recommendation request flow
- [ ] Ontology section: explains HHH ontology structure, BCIO integration, G1–G4 group encoding, with example Cypher and SPARQL queries
- [ ] Data model section: MongoDB collections (schema + example documents), Neo4j node/relationship types

### US-032: API reference documentation
**Description:** As a developer integrating with the backend, I want a complete API reference so that every endpoint is unambiguous.

**Acceptance Criteria:**
- [ ] OpenAPI 3.1 spec auto-generated and served at `/api/v1/docs` (Swagger UI)
- [ ] Spec committed as `docs/api/openapi.yaml`
- [ ] Every endpoint has: description, all parameters, request body schema, all response codes with example payloads, required auth role
- [ ] Python recommender API spec (`API-service/`) merged into the same unified spec or cross-linked
- [ ] Postman collection exported as `docs/api/hhh-postman-collection.json` covering all endpoints with example requests

### US-033: Deployment & operations runbook
**Description:** As a system operator, I want a step-by-step runbook so that I can deploy, update, and recover the platform on the production server without prior context.

**Acceptance Criteria:**
- [ ] Document saved as `docs/runbook.md`
- [ ] Covers: prerequisites (server spec, Docker version, open ports), first-time setup from scratch, deploying an update per service (`scripts/deploy-*.sh`), full-stack deployment (`scripts/deploy-full.sh`), rolling back a deployment, running the backup + verifying it, restoring from backup, rotating Keycloak secrets, adding a new admin user, checking service health (`GET /api/v1/health`)
- [ ] Includes a troubleshooting section: common errors and their resolutions (Keycloak token errors, Neo4j connection failures, Flutter web blank page, recommender service unreachable)
- [ ] Every command in the runbook is copy-pasteable and tested against the production environment

### US-034: Ontology & data model reference
**Description:** As a researcher or data analyst, I want a reference document for the ontology and all data stores so that I can write queries and interpret study data correctly.

**Acceptance Criteria:**
- [ ] Document saved as `docs/data-model.md`
- [ ] Neo4j section: all node labels, all relationship types, all properties with types and example values; 10 annotated example Cypher queries covering common research questions (habits by group, habits by BCIO category, donation timeline, etc.)
- [ ] Fuseki/SPARQL section: ontology namespace table, 10 example SPARQL queries
- [ ] MongoDB section: all collections with JSON schema, example documents, indexes
- [ ] Explains G1–G4 group encoding and how to query each group unambiguously
- [ ] Explains anonymisation model: what is stored, what is removed on soft-delete

### US-035: Developer onboarding guide
**Description:** As a new developer joining the project, I want a single document that gets me from zero to a running local development environment so that I can contribute within one day.

**Acceptance Criteria:**
- [ ] Document saved as `docs/guides/developer-onboarding.md`
- [ ] Covers: cloning the repo, required tools (Flutter, Docker, Node.js versions), environment setup (`stack.env` template), starting the full stack locally (`docker-compose up`), running the Flutter app in Chrome + Android emulator, running all tests, common pitfalls
- [ ] Includes a "verify your setup" checklist: 8 checks a developer can run to confirm everything works
- [ ] Links to architecture doc, API reference, and ontology reference
- [ ] Screenshots of a working local Flutter app (Web) and a passing test run

### US-036: Changelog and version history
**Description:** As a stakeholder, I want a maintained changelog so that I can track what changed between versions of the platform.

**Acceptance Criteria:**
- [ ] `CHANGELOG.md` at repo root following Keep a Changelog format
- [ ] All phases (0–11) summarised as version `1.0.0` entry
- [ ] Each entry has: version, date, sections Added / Changed / Fixed / Removed
- [ ] `CHANGELOG.md` update included as a required step in `scripts/deploy-full.sh` (script warns if version tag not bumped)

---

## Functional Requirements

- **FR-1:** Single Keycloak realm `hhh` is the sole authentication source for all clients (Flutter app, admin panel, web app, backend API)
- **FR-2:** Participant accounts are auto-generated; credentials never visible to researchers after creation
- **FR-3:** Flutter app is the sole user-facing client — the existing Node.js-rendered web app is retired and all its functionality (habit donation, survey, reward, demo, etc.) migrated into Flutter; no duplicate code paths
- **FR-4:** All network traffic from Flutter app goes to `/api/v1/` on the Node.js backend; Python recommender is never directly called by clients
- **FR-4b:** No participant group size limit is enforced by the system; groups are unlimited
- **FR-5:** Neo4j ontology must be able to distinguish all 4 experiment groups via Cypher query without ambiguity
- **FR-6:** BCIO ontology classes are available in Fuseki SPARQL and used for habit classification
- **FR-7:** All 7 ontology entity types must have passing retrieval tests before deployment
- **FR-8:** Admin panel is a Flutter route (not a separate web app), visible only to users with `admin` or `researcher` Keycloak role
- **FR-9:** Surveys displayed in the Flutter app are fetched from MongoDB and can be changed by admin without an app update
- **FR-10:** Anonymized habit graph shown to participants contains no userId, no name, no device info; participants can annotate nodes (e.g. "helpful", "I do this too") but annotations are stored anonymously
- **FR-11:** Habit recommendation cards show a lay-language explanation of the reasoning; where possible the explanation cites a source retrieved from the RAG/knowledge base (title + short excerpt)
- **FR-12:** All DELETE actions on participant data are soft-deletes; data is anonymized, not removed
- **FR-13:** Daily backups cover MongoDB, Neo4j, and Keycloak realm; restore script tested and documented
- **FR-14:** `npm test` and `flutter test` must both pass on `rapid_dev` before any merge to `master`
- **FR-15:** Documentation is written against the final running build; no placeholder screenshots or TODO sections permitted in a release
- **FR-16:** Participant guide and admin guide must each exist in English and German before go-live
- **FR-17:** OpenAPI spec at `/api/v1/docs` must be current with the deployed backend at all times; spec is generated, not hand-maintained

---

## Non-Goals (Out of Scope)

- Native push notifications (may be added post-study)
- App Store / Play Store submission (internal/TestFlight distribution only for this study)
- Keeping the existing Node.js-rendered web app as a parallel user-facing interface (it is retired in `rapid_dev`; backend API layer is kept)
- Multi-language support beyond what LibreTranslate already handles
- Participant-to-participant messaging or social features
- Real-time collaboration in the admin panel (single admin at a time is acceptable)
- Automatic habit classification ML model training (use existing BCIO mapping from `API-service/`)
- GDPR consent flows (handled externally by study ethics process)

---

## Design Considerations

- Flutter app: Material 3 design language, consistent with existing brand colors from `feature/colorLaMarcel`
- Neo4j graph visualization: use force-directed layout; nodes color-coded by BCIO top-level category
- Admin panel: dense data tables (not card-based); optimized for desktop browser via Flutter Web
- Recommendation cards: large, scannable; swipe-to-dismiss gesture on mobile
- All screens must handle empty states, loading states, and error states explicitly

---

## Technical Considerations

- **Keycloak version:** 24.x (latest stable); configured via realm JSON export in `keycloak/`
- **Flutter version:** pin to stable channel (3.22+); web renderer: `canvaskit` for graph views, `html` for forms
- **Python recommender:** FastAPI with OpenAPI spec already in `API-service/`; add `uvicorn` production entrypoint
- **Neo4j:** APOC plugin required for constraints and migration scripts; already on Neo4j 5
- **Ontology merging:** Use Protégé or ROBOT tool to merge `Ontology.ttl` + `bcio.owl`; commit merged file
- **Branch merge order for `rapid_dev`:** infrastructure branches first (traefik, server, proxy), then data (neo4j, backup), then features (adminpanel, recommender, flutter)
- **Existing web app:** retired in `rapid_dev`; Node.js backend API layer kept, all views removed
- **Device metadata:** Flutter app sends `X-App-Platform` header on every request; backend stores in session record

---

## Success Metrics

- All 4 experiment groups distinguishable in Neo4j (0 ambiguity)
- Flutter app installs and runs on a physical Android device, iOS simulator, and Chrome
- A new participant can be created, log in, complete profile + habit survey, and receive a recommendation — end to end in < 5 minutes
- Admin can re-configure a questionnaire and participant sees the update on next app launch without any deployment
- `npm test` + `flutter test` pass in CI with ≥ 80% coverage on backend
- All ontology validation tests green on a clean Neo4j + Fuseki seed
- Daily backup creates a restorable snapshot (restore tested in CI with ephemeral containers)
- All 6 documentation deliverables exist, contain real screenshots, and have no placeholder sections before `master` merge

---

## Open Questions

~~1. Should the Flutter web build replace the existing Node.js web app at `/`, or live at `/app/` alongside it?~~
→ **Resolved:** Flutter replaces the web app entirely in `rapid_dev`; no duplicate code.

~~2. Which specific BCIO classes map to the existing HHH habit categories?~~
→ **Resolved:** Mapping exists in `concepts_all_merged.jsonl` (diplomarbeit branch); flagged for domain expert review before final ontology merge. Uncertain mappings annotated with `TODO: domain-review`.

~~3. Should the anonymized habit graph be read-only for participants?~~
→ **Resolved:** Participants can annotate nodes ("I do this too", "Helpful"); annotations stored anonymously.

~~4. Does the recommender need to explain its reasoning in lay terms?~~
→ **Resolved:** Yes — lay-language rationale required on every recommendation card. RAG citations shown as collapsible source excerpts where available.

~~5. Is there a maximum number of participants per group?~~
→ **Resolved:** No limit; groups are unlimited.

~~6. Should the token card be a QR code or printed credentials?~~
→ **Resolved:** Both formats supported; admin configures the default in the admin settings panel (QR code deep-links to app login, printed card shows username/password, or both).
