# Health Habit Hub — Documentation

**Version:** 3.1
**Last Updated:** June 2026
**Production Domain:** https://habit.wiwi.tu-dresden.de
**Repository:** https://github.com/helict/health-habit-hub

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture](#2-architecture)
3. [Repository Structure](#3-repository-structure)
4. [Tech Stack](#4-tech-stack)
5. [Environment Variables](#5-environment-variables)
6. [Local Development](#6-local-development)
7. [Production Deployment](#7-production-deployment)
8. [Admin Application](#8-admin-application)
9. [Testing](#9-testing)
10. [API Reference](#10-api-reference)
11. [Security](#11-security)
12. [Troubleshooting](#12-troubleshooting)

---

> **This file is the central reference** — architecture, containers, environment,
> security, and API. Deeper, task-specific docs live alongside it:
> | Doc | Use it for |
> | --- | --- |
> | [`DEPLOYMENT.md`](DEPLOYMENT.md) | Step-by-step first production deploy (Portainer, secrets) |
> | [`docs/runbook.md`](docs/runbook.md) | Day-two ops: updates, rollback, backup/restore, secret rotation, Neo4j Browser access, troubleshooting |
> | [`docs/DEPLOYMENT_TESTING_CHECKLIST.md`](docs/DEPLOYMENT_TESTING_CHECKLIST.md) | Post-deploy smoke-test checklist |
> | [`docs/data-model.md`](docs/data-model.md) | MongoDB collections + Neo4j graph schema |
> | [`docs/architecture.md`](docs/architecture.md) | Extended architecture narrative |
> | [`docs/diagrams/`](docs/diagrams/README.md) | Diagrams-as-code (system, sequences, use cases, class model) |
> | [`docs/migration.md`](docs/migration.md) | Fuseki → Neo4j/LightRAG migration history |

## 1. Project Overview

Health Habit Hub (H3) is a mobile-first research platform developed at TU Dresden (Chair of Business Informatics, esp. Health Informatics). It enables participants to donate, explore, and receive recommendations about health habits in the context of a longitudinal research study.

### Key Features

- **Flutter mobile app** — cross-platform (iOS, Android, web), Keycloak PKCE login, habit donation, AI-powered recommendations, guided onboarding
- **Habit classification pipeline** — LLM-based habit extraction, BCIO ontology mapping, and recommendation generation via the Python FastAPI service
- **Semantic knowledge base** — Neo4j habit graph with BCIO ontology alignment, plus a LightRAG graph+vector knowledge base _(the former Fuseki/RDF triplestore has been retired — see docs/migration.md)_
- **Multi-language support** — English, German, French, Japanese, and Dutch (LibreTranslate for automatic translation + LLM refinement)
- **Automated notifications** — Redis-coordinated scheduled push notification dispatch, plus per-habit check-in delivery (see _Questionnaire Scheduling & Check-in Delivery_)
- **Researcher admin panel** — study management, participant tracking, questionnaire authoring and scheduling

---

## 2. Architecture

> **Diagrams-as-code:** the maintained diagram suite — system architecture ([Mermaid source](docs/diagrams/architecture/system-architecture.mmd)), UML use case diagram + [use case catalogue](docs/diagrams/use-cases/use-case-overview.md), one sequence diagram per use case (UC-01 … UC-39, [docs/diagrams/sequences/](docs/diagrams/sequences/)), and the [domain class diagram](docs/diagrams/classes/class-diagram.mmd) — lives in [docs/diagrams/](docs/diagrams/README.md) with rendering/export instructions (SVG · PNG · PDF).

### System Diagram

Everything runs as Docker containers on one host, path-routed behind Traefik on a
single domain (`habit.wiwi.tu-dresden.de`). The Flutter app and admin panel are
the public entrypoints; a set of internal admin/debug tools sit behind a Keycloak
SSO gate (`oauth2-proxy`).

```
 Participants (Flutter app)          Researchers / Admins (browser)
        │  HTTPS / WSS                        │  HTTPS
        └──────────────┬──────────────────────┘
                       ▼
        ┌──────────────────────────────────────────────┐
        │  proxy — Traefik v3 (TLS, Let's Encrypt)       │  :80/:443, bolt :7687
        └──┬───────────┬───────────┬──────────┬─────────┘
           │ /api/v1   │ /admin    │ /auth     │ (internal tools)
           ▼           ▼           ▼           ▼
      ┌────────┐  ┌────────┐  ┌──────────┐  ┌───────────────────────────┐
      │  app   │  │ admin  │  │ keycloak │  │ oauth2-proxy (SSO gate)   │
      │ Node   │  │ Next.js│  │  + kc-db │  │ forward-auth, admin role  │
      │ :3000  │  │ :3001  │  │ (postgres)│ └──────────────┬────────────┘
      └───┬────┘  └────────┘  └──────────┘                 │ gated
          │ service token                    ┌─────────────┴─────────────────┐
          ▼                                   ▼      ▼       ▼        ▼       ▼
   ┌────────────┐                        Prometheus Grafana RedisInsight  Bull  mongo-
   │ recommender│                                                         Board express
   │ Python API │──chat/embed──▶ LLM (llm.scads.ai)                    (/queues) (/mongo)
   │ :8000      │──▶ lightrag ──entity/embed──▶ LLM      LightRAG WebUI (/lightrag,
   └─────┬──────┘   (graph+vector KB, :9621)              own login, not SSO)
         │
  ┌──────┼───────────┬──────────────┐        Data stores
  ▼      ▼           ▼              ▼
┌──────┐┌──────┐  ┌──────┐    ┌───────────┐
│mongo ││neo4j │  │redis │    │ knowledge │  Ops/support: config-sync (git pull),
│ :27017││bolt  │  │ :6379│    │ -mcp :8002│  backup, docker-socket-proxy,
│      ││:7687 │  │      │    │ (MCP/SSE) │  blackbox-exporter, keycloak-init
└──────┘└──────┘  └──────┘    └───────────┘
```

### Service Responsibilities

All 22 containers, grouped by role. Container names are prefixed `hhh-`
(e.g. service `app` → container `hhh-app`).

**Edge & identity**

| Service | Image | Responsibility |
| --- | --- | --- |
| `proxy` | `traefik:v3.6.1` | Reverse proxy; TLS via Let's Encrypt; path-based routing on `${DOMAIN}`; dedicated `neo4jbolt` entrypoint on :7687 |
| `oauth2-proxy` | `oauth2-proxy:v7.13.0` | Keycloak SSO **forward-auth gate** for the internal tools; only realm `admin` role passes. Identifies users by `preferred_username` |
| `keycloak` | `keycloak:26.5.5` | Identity provider; realm `hhh`; clients: `hhh-flutter` (public PKCE), `hhh-backend` (confidential SA), `hhh-admin`, `hhh-ropc`, `grafana`, `oauth2-proxy` |
| `keycloak-db` | `postgres:16-alpine` | Keycloak's persistence backend |
| `keycloak-init` | `keycloak:26.5.5` | One-shot init: injects client secrets, creates the `oauth2-proxy` client if missing, seeds the admin user (via `kcadm`) |

**Application**

| Service | Image | Responsibility |
| --- | --- | --- |
| `app` | `hhh/app` (Node 22, Express) | REST API `/api/v1/*` (JWT-verified via Keycloak JWKS); WebSocket recommendations; notification scheduler; BullMQ `habitQueue`; Bull Board at `/queues` |
| `admin` | `hhh/admin` (Next.js 15, MUI, NextAuth) | Researcher/admin dashboard at `/admin`; participant management; questionnaire authoring; study config. OIDC login via Keycloak (`hhh-admin`) |
| `recommender` | `hhh/recommender` (Python, FastAPI) | LLM habit classification, BCIO mapping, context extraction, RAG recommendation; protected by `API_SERVICE_SECRET` |
| `knowledge-mcp` | `hhh/knowledge-mcp` (FastMCP, SSE, :8002) | MCP server exposing `search_knowledge` / `ingest_document` over the LightRAG KB to AI agents |
| `translate` | `hhh/translate` (LibreTranslate, baked EN/DE/JA/FR/NL) | Self-hosted machine translation used by the backend |

**Data stores**

| Service | Image | Responsibility |
| --- | --- | --- |
| `mongo` | `mongo:7.0` | Studies, questionnaires, intentions, logs, SRHI trajectories, recommendations, restore attempts, device tokens |
| `neo4j` | `neo4j:5` | Habit / Context / BCIOConcept graph; bolt :7687. Loopback ports `127.0.0.1:17474/17687` for admin SSH tunnels |
| `redis` | `redis:7-alpine` | API-service response cache; BullMQ `habitQueue`; notification-cron lock |
| `lightrag` | `hhh/lightrag` (lightrag-hku 1.5.0, :9621) | Graph + vector knowledge base for RAG. Has its **own** login (`AUTH_ACCOUNTS`) — not on the SSO |

**Internal tools** (all HTTP tools gated by `oauth2-proxy` SSO / admin role)

| Service | Image | Responsibility |
| --- | --- | --- |
| `mongo-express` | `mongo-express:1.0` | Web UI for MongoDB at `/mongo` (own basic-auth disabled; SSO-gated) |
| `redisinsight` | `redis/redisinsight:latest` | Web UI for Redis at `/redisinsight` |
| `prometheus` | `prom/prometheus:v3.4.1` | Metrics scraping + 30-day retention at `/prometheus` |
| `grafana` | `grafana/grafana-oss:12.0.1` | Dashboards at `/grafana`; its own Keycloak OIDC SSO (separate from oauth2-proxy) |
| `blackbox-exporter` | `prom/blackbox-exporter:v0.25.0` | Probes service endpoints for Prometheus uptime metrics |

**Ops & support**

| Service | Image | Responsibility |
| --- | --- | --- |
| `config-sync` | `alpine/git:latest` | One-shot: refreshes the on-server `/opt/hhh/repo` config clone before dependents start |
| `backup` | `hhh/backup` | ~24h loop: MongoDB dump, Neo4j dump, LightRAG tar, Keycloak realm export; configurable retention |
| `docker-socket-proxy` | `tecnativa/docker-socket-proxy:0.3.0` | Scoped Docker API for the backup service (no raw socket mount) |

---

## 3. Repository Structure

```
health-habit-hub/
├── app/                            # Node.js/Express backend
│   ├── main.js                     # Entry point
│   ├── app.js                      # Express app setup, middleware, route mounting
│   ├── routes/                     # All API route handlers (~30 routers under /api/v1)
│   │   ├── habits/                 # habitsCrudRouter (donate + retrieve, BullMQ-backed),
│   │   │   │                       # habitsGraphRouter, habitsStatsRouter
│   │   ├── adminRouter.js          # /api/v1/admin — mounts all admin/ sub-routers
│   │   ├── admin/                  # auditLogRouter, backupsRouter, notificationsRouter,
│   │   │   │                       # participantsRouter, restoreAttemptsRouter, studiesRouter,
│   │   │   │                       # surveysRouter, systemRouter, teamRouter
│   │   ├── restoreRouter.js        # /api/v1/restore — passphrase-based account recovery
│   │   ├── recommendationsRouter.js# /api/v1/recommendations — cached recommendations
│   │   ├── recommendRouter.js      # /api/v1/recommend — live AI recommendation calls
│   │   ├── questionnairesRouter.js, questionnaireResponsesRouter.js
│   │   ├── usersRouter.js          # /api/v1/users (profile, consent, delete, rotate-credentials)
│   │   ├── kbRouter.js             # /api/v1/kb — knowledge base (admin/researcher)
│   │   ├── onboardRouter.js        # /api/v1/onboard — anonymous self-registration
│   │   ├── studyEnrollRouter.js, studyConfigRouter.js, srhiRouter.js, intentionsRouter.js,
│   │   │   cuePoolRouter.js        # DFG study module
│   │   └── internalRouter.js       # /api/internal — internal WS broadcast
│   ├── middleware/                 # auth.js (JWT via Keycloak JWKS), requireRole.js,
│   │   │                           # requireServiceToken.js, rateLimiter.js, inputSanitizer.js,
│   │   │                           # securityHeaders.js, auditAdminActions.js, maintenanceMode.js
│   ├── services/                   # ~30 services: habitDonationService, keycloakRopcClient,
│   │   │                           # commentModerationService, notificationService, backupService,
│   │   │                           # intentionService, dailyLogService, srhiService, etc.
│   ├── models/                     # MongoDB collection schemas/validators (incl. restoreAttempt.js)
│   ├── utils/                      # Database clients, config, health check, recoveryPhrase.js
│   ├── ws/
│   │   └── recommendationWs.js     # WebSocket server for live recommendations
│   ├── swagger.js                  # OpenAPI spec generation (swagger-jsdoc)
│   └── tests/                      # Jest unit + integration tests
│
├── mobile/                         # Flutter mobile application
│   ├── lib/
│   │   ├── main.dart               # App entry point
│   │   ├── router/                 # go_router route definitions
│   │   ├── features/               # Feature modules (my_habits, questionnaire, recommendation)
│   │   ├── screens/                # Top-level screens (onboarding/, donate, explore, settings/, stats)
│   │   ├── providers/              # Riverpod providers (state management)
│   │   ├── services/                # API clients, auth service
│   │   ├── models/                 # Dart data models
│   │   ├── widgets/                # Shared UI widgets
│   │   └── l10n/                   # Localisation: en, de, fr, ja, nl (.arb + generated)
│   └── test/                       # Flutter widget + unit tests
│
├── admin/                          # Next.js 15 admin application (React 18, MUI v7 + Emotion, CSS Modules)
│   ├── src/
│   │   ├── app/                    # Next.js App Router pages
│   │   │   ├── (admin)/            # Admin-only page group (auth-gated): participants, studies,
│   │   │   │                       # questionnaires, cue-pools, comments, restore-attempts, backups,
│   │   │   │                       # audit-log, analytics, insights, knowledge-base, profile-fields,
│   │   │   │                       # devices, donations, settings, system, team, help
│   │   │   ├── api/                # API route handlers (NextAuth, etc.)
│   │   │   ├── access-denied/      # Shown when role check fails
│   │   │   ├── layout.tsx          # Root layout
│   │   │   └── page.tsx            # Root redirect
│   │   ├── components/             # React components
│   │   ├── lib/                    # API fetch helpers, auth utilities
│   │   ├── i18n/                   # next-intl config (en, de, fr, nl)
│   │   └── middleware.ts           # Next.js edge middleware (auth guard)
│   └── src/__tests__/             # Jest + React Testing Library tests
│
├── API-service/                    # Python FastAPI service
│   ├── main.py                     # FastAPI app, router registration (all under /api/v1)
│   ├── deps.py                     # Shared dependencies (lifespan, auth)
│   ├── routers/                    # Endpoint routers — each path also starts with /llm
│   │   │                           # (e.g. classify_habit.py -> POST /api/v1/llm/classify-habit):
│   │   │                           # classify_habit, classify_context, embed_habit, map_bcio,
│   │   │                           # extract_habits, extract_profile, translate_lang,
│   │   │                           # refine_translation_lang, translate_term, stitch_intention,
│   │   │                           # retrieve, recommend
│   ├── llm_client.py               # OpenAI-compatible client wrapper
│   ├── prompts/                    # LLM prompt templates
│   ├── kb/                         # Knowledge base data
│   ├── data/                       # Static data files (incl. references.json for citations)
│   └── tests/                      # pytest test suite
│
├── keycloak/
│   ├── hhh-realm.json              # Keycloak realm export (imported on startup)
│   └── hhh-user-profile.json       # Custom user profile attributes
│
├── mongo/
│   └── entrypoint/                 # MongoDB init scripts
│
├── neo4j/
│   └── extension.sh                # Neo4j startup extension
│
├── backup-service/                 # Automated backup scripts + Dockerfile
│
├── docs/
│   ├── api/
│   │   ├── openapi.yaml            # OpenAPI 3.1 specification
│   │   └── hhh-postman-collection.json
│   ├── guides/
│   │   ├── local-dev.md            # Full local development guide
│   │   ├── developer-onboarding.md # Onboarding for new developers
│   │   ├── admin-guide.md          # Admin/researcher user guide (EN)
│   │   ├── admin-guide-de.md       # Admin/researcher user guide (DE)
│   │   ├── participant-guide.md    # Participant user guide (EN)
│   │   └── flutter-architecture.md # Flutter app architecture deep-dive
│   ├── runbook.md                  # Production runbook
│   ├── architecture.md             # Extended architecture notes
│   └── data-model.md               # Data model reference
│
├── scripts/                        # Utility scripts
├── tests/                          # Integration / e2e tests
├── Ontology.ttl                    # BCIO/habit ontology
├── docker-compose.local.yml        # Local development compose file
├── docker-compose.yml              # Production compose file
├── Makefile                        # Developer convenience targets
├── stack.env                       # Environment variable template (override in Portainer)
└── DEPLOYMENT.md                   # Production deployment guide
```

---

## 4. Tech Stack

### Backend (`app/`)

| Component         | Technology                                                   |
| ----------------- | ------------------------------------------------------------ |
| Runtime           | Node.js 22, ES modules                                       |
| Framework         | Express.js                                                   |
| Authentication    | Keycloak JWKS JWT verification (`middleware/auth.js`)        |
| WebSocket         | Node.js `http` + custom WS server (`ws/recommendationWs.js`) |
| Databases         | MongoDB (via native driver), Neo4j (bolt)                    |
| Caching / locking | Redis 7                                                      |
| API docs          | swagger-jsdoc + swagger-ui-express at `/api/v1/docs`         |

### Mobile App (`mobile/`)

| Component        | Technology                                  |
| ---------------- | ------------------------------------------- |
| Language         | Dart                                        |
| Framework        | Flutter (iOS / Android / Web)               |
| State management | Riverpod                                    |
| Navigation       | go_router                                   |
| Authentication   | Keycloak PKCE (public client `hhh-flutter`) |
| Localisation     | Flutter ARB/l10n (EN, DE)                   |

### Admin Application (`admin/`)

| Component         | Technology                                                                                              |
| ----------------- | ------------------------------------------------------------------------------------------------------- |
| Framework         | Next.js 15 (App Router), React 18                                                                       |
| Language          | TypeScript                                                                                              |
| Component library | MUI (Material UI) v7 + Emotion styling engine                                                           |
| Styling           | CSS Modules (`*.module.css`) keyed to `globals.css` custom properties; `[data-theme]` light/dark toggle |
| Charts            | Recharts                                                                                                |
| Authentication    | NextAuth.js with Keycloak provider (confidential client `hhh-admin`)                                    |
| Testing           | Jest + React Testing Library                                                                            |

### Python API Service (`API-service/`)

| Component      | Technology                                  |
| -------------- | ------------------------------------------- |
| Framework      | FastAPI                                     |
| Language       | Python 3                                    |
| LLM            | OpenAI (configurable model via `LLM_MODEL`) |
| Authentication | Shared secret (`API_SERVICE_SECRET` header) |
| Testing        | pytest                                      |

### Databases

| Database                             | Purpose                                                                           |
| ------------------------------------ | --------------------------------------------------------------------------------- |
| MongoDB 7.0                          | Survey definitions, questionnaire responses, user preferences, notification state |
| Neo4j 5                              | Donated habit graph, BCIO relationships, semantic graph                           |
| Redis 7                              | API-service response cache, BullMQ `habitQueue`, notification-cron lock           |
| PostgreSQL 16                        | Keycloak persistence (`keycloak-db`)                                              |
| LightRAG (graph + vector)            | RAG knowledge base for the recommendation pipeline                                |
| ~~Apache Fuseki (Jena)~~ _(retired)_ | Former RDF triple store; ontology files kept for reference                        |

### Infrastructure

| Component                  | Technology                                                            |
| -------------------------- | --------------------------------------------------------------------- |
| Container orchestration    | Docker Compose (local), Portainer + `docker-compose.yml` (production) |
| Reverse proxy              | Traefik v3.6.1                                                        |
| TLS                        | Let's Encrypt (ACME, automatic renewal via Traefik)                   |
| Identity provider          | Keycloak 26.5.5 (PostgreSQL backend in production)                    |
| Translation                | LibreTranslate v1.9.5 (self-hosted)                                   |
| Caching / distributed lock | Redis 7                                                               |
| Backup                     | Custom bash-based backup service (daily, 14-day retention)            |

---

## 5. Environment Variables

All variables are defined in `stack.env`. In production, override sensitive values in Portainer's environment variables section — never commit real secrets to Git.

### Domain & TLS

| Variable                 | Default                    | Description                                       |
| ------------------------ | -------------------------- | ------------------------------------------------- |
| `DOMAIN`                 | `habit.wiwi.tu-dresden.de` | Production domain name                            |
| `SERVER_IP`              | `141.76.16.16`             | Server IP address                                 |
| `ACME_EMAIL`             | —                          | Email for Let's Encrypt certificate notifications |

### Application

| Variable        | Default      | Description                                        |
| --------------- | ------------ | -------------------------------------------------- |
| `APP_BASE_PATH` | `/`          | URL base path for the Node.js app                  |
| `NODE_ENV`      | `production` | Node.js environment (`development` / `production`) |

### Keycloak

| Variable                          | Default       | Description                                                      |
| --------------------------------- | ------------- | ---------------------------------------------------------------- |
| `KEYCLOAK_ADMIN`                  | `admin`       | Keycloak admin console username                                  |
| `KEYCLOAK_ADMIN_PASSWORD`         | —             | Keycloak admin console password **(change in Portainer)**        |
| `KC_DB_USERNAME`                  | `keycloak`    | PostgreSQL username for Keycloak (production)                    |
| `KC_DB_PASSWORD`                  | —             | PostgreSQL password for Keycloak **(change in Portainer)**       |
| `KEYCLOAK_REALM`                  | `hhh`         | Keycloak realm name                                              |
| `KEYCLOAK_CLIENT_ID`              | `hhh-flutter` | Public PKCE client used by the Flutter app                       |
| `KEYCLOAK_ADMIN_CLIENT_ID`        | `hhh-backend` | Confidential service-account client for Node.js backend          |
| `KEYCLOAK_ADMIN_CLIENT_SECRET`    | —             | Secret for `hhh-backend` client **(change in Portainer)**        |
| `NEXTAUTH_SECRET`                 | —             | Secret for NextAuth.js session signing **(change in Portainer)** |
| `KEYCLOAK_ADMIN_UI_CLIENT_SECRET` | —             | Secret for `hhh-admin` client **(change in Portainer)**          |
| `KEYCLOAK_ROPC_CLIENT_SECRET`     | —             | Secret for `hhh-ropc` client (server-side passphrase auth)       |

### Internal-tool SSO & LightRAG

The internal admin/debug tools use Keycloak SSO via `oauth2-proxy`; LightRAG uses
its own login. There are **no** per-tool htpasswd/basic-auth variables anymore
(the former `INTERNAL_TOOLS_TRAEFIK_AUTH`, per-tool `*_TRAEFIK_AUTH`,
`MONGO_EXPRESS_*`, and `TRAEFIK_DASHBOARD_AUTH` were removed).

| Variable | Default | Description |
| --- | --- | --- |
| `OAUTH2_PROXY_CLIENT_SECRET` | — | Secret for the `oauth2-proxy` Keycloak client (injected by `keycloak-init`) **(change in Portainer)** |
| `OAUTH2_PROXY_COOKIE_SECRET` | — | Signs the SSO session cookie; **must be 16/24/32 chars** (`openssl rand -base64 24`) **(change in Portainer)** |
| `GRAFANA_CLIENT_SECRET` | — | Secret for the `grafana` Keycloak OIDC client **(change in Portainer)** |
| `LIGHTRAG_API_KEY` | — | Bearer token for the LightRAG REST API (internal callers) |
| `LIGHTRAG_AUTH_PASSWORD` | — | Password for LightRAG's own WebUI login (user `admin`) **(change in Portainer)** |
| `LIGHTRAG_TOKEN_SECRET` | — | Signs LightRAG's login JWTs (`openssl rand -hex 32`) **(change in Portainer)** |
| `ENABLE_QUEUE_DASHBOARD` | `true` | Mounts Bull Board at `/queues` in production (SSO-gated) |

### MongoDB

| Variable                            | Default    | Description                                      |
| ----------------------------------- | ---------- | ------------------------------------------------ |
| `MONGO_HOST`                        | `mongo`    | MongoDB service hostname                         |
| `MONGO_PORT`                        | `27017`    | MongoDB port                                     |
| `MONGO_USER`                        | `admin`    | MongoDB admin username                           |
| `MONGO_PASSWORD`                    | —          | MongoDB admin password **(change in Portainer)** |
| `MONGO_DB`                          | `surveyjs` | Default database name                            |
| `MONGO_AUTH_SOURCE`                 | `admin`    | Authentication database                          |
| `MONGO_SERVER_SELECTION_TIMEOUT_MS` | `30000`    | Connection timeout                               |
| `MONGO_SOCKET_TIMEOUT_MS`           | `30000`    | Socket timeout                                   |

### Neo4j

| Variable         | Default             | Description                              |
| ---------------- | ------------------- | ---------------------------------------- |
| `NEO4J_URI`      | `bolt://neo4j:7687` | Neo4j Bolt connection URI                |
| `NEO4J_USER`     | `neo4j`             | Neo4j username                           |
| `NEO4J_PASSWORD` | —                   | Neo4j password **(change in Portainer)** |
| `GRAPH_BACKEND`  | `neo4j`             | Graph backend selector                   |

### Apache Fuseki _(retired — no longer in docker-compose.yml; variables kept for historical reference)_

| Variable         | Default  | Description                                     |
| ---------------- | -------- | ----------------------------------------------- |
| `FUSEKI_PATH`    | `fuseki` | Fuseki dataset name                             |
| `DB_HOST`        | `fuseki` | Fuseki hostname                                 |
| `DB_PORT`        | `3030`   | Fuseki port                                     |
| `DB_USER`        | `admin`  | Fuseki admin username                           |
| `DB_PASSWORD`    | —        | Fuseki admin password **(change in Portainer)** |
| `DB_PATH`        | `hhh`    | Fuseki dataset path                             |
| `ADMIN_PASSWORD` | —        | Fuseki admin password (used in container env)   |

### Python API Service

| Variable                            | Default                       | Description                                                                                   |
| ----------------------------------- | ----------------------------- | --------------------------------------------------------------------------------------------- |
| `RECOMMENDER_URL`                   | `http://recommender:8000`     | Internal URL for the Python FastAPI service                                                   |
| `API_SERVICE_SECRET`                | —                             | Shared secret between Node.js backend and Python API service **(change in Portainer)**        |
| `LLM_API_KEY`                       | —                             | API key for the LLM provider **(required, set in Portainer)**                                 |
| `LLM_API_BASE`                      | OpenAI                        | Base URL of the LLM provider (e.g. `https://llm.scads.ai/v1`)                                 |
| `LLM_MODEL`                         | `alias-huge`                  | Model name or alias for general LLM calls                                                     |
| `LLM_RECOMMEND_MODEL`               | — (falls back to `LLM_MODEL`) | Model used only for the final recommendation-writing call (e.g. `alias-ha`)                   |
| `LLM_TEMPERATURE`                   | `0.2`                         | LLM sampling temperature (0.0 = deterministic)                                                |
| `LLM_TIMEOUT_S`                     | `120`                         | Per-attempt timeout for LLM calls                                                             |
| `LLM_MAX_RETRIES`                   | `0`                           | OpenAI-client retries (0 = fail fast, avoids proxy 504s)                                      |
| `RECOMMEND_MAX_CONTEXT_CHARS`       | `0` (unlimited)               | Cap on the LightRAG context in the recommendation prompt (latency lever; `.env` sets `30000`) |
| `LLM_RECOMMEND_MAX_TOKENS`          | `0` (model default)           | Completion-length cap for the recommendation call (`.env` sets `2000`)                        |
| `MONGO_SERVER_SELECTION_TIMEOUT_MS` | `5000`                        | MongoDB server-selection/connect timeout in the API-service                                   |
| `MONGO_SOCKET_TIMEOUT_MS`           | `5000`                        | MongoDB socket timeout in the API-service                                                     |

### LibreTranslate

| Variable            | Default    | Description                        |
| ------------------- | ---------- | ---------------------------------- |
| `LT_LOAD_ONLY`      | `de,en,ja` | Language pairs to load             |
| `LT_REQ_LIMIT`      | `0`        | Request rate limit (0 = unlimited) |
| `LT_DEBUG`          | `false`    | Enable debug logging               |
| `LT_DISABLE_WEB_UI` | `false`    | Disable LibreTranslate web UI      |

### Email & Notifications

| Variable        | Default                      | Description                                                                                                            |
| --------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `SMTP_HOST`     | —                            | Generic SMTP relay/provider host (any provider works)                                                                  |
| `SMTP_PORT`     | `587`                        | `587` for STARTTLS, `465` for implicit TLS                                                                             |
| `SMTP_USER`     | —                            | SMTP username                                                                                                          |
| `SMTP_PASS`     | —                            | SMTP password                                                                                                          |
| `SMTP_FROM`     | `noreply@wiwi.tu-dresden.de` | Sender address                                                                                                         |
| `SMTP_STARTTLS` | `true`                       | Set `false` only when `SMTP_PORT=465`                                                                                  |
| `ALERT_EMAIL`   | —                            | Recipient for critical alerts (backup, LLM outages, BullMQ failures, service reachability/5xx — see `docs/runbook.md`) |

### Backup

| Variable                | Default   | Description                                                                                                                                                                                                          |
| ----------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BACKUP_RETENTION_DAYS` | `14`      | Days to retain backup archives (time-based; applies to all backups). Also caps daily automatic (scheduled-trigger) backups by count, using the same number — manual/uploaded backups are unaffected by the count cap |
| `ALERT_EMAIL`           | —         | Email address for backup alert notifications                                                                                                                                                                         |
| `BACKUP_EMAIL`          | —         | Email address for backup reports                                                                                                                                                                                     |
| `ALERT_WEBHOOK_URL`     | _(empty)_ | Optional Slack/Discord/Teams webhook URL                                                                                                                                                                             |

## 6. Local Development

For full setup instructions (prerequisites, first-run steps, seed data, and common workflows), see:

- **[`docs/guides/local-dev.md`](docs/guides/local-dev.md)** — complete local development guide
- **[`docs/guides/developer-onboarding.md`](docs/guides/developer-onboarding.md)** — new developer onboarding

### Prerequisites

- Docker Engine 20.10+ and Docker Compose v2
- Flutter SDK (for mobile development)
- Python 3.11+ (for API-service development)
- Node.js 22 (for backend/admin development)
- A `.env` file created from `stack.env` with local values

### Make Targets

All common tasks are available via `make`:

```bash
make help          # Show all available targets
make dev           # Start all local services (docker-compose.local.yml up -d)
make stop          # Stop all local services
make seed          # Seed MongoDB, Neo4j, and Keycloak with dev data
make logs          # Tail app (Node.js backend) logs
make logs-all      # Tail all service logs
make ios           # Run Flutter app on iPhone Simulator
make reset         # Stop, wipe volumes, restart, and re-seed (full reset)
make test          # Run all test suites (backend + Flutter + Python + admin)
make test-backend  # Backend: prettier check + ESLint + Jest unit tests + npm audit
make test-flutter  # Flutter: flutter analyze + flutter test
make test-python   # Python API-service: pytest
make test-admin    # Admin: TypeScript typecheck (tsc --noEmit)
```

### Local Service URLs

After `make dev`, services are available at:

| Service                | URL                                                 |
| ---------------------- | --------------------------------------------------- |
| Node.js backend        | http://app.localhost or http://localhost:3000       |
| Keycloak admin console | http://keycloak.localhost or http://localhost:8080  |
| Next.js admin app      | http://admin.localhost or http://localhost:3001     |
| Neo4j browser          | http://neo4j.localhost or http://localhost:7474     |
| LibreTranslate         | http://translate.localhost or http://localhost:5001 |
| Python API service     | http://localhost:8001                               |
| Traefik dashboard      | http://localhost:8888                               |

---

## 7. Production Deployment

For the full deployment procedure, see:

- **[`DEPLOYMENT.md`](DEPLOYMENT.md)** — step-by-step production deployment guide
- **[`docs/runbook.md`](docs/runbook.md)** — operational runbook (restarts, backups, incident response)

### Approach

Production runs on a single server managed via **Portainer** connected to the Git repository. The stack is defined in `docker-compose.yml`.

Key differences from local:

- Traefik performs TLS termination with automatic Let's Encrypt certificate renewal
- Keycloak uses a dedicated PostgreSQL container (not `dev-file` mode)
- All passwords and secrets are injected via Portainer's environment variables (not from `stack.env` in Git)
- The backup service isn't real cron — it's a sleep loop (`sleep 120`, then `sleep 86400` between runs) that drifts on container restart — storing archives in the `backups/` volume. Scheduled (automatic) backups are additionally capped by count, using the same `BACKUP_RETENTION_DAYS` value as the time-based retention, so the admin panel's backup list doesn't grow unbounded.
- The backup container never mounts the Docker socket directly — it talks to a scoped `docker-socket-proxy` sidecar instead (see `docs/runbook.md`)

### Deployment Steps (summary)

1. Connect Portainer to the Git repository
2. Configure all environment variables in Portainer (override `stack.env` defaults with real secrets)
3. Deploy the `docker-compose.yml` stack via Portainer UI
4. On first deploy, the `keycloak-init` one-shot container sets `sslRequired=external`, configures client secrets, and grants the backend service account `realm-admin`

### Mobile App Release (iOS)

Backend/admin changes ship instantly on deploy — the mobile app binary does not, since it needs Apple's review. Releasing an update:

- **[`mobile/RELEASING.md`](mobile/RELEASING.md)** — one-time Apple Developer / App Store Connect setup, and the release checklist

Pushing a `mobile-v*` tag (e.g. `mobile-v1.0.1`) triggers `.github/workflows/mobile-release.yml`, which builds the app via `fastlane` (`mobile/fastlane/Fastfile`) and uploads it to TestFlight automatically. Submitting a tested TestFlight build for public App Store review is a separate, manually-triggered step (Actions tab → **Mobile Release** → **Run workflow** → lane `release`) — deliberately not automatic, so a bad tag can't reach real users without a human checking it first. Note this is a different tag prefix from the backend's `v*` used by `release.yml`, so the two pipelines never collide.

---

## 8. Admin Application

The Next.js 15 / React 18 admin application (`admin/`) provides a web dashboard for researchers and study administrators. Its UI is built with MUI (Material UI) v7 + Emotion for shared components and CSS Modules for bespoke styling.

### Access

| Environment | URL                                               |
| ----------- | ------------------------------------------------- |
| Local       | http://admin.localhost (or http://localhost:3001) |
| Production  | https://admin.habit.wiwi.tu-dresden.de            |

### Keycloak Roles Required

Access to the admin application requires one of the following Keycloak realm roles in the `hhh` realm:

- `admin` — full access
- `researcher` — full access (same permissions as admin within the dashboard)

Users without these roles see the `/access-denied` page. The Next.js edge middleware (`src/middleware.ts`) enforces authentication on all admin routes. Server components and API routes additionally check for the required role via the NextAuth session.

### Features

- **Participant management** — list, create, and manage study participants
- **Questionnaire authoring** — create and publish questionnaires
- **Study configuration** — manage study groups, per-group cue config, and enrollment codes
- **Comment moderation** — a local wordlist/regex check (not an LLM call — see `docs/architecture.md`'s _Community Signals_ section) auto-flags inappropriate community comments for review; researchers approve or delete flagged comments in a dedicated queue rather than reviewing every comment
- **Restore-attempts monitoring** — security view over every passphrase-based account-recovery attempt (success/failure/rate-limited), with IPs flagged for repeated non-success attempts
- **Backups** — last-backup status per component, on-demand trigger, and restore from an existing or uploaded archive
- **Audit log** — paginated log of admin actions
- **Knowledge base** — view and manage the habit knowledge base
- **Questionnaire scheduling** — assign questionnaires to a study/group on a cadence, and optionally flag one to **deliver on habit creation** (Studies → Schedule); see below
- **Data export** — export questionnaire response and study analytics data

### Questionnaire Scheduling & Check-in Delivery

Researchers assign questionnaires to a study (all groups) or a specific group on a **cadence**
(recurring interval, or fixed weeks/days after enrollment) in **Studies → Schedule**. Each
participant gets per-occurrence `questionnaire_windows` generated on enrollment; submitting a
response marks the next open window complete. Completion is shown as **completed / total** per
questionnaire (the count reflects *submitted* windows, not merely scheduled ones).

**Deliver on habit creation.** An assignment can be flagged **"Deliver first occurrence on
habit creation (counts as week 1)"**. Instead of anchoring the first window at enrollment, the
backend generates it **per habit** the moment the participant creates a habit
(`POST /habits/intentions`), and fires a fire-and-forget FCM push (~5 s later, reusing the
existing device-token → FCM path) nudging them to complete it. The push carries a deep-link
payload (`{ type: "srhi", intentionId }`) and the check-in is also visible in-app immediately.

- **SRHI** (the weekly habit-strength check-in) is special-cased: the flag gates its own
  per-habit pipeline (`srhiService.generateWindows` → 4 weekly `srhi_responses` rows, week 1 =
  creation day), preserving SRHI's dedicated scoring and sparkline. The **default study seeds
  this SRHI assignment automatically** (idempotently, on boot — it also back-fills a
  pre-existing default study), so organic participants get SRHI check-ins from their first habit.
- Any **other** flagged questionnaire creates one generic `questionnaire_windows` row per habit
  (keyed by `intentionId`).

Behaviour is driven by the assignment's `deliverOnHabitCreation` flag (see
`docs/data-model.md` → `questionnaire_assignments` / `questionnaire_windows`). The participant's
Progress view in the admin panel surfaces created habits (from `implementation_intentions`) and
an **SRHI check-ins** summary (`completed / scheduled` + latest score). Relevant code:
`app/routes/intentionsRouter.js`, `app/services/questionnaireScheduleService.js`
(`generateHabitCreationWindows`, `srhiDeliversOnHabitCreation`),
`app/services/defaultStudySeedService.js` (`ensureSrhiHabitCreationAssignment`).

### Test Suite

The admin application includes a Jest + React Testing Library suite at `admin/src/__tests__/`:

```
admin/src/__tests__/
├── __mocks__/          # Module mocks (next/navigation, etc.)
├── apiFetch.test.ts    # API fetch helper tests
├── auth.test.ts        # Auth utility tests
├── middleware.test.ts  # Next.js middleware route guard tests
├── knowledge-base.test.tsx
├── questionnaires.test.tsx
└── studies.test.tsx
```

Run with: `make test-admin` (TypeScript typecheck) or `cd admin && npx jest` for the full test suite.

---

## 9. Testing

### Test Suites

| Suite      | Command             | What it tests                                                                                                     |
| ---------- | ------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Backend    | `make test-backend` | Prettier formatting, ESLint linting, Jest unit tests for all routes and middleware, `npm audit` for critical CVEs |
| Flutter    | `make test-flutter` | `flutter analyze` static analysis + Flutter widget/unit tests                                                     |
| Python API | `make test-python`  | pytest for all API-service routers                                                                                |
| Admin      | `make test-admin`   | TypeScript typecheck (`tsc --noEmit`)                                                                             |
| All        | `make test`         | Runs all four suites sequentially                                                                                 |

### Backend Tests (`app/tests/`)

Located at `app/tests/unit/**/*.test.js`. Run using Node.js built-in test runner:

```bash
cd app
node --test "tests/unit/**/*.test.js"
```

### Flutter Tests (`mobile/test/`)

```bash
cd mobile
flutter test
```

### Python Tests (`API-service/tests/`)

```bash
cd API-service
python3 -m pytest tests/ -v
```

### Admin Tests (`admin/src/__tests__/`)

```bash
cd admin
npx jest
# or for typecheck only:
npx tsc --noEmit
```

---

## 10. API Reference

The full OpenAPI 3.1 specification is at **[`docs/api/openapi.yaml`](docs/api/openapi.yaml)**.

A Postman collection is available at **[`docs/api/hhh-postman-collection.json`](docs/api/hhh-postman-collection.json)**.

The interactive Swagger UI is served by the running backend at `/api/v1/docs`. The raw spec JSON is at `/api/v1/docs/openapi.json`.

### Key Endpoints

| Method                | Path                                                  | Auth                    | Description                                                                         |
| --------------------- | ----------------------------------------------------- | ----------------------- | ----------------------------------------------------------------------------------- |
| `GET`                 | `/api/v1/health`                                      | None                    | Health check for all downstream services                                            |
| `GET`                 | `/api/v1/docs`                                        | None                    | Swagger UI                                                                          |
| `POST`                | `/api/v1/onboard`                                     | None (rate limited)     | Anonymous self-registration (creates Keycloak user)                                 |
| `GET`                 | `/api/v1/surveys`                                     | JWT (participant+)      | List available surveys                                                              |
| `POST`                | `/api/v1/habits`                                      | JWT (participant+)      | Donate a habit                                                                      |
| `GET`                 | `/api/v1/habits`                                      | JWT (participant+)      | Retrieve donated habits                                                             |
| `GET`                 | `/api/v1/recommendations`                             | JWT (participant+)      | Get cached recommendations                                                          |
| `POST`                | `/api/v1/recommend`                                   | JWT (participant+)      | Request live AI recommendation                                                      |
| `GET`                 | `/api/v1/profile`                                     | JWT (participant+)      | Get user profile                                                                    |
| `PUT`                 | `/api/v1/profile`                                     | JWT (participant+)      | Update user profile                                                                 |
| `GET`                 | `/api/v1/questionnaires`                              | JWT (participant+)      | List questionnaires                                                                 |
| `POST`                | `/api/v1/questionnaire-responses`                     | JWT (participant+)      | Submit questionnaire response (links the answer to the next open scheduled window)  |
| `POST`                | `/api/v1/onboarding/redeem-code`                      | JWT (participant)       | Redeem a study enrollment code (first-time onboarding)                              |
| `POST`                | `/api/v1/onboarding/skip-code`                        | JWT (participant)       | Enroll in the default study (round-robin group), no code                            |
| `GET`                 | `/api/v1/onboarding/enrollment`                       | JWT (participant)       | Current study/group, for the account screen                                         |
| `POST`                | `/api/v1/onboarding/switch-study`                     | JWT (participant)       | Move to a different study via code, without touching already-donated data           |
| `POST`                | `/api/v1/onboarding/leave-study`                      | JWT (participant)       | Move back to the default study ("leave study")                                      |
| `GET/POST/PUT/DELETE` | `/api/v1/admin/studies/:id/questionnaire-assignments` | JWT (admin, researcher) | Assign a questionnaire to a study/group on a cadence; list assignments + completion |
| `GET`                 | `/api/v1/admin/participants/:id/responses`            | JWT (admin, researcher) | A participant's questionnaire answers (for the admin answer viewer)                 |
| `GET`                 | `/api/v1/admin/comments`                              | JWT (admin, researcher) | Paginated comment moderation list; `?status=flagged` for the review queue           |
| `POST`                | `/api/v1/admin/comments/:id/approve`                  | JWT (admin, researcher) | Publish a flagged comment                                                           |
| `DELETE`              | `/api/v1/admin/comments/:id`                          | JWT (admin, researcher) | Delete/reject a comment                                                             |
| `GET/POST`            | `/api/v1/admin/*`                                     | JWT (admin, researcher) | Admin operations (participants, studies, exports)                                   |
| `GET/POST`            | `/api/v1/kb/*`                                        | JWT (admin, researcher) | Knowledge base management                                                           |

### Python API Service Endpoints

All endpoints require the `X-API-Service-Secret` header (value from `API_SERVICE_SECRET`). Every route below is mounted under `/api/v1`, and each router's own path additionally starts with `/llm` — i.e. the full path for the first row is `POST /api/v1/llm/classify-habit` (`API-service/main.py`, `routers/classify_habit.py`).

| Method       | Path (under `/api/v1`)         | Description                                                                                                                                                                                                                                                                                                                                                                    |
| ------------ | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET`        | `/health`                      | Service health check                                                                                                                                                                                                                                                                                                                                                           |
| `POST`       | `/llm/classify-habit`          | Classify whether a sentence is a habit                                                                                                                                                                                                                                                                                                                                         |
| `POST`       | `/llm/classify-context`        | Classify habit context dimensions                                                                                                                                                                                                                                                                                                                                              |
| `POST`       | `/llm/map-bcio`                | Map habit context to BCIO ontology concepts                                                                                                                                                                                                                                                                                                                                    |
| `POST`       | `/llm/embed-batch`             | Batch-embed a habit + its contexts/mappings into the vector index                                                                                                                                                                                                                                                                                                              |
| `POST`       | `/llm/extract-habits`          | Extract habits from free text                                                                                                                                                                                                                                                                                                                                                  |
| `POST`       | `/llm/extract-profile`         | Extract user profile from text                                                                                                                                                                                                                                                                                                                                                 |
| `POST`       | `/llm/translate-lang`          | Machine-translate a sentence to a target app language                                                                                                                                                                                                                                                                                                                          |
| `POST`       | `/llm/refine-translation-lang` | LLM-refine a raw machine translation                                                                                                                                                                                                                                                                                                                                           |
| `POST`       | `/llm/translate-term`          | Translate/localise a single term (e.g. a new BCIO concept label)                                                                                                                                                                                                                                                                                                               |
| `POST`       | `/llm/stitch-intention`        | Compose an if-then implementation intention from its parts                                                                                                                                                                                                                                                                                                                     |
| `POST`       | `/llm/retrieve`                | Retrieve relevant knowledge base entries                                                                                                                                                                                                                                                                                                                                       |
| `GET`/`POST` | `/kb`                          | List / ingest knowledge base entries                                                                                                                                                                                                                                                                                                                                           |
| `POST`       | `/llm/recommend`               | Generate habit recommendations — guarded goal input (prompt-injection screen + LLM refusal backstop → `422` with user-facing reason); response items carry `title · body · rationale · suggested_cue · sources` (paper citations with optional DOI links from `API-service/data/references.json`); graph provenance (`selected_habit_uuids`) is logged/stored server-side only |

---

## 11. Security

### Legal Documents (imprint, privacy, accessibility)

The user-facing legal documents live as Markdown in `app/language/{en,de,ja}/` and are served at `/:lng/{imprint,privacy,accessibility}` (rendered to HTML server-side; the Flutter app fetches and displays them). Each file carries YAML front matter:

```yaml
---
version: 1.0.0
effectiveDate: 2026-03-15
bindingLanguage: de
---
```

Rules:

- **Bump `version` and `effectiveDate` in _all three_ locales together** when the content changes — CI (`node scripts/checkLegalDocs.mjs`, also `npm run check:legal`) fails if locales diverge.
- The metadata is returned in the API response (`document` field) and shown as a footer in the app; non-German locales display a note that the German version is authoritative.
- Git history of these files is the GDPR audit trail for which policy version was active when.
- Never machine-translate these documents; translations require professional/legal review.

### Authentication Model

- **Flutter app ↔ Keycloak:** the app never talks to Keycloak directly. It authenticates via a 24-word recovery passphrase against the Node.js backend (`/onboard` for new accounts, `/restore` for an existing account on a new device, `/users/me/rotate-credentials` to rotate the passphrase), which exchanges it for a Keycloak token pair server-side — see **Session & Token Lifetime** below. A PKCE authorization code flow via the public client `hhh-flutter` also exists in the mobile codebase (`AuthService.login()`, no client secret required or stored on device) but has no current call site.
- **Flutter app ↔ Node.js backend:** Bearer JWT in the `Authorization` header. The backend validates JWTs against Keycloak's JWKS endpoint.
- **Node.js backend ↔ Keycloak (admin operations):** Confidential service-account client `hhh-backend` with client credentials grant.
- **Node.js backend ↔ Keycloak (passphrase auth):** Confidential client `hhh-ropc` with the resource-owner-password-credentials (ROPC) grant, kept behind a server-held secret so the ROPC capability isn't available to anyone who extracts the public `hhh-flutter` client ID from the app (`hhh-flutter` has `directAccessGrantsEnabled: false` for exactly this reason).
- **Next.js admin ↔ Keycloak:** Confidential client `hhh-admin` via NextAuth.js. Session is maintained server-side; access tokens are not exposed to the browser.
- **Node.js backend ↔ Python API service:** Shared secret (`API_SERVICE_SECRET`) sent as an HTTP header. The Python service refuses all requests without a valid secret.
- **Internal tools ↔ Keycloak SSO:** Prometheus, Bull Board (`/queues`), RedisInsight, the Neo4j Browser **UI** (`/neo4j`) and mongo-express (`/mongo`) sit behind `oauth2-proxy` as a Traefik forward-auth gate. You log in with your normal Keycloak account and only accounts holding the realm **`admin`** role pass (participants with `user` are denied). No per-tool passwords or htpasswd hashes exist anymore. See [Internal-tool access (SSO)](#internal-tool-access-sso) below.

### Internal-tool access (SSO)

The internal admin/debug tools are gated by **Keycloak SSO** via `oauth2-proxy`,
which runs as a Traefik forward-auth backend. Design notes and per-tool auth:

| Path | Tool | Auth |
| --- | --- | --- |
| `/prometheus` | Prometheus | Keycloak SSO (admin role) |
| `/queues` | Bull Board | Keycloak SSO (admin role) |
| `/redisinsight` | RedisInsight | Keycloak SSO (admin role) |
| `/mongo` | mongo-express | Keycloak SSO (admin role); own basic-auth disabled (`ME_CONFIG_BASICAUTH=false`) |
| `/neo4j` | Neo4j Browser **UI** | Keycloak SSO (admin role) |
| bolt :7687 | Neo4j **query channel** | Neo4j's own username/password (raw TCP — can't be SSO-gated) |
| `/lightrag` | LightRAG WebUI | LightRAG's **own** login (`AUTH_ACCOUNTS`) — no OIDC, so not on the SSO |
| `/grafana` | Grafana | Grafana's own Keycloak OIDC (separate `grafana` client, role-mapped) |

Implementation details:

- The `sso-auth` Traefik middleware forwards each request to `oauth2-proxy`'s
  **root** (not `/oauth2/auth`) — the root returns a **302 to Keycloak** for
  unauthenticated requests, which Traefik propagates as a real browser redirect.
  (The Traefik `errors`-middleware approach can't do this on v3: it keeps the 401
  status, so the browser never redirects.)
- oauth2-proxy identifies users by **`preferred_username`**
  (`OAUTH2_PROXY_OIDC_EMAIL_CLAIM`), because Keycloak accounts here often have no
  email and it otherwise 500s the callback with "could not enrich oidc session".
- The `oauth2-proxy` Keycloak client is created/repaired by `keycloak-init` on
  every deploy (no realm-volume recreation needed).
- **LightRAG is deliberately off the SSO** — it can't do OIDC, and layering the
  Traefik gate in front of its own login caused an endless sign-in loop. Its
  `AUTH_ACCOUNTS`/`TOKEN_SECRET` login is a proper per-user gate and closes the
  otherwise-open Guest-access hole.
- **Neo4j Browser** connection: bolt :7687 is blocked by the TU perimeter
  firewall; use the SSH-tunnel method in [docs/runbook.md](docs/runbook.md)
  ("Connecting to Neo4j Browser").

### Session & Token Lifetime

All Keycloak token-minting call sites for the mobile app (`app/services/keycloakRopcClient.js`, used by `/onboard`, `/restore`, and `/users/me/rotate-credentials`; and the currently-unused PKCE `AuthService.login()` in `mobile/lib/services/auth_service.dart`) request the `offline_access` OAuth scope, which changes which Keycloak session settings govern the resulting refresh token:

| Setting | Keycloak default | This realm (`keycloak/hhh-realm.json`) |
| --- | --- | --- |
| SSO session idle / max (regular tokens, no `offline_access`) | 30 min / 10 h | unchanged (not used by the mobile app) |
| `offlineSessionIdleTimeout` | 30 days | **180 days** |
| `offlineSessionMaxLifespanEnabled` | `false` (no cap) | `false` (no cap) |

Without `offline_access`, refresh tokens are bound to the regular SSO session — a 30-minute idle default was logging participants out after every ordinary gap between app opens, since this is a habit tracker checked a few times a day rather than continuously.

**This is a rolling window, not a fixed expiry.** Every successful token refresh (automatic whenever the app is opened and the short-lived access token needs renewing) resets the 180-day idle clock, and there is no maximum session age at all (`offlineSessionMaxLifespanEnabled: false`). A participant only needs to open the app once every 180 days to stay signed in indefinitely — this is the same mechanism ("always signed in") apps like WhatsApp rely on: a long-lived, revocable, silently-renewed token, not a short-lived one requiring manual re-entry.

Explicit sign-out (Settings → Sign out, or account deletion) still fully revokes the session via Keycloak's `/protocol/openid-connect/revoke` endpoint (RFC 7009) regardless of token type — offline tokens are not exempt from revocation.

**Deliberately not implemented:** caching the recovery passphrase on-device to silently re-authenticate after a token dies. The passphrase is the account's root credential — it alone can mint a fresh token pair from scratch via `/restore`. A stored refresh token has a bounded lifetime and can be revoked individually; a cached master credential replayed automatically has no natural expiry and turns a lost/stolen device into a permanent skeleton key. `AuthService`'s `_passwordKey` constant documents that an earlier version of the app did exactly this (ROPC replay of a stored raw password) and it was removed.

If the study protocol needs a hard cap on session age (e.g. for consent-renewal or data-minimization reasons) rather than "stays signed in as long as it's used within 180 days," set `offlineSessionMaxLifespanEnabled: true` and `offlineSessionMaxLifespan` (seconds) in `keycloak/hhh-realm.json` and the `keycloak-init` bootstrap step in both compose files.

### Roles

The realm (`keycloak/hhh-realm.json`) defines three roles: `user`, `researcher`, `admin`.

| Role         | Granted to              | Access                                                    |
| ------------ | ----------------------- | --------------------------------------------------------- |
| `user`       | Study participants      | Own data only — surveys, habits, recommendations, profile |
| `researcher` | Research staff          | All participant data (read), admin APIs, knowledge base   |
| `admin`      | Platform administrators | Full access including user management; internal-tool SSO  |

### Password Storage

Participant passwords (outside Keycloak, e.g. token card PINs) are stored as **bcrypt hashes**. Keycloak manages the primary identity credential.

### Security Headers

The `securityHeaders` middleware (applied to all responses in `app.js`) sets standard security headers including `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, and `Strict-Transport-Security`.

### Additional Protections

- **IDOR protection** on recommendation feedback endpoints — server-side ownership checks ensure a participant can only modify their own records
- **Input sanitization** middleware (`sanitizeBody`) applied before authentication on all `/api/v1` routes
- **Rate limiting** (`apiRateLimiter`) applied per authenticated user on all protected routes
- **WebView navigation lock** in the Flutter app — the in-app WebView is restricted to the app origin to prevent navigation hijacking
- **`API_SERVICE_SECRET` startup warning** — the Node.js backend logs a warning at startup if `API_SERVICE_SECRET` is not set

---

## 12. Troubleshooting

For the full operational runbook (service restart procedures, database access, backup restore, incident response), see **[`docs/runbook.md`](docs/runbook.md)**.

### Top 3 Common Issues

#### 1. Keycloak token validation fails (`401 Unauthorized` from the backend)

**Symptoms:** Flutter app receives 401 errors; logs show JWKS fetch failure or issuer mismatch.

**Causes and fixes:**

- The backend's `KEYCLOAK_URL` must match the issuer in the JWT. In local development, the backend container uses `http://keycloak:8080` (Docker internal hostname) while the browser uses `http://localhost:8080`. If tokens were issued via `localhost` but validated against `keycloak`, issuer verification fails.
- Ensure `KEYCLOAK_ISSUER` in `admin/.env` (or compose environment) uses the **internal** Docker hostname (`http://keycloak:8080/realms/hhh`), and `KEYCLOAK_BROWSER_URL` uses `http://localhost:8080` for browser redirects.
- After a `make reset`, allow 60–90 seconds for Keycloak to fully start before the app connects.

#### 2. Python API service returns `403 Forbidden`

**Symptoms:** Habit classification or recommendation requests fail; logs show `Invalid or missing API service secret`.

**Causes and fixes:**

- The `API_SERVICE_SECRET` in the Node.js backend environment must exactly match the value in the Python service environment.
- Verify both are set identically in `.env` (local) or Portainer (production).
- The Python service will **refuse to start** (`RuntimeError`) if `API_SERVICE_SECRET` is not set at all — check the `recommender` container logs.

#### 3. MongoDB connection timeout on startup

**Symptoms:** The `app` container restarts repeatedly; logs show `MongoServerSelectionError` or connection timeout.

**Causes and fixes:**

- The `app` service starts before MongoDB is ready to accept connections. Docker healthchecks are configured, but `depends_on` only guarantees container start, not readiness.
- Run `make logs-all` to watch all containers. Wait for the `mongo` container to show `Waiting for connections` before the app will connect successfully.
- If the problem persists, run `make reset` to wipe and restart all volumes with a clean state.
- Ensure `MONGO_USER`, `MONGO_PASSWORD`, and `MONGO_AUTH_SOURCE` in `.env` match the values used when the MongoDB volume was first initialized. Changing credentials after volume creation requires wiping the volume.
