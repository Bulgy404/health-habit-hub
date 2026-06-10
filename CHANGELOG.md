# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added — Legal-document versioning (2026-06-10)
- YAML front matter (`version`, `effectiveDate`, `bindingLanguage`) on all 9 legal documents (`app/language/{en,de,ja}/{privacy,imprint,accessibility}.md`); legal wording unchanged
- `parseFrontMatter` in `app/utils/markdown.js` (no new dependency); legal-page API responses now include a `document` metadata field
- Flutter legal screen renders a localized footer (version · effective date) and, on non-German locales, an authoritative-version note — *wording of that note pending DPO confirmation*
- CI gate `app/scripts/checkLegalDocs.mjs` (`npm run check:legal`): fails the build when locales of a document carry different `version`/`effectiveDate`, preventing silent translation drift; 5 new unit tests for the front matter parser

### Removed — Legacy web experiment app (2026-06-10)
- Deleted the unauthenticated server-rendered experiment site: `donate`, `thanks`, `demo`, `about`, `reward`, and `contact` routes + controllers, their public JS assets, and the root redirect to `/:lng/donate`. Habit donation happens exclusively via `POST /api/v1/habits/donate`
- Deleted the old n10s/RDF Neo4j writer (`app/utils/Neo4jDatabase.js`) and its models (`donation.js`, `experimentGroup.js`, `contexts.js`), integration test, and script; existing legacy graph data is untouched (see `docs/migration.md`)
- Dropped now-unused dependencies (`express-recaptcha`, `nodemailer`), `RECAPTCHA_*` env vars (compose + `.env.example`), and `recaptcha`/`mail` config blocks; removed `test:neo4j` script
- **Kept:** legal pages (`/:lng/imprint`, `/privacy`, `/accessibility`) — the Flutter app fetches and renders them — and the surveys API (`/api/v1/surveys`), which the mobile app uses
- Scrubbed configuration & docs: `RECAPTCHA_*` removed from `.env`, `stack.env`, `DEPLOYMENT.md`, `DOCUMENTATION.md` (env section), and `docs/guides/developer-onboarding.md`; `MAIL_RECEIVER` dropped from `.env` (contact-form only — `MAIL_USER/PASS/FROM` kept for the backup service); legacy user manuals (`docs/MANUAL-{en,de,ja}.md`) carry a deprecation banner pointing to the participant guide; fixed stale "WebView survey" description in `docs/guides/flutter-architecture.md` (donation is a native form against the REST API)
- Verified: ESLint clean, 480/480 backend tests pass, compose files validate

### Fixed — Legacy donate flow crash (2026-06-10)
- `app/controllers/donateController.js`: `saveDonateData` dynamically imported `Neo4jSparqlDbClient`, a class renamed to `Neo4jDbClient` in the US-170 dead-code pass. The dynamic import evaded static analysis and resolved to `undefined`, so every submission of the legacy web donate form (`POST /:lng/donate`) crashed with `TypeError: Neo4jSparqlDbClient is not a constructor` (HTTP 500). Import corrected; verified against the exported class and full test suite (480/480 pass)

### Fixed — Architecture docs vs. actual stack (2026-06-10)
- Removed Fuseki from all current architecture diagrams and service tables — the service is no longer in `docker-compose.yml`; ontology/RDF sections in `docs/architecture.md`, `docs/data-model.md`, and `DOCUMENTATION.md` are now marked *retired/legacy*
- Corrected backup documentation: targets are MongoDB, LightRAG, Neo4j, Keycloak (not Fuseki); retention is configurable via `BACKUP_RETENTION_DAYS` (default 14 days, not 30)
- Clarified Redis's role in diagrams: API-service response cache consulted *before* the LightRAG retrieval + LLM generation pipeline

