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

---

## PHASE 12 — LLM Pipeline & Habit Donation Workflow (hjt-development integration)

> Merge and adapt the logic from `feature/hjt-context-classifier` into `hhh-platform-unified`. The Vue frontend and standalone HHH-service are discarded; the API-service Python logic is ported into the existing `API-service/` FastAPI service. All LLM calls use OpenAI only (SCADS key removed). Keycloak `sub` (UUID) is used as the canonical `userID` linking Neo4j habits to MongoDB users.

---

### US-096: Add OpenAI API key to env and wire LLM client in API-service

**Description:** As a developer, I need OpenAI configured as the sole LLM provider in the API-service so all downstream modules (M1.1, M1.2, M1.3, M3.x) can make LLM calls without any per-module configuration.

**Acceptance Criteria:**
- [ ] `stack.env` gains a placeholder `OPENAI_API_KEY=REPLACE_WITH_YOUR_OPENAI_API_KEY` entry with a comment explaining its purpose
- [ ] `API-service/` has a shared `llm_client.py` (or equivalent) that reads `OPENAI_API_KEY` from env and exposes a single async `chat_complete(messages, model, temperature)` helper
- [ ] Model name (e.g. `gpt-4o-mini`) and temperature are configurable via env vars `LLM_MODEL` and `LLM_TEMPERATURE` with sensible defaults
- [ ] SCADS-AI references removed from `API-service/` entirely
- [ ] `docker compose up` starts the API-service successfully with the placeholder key (service logs a warning but does not crash)
- [ ] Typecheck passes

---

### US-097: Port M1.1 Habit Classifier into API-service

**Description:** As a developer, I need the habit classifier (M1.1) from the hjt-development branch ported into the existing `API-service/` FastAPI app so the Flutter app can submit a sentence and learn whether it describes a habit.

**Acceptance Criteria:**
- [ ] `POST /api/v1/llm/classify-habit` endpoint added to `API-service/main.py`
- [ ] Request body: `{ "sentence": string, "language": string, "user_id": string }`
- [ ] Response body: `{ "uuid": string, "sentence": string, "language": string, "is_habit": boolean, "confidence": number }`
- [ ] LLM prompt logic ported from `hjt-context-classifier` branch; prompt is stored in a separate `prompts/classify_habit.txt` file (not hardcoded inline)
- [ ] Redis caching: cache key = SHA-256 hash of `(sentence, language)`; cache TTL configurable via env `REDIS_TTL_SECONDS` (default 86400)
- [ ] If Redis is unavailable the endpoint still functions (graceful fallback, logs warning)
- [ ] OpenAPI spec auto-generated by FastAPI and accessible at `/docs`
- [ ] Unit test covers: habit sentence → `is_habit=true`, non-habit sentence → `is_habit=false`, cache hit returns cached value
- [ ] Typecheck passes

---

### US-098: Port M1.2 Context Extractor into API-service

**Description:** As a developer, I need the context extractor (M1.2) ported so that once a sentence is classified as a habit, its contextual dimensions are extracted.

**Acceptance Criteria:**
- [ ] `POST /api/v1/llm/classify-context` endpoint added
- [ ] Request body: `{ "uuid": string, "sentence": string, "language": string }`
- [ ] Response body includes all 7 context dimensions: `TIME`, `PHYSICAL_SETTING`, `PRIOR_BEHAVIOR`, `OTHER_PEOPLE`, `INTERNAL_STATE`, `BEHAVIOR`, `REASONING` — each as a list of strings (empty list if not present)
- [ ] Prompt ported from hjt branch; stored in `prompts/classify_context.txt`
- [ ] Redis caching applied (same key strategy as US-097)
- [ ] Unit test covers: known habit sentence produces non-empty `BEHAVIOR` field; non-habit input (bypassed in practice) handled gracefully
- [ ] Typecheck passes

---

### US-099: Port M1.3 BCIO Ontology Mapper into API-service

**Description:** As a developer, I need the BCIO ontology mapper (M1.3) ported so extracted context phrases are mapped to BCIO concepts with a confidence score.

