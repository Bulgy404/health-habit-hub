# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