### Added — Documentation & Diagrams (2026-06-10)
- New diagrams-as-code suite under `docs/diagrams/`: system architecture (Mermaid), UML use case diagram (PlantUML), structured use case catalogue with code traceability (30 use cases, 5 actors), one Mermaid sequence diagram per use case (`UC-01` … `UC-30`), and a domain class diagram covering MongoDB collections, Neo4j nodes, and backend domain classes
- `docs/diagrams/Makefile` + README for reproducible export to SVG/PNG/PDF via `mermaid-cli` and PlantUML; all Mermaid sources validated with `mermaid.parse()`
- Rewrote `README.md`: condensed Mermaid architecture overview, repository layout, use case section, full documentation index, contributing conventions (logo and badges retained)
- Replaced placeholder `SECURITY.md` with a real security policy (private reporting, scope, supported versions)
- Cross-linked `docs/architecture.md`, `docs/data-model.md`, and `DOCUMENTATION.md` to the new diagram suite

### Changed
- LightRAG upgraded from 1.3.9 to 1.5.0 (`lightrag/Dockerfile`)

### Changed — Full-Repo Clean Sweep (2026-06-03/04)

**Stack 1 — `app/` (Node.js/Express)**
- Renamed `token_card_service.js` → `tokenCardService.js` (camelCase convention); updated all import paths
- Deleted `app/controllers/defaultController.js` — confirmed unused (no active consumers)
- Split `habitsRouter.js` (888 lines) into three focused modules: `habits/habitsCrudRouter.js`, `habits/habitsStatsRouter.js`, `habits/habitsGraphRouter.js`; orchestrator reduced to 68 lines
- Converted `.then()` callback chains to `async/await` in `questionnaireResponsesRouter.js` and `adminRouter.js`; documented PDFKit `new Promise` wrapper in `tokenCardService.js`
- Added JSDoc (`@param`, `@returns`, `@throws`) to all 17 exported service functions and all 5 exported middleware functions
- Extracted single-responsibility helpers from long service functions in `habitDonationService.js`, `studyService.js`, `studyCodeService.js`, `notificationService.js`; private helpers prefixed `_camelCase`

**Stack 2 — `API-service/` (Python/FastAPI)**
- Extracted shared Redis lazy-initialisation pattern into `routers/_cache.py` (`get_redis`, `make_cache_key`, `_REDIS_TTL`); removed duplication from `extract_habits.py` and `extract_profile.py`
- Extracted shared LLM invocation helpers into `routers/_llm_helpers.py` (`load_prompt_template`, `call_llm_with_fallback`); simplified `refine_translation.py` and `refine_translation_de.py`
- Replaced all `Any` type hints with concrete types across all routers (`AsyncIOMotorDatabase`, `aioredis.Redis`, `list[str]`, `dict[str, object]`, etc.); used `cast` where JSON shapes are known at runtime
- Standardised `HTTPException` error handling: all routers use `status.HTTP_*` constants; replaced raw integer status codes
- Added Google-style docstrings (module-level + `Args`/`Returns`/`Raises` blocks) to all router functions, helper functions, and Pydantic models across all 12 Python files

**Stack 3 — `admin/` (Next.js 14)**
- Removed unused `useRef` import and dead CSS classes (`.categoryCell`, orphaned `.select` in knowledge-base module)
- Moved `analytics-tab.tsx` from `app/(admin)/studies/` into `components/studies-analytics-tab.tsx`; updated all import paths
- Replaced all remaining `any` TypeScript types with proper interfaces; exported `StudySummaryForAnalytics` type
- Added JSDoc to all exported page components (`StudiesPage`, `CuePoolsPage`, `KnowledgeBasePage`, `QuestionnairesPage`, `SettingsPage`, `ProfileFieldsPage`) and `Sidebar`, `AnalyticsTab`, `apiFetch`, `authOptions`
- Extracted data-fetching hooks into same-directory files: `useStudiesData.ts`, `useQuestionnairesData.ts`, `useCuePoolsData.ts`, `useKnowledgeBaseData.ts`; page components reduced to thin rendering shells