**Acceptance Criteria:**
- [ ] `POST /api/v1/llm/map-bcio` endpoint added
- [ ] Request body: `{ "uuid": string, "context_phrases": { [dimension: string]: string[] } }`
- [ ] Response body: `{ "mappings": [{ "phrase": string, "dimension": string, "bcio_concept_id": string, "bcio_concept_label": string, "confidence": number }] }`
- [ ] Mapping uses dense vector similarity against `bcio.owl` concepts (BAAI/bge-m3 embeddings or OpenAI `text-embedding-3-small` — configurable via env `EMBEDDING_MODEL`)
- [ ] `confidence` is a float 0–1 representing cosine similarity score
- [ ] Only mappings above `BCIO_MIN_CONFIDENCE` threshold (default 0.75, env-configurable) are returned
- [ ] BCIO concept index built once at startup and cached in memory; rebuilt if `bcio.owl` changes (file hash check)
- [ ] Unit test: known BCIO phrase maps to correct concept with confidence > 0.75
- [ ] Typecheck passes

---

### US-100: Store donated habit in Neo4j with context nodes and BCIO links

**Description:** As a user, I want my donated habit stored in Neo4j as a structured graph so researchers can analyse habits and their context across the study population.

**Acceptance Criteria:**
- [ ] Node.js backend gains `POST /api/v1/habits/donate` route (proxied through from Flutter)
- [ ] Route orchestrates the full M1.1 → M1.2 → M1.3 pipeline via internal calls to `API-service`
- [ ] If M1.1 returns `is_habit=false`, the sentence is stored in MongoDB (`habits` collection) with `is_habit: false` and the user is informed; no Neo4j write occurs
- [ ] If `is_habit=true`:
  - Neo4j `Habit` node created with properties: `uuid`, `sentence`, `language`, `is_habit: true`, `confidence`, `userID` (Keycloak sub), `created_at`
  - For each non-empty context dimension, a `Context` node is created (or matched if identical text exists) and linked via `HAS_CONTEXT { dimension }` relationship
  - For each BCIO mapping returned by M1.3: if a `BCIOConcept` node with that `bcio_concept_id` already exists, it is reused (not duplicated); a `MAPS_TO { confidence, phrase, dimension }` relationship is created from the `Context` node to the `BCIOConcept` node
  - `Habit` node linked to MongoDB user via `userID` property (Keycloak sub UUID)
- [ ] If two users donate similar habits that map to the same BCIO concept, they share the single `BCIOConcept` node — confirmed by Cypher query in a test
- [ ] Flutter receives success/failure response with human-readable message (e.g. "This doesn't look like a habit — try describing something you do regularly")
- [ ] Integration test: donate two similar habits from two different mock users, verify one shared `BCIOConcept` node exists in Neo4j
- [ ] Typecheck passes

---

### US-101: Migrate existing Neo4j habits to new BCIO-enriched ontology

**Description:** As a developer, I need a migration script that re-processes all existing Neo4j `Habit` nodes through M1.2 and M1.3 so the graph is enriched with context nodes and BCIO links consistently with new donations.

**Acceptance Criteria:**
- [ ] Script at `scripts/migrate-habits-bcio.js` (or `.py`) reads all `Habit` nodes from Neo4j where `migrated_to_bcio` property is absent or false
- [ ] For each such habit: calls M1.2 (context extraction) then M1.3 (BCIO mapping) via the `API-service` HTTP API
- [ ] Creates/merges `Context` nodes, `BCIOConcept` nodes, and relationships as per US-100
- [ ] Sets `migrated_to_bcio: true` and `migrated_at: <timestamp>` on the `Habit` node after successful enrichment
- [ ] Script is idempotent — safe to re-run; already-migrated nodes are skipped
- [ ] Script logs progress: `Processed N/Total habits — M succeeded, K failed`
- [ ] Failed habits logged with UUID and error reason; do not abort the whole run
- [ ] Script documented in `docs/migration.md` with run instructions
- [ ] Typecheck passes

---

