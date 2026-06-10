# Health Habit Hub — Use Case Overview

Structured catalogue of all use cases. Each use case has a sequence diagram in
[`../sequences/`](../sequences/) named `UC-XX-<slug>.mmd`. The UML use case
diagram is in [`use-case-diagram.puml`](use-case-diagram.puml).

**Actors**

| Actor | Description |
|---|---|
| Participant | End user of the Flutter app, Keycloak realm role `user` |
| Researcher | Research staff, admin portal access (no KB / settings), role `researcher` |
| Admin | Full platform access, role `admin` (inherits all researcher use cases) |
| AI Agent | MCP client (e.g. Claude) connected to `knowledge-mcp` |
| Backup Scheduler | Cron inside the backup-service container |
| Keycloak / LLM Provider / FCM | Supporting external systems |

---

## Participant use cases (Flutter app)

| ID | Use Case | Description | Key Endpoints | Main Services / Stores |
|---|---|---|---|---|
| UC-01 | Register & sign in | OIDC Authorization Code + PKCE flow; tokens stored in secure storage | Keycloak `/auth/realms/hhh/...` | Keycloak |
| UC-02 | Onboard | Self-service account creation (rate-limited, public) | `POST /api/v1/onboard` | Backend → Keycloak Admin API |
| UC-03 | Donate habit | Submit habit sentence; pipeline: translate → refine → classify contexts → map BCIO → persist graph | `POST /api/v1/habits/donate` | LibreTranslate, API-service (LLM), Neo4j |
| UC-04 | Browse & explore habits | List donated habits with locale-aware `displayText`; graph & stats views | `GET /api/v1/habits?lang=` | Backend, Neo4j |
| UC-05 | Manage profile | Read/write profile answers against admin-defined field definitions | `GET/PUT /api/v1/me/profile`, `GET /api/v1/profile-field-definitions` | MongoDB |
| UC-06 | Complete questionnaire | Fetch assigned questionnaire, submit form response | `GET /api/v1/participant/questionnaires`, `POST /api/v1/questionnaire-responses` | MongoDB, Neo4j |
| UC-07 | Request recommendations | RAG pipeline: extract habits + profile → hybrid retrieve → LLM generation, Redis-cached | `POST /api/v1/recommend` | API-service, LightRAG, Redis, MongoDB |
| UC-08 | View recommendations & give feedback | List own recommendations; per-recommendation free-text feedback | `GET /api/v1/recommendations/me`, `POST /api/v1/recommendations/:id/feedback` | MongoDB |
| UC-09 | Enroll in study | Redeem study code (assigns group) or skip into default study | `POST /api/v1/enroll/redeem-code`, `/enroll/skip-code` | MongoDB |
| UC-10 | Retrieve habit config | Resolved cue config + randomly drawn pre-rated cues + SRHI items for the user's group | `GET /api/v1/me/habit-config` | MongoDB (studies, cue_pools, enrollments) |
| UC-11 | Create implementation intention | If-then habit plan (behaviour, cue(s), duration); enforces `maxHabits` | `POST /api/v1/habits/intentions` | MongoDB |
| UC-12 | Log daily behaviour | Mark intention done / not done; idempotent upsert on (intention, date) | `POST /api/v1/habits/intentions/:id/logs` | MongoDB |
| UC-13 | Submit weekly SRHI check-in | 12-item SRHI per due window; composite score computed | `GET /api/v1/srhi/due`, `POST /api/v1/srhi` | MongoDB |
| UC-14 | Manage settings & language | Persist preferences (e.g. `preferredLanguage`); UI re-localises | `GET/PUT /api/v1/users/me` | MongoDB |
| UC-15 | Receive push notifications | Register FCM device token; receive campaign pushes | `POST /api/v1/participant/register-token` | Backend, FCM |
| UC-16 | Complete survey | Legacy survey module: render survey, submit results | `GET /api/v1/surveys/:id`, `POST /api/v1/surveys/:id/results` | MongoDB |

## Researcher / Admin use cases (admin portal)