**Stack 4 — `mobile/` (Flutter)**
- Split `main.dart` (592 lines) into `app.dart` (HhhApp widget) and `router/app_router.dart` (GoRouter config + all routes); `main.dart` reduced to ~30-line entry point
- Split `bubble_graph_widget.dart` (529 lines) into `bubble_graph/bubble_graph_data.dart`, `bubble_graph/bubble_graph_painter.dart`, `bubble_graph/bubble_graph_gesture_handler.dart`
- Extracted reusable `AdminDataTable<T>` widget to `screens/admin/widgets/admin_data_table.dart`; refactored `admin_questionnaires_screen.dart` and `admin_surveys_screen.dart` to use it
- Split `donate_screen.dart` (646 lines) into `donate/widgets/donate_form_widget.dart` and `donate/widgets/donate_progress_widget.dart`
- Added `///` Dart doc comments to all public classes, methods, providers, and fields across 70+ files; added section headers (`// ── State reads ──`, `// ── Main layout ──`, etc.) to large `build()` methods

## [1.3.0] - 2026-04-16

### Security
- Participant passwords now stored as bcrypt hashes (was plaintext) — `adminParticipantService.js`
- Timing-safe secret comparison for shared-secret endpoints; security headers middleware added to all responses
- Shared-secret authentication added between Node.js backend and Python API service — new env var `API_SERVICE_SECRET`, new file `API-service/auth.py`
- IDOR vulnerability closed on recommendations feedback endpoint — query now scoped by `userId`; regression test added
- Field length limits added to all API request models in Python API service
- LLM call timeout added to Python API service
- Knowledge-base endpoint path traversal guard added
- PII redacted from survey submission logs
- `secure` and `sameSite` cookie flags added to session cookies
- `_id` field stripped from all API responses
- WebView navigation restricted to app origin in donate and profile screens

### Added
- Redis distributed lock on notification cron job — prevents duplicate dispatch across multiple instances
- Jest + React Testing Library test suite for Next.js admin app (`admin/src/__tests__/`)
- IDOR regression tests for recommendations feedback endpoint
- Interaction tests for questionnaires, studies, and knowledge-base admin pages
- `API-service/auth.py` — shared-secret middleware for all Python API routes

### Changed
- `adminRouter.js` refactored into domain sub-routers: `app/routes/admin/participantsRouter.js`, `studiesRouter.js`, `surveysRouter.js`, `notificationsRouter.js`
- Token card PDF generated at participant creation time (previously generated lazily on first download)
- Python API singletons consolidated into shared `API-service/deps.py` using FastAPI lifespan management
- Redis compare-and-delete now uses unique per-lock token to prevent accidental lock release

### Removed
- Age-consent middleware removed from Node.js backend
- Disclaimer routes removed from Node.js backend
- Legal document screen added to Flutter app to replace the removed middleware/routes

## [1.2.0] - 2026-03-22

### Changed — Clean Code Refactor Cycle (US-162 to US-170)

**Flutter app (`mobile/`)**
- Extracted shared `AuthInterceptor` + `DioProvider` (`lib/core/auth_interceptor.dart`, `lib/core/dio_provider.dart`) — removed duplicated `_authHeaders()` from 6 service files
- Extracted shared `OfflineBanner` widget to `lib/widgets/offline_banner.dart` — removed duplication between `DonateScreen` and `ProfileScreen`
- Decomposed `AdminParticipantsScreen` into `_FilterBar`, `_ParticipantsTable`, `_PaginationBar`, `_ErrorView`, `_CreateParticipantDialog` sub-widgets
- Decomposed `AdminHabitsScreen` into `_FilterBar`, `_DonationListView`, `_DonationTile`, `_ErrorView` sub-widgets
- Decomposed `QuestionnaireFormWidget` into 8 named sub-widget classes
- Split `ProfileScreen._init()` into `_init()` + `_initSurvey()` + focused helpers
- Fixed infinite-fetch loop in `ExploreScreen` annotate closure (catch block now sets `_fetchedLang`)
- Replaced all silent `catch(_) {}` blocks with `catch(e, st) { debugPrint(...) }` pattern
- `HabitDonation.donatedAt` changed to `DateTime?` (null-safe)
- `ProfileScreen` now uses `AppConfig.apiBaseUrl` (removed hardcoded production URL)