## PHASE 13 — Configurable Questionnaire Forms (SLIQ & RAND-36)

> Questionnaire definitions are stored in MongoDB (`questionnaires` collection). The Flutter app fetches them at runtime and renders them using a modular, reusable form engine. The admin panel CRUD interface allows adding, editing, and removing questionnaire definitions without any app deployment. Responses are saved to MongoDB (`form_responses` collection) and linked to the Keycloak user ID.

---

### US-102: MongoDB questionnaire definition schema and seed data

**Description:** As a developer, I need a MongoDB schema and seed data for the SLIQ and RAND-36 questionnaires so they are the first questionnaires available in the system.

**Acceptance Criteria:**
- [ ] `mongo/seed/questionnaires.json` created with two documents: one for SLIQ, one for RAND-36
- [ ] Each document has: `_id`, `slug` (e.g. `sliq`, `rand-36`), `title`, `description`, `version`, `active: true`, `questions: []`
- [ ] Each question has: `id`, `text`, `type` (`single_choice | multi_choice | scale | text`), `options: []` (array of `{ value, label }`), `required: boolean`
- [ ] SLIQ: all 4 questions (diet, physical activity, smoking, alcohol) fully specified with correct response options per the validated instrument
- [ ] RAND-36: all 36 items fully specified with correct response options per the validated instrument
- [ ] Seed script (`mongo/seed/seed-questionnaires.js` or integrated into existing seed) inserts the documents with `upsert` so re-running is safe
- [ ] Node.js backend `GET /api/v1/questionnaires` returns the list of active questionnaire definitions
- [ ] Node.js backend `GET /api/v1/questionnaires/:slug` returns a single definition by slug
- [ ] Typecheck/lint passes

---

### US-103: Reusable Flutter questionnaire form engine

**Description:** As a user, I want to fill out standardized health questionnaires inside the app, rendered dynamically from the server-side definition, so the admin can update questions without an app update.

**Acceptance Criteria:**
- [ ] `mobile/lib/features/questionnaire/` module created
- [ ] `QuestionnaireFormWidget` is a reusable Flutter widget that accepts a questionnaire definition JSON and renders all question types: `single_choice` (radio), `multi_choice` (checkboxes), `scale` (slider), `text` (text field)
- [ ] Widget handles required field validation before submission
- [ ] Progress indicator shows current question / total questions
- [ ] "Save & Continue" saves partial progress to local state (Riverpod); "Submit" POSTs to backend
- [ ] `POST /api/v1/questionnaire-responses` endpoint on Node.js backend saves response to MongoDB `form_responses` collection with `userId` (Keycloak sub), `questionnaireSlug`, `answers`, `submitted_at`
- [ ] On successful submission, user sees a confirmation screen
- [ ] Widget is used for both SLIQ and RAND-36 screens (no separate widgets per questionnaire)
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

---

### US-104: User profile data written to MongoDB on questionnaire submission

**Description:** As a developer, I need questionnaire responses stored in MongoDB and linked to the user's profile so the recommendation pipeline (M3.2) can query them by Keycloak user ID.

**Acceptance Criteria:**
- [ ] `form_responses` MongoDB collection has an index on `{ userId: 1, questionnaireSlug: 1, submitted_at: -1 }`
- [ ] `GET /api/v1/questionnaire-responses/me` returns all responses for the authenticated user, ordered by most recent first
- [ ] `GET /api/v1/questionnaire-responses/me/:slug` returns the most recent response for a given questionnaire slug
- [ ] Backend validates JWT and extracts `sub` claim as `userId` — no client-supplied userId accepted
- [ ] Integration test: submit a SLIQ response → fetch by slug → verify all answers match
- [ ] Typecheck/lint passes

---

### US-105: Admin panel — standalone web app scaffold

**Description:** As a researcher, I need a simple standalone admin web app so I can manage questionnaires and system settings without touching the Flutter mobile app.

