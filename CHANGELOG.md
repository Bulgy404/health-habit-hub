# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[unreleased]: https://github.com/your-org/health-habit-hub/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/your-org/health-habit-hub/releases/tag/v1.0.0