**Node.js backend (`app/`)**
- Extracted `app/utils/getDb.js` — removed 8 copy-pasted `getDb()` functions from route files
- Extracted `app/services/habitDonationService.js` — `POST /habits/donate` handler reduced from 143 to ~20 lines
- Split `translate()` into `fetchLibreTranslation()` + `refineLLMTranslation()` in `app/utils/translate.js`
- Extracted `app/services/keycloakAdminClient.js` — Keycloak admin API wrapper with 55s token TTL cache
- Extracted `app/middleware/roles.js` — `ROLES` constants + `isPrivileged()` helper
- `createAuthMiddleware` now composes `createTokenVerifier` — single JWKS cache (no duplication)
- Removed `console.log` debug statements from `app.js`, `donateRouter.js`; removed dead `/test-disclaimer` and `/submit-form` routes
- Replaced `uuid` npm package with `node:crypto.randomUUID` in `donateRouter.js` and `surveyRouter.js`

**Neo4j / data layer (`app/`)**
- Extracted `app/db/habitQueries.js` and `app/db/adminQueries.js` — moved all inline Cypher strings from routers and services
- Extracted `app/models/donation.js` — `Donor`, `Label`, `Donation`, `ExperimentalSetting` domain model classes (previously duplicated between `Neo4jDatabase.js` and `SparqlDatabase.js`)
- Extracted `app/utils/constants.js` — shared constants (RDF namespaces, group labels, etc.)
- `SparqlDatabase.js`: renamed `DbClient` → `SparqlDbClient` for naming consistency with `Neo4jDbClient`; fixed critical bug where `isClosedTaskClosedDescription` etc. were referenced without `()` (truthy function references)
- Fixed deprecated `exists()` call in `scripts/migrate-group-labels.cypher` (Step 2)

**CI / Scripts**
- Added reusable GitHub Actions composite actions: `.github/actions/setup-node-app/action.yml`, `.github/actions/setup-flutter/action.yml` — eliminated ~60 lines of duplicated setup steps across CI jobs
- `scripts/deploy-*.sh`: updated `docker-compose` → `docker compose` (Docker Compose v2 plugin CLI)
- `scripts/deploy-keycloak.sh`: replaced brittle `grep | cut` token extraction with `jq -r '.access_token'`
- `scripts/deploy-full.sh`: fixed health check — now polls Keycloak health endpoint (not backend) after Keycloak deploy
- `scripts/generate-spec.js`: removed dead 44-line `toYaml()` function; added `process.exit(1)` on error
- `scripts/restore.sh`: shebang updated to `#!/usr/bin/env bash`; timestamp format changed to UTC ISO 8601
- `.github/workflows/deploy.yml`: updated `actions/checkout@v6` → `@v4`

**Tests**
- Backend: 265 passing tests (up from 247 in v1.1.0)
- Flutter: `flutter analyze` zero issues; `flutter test` 49/49 passed

## [1.1.0] - 2026-03-21

### Added

**Habit donation pipeline (M1)**
- `POST /api/v1/habits/donate` — end-to-end habit donation: creates `Habit` node in Neo4j with BCIO context enrichment via API-service (`classify-context` + `map-bcio`); non-habits stored in MongoDB `habits` collection
- `GET /api/v1/habits` — returns all donated `Habit` nodes with `uuid`, `original`, `language`, `translationEN`, `translationDE`; `?lang=en|de` query parameter adds `displayText` convenience field

**Translation pipeline**
- Automatic English habit refinement: LibreTranslate EN draft → LLM tone refinement via `POST /api/v1/llm/refine-translation`; stored as `translationEN` on Habit node
- Automatic German habit refinement: LibreTranslate DE draft → LLM tone refinement via `POST /api/v1/llm/refine-translation-de`; stored as `translationDE` on Habit node
- `scripts/backfill-de-translations.js` — migration script to back-fill `translationDE` for all existing English Habit nodes (supports `--dry-run`)

**Python API-service (recommender)**
- `POST /api/v1/llm/classify-habit` — classifies a sentence as a habit or non-habit with confidence score
- `POST /api/v1/llm/classify-context` — extracts 7 BCIO context dimensions from a habit sentence
- `POST /api/v1/llm/map-bcio` — maps extracted context phrases to BCIO concepts via embedding similarity
- `POST /api/v1/llm/refine-translation` — refines a raw EN machine translation into natural English
- `POST /api/v1/llm/refine-translation-de` — refines a raw DE machine translation into natural German
- Redis LLM response caching (SHA-256 keyed, configurable TTL)
- `API-service/data/bcio.owl` — 32-concept BCIO stub OWL file for embedding-based concept mapping