**Acceptance Criteria:**
- [ ] New directory `admin/` at repo root containing a Next.js (App Router) project
- [ ] `admin/` has its own `Dockerfile` and is added to `docker-compose.yml` as service `h3-admin` on an internal port with a Traefik label for `admin.${PATH_SUFFIX:-localhost}`
- [ ] Admin app authenticates via Keycloak OIDC (same realm as the rest of the platform); only users with `admin` or `researcher` role can log in — others see an "Access Denied" page
- [ ] Navigation sidebar with sections: **Questionnaires**, **Settings** (placeholder for future sections)
- [ ] Responsive layout suitable for desktop browser (minimum 1280px wide)
- [ ] App built with TypeScript; ESLint + Prettier configured
- [ ] `npm run build` in `admin/` succeeds with no errors
- [ ] Verify in browser using dev-browser skill

---

### US-106: Admin panel — questionnaire CRUD

**Description:** As a researcher, I want to create, edit, activate/deactivate, and delete questionnaire definitions from the admin panel so I can configure which forms participants see without a deployment.

**Acceptance Criteria:**
- [ ] Questionnaire list page shows all questionnaires with: slug, title, active status, question count, last updated
- [ ] "Add Questionnaire" opens a form: title, slug (auto-slugified from title), description, version, question builder
- [ ] Question builder allows adding questions with type selection (`single_choice`, `multi_choice`, `scale`, `text`), question text, options (for choice types), and required toggle
- [ ] Questions can be reordered via drag-and-drop within the builder
- [ ] "Edit" opens the same form pre-filled with existing data
- [ ] Toggle "Active/Inactive" sets `active` flag in MongoDB; inactive questionnaires are not returned by `GET /api/v1/questionnaires` in the mobile app
- [ ] "Delete" shows a confirmation dialog; delete is a hard delete only if there are zero responses linked to that questionnaire slug; otherwise it deactivates only and shows a warning
- [ ] All mutations go through the existing Node.js backend API (new admin-only routes: `POST`, `PUT`, `DELETE /api/v1/admin/questionnaires/:slug`), protected by Keycloak role check (`admin` or `researcher`)
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

---

## PHASE 14 — Workflow 3: Habit Recommendation Pipeline

> Implements M3.1–M3.6 from the diplomarbeit branch, adapted into the existing `API-service/` FastAPI service and proxied through the Node.js backend. The Flutter app drives the recommendation UI. Redis caches intermediate LLM results. A PDF knowledge base lives in `API-service/kb/`.

---

### US-107: Port M3.1 Habit Extractor into API-service

**Description:** As a developer, I need the Habit Extractor (M3.1) ported so the system can select relevant habits for a given user goal from the user's Neo4j habit database.

**Acceptance Criteria:**
- [ ] `POST /api/v1/llm/extract-habits` endpoint added to API-service
- [ ] Request: `{ "user_id": string, "goal": string }`
- [ ] Fetches all `Habit` nodes for `user_id` from Neo4j (via the existing Neo4j driver in the backend, passed as context, or via a dedicated internal call)
- [ ] LLM selects the most relevant habits for the given goal; returns selected habits with their context labels (excluding BCIO mappings)
- [ ] Response includes: `{ "selected_habits": [{ "uuid", "sentence", "context": { ... } }], "habit_summary": string }`
- [ ] Redis caching: key = SHA-256 of `(user_id, goal)`; TTL = `REDIS_TTL_SECONDS`
- [ ] Prompt stored in `prompts/extract_habits.txt`
- [ ] Typecheck passes

---

### US-108: Port M3.2 User Profile Extractor into API-service

**Description:** As a developer, I need the User Profile Extractor (M3.2) ported so the LLM can build a profile summary and detailed profile from the user's questionnaire responses in MongoDB.

**Acceptance Criteria:**
- [ ] `POST /api/v1/llm/extract-profile` endpoint added
- [ ] Request: `{ "user_id": string, "goal": string }`
- [ ] Fetches the user's most recent SLIQ and RAND-36 responses (and any other active questionnaire responses) from MongoDB via `GET /api/v1/questionnaire-responses/me/:slug` (internal call with service auth token)
- [ ] LLM produces: `profile_summary` (short, plain-language summary for M3.5) and `profile_detailed` (comprehensive, plus a rewritten goal statement optimised for RAG query for M3.3)
- [ ] Response: `{ "profile_summary": string, "profile_detailed": string, "rag_query": string }`
- [ ] Redis caching applied
- [ ] Prompt stored in `prompts/extract_profile.txt`
- [ ] Typecheck passes