| ID | Use Case | Roles | Description | Key Endpoints | Main Services / Stores |
|---|---|---|---|---|---|
| UC-17 | Sign in to admin portal | researcher, admin | NextAuth + Keycloak confidential client; role check in middleware | NextAuth `/api/auth/*` | Keycloak |
| UC-18 | Manage participants | researcher, admin | List, inspect, soft-delete participants; Keycloak user admin | `/api/v1/admin/participants*` | MongoDB, Keycloak Admin API |
| UC-19 | Manage studies, groups & study codes | researcher, admin | Study CRUD, G1–G4 groups, per-group cue config, code generation | `/api/v1/admin/studies*` | MongoDB |
| UC-20 | Manage questionnaires | researcher, admin | Questionnaire CRUD, assignment to studies | `/api/v1/questionnaires*` | MongoDB |
| UC-21 | Manage cue pools | researcher, admin | Cue pool CRUD + bulk CSV import of pre-rated cues | `/api/v1/admin/cue-pools*` | MongoDB |
| UC-22 | View study analytics | researcher, admin | Weekly active rate, SRHI trajectory, dropout curve per group | `/api/v1/admin/studies/:id/analytics` | MongoDB (aggregations) |
| UC-23 | Export study data | researcher, admin | ZIP with 3 CSVs: SRHI responses, daily logs, dropouts | `/api/v1/admin/studies/:id/export` | MongoDB |
| UC-24 | Send notification campaign | researcher, admin | Compose / schedule FCM push to individual, group, or all enrolled | `/api/v1/admin/notifications*` | MongoDB, FCM |
| UC-25 | Manage knowledge base | admin only | Upload PDF/TXT/MD; LightRAG builds entity graph + vector index | `/api/v1/kb*` → API-service → LightRAG | LightRAG, LLM |
| UC-26 | View knowledge graph | admin only | Open LightRAG graph UI to inspect extracted entities | LightRAG web UI `:9621` | LightRAG |
| UC-27 | View dashboard stats & moderate habit feed | researcher, admin | Platform stats, habit feed review & export, session management | `/api/v1/admin/stats`, `/admin/habits/feed*`, `/admin/sessions*` | MongoDB, Neo4j |
| UC-28 | Configure platform settings | admin only | Key-value platform configuration | `PUT /api/v1/admin/settings/:key` | MongoDB |

## System use cases

| ID | Use Case | Actor | Description | Components |
|---|---|---|---|---|
| UC-29 | Run daily backup | Backup Scheduler | 02:00 cron: mongodump, neo4j-admin dump, Fuseki tar, Keycloak partial-export; 30-day retention, webhook alert on failure | backup-service, all stores |
| UC-30 | Query / ingest KB via MCP | AI Agent | `search_knowledge` and `ingest_document` tools over SSE | knowledge-mcp, LightRAG |

---

## Traceability

| Functional area | Use cases | Code |
|---|---|---|
| Auth & identity | UC-01, UC-02, UC-17 | `app/middleware/auth.js`, `app/routes/onboardRouter.js`, `admin/src/lib/auth.ts`, `keycloak/` |
| Donation pipeline | UC-03, UC-04 | `app/routes/habits/`, `app/services/habitDonationService.js`, `API-service/routers/classify_*.py`, `map_bcio.py` |
| Recommendations | UC-07, UC-08 | `app/routes/recommendRouter.js`, `API-service/routers/recommend.py`, `retrieve.py` |
| DFG study module | UC-09 – UC-13, UC-19, UC-21 – UC-24 | `app/services/intentionService.js`, `dailyLogService.js`, `srhiService.js`, `cuePoolService.js`, `exportService.js`, `studyAnalyticsService.js`, `notificationCampaignService.js` |
| Questionnaires & profiles | UC-05, UC-06, UC-20 | `app/routes/questionnaires*`, `profileFieldDefinitionsRouter.js`, `userProfileRouter.js` |
| Knowledge base | UC-25, UC-26, UC-30 | `app/routes/kbRouter.js`, `API-service/kb/`, `lightrag/`, `knowledge-mcp/` |
| Operations | UC-29 | `backup-service/` |