**Questionnaire system**
- `GET /api/v1/questionnaires` and `GET /api/v1/questionnaires/:slug` — serve questionnaire definitions from MongoDB
- `POST /api/v1/questionnaire-responses` — store questionnaire answers (indexed on userId + slug + submitted_at)
- `GET /api/v1/questionnaire-responses/me` and `GET /api/v1/questionnaire-responses/me/:slug` — retrieve own responses
- Flutter `questionnaire_screen.dart` — step-by-step form for SLIQ, RAND-36 and custom questionnaires; all 4 question types (singleChoice, multiChoice, scale, text)

**User preferences**
- `GET /api/v1/users/me` and `PUT /api/v1/users/me` — read/write `preferredLanguage` ('en' or 'de') per user; stored in MongoDB `users` collection
- Flutter `user_settings_screen.dart` — Settings tab with Language dropdown; persists preference server-side
- Flutter `locale_provider.dart` — `StateNotifierProvider` driving `MaterialApp.router locale`; calls `PUT /api/v1/users/me` on change

**Recommendations**
- `GET /api/v1/recommendations/me` — retrieve personalised habit recommendations for the authenticated user
- `POST /api/v1/recommendations/:recommendation_id/feedback` — accept or dismiss a recommendation
- Flutter recommendation screen with rationale, citations, accept/dismiss actions, and local history cache

**Onboarding**
- `POST /api/v1/onboard` — unauthenticated endpoint; creates Keycloak user with random UUID username and 32-byte hex password; returns JWT pair (rate-limited to 5 req/hour per IP)
- Flutter passphrase screen — BIP39-style 36-word mnemonic encoding credentials; copy-to-clipboard and checkbox gate before Continue
- Flutter restore screen — enter passphrase to recover credentials on a new device

**Admin panel (Next.js)**
- `admin/` — Next.js 14 App Router admin panel at `/admin`
- Keycloak OIDC login (NextAuth v4, `hhh-admin` confidential client); middleware blocks non-admin/researcher users with `/access-denied` redirect
- Sidebar layout with Questionnaires and Settings pages
- `admin` service added to `docker-compose.yml` as `h3-admin` on port 3001

**Knowledge base**
- `GET|POST /api/v1/kb` — list and upload documents to the knowledge base (proxied to API-service); restricted to admin/researcher roles
- `POST /api/v1/kb/reindex` — trigger KB reindex
- `DELETE /api/v1/kb/:filename` — remove a KB document

**Security improvements**
- JWT audience (`KEYCLOAK_JWT_AUDIENCE`) and issuer (`KEYCLOAK_JWT_ISSUER`) validation added to `app/middleware/auth.js`
- IDOR fix on `GET /api/v1/recommend/:userId` — participants can now only access their own recommendations
- `internalRouter.js` routes now protected by `INTERNAL_API_SECRET` secret header check
- Rate limiter moved to run after authentication middleware (per-user limiting now works correctly)
- JWKS cache refresh: `app/middleware/auth.js` re-fetches keys on 401 JWK-not-found to handle key rotation
- Consistent error response shape `{ error: '...' }` across all v1 routes
- Consistent `console.error('[route] Error:', err)` logging in all catch blocks

**Tests**
- Backend: 247 passing tests (up from 186 in v1.0.0)
- Flutter: `flutter analyze` zero issues; `flutter test` passes (23 pre-existing `MaterialApp` widget-test failures from missing l10n delegates fixed progressively)

**Documentation**
- `docs/api/openapi.yaml` — 14 new paths documented (onboard, habits, questionnaires, questionnaire-responses, recommendations, users, KB)
- `docs/api/hhh-postman-collection.json` — 7 new request folders for all new endpoints
- `docs/data-model.md` — Neo4j schema for new `Habit`/`Context`/`BCIOConcept` labels; 6 new MongoDB collections documented
- `README.md` — backend npm scripts table and 18-variable env var reference added
- `docs/guides/admin-guide.md` and `admin-guide-de.md` — Section 9: Language Settings for Participants

### Changed