---

### US-109: Port M3.3 RAG Retrieval into API-service

**Description:** As a developer, I need the RAG retrieval module (M3.3) ported so academic PDFs in the knowledge base are indexed and queried to support recommendation generation.

**Acceptance Criteria:**
- [ ] `POST /api/v1/llm/retrieve` endpoint added
- [ ] Request: `{ "rag_query": string }`
- [ ] PDFs in `API-service/kb/**/*.pdf` are indexed on first startup; each PDF gets a one-time LLM-generated summary stored in `API-service/kb/_meta/` as `<filename>.summary.json`
- [ ] Only dense vector embeddings used (OpenAI `text-embedding-3-small` or configured `EMBEDDING_MODEL`)
- [ ] Vector index stored in-memory (or Milvus if already available) — configurable via env `VECTOR_STORE` (`memory` | `milvus`)
- [ ] CRUD support for KB: `POST /api/v1/kb` (upload PDF), `GET /api/v1/kb` (list), `DELETE /api/v1/kb/:filename` (remove + re-index)
- [ ] Changes to the KB directory are detected at query time (file hash check) and the index is updated incrementally
- [ ] Response: `{ "sources": [{ "filename": string, "category": string, "excerpt": string, "score": number }] }`
- [ ] Typecheck passes

---

### US-110: Port M3.5 Habit Recommendation Generator into API-service

**Description:** As a developer, I need the Recommendation Generator (M3.5) ported so it combines habits, user profile, and RAG results to produce personalised recommendations.

**Acceptance Criteria:**
- [ ] `POST /api/v1/llm/recommend` endpoint added
- [ ] Request: `{ "user_id": string, "goal": string, "session_id": string }`
- [ ] Internally orchestrates M3.1 → M3.2 → M3.3 → M3.5 in sequence (or parallel where possible)
- [ ] LLM call combines: selected habits (M3.1), profile summary (M3.2), RAG sources (M3.3), and any prior feedback for same goal (M3.6 `comments` collection from MongoDB)
- [ ] Response: `{ "recommendation_id": string, "goal": string, "recommendations": [{ "title": string, "body": string, "rationale": string, "sources": [{ "filename", "excerpt" }] }], "generated_at": string }`
- [ ] Recommendation stored in MongoDB `recommendations` collection with `userId`, `goal`, `session_id`, `recommendations[]`, `generated_at`
- [ ] Redis caching applied: same `(user_id, goal)` returns cached result until cache TTL expires or user submits new feedback
- [ ] Prompt stored in `prompts/recommend.txt`
- [ ] Typecheck passes

---

### US-111: Port M3.6 Feedback Collector into API-service

**Description:** As a user, I want to leave a comment on a recommendation so the system can improve future recommendations for the same goal.

**Acceptance Criteria:**
- [ ] `POST /api/v1/recommendations/:recommendation_id/feedback` endpoint on Node.js backend
- [ ] Request body: `{ "comment": string }`
- [ ] Stores `{ recommendation_id, userId, goal, comment, created_at }` in MongoDB `recommendation_feedback` collection
- [ ] After feedback is stored, the Redis cache for `(user_id, goal)` is invalidated so the next recommendation request picks up the new feedback
- [ ] `GET /api/v1/recommendations/me` returns all past recommendations for the authenticated user with their feedback
- [ ] Typecheck passes

---

### US-112: Flutter recommendation screen with animated loading states

**Description:** As a user, I want an engaging animated loading experience while my habit recommendations are being generated so I understand the system is working and stay engaged.