- Flutter `donate_screen.dart` — replaced hard-coded production API URL with `AppConfig.apiBaseUrl`
- Flutter `main.dart` — GoRouter auth guard added; unauthenticated users redirected from protected routes to `/onboarding/welcome`
- Flutter `goal_input_screen.dart` — replaced legacy `Navigator.push()` with `context.push()` (GoRouter)
- Flutter `pubspec.yaml` — pinned `flutter_appauth: 8.0.3` and `flutter_secure_storage: 9.2.4` to exact versions
- `.env.example` — updated with all env vars used across services, each with a one-line description

### Fixed

- Silent `catch (_) {}` blocks across `donate_screen.dart` and `locale_provider.dart` replaced with `debugPrint` error logging
- Null-safety: defensive `(json['field'] ?? '').toString()` in `Survey.fromJson`, `Recommendation.fromJson`, `RagCitation.fromJson`
- `surveyController.js` error shape standardised from `{ status: 'error', message }` to `{ error: 'Server error' }` consistent with all other v1 routes

## [1.0.0] - 2026-03-16

### Added

**Phase 0 – Branch consolidation**
- Merged all infrastructure branches (`feature/traeffic`, `feature/h3-proxy`, `feature/server`, `docker-env`, `max-base-path`, `max-deployment-optionen`) into a unified `rapid_dev` base
- Merged all feature branches (`feature/neo4j`, `feature/backup`, `feature/colorLaMarcel`, `contact-reward-language`, `feature/adminpanel`, `ralph/flutter-mobile-app`, `feature/hjt-diplomarbeit-habit-recommendation-system`, `feature/hjt-context-classifier`) into a single history

**Phase 1 – Keycloak identity provider**
- Self-hosted Keycloak 24 service in Docker Compose (dev and prod)
- `keycloak/hhh-realm.json` — reproducible realm definition with public PKCE client (`hhh-flutter`), confidential service-account client (`hhh-backend`), and roles `participant`, `admin`, `researcher`
- `app/middleware/auth.js` — JWKS-cached JWT verification middleware; attaches decoded token to `req.user`
- `app/middleware/requireRole.js` — role-gate middleware; returns 403 when required role is absent

**Phase 2 – Versioned API and recommender proxy**
- All routes namespaced under `/api/v1/` with auth and role guards applied uniformly
- `GET /api/v1/health` — unauthenticated health endpoint; parallel downstream checks (Neo4j, MongoDB, Fuseki, Keycloak, recommender) with 1 500 ms timeout and 503 on critical failure
- Python recommender service (`API-service/`) added to Docker Compose; proxied via Node.js routes `GET /api/v1/recommend/:userId`, `GET /api/v1/recommend/:userId/history`, `POST /api/v1/recommend/classify`

**Phase 3 – Ontology and Neo4j integrity**
- Fixed G3/G4 group indistinguishability: `hhh:Group3` ("Full+Free-text") and `hhh:Group4` ("Minimal+Free-text") given distinct URIs and labels in `fuseki/init/Ontology.ttl`
- Migration script `scripts/migrate-group-labels.cypher` for existing Neo4j data
- BCIO human-behavior ontology (119 classes from BCT Taxonomy v1) merged inline into `fuseki/init/Ontology.ttl`; uncertain HHH↔BCIO mappings annotated `rdfs:comment "TODO: domain-review"`
- APOC uniqueness constraints and automated ontology test suite (`scripts/test-ontology.sh`)

**Phase 4 – Flutter mobile/web application**
- Flutter 3.22 app (`mobile/`) targeting Android, iOS, and Chrome
- Keycloak PKCE login screen with QR-code token-card fallback
- Profile screen (POST `/api/v1/profile`)
- Habit donation screen with Neo4j graph explorer and annotation flow
- Recommendation screen with rationale, citation, accept/dismiss actions and local history cache

**Phase 5 – Study admin panel**
- Full-featured admin panel (Flutter + Node.js admin routes)
- Participant CRUD, group assignment (G1–G4), token-card PDF download
- Survey builder: create, publish, archive, assign to groups; response export (CSV)
- Participant progress dashboard: session log, recommendations log, habit donations count
- Device session revocation via Keycloak admin API
- Admin settings: configurable token-card format (QR size, include study-ID flag)