**Acceptance Criteria:**
- [ ] `mobile/lib/features/recommendation/` module created
- [ ] Goal input screen: text field + "Get Recommendations" button
- [ ] On submit, user is taken to a loading screen that cycles through sequential animated messages:
  1. "Asking experts…" — animated icon: open book / academic cap
  2. "Looking through your habits database…" — animated graph network of nodes and edges (force-directed style, 5–8 nodes, continuously animated)
  3. "Reading academic papers…" — animated document/scroll icon with scanning line
  4. "Generating your personalised recommendations…" — pulsing brain/sparkle icon
- [ ] Each phase shows for a minimum of 2 seconds (even if the API responds faster); phases advance automatically as pipeline stages complete (use WebSocket or SSE progress events from backend, or time-based if streaming is out of scope)
- [ ] On completion, user is taken to the recommendation results screen showing recommendation cards
- [ ] Each recommendation card shows: title, body text, rationale, collapsible "Sources" section with PDF excerpt
- [ ] User can submit a text comment per recommendation (triggers US-111 feedback endpoint)
- [ ] "Try a different goal" button returns to goal input screen
- [ ] Empty state: if no habits have been donated yet, show message "Donate some habits first to get personalised recommendations" with a CTA button
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

---

### US-113: Admin panel — knowledge base management

**Description:** As a researcher, I want to manage the PDF knowledge base from the admin panel so I can add or remove academic papers without touching the server filesystem.

**Acceptance Criteria:**
- [ ] Admin panel "Knowledge Base" section (new sidebar entry) lists all PDFs in `API-service/kb/` grouped by category folder
- [ ] Each entry shows: filename, category, file size, whether a summary has been generated, upload date
- [ ] "Upload PDF" lets the admin pick a PDF file and a category; uploads via `POST /api/v1/kb` (Node.js proxies to API-service)
- [ ] "Delete" removes a PDF via `DELETE /api/v1/kb/:filename`; confirmation dialog shown first
- [ ] Summary generation status shown as a badge ("Pending" / "Ready"); admins can trigger re-indexing manually via "Re-index" button (`POST /api/v1/kb/reindex`)
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

---

## Updated Functional Requirements (Phase 12–14 additions)

- **FR-18:** All LLM calls in `API-service` use a single shared OpenAI client; model and temperature are env-configurable; no hardcoded model names outside env defaults
- **FR-19:** Redis caching is applied to all LLM-heavy endpoints (M1.1, M1.2, M1.3, M3.1, M3.2, M3.5); cache is keyed by SHA-256 of input; TTL is env-configurable
- **FR-20:** A donated habit sentence that is not classified as a habit (`is_habit=false`) is never written to Neo4j; it is stored in MongoDB only
- **FR-21:** BCIO concept nodes in Neo4j are shared across users — two habits mapping to the same BCIO concept share one node; duplication is prevented at write time using `MERGE`
- **FR-22:** Every BCIO mapping edge in Neo4j carries a `confidence` float property (0–1)
- **FR-23:** Questionnaire definitions are stored in MongoDB and fetched at runtime; no questionnaire content is hardcoded in the Flutter app or backend
- **FR-24:** The Flutter questionnaire form engine supports at minimum four question types: `single_choice`, `multi_choice`, `scale`, `text`; new types can be added without changing the widget API
- **FR-25:** The admin panel is a separate Next.js web app deployed as `h3-admin` Docker service; it shares the Keycloak realm for authentication and calls the existing Node.js backend API for all data mutations
- **FR-26:** Recommendation results are persisted in MongoDB; users can view their recommendation history
- **FR-27:** User feedback on a recommendation invalidates the Redis cache so subsequent requests to the same goal incorporate the new feedback
- **FR-28:** The PDF knowledge base supports full CRUD via API; the admin panel surfaces these operations in a UI; no direct filesystem access required for KB management

---

## Updated Non-Goals (Phase 12–14)

- No fine-tuning or training of LLM models (inference only via OpenAI API)
- No multi-tenant knowledge bases (one shared KB for all users)
- No real-time streaming of recommendation text (chunked response; loading animation is time-based)
- No push notifications when recommendations are ready
- No SCADS-AI or other LLM providers — OpenAI only for this phase