**Phase 6 – Test suite**
- 186 unit and integration tests (`app/tests/`)
- Flutter widget and golden tests (`mobile/test/`, 42 tests)
- End-to-end smoke tests (`scripts/e2e-smoke.sh`)
- Ontology validation tests (`scripts/test-ontology.sh`)
- Coverage reporting via `c8` (`npm run test:coverage`)

**Phase 7 – Deployment scripts**
- `scripts/deploy-backend.sh` — pull, `npm ci`, restart Node.js container, health-poll
- `scripts/deploy-flutter-web.sh` — `flutter build web`, copy to `app/public/flutter/`, restart
- `scripts/deploy-keycloak.sh` — rolling restart with realm re-import guard
- `scripts/deploy-recommender.sh` — rebuild Python image, rolling update
- `scripts/deploy-full.sh` — orchestrates all four scripts with health checks between steps; `--dry-run` mode; version-bump guard (this file)

**Phase 8 – Security, backup, and hardening**
- `backup-service/` extended: MongoDB (`mongodump`), Fuseki (tar), Neo4j (`neo4j-admin dump`), Keycloak realm export via admin API; cron daemon (02:00 UTC daily); 30-day retention; structured log
- `scripts/restore.sh` — interactive restore with confirmation prompt; restores all three databases and Keycloak realm
- `app/middleware/rateLimiter.js` — 100 req / 15 min per user; 429 JSON response
- `app/middleware/inputSanitizer.js` — recursive HTML-tag stripping for POST/PUT/PATCH bodies
- MongoDB `$jsonSchema` validators for key collections (`scripts/add-mongo-validators.js`)
- Soft-delete pattern enforced across all DELETE routes (`deletedAt` timestamp)

**Phase 9 – End-user documentation**
- `docs/guides/participant-guide.md` + PDF — 7-section guide (access, login, profile, habit donation, graph annotation, recommendations, update profile); Android/iOS/Chrome screenshot tables; German translation `participant-guide-de.md` + PDF
- `docs/guides/admin-guide.md` + PDF — 8-section guide (login, create participant, group assignment, survey config, habit monitoring, progress tracking, session revocation, settings); German translation `admin-guide-de.md` + PDF

**Phase 10 – Technical documentation**
- `docs/architecture.md` — system overview Mermaid diagram; per-service reference table; sequence diagrams for PKCE login, habit donation, recommendation request; ontology section with Cypher and SPARQL examples
- `docs/data-model.md` — Neo4j node/relationship reference with 10 annotated Cypher queries; Fuseki/SPARQL namespace table with 10 annotated queries; MongoDB collection schemas; G1–G4 encoding reference; anonymisation model

**Phase 11 – API reference and developer experience**
- `docs/api/openapi.yaml` — OpenAPI 3.1 spec (28 paths) generated from JSDoc annotations; Swagger UI at `GET /api/v1/docs`
- `docs/api/hhh-postman-collection.json` — Postman v2.1 collection with 28 requests, `{{baseUrl}}` / `{{token}}` variables
- `docs/runbook.md` — 11-section operations runbook (first-time setup, per-service updates, full-stack deploy, rollback, backup verification, restore, secret rotation, adding admin users, health checking, troubleshooting)
- `docs/guides/developer-onboarding.md` — zero-to-working-dev-environment guide (required tools, clone/branch, `stack.env` template, `docker-compose up`, Flutter in Chrome/Android, running all tests, common pitfalls, 8-point verify checklist)

### Changed

- Retired all EJS/HTML view templates from `app/views/`; all routes now return JSON (Flutter is the sole frontend)
- All controllers migrated from `res.render()` to `res.json()`
- Backup service retention extended from 14 days to 30 days

### Fixed

- G3/G4 ontology indistinguishability: groups 3 and 4 previously shared indistinct URIs, making study-group queries ambiguous; each group now has a unique URI and label in `Ontology.ttl`

[unreleased]: https://github.com/your-org/health-habit-hub/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/your-org/health-habit-hub/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/your-org/health-habit-hub/releases/tag/v1.0.0
