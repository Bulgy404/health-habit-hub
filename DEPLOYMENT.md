# Production Deployment Guide

## Overview

This guide covers deploying Health Habit Hub to production using Portainer on the TU Dresden server.

**Production environment:**

- URL: `https://habit.wiwi.tu-dresden.de`
- Server IP: `141.76.16.16`
- Management: Portainer
- Auto-update: Every 5 minutes from `main` branch

---

## Local Testing

Use this section when you want to run the stack on your own machine for development or manual testing.

There is one supported local mode:

- `docker-compose.local.yml` — local Docker development stack (also what `make dev` runs). Starts the backend, Keycloak (dev-file DB), databases, Traefik, the Next.js admin panel, Redis, the backup service, and the recommender with local-friendly defaults. Uses `*.localhost` hostnames via Traefik on plain HTTP.

`docker-compose.yml` is the **production** stack (see [Portainer Deployment Steps](#portainer-deployment-steps) below) — it terminates TLS via Let's Encrypt against a real `DOMAIN` and routes everything under a single hostname with path prefixes (`https://${DOMAIN}/admin`, `/auth`, `/grafana`, …), not `*.localhost` subdomains. It isn't meant for ad-hoc local testing; running `docker compose up` (no `-f` flag defaults to this file) locally will just hang or fail waiting on a real ACME challenge unless you've pointed a real domain at your machine. Always pass `-f docker-compose.local.yml` for local work.

### 1. Prepare Local Environment

Create a local `.env` file if you do not already have one:

```bash
cp .env.example .env
```

At minimum, set these values in `.env` before first start:

```env
KEYCLOAK_ADMIN=admin
KEYCLOAK_ADMIN_PASSWORD=<local-keycloak-password>
KEYCLOAK_ADMIN_CLIENT_SECRET=<local-hhh-backend-secret>
MONGO_PASSWORD=<local-mongo-password>
NEO4J_PASSWORD=<local-neo4j-password>
API_SERVICE_SECRET=<local-api-service-secret>
LLM_API_KEY=<optional-but-needed-for-recommender-features>
```

Recommended local defaults already present in `.env.example`:

- `PATH_SUFFIX=localhost`
- `APP_HOST_PORT=3000`
- `TRAEFIK_HOST_PORT80=80`
- `TRAEFIK_HOST_PORT8080=8888` (not `8080` — Keycloak also publishes `8080:8080` in `docker-compose.local.yml`, so `8080` here fails to bind at container start)

### 2. Clean Local Database Init

If you want a completely fresh local state, stop the local stack and remove its Docker volumes first:

```bash
docker compose -f docker-compose.local.yml down -v
docker compose down -v
```

This resets:

- MongoDB data
- Neo4j data
- LightRAG index
- Redis data
- Keycloak local realm storage

Then start again and let Keycloak re-import the realm from `keycloak/hhh-realm.json`.

### 3. Start Local Docker Dev Stack

For normal local app testing:

```bash
docker compose -f docker-compose.local.yml up -d --build
```

Check container status:

```bash
docker compose -f docker-compose.local.yml ps
```

Check backend health:

```bash
curl -s http://localhost:3000/api/v1/health | python3 -m json.tool
```

Expected local URLs in this mode:

| Service                 | Local URL                                                           | Notes                                                                                |
| ----------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Main app via Traefik    | `http://app.localhost`                                              | Preferred browser URL for the app                                                    |
| Admin panel via Traefik | `http://admin.localhost`                                            | Local Next.js admin UI                                                               |
| Traefik dashboard       | `http://proxy.localhost`                                            | Same dashboard as `http://localhost:8888`                                            |
| Backend API             | `http://localhost:3000/api/v1/health`                               | Main backend health check                                                            |
| Keycloak                | `http://localhost:8080`                                             | Realm + admin console                                                                |
| Keycloak Admin Console  | `http://localhost:8080/admin/`                                      | Login with `KEYCLOAK_ADMIN` / `KEYCLOAK_ADMIN_PASSWORD`                              |
| Keycloak Realm Metadata | `http://localhost:8080/realms/hhh/.well-known/openid-configuration` | Quick realm import check                                                             |
| Translation             | `http://localhost:5001`                                             | LibreTranslate in `docker-compose.local.yml`                                         |
| Neo4j Browser           | `http://localhost:7474`                                             | Login with `neo4j` + `NEO4J_PASSWORD` (prod publishes loopback-only equivalents at `17474`/`17687` for SSH-tunnel admin access — see `docs/runbook.md`) |
| LightRAG                | `http://localhost:9622`                                             | Graph + vector knowledge base UI                                                     |
| Recommender             | `http://localhost:8001/docs`                                        | FastAPI docs                                                                         |
| Redis                   | `localhost:6379`                                                    | No auth in local mode                                                                |
| Prometheus              | `http://prometheus.localhost`                                       | Scrapes app metrics from `app:9091`                                                  |
| Grafana                 | `http://grafana.localhost`                                          | Login: `admin` / `KEYCLOAK_ADMIN_PASSWORD`. Pre-built HHH dashboard auto-provisioned |

Notes:

- `*.localhost` resolves locally on modern browsers, so `app.localhost` and `admin.localhost` should work without editing `/etc/hosts`.
- The admin app uses the `hhh-admin` Keycloak client and requires a Keycloak user with the `admin` or `researcher` realm role.
- Redis is included in both `docker-compose.yml` and `docker-compose.local.yml` — it is the API-service response cache and is required by both stacks.
- The `backup` service and its `docker-socket-proxy` sidecar also start with this stack — see [`docs/runbook.md`](docs/runbook.md) for how backups work locally.
- **`make seed` hangs on "`[neo4j] Not ready (attempt N/30)...`" but the neo4j container looks healthy?** This has happened as a Docker/OrbStack host-port-forward glitch: `docker ps` shows `hhh-neo4j` healthy and its logs show Bolt/HTTP both listening, but `127.0.0.1:7474`/`7687` refuse connections from the host (other services' published ports keep working fine). `docker exec hhh-neo4j cypher-shell -u neo4j -p $NEO4J_PASSWORD "RETURN 1;"` still succeeds in this state (it goes through `docker exec`, not the host port, so it isn't a useful check here). Fix: `docker restart hhh-neo4j` — no data loss, no volume reset needed.

### 4. Create a Local Admin User in Keycloak

1. Open `http://localhost:8080/admin/`
2. Log in with:
   - Username: value of `KEYCLOAK_ADMIN`
   - Password: value of `KEYCLOAK_ADMIN_PASSWORD`
3. Select realm `hhh`
4. Go to **Users** → **Add user**
5. Create a user, then set a password under **Credentials**
6. Under **Role mapping**, assign realm role `admin` or `researcher`
7. Open `http://admin.localhost` and sign in with that account

### 5. Verify Onboarding / Recovery Locally

After the local stack is healthy:

1. Open the Flutter app or frontend you are testing
2. Complete onboarding until the recovery passphrase is shown
3. Save the generated passphrase
4. Test restore/recovery using that passphrase

Recovery works by decoding the phrase back into the participant's Keycloak
username/password and minting a token pair via the OAuth password grant
(ROPC) against the `hhh-ropc` client — this requires
`KEYCLOAK_ROPC_CLIENT_SECRET` to be set (see the client secrets table
below); if it's empty, `POST /api/v1/restore` fails closed rather than
minting a token. The route is rate-limited to 5 attempts/hour per IP, and
every attempt is logged to MongoDB `restore_attempts` for review in the
admin panel's **Restore Attempts** page — see
`docs/architecture.md`'s _Account Recovery via Passphrase_ section.

If participant creation fails, check:

```bash
docker logs hhh-app --tail 100
docker logs hhh-keycloak --tail 100
```

### 6. Re-apply Local Keycloak Config After Reset

After wiping Keycloak storage, re-run the repo deploy helper so local Keycloak picks up:

- the realm import
- the bare-user profile schema
- the `hhh-backend` client secret alignment
- the backend service-account permissions

```bash
bash scripts/deploy-keycloak.sh
```

If you are only using `docker-compose.local.yml`, this is the safest way to bring Keycloak back to the repo-expected state after a fresh reset.

---

## Pre-Deployment Checklist

### 0. Code Quality

- [ ] `make test` passes locally (or the individual `test-backend`,
      `test-flutter`, `test-python`, `test-admin` targets) — this is the only
      gate before a push reaches production, since Portainer's auto-update
      polls `main` on a timer with no CI check of its own.
- [ ] If the change touches admin UI styling, manually check both light and
      dark mode in a browser — CSS module changes aren't covered by
      `test-admin`'s typecheck.

### 1. Server Prerequisites

- [ ] Server accessible at `141.76.16.16`
- [ ] Portainer installed and running
- [ ] Ports 80 and 443 open in firewall
- [ ] Docker installed (managed by Portainer)
- [ ] External Docker network `hhh-proxy` created on the server:
  ```bash
  docker network create hhh-proxy
  ```

### 2. DNS Configuration

- [ ] Domain `habit.wiwi.tu-dresden.de` resolves to `141.76.16.16`
- [ ] DNS propagation complete (verified with `dig habit.wiwi.tu-dresden.de`)

### 3. External Services

- Site key
- Secret key
- Domain `habit.wiwi.tu-dresden.de` added
- [ ] SMTP relay/provider credentials obtained (any provider works — no vendor
      lock-in). Used for critical-alert emails: backup failures, LLM outages,
      BullMQ job failures, and service-reachability/5xx alerts. See
      [docs/runbook.md](docs/runbook.md) for what alerts on what.
  - Host + port (587 for STARTTLS, or 465 for implicit TLS)
  - Username + password
  - Sender address (`SMTP_FROM`) and recipient (`ALERT_EMAIL`)

### 4. Security — Generate Secure Values

- [ ] MongoDB password (`MONGO_PASSWORD`)
- [ ] Neo4j password (`NEO4J_PASSWORD`)
- [ ] oauth2-proxy secrets (`OAUTH2_PROXY_CLIENT_SECRET`, `OAUTH2_PROXY_COOKIE_SECRET`)
- [ ] LightRAG login (`LIGHTRAG_AUTH_PASSWORD`, `LIGHTRAG_TOKEN_SECRET`)
- [ ] Keycloak admin password (`KEYCLOAK_ADMIN_PASSWORD`)
- [ ] Keycloak PostgreSQL password (`KC_DB_PASSWORD`)
- [ ] Traefik dashboard hash: `htpasswd -nb admin your-password`
- [ ] **API service shared secret** (`API_SERVICE_SECRET`): `openssl rand -hex 32`

### 5. Bind-Mount Config Directory (Required — Portainer CE Limitation)

Portainer **Community Edition** does not support "relative path volumes" for
Git-based stacks (that's a paid Business Edition feature — you'll see
"Re-pull image" and "Force redeployment" greyed out as Business features too,
which is a good sign you're on CE). Without it, a Git-based Portainer stack
only fetches/writes `docker-compose.yml` itself into its own per-deploy stack
folder (`/data/compose/<id>/`, a new numeric ID every deploy) — none of the
repo's other files (`monitoring/`, `keycloak/`, `mongo/entrypoint/`,
`neo4j/import/`) come along with it. Any relative `./...` bind mount that
references them then points at a path that doesn't exist on disk.

Docker's response to a missing bind-mount **source** is to silently
auto-create an empty **directory** there to satisfy the mount — which then
crashes any service expecting a *file* at that path (blackbox-exporter,
Prometheus, the Keycloak realm import) with an OCI error like:

```
error mounting ".../monitoring/blackbox/blackbox.yml" to rootfs at
"/etc/blackbox_exporter/config.yml" ... not a directory
```

**Fix (one-time, before the first deploy):** clone the repo directly onto the
server at a stable path outside Portainer's per-deploy folder.
`docker-compose.yml`'s bind mounts already point here by default
(`${HHH_REPO_DIR:-/opt/hhh/repo}/...` for tracked config,
`${HHH_DATA_DIR:-/opt/hhh/data}/...` for runtime data/secrets like backups
and rclone credentials that shouldn't live in the git checkout):

```bash
sudo mkdir -p /opt/hhh
sudo git clone https://github.com/Bulgy404/health-habit-hub.git /opt/hhh/repo
sudo mkdir -p /opt/hhh/data/backups /opt/hhh/data/rclone
```

Both directories need to be readable by whatever UID/GID the containers run
as — usually **not** root and **not** your login user:

```bash
sudo chmod -R go+rX /opt/hhh
```

Grant read access to **both** `group` (`g+r`) and `other` (`o+r`), not just
one. Several images (e.g. Keycloak: `uid=1000(keycloak) gid=0(root)`) run as
a non-root UID whose **group is `0`/root** — Linux permission checks use the
*first matching class* (owner → group → other), so if a container's UID
shares the file's owning group, the **group** bits are what get checked, and
`other`-only permissions are silently ignored even though they'd otherwise
allow the read. `go+rX` covers both cases.

This clone is refreshed **automatically on every stack (re)deploy** by the
`config-sync` service in `docker-compose.yml` — a one-shot `alpine/git` container
that runs `git fetch` + `git reset --hard` on `/opt/hhh/repo` and fixes read
permissions before the config-consuming services (`mongo`, `neo4j`, `keycloak`,
`keycloak-init`, `blackbox-exporter`, `prometheus`, `grafana`) start. They
`depends_on: config-sync` with `condition: service_completed_successfully`, so
they always mount the up-to-date files. **You no longer need to `git pull` this
clone by hand** — just redeploy the stack.

Notes:

- Only the **one-time initial clone** (above) is manual; after that it self-updates.
- `config-sync` is **best-effort**: if the fetch fails (e.g. transient network),
  it logs a warning and exits 0 so the stack still starts on the existing files.
  Check it with `docker logs hhh-config-sync`.
- It syncs to `main` by default. If you deploy the stack from a different ref,
  set `HHH_CONFIG_REF` (Portainer env var) to the same ref so the config files
  match the deployed `docker-compose.yml`.
- To force an out-of-band refresh without a full redeploy:
  `docker start -a hhh-config-sync` then restart the consumer(s), e.g.
  `docker restart hhh-prometheus`.

### 6. Volume Permissions (First Deploy Only)

LibreTranslate runs as UID 1032 inside the container. Create the host directory with the correct ownership before the first deploy so language model downloads succeed:

```bash
sudo mkdir -p /mnt/data/appdata/hhh2/translate
sudo chown -R 1032:1032 /mnt/data/appdata/hhh2/translate
```

Failure to do this will cause `hhh-translate` to start but fail to persist language packs, resulting in empty translation responses.

---

## Portainer Deployment Steps

### Step 1: Access Portainer

1. Navigate to the Portainer web interface
2. Log in with your credentials
3. Select your environment

### Step 2: Create Stack

1. Go to **Stacks** → **Add stack**
2. Stack name: `health-habit-hub-2`
3. Build method: **Repository**

### Step 3: Configure Git Repository

- **Repository URL:** `https://github.com/Bulgy404/health-habit-hub.git`
- **Repository reference:** `refs/heads/main`
- **Compose path:** `docker-compose.yml`
- **GitOps updates:** Enable
  - Mechanism: Polling, interval 5 minutes
  - Re-pull image / Force redeployment: **Business Edition features** — greyed
    out on Community Edition. Not required; GitOps polling still re-fetches
    and redeploys `docker-compose.yml` on CE, just without those two extras.

> **Before deploying:** this only clones `docker-compose.yml` itself, not the
> rest of the repository (see [Bind-Mount Config
> Directory](#5-bind-mount-config-directory-required--portainer-ce-limitation)
> under Prerequisites) — complete that one-time server setup first, or the
> deploy will fail on missing config files.

### Step 4: Override Environment Variables

The `stack.env` file in the repository contains placeholder values. Override every `CHANGE_THIS_*` entry in Portainer's environment variable section before deploying.

#### Required Overrides

```env
# Passwords — generate secure values!
MONGO_PASSWORD=<your-secure-mongo-password>
NEO4J_PASSWORD=<your-secure-neo4j-password>

# Keycloak
KEYCLOAK_ADMIN=admin
KEYCLOAK_ADMIN_PASSWORD=<your-secure-keycloak-admin-password>
KC_DB_PASSWORD=<your-secure-keycloak-db-password>

# Keycloak client secrets — keycloak-init pushes each into its matching
# Keycloak client at startup. Leaving any of these unset silently sets that
# client's secret to an empty string, breaking the integration (backend
# auth, admin panel login, Grafana SSO, or account restore respectively).
# Generate each with: openssl rand -hex 32
KEYCLOAK_ADMIN_CLIENT_SECRET=<your-hhh-backend-client-secret>
KEYCLOAK_ADMIN_UI_CLIENT_SECRET=<your-hhh-admin-client-secret>
GRAFANA_CLIENT_SECRET=<your-grafana-client-secret>
KEYCLOAK_ROPC_CLIENT_SECRET=<your-hhh-ropc-client-secret>
# oauth2-proxy — SSO gate for the internal tools (admin role). The client secret
# is injected into the oauth2-proxy Keycloak client by keycloak-init; the cookie
# secret signs the SSO session — MUST be 16/24/32 chars (openssl rand -base64 24).
OAUTH2_PROXY_CLIENT_SECRET=<your-oauth2-proxy-client-secret>
OAUTH2_PROXY_COOKIE_SECRET=<your-32-byte-cookie-secret>

# LightRAG's own login (not SSO) — username admin
LIGHTRAG_AUTH_PASSWORD=<your-lightrag-password>
LIGHTRAG_TOKEN_SECRET=<your-lightrag-jwt-secret>

# API service shared secret — MUST match in both hhh-app and hhh-recommender
# Generate with: openssl rand -hex 32
API_SERVICE_SECRET=<your-shared-api-service-secret>

# Generic SMTP — used for critical-alert emails (backup, LLM outages, BullMQ
# failures, service-reachability/5xx alerts). Any provider/relay works.
SMTP_HOST=<your-smtp-host>
SMTP_PORT=587
SMTP_USER=<your-smtp-username>
SMTP_PASS=<your-smtp-password>
SMTP_FROM=noreply@habit.wiwi.tu-dresden.de
ALERT_EMAIL=<address-to-receive-critical-alerts>

# LLM provider (for habit classification, BCIO mapping, translation refinement, recommendations)
LLM_API_KEY=<your-api-key>
LLM_API_BASE=https://llm.scads.ai/v1  # omit to use OpenAI directly
LLM_MODEL=alias-ha                     # or gpt-4o-mini, alias-huge, etc.
```

#### Optional Overrides

```env
# Backup alerts (Slack/Discord/Teams webhook)
ALERT_WEBHOOK_URL=<your-webhook-url>

# Backup retention
BACKUP_RETENTION_DAYS=14

# Max number of scheduled (automatic) backups kept, regardless of age —
# manual/uploaded backups are not counted or capped by this
BACKUP_SCHEDULED_LIMIT=10

# LibreTranslate language packs
LT_LOAD_ONLY=de,en,ja   # comma-separated ISO codes
LT_REQ_LIMIT=0           # max chars per request (0 = unlimited)

# LLM model and sampling
LLM_MODEL=gpt-4o-mini    # or gpt-4o for higher accuracy
LLM_TEMPERATURE=0.2      # 0.0 = deterministic, 1.0 = creative
```

### Step 5: Deploy

1. Click **Deploy the stack**
2. Wait for deployment (5–10 minutes for initial setup; Keycloak first-boot takes ~90 s)
3. Monitor container logs for errors

---

## Post-Deployment Verification

### 1. Check Container Status

All containers should be running:

| Container           | Role                                                                                    |
| ------------------- | --------------------------------------------------------------------------------------- |
| `hhh-proxy`         | Traefik reverse proxy                                                                   |
| `hhh-app`           | Node.js backend API                                                                     |
| `hhh-mongo`         | MongoDB — survey responses, recommendations, user preferences                           |
| `hhh-mongo-express` | MongoDB web UI                                                                          |
| `hhh-neo4j`         | Neo4j graph database — habit graph, BCIO ontology                                       |
| `hhh-redis`         | Redis — notification locks and recommendation caching                                   |
| `hhh-translate`     | LibreTranslate — EN↔DE habit translation                                                |
| `hhh-keycloak-db`   | PostgreSQL — Keycloak backend database                                                  |
| `hhh-keycloak`      | Keycloak identity provider — authentication and authorisation                           |
| `hhh-recommender`   | Python FastAPI recommender service — habit classification, BCIO mapping, LLM refinement |
| `hhh-lightrag`      | LightRAG — graph + vector knowledge base                                                |
| `hhh-knowledge-mcp` | MCP server exposing the knowledge base to AI agents                                     |
| `hhh-admin`         | Next.js admin panel — study management UI                                               |
| `hhh-backup`        | Backup service                                                                          |

### 2. Verify SSL Certificate

- Check Traefik logs: look for "certificate obtained"
- Visit `https://habit.wiwi.tu-dresden.de`
- Verify valid SSL certificate (green padlock)

### 3. Test Services

- [ ] Main application: `https://habit.wiwi.tu-dresden.de`
- [ ] Admin panel: `https://habit.wiwi.tu-dresden.de/admin`
- [ ] Mongo Express: `https://habit.wiwi.tu-dresden.de/mongo`
- [ ] Translation API: `https://habit.wiwi.tu-dresden.de/translate`
- [ ] Neo4j: `docker exec -it hhh-neo4j cypher-shell -u neo4j -p ${NEO4J_PASSWORD}` (internal-only, no browser — see below)
- [ ] Traefik dashboard: `https://habit.wiwi.tu-dresden.de/dashboard`

### 4. Run One-time Migration Scripts (First Deploy of This Branch Only)

#### 4a. Legacy Neo4j Migration — no longer required

The legacy n10s `hhh__Habit` schema was retired in 2026-06 with no production
data; no migration step is needed. Current-schema constraints are applied
automatically at backend startup (`app/utils/neo4jSchema.js`).

#### 4b. Re-import Keycloak Realm (First Deploy After Keycloak DB Migration)

If you are upgrading an existing deployment that previously used Keycloak with the embedded dev-file store (`KC_DB=dev-file`), the new PostgreSQL database will be empty on first boot. Keycloak will attempt to import the realm automatically via `--import-realm`, but the import is skipped when a realm with the same name already exists. On a **fresh PostgreSQL database** the realm is always imported.

After deploying with the PostgreSQL-backed Keycloak for the first time, verify the realm is present:

```bash
curl -s -o /dev/null -w "%{http_code}" \
  http://localhost:8080/realms/hhh/.well-known/openid-configuration
# Expected: 200
```

If the realm is missing, force-import it:

```bash
bash scripts/deploy-keycloak.sh
```

> **Note:** Any users, credentials, or client secrets from the old dev-file Keycloak instance are **not** automatically migrated to PostgreSQL. Re-create them manually via the Keycloak admin console or re-run participant provisioning scripts.

#### 4c. Backfill German Translations for Existing English Habits

Habit nodes donated before this branch was deployed do not have a `translationDE` field. Run the backfill script to populate German translations via LibreTranslate + LLM refinement:

```bash
docker exec hhh-app node scripts/backfill-de-translations.js
```

Dry-run mode (preview changes without writing):

```bash
docker exec hhh-app node scripts/backfill-de-translations.js --dry-run
```

Expected output:

```
[backfill] 0 habits already have translationDE. Found 42 to translate.
[backfill] Processed 1/42: <uuid> → "Jeden Morgen joggen"
...
[backfill] Done. 42 updated, 0 failed.
```

#### 4d. Backfill BCIO Enrichment for Existing Habits (Optional)

```bash
docker exec hhh-app node scripts/migrate-habits-bcio.js
```

### 5. Test Backup System

Check backup logs:

```bash
docker logs hhh-backup
```

Verify backup files are created:

- Location: `./backups` directory on the host (bind-mounted into the container at `/backups`)
- Format: `full_backup_YYYYMMDD_HHMMSS.tar.gz`

---

## Network Architecture

### How It Works

1. **External Traffic:** Internet → Ports 80/443 → Traefik (`hhh-proxy`)
2. **Internal Routing:** Traefik inspects Host/Path and routes to the appropriate service via the `hhh-proxy` bridge network
3. **Service Communication:** All services share the `hhh-proxy` external Docker network; they address each other by service/container name

> **Note:** In production (`docker-compose.yml`) the network is named `hhh-proxy` (external). It must be created on the host before the first deploy: `docker network create hhh-proxy`.
>
> In local mode (`docker-compose.local.yml`) the network is named `hhh-proxy` and is created by Docker Compose automatically.

### Network Diagram

```
Internet
   |
Port 80/443
   |
Traefik (hhh-proxy)
   |
hhh-proxy network (bridge)
   |-- hhh-app          Node.js backend API
   |-- hhh-admin        Next.js admin panel
   |-- hhh-recommender  Python FastAPI — LLM/BCIO/recommendations
   |-- hhh-lightrag     LightRAG — graph + vector knowledge base
   |-- hhh-knowledge-mcp MCP server — knowledge base for AI agents
   |-- hhh-redis        Redis — notification locks, recommendation cache
   |-- hhh-keycloak     Keycloak — routed at /auth, no published port
   |-- hhh-keycloak-db  PostgreSQL — Keycloak database (internal only)
   |-- hhh-mongo        MongoDB
   |-- hhh-mongo-express MongoDB UI
   |-- hhh-neo4j        Graph DB — loopback-only ports 17474/17687 for SSH-tunnel admin access (see below)
   |-- hhh-translate    LibreTranslate — UID 1032, volume chown required
   |-- hhh-prometheus   Metrics — internal-only, no published port
   |-- hhh-grafana      Dashboards — routed at /grafana, Keycloak SSO
   `-- hhh-backup       Backup service — also joins hhh-backup-internal

hhh-backup-internal network (bridge, internal-only)
   |-- hhh-backup             (also on hhh-proxy)
   `-- hhh-docker-socket-proxy  Scoped Docker API — no direct socket mount
```

---

## Automatic Updates

### How It Works

- Portainer polls the `main` branch every 5 minutes
- If changes are detected:
  1. Pulls latest code
  2. Rebuilds images if needed
  3. Recreates containers
  4. Zero-downtime for config-only changes

### Triggering a Manual Update

In Portainer:

1. Go to **Stacks** → `health-habit-hub-2`
2. Click **Pull and redeploy**

---

## Troubleshooting

### Admin login loops / never reaches Keycloak

**Problem:** Clicking sign-in on `https://${DOMAIN}/admin` just reloads to
`…/admin/api/auth/signin?callbackUrl=…/admin/signin?csrf=true` and never shows the
Keycloak login page — or a browser **basic-auth popup** appears instead of Keycloak.

**Cause & fix — the admin panel is served under the `/admin` sub-path, and three
things must all be correct (all handled in the repo; listed here so you know why):**

1. **`NEXTAUTH_URL` must include the API path.** In `docker-compose.yml` it is
   `https://${DOMAIN}/admin/api/auth` (**not** `…/admin`). With `basePath: /admin`,
   NextAuth v4 builds its sign-in/callback/CSRF links from this value; if it lacks
   `/api/auth`, links point at `/admin/*`, the sign-in POST misses the handler, and
   login loops on `/admin/signin?csrf=true`. It is derived from `DOMAIN`, so setting
   `DOMAIN` correctly is all that's needed.
2. **`<SessionProvider basePath="/admin/api/auth">`** (`admin/src/components/providers.tsx`)
   — otherwise the client's `signIn()`/`useSession()`/CSRF calls hit the root
   `/api/auth/*`, which Traefik routes to the backend API, not the admin app.
3. **Traefik must not expose its dashboard under `PathPrefix(/api)`** (removed in
   `docker-compose.yml`) — it shadowed `/admin/api/auth/*` behind basic-auth, which
   is what produces the browser basic-auth popup.

Because #1 lives in a **built** image (`middleware.ts`) *and* a runtime env, a
redeploy must **rebuild the admin image** (Portainer rebuild, or
`docker compose build --no-cache admin`) as well as pick up the new compose env.

Also confirm the Keycloak `hhh-admin` client's Valid Redirect URIs include
`https://${DOMAIN}/admin/*` (the realm import seeds this, but the import is skipped
when the realm already exists — on an upgrade, set it on the running client):

```bash
docker exec hhh-keycloak /opt/keycloak/bin/kcadm.sh config credentials \
  --server http://localhost:8080/auth --realm master \
  --user admin --password "$KEYCLOAK_ADMIN_PASSWORD"
docker exec hhh-keycloak /opt/keycloak/bin/kcadm.sh get clients -r hhh \
  -q clientId=hhh-admin --fields 'clientId,redirectUris'
```

### Admin login fails with `error=OAuthCallback`

**Problem:** Keycloak authenticates you, then the browser lands back on
`…/admin/api/auth/signin?error=OAuthCallback` ("Try signing in with a different
account"). This is *after* the sign-in loop above is fixed — Keycloak's own logs
look clean, because the failure is on the admin's server-to-server callback.

**Diagnose first — NextAuth logs the real reason:**

```bash
sudo docker logs --tail 60 hhh-admin        # attempt a login, then run this
```

Two causes, both from `KC_HTTP_RELATIVE_PATH=/auth` (all handled in the repo;
listed so the values aren't "corrected" back):

1. **`/auth` missing on the internal endpoints.** `KEYCLOAK_INTERNAL_URL` must be
   `http://keycloak:8080/auth`. Without it `admin/src/lib/auth.ts` builds
   `http://keycloak:8080/realms/hhh/.../token`, which 404s.
2. **`KEYCLOAK_ISSUER` must be the PUBLIC URL** — `https://${DOMAIN}/auth/realms/hhh`
   — even though token/userinfo/JWKS are fetched internally. Keycloak stamps
   `iss` from the frontend request context, so tokens carry the public issuer.
   The internal form produces:
   `iss mismatch, expected http://keycloak:8080/auth/realms/hhh, got: https://<domain>/auth/realms/hhh`

> ⚠️ The **internal discovery document is misleading here**: fetching
> `/auth/realms/hhh/.well-known/openid-configuration` over the Docker hostname
> advertises `issuer: http://keycloak:8080/auth/realms/hhh`, contradicting the
> issued token. `KC_HOSTNAME=https://${DOMAIN}` is now set on the keycloak
> service so the two agree — but the **issued token is authoritative**.

Both are runtime `environment:` values, so a redeploy applies them with **no
image rebuild**. Verify they are actually live (Portainer has served stale
compose before):

```bash
sudo docker exec hhh-admin env | grep -E 'KEYCLOAK_ISSUER|KEYCLOAK_INTERNAL_URL'
```

Local dev is unaffected — `docker-compose.local.yml` sets no relative path, so
its non-`/auth` values are correct there.

### SSL Certificate Issues

**Problem:** Certificate not obtained

**Solutions:**

1. Check ports 80/443 are open:
   ```bash
   sudo ufw status
   ```
2. Verify DNS propagation:
   ```bash
   dig habit.wiwi.tu-dresden.de
   ```
3. Check Traefik logs:
   ```bash
   docker logs hhh-proxy | grep -i certificate
   ```

### Services Can't Communicate

**Problem:** App can't connect to MongoDB / Neo4j / Redis / recommender

**Solutions:**

1. Verify all containers are on the same network:
   ```bash
   docker network inspect hhh-proxy
   ```
2. Check service names match those in `docker-compose.yml` (internal hostnames are the service keys: `mongo`, `neo4j`, `redis`, `recommender`, `lightrag`)
3. Verify environment variables in Portainer

### Recommender / API Service Errors

**Problem:** `hhh-recommender` or `hhh-app` returns auth errors on internal calls

**Solution:** Ensure `API_SERVICE_SECRET` is set to the **same value** in Portainer for both services and that neither container has a stale value cached. Redeploy the stack after updating the secret.

### Backup Failures

**Problem:** Backup container shows errors

**Solutions:**

1. Check backup logs:
   ```bash
   docker logs hhh-backup
   ```
2. Verify MongoDB credentials match (`MONGO_USER` / `MONGO_PASSWORD`)
3. Ensure the `./backups` bind-mount directory has write permissions
4. Check disk space

### Container Won't Start

**Problem:** Container in restart loop

**Solutions:**

1. Check container logs:
   ```bash
   docker logs <container-name>
   ```
2. Verify environment variables are set correctly in Portainer
3. Check resource constraints (memory/CPU)

### Bind-Mounted Config File Becomes an Empty Directory

**Problem:** Deploy fails with an OCI runtime error like:

```
error mounting ".../monitoring/blackbox/blackbox.yml" to rootfs at
"/etc/blackbox_exporter/config.yml" ... not a directory
```

**Cause:** The bind-mount source doesn't exist on the host as a *file* —
Docker auto-creates it as an empty *directory* to satisfy the mount, then
the container fails because it expected a file there. See [Bind-Mount Config
Directory](#5-bind-mount-config-directory-required--portainer-ce-limitation)
under Prerequisites — this happens if `/opt/hhh/repo` hasn't been
cloned/updated yet, or its permissions don't allow the container's UID/GID
to read it.

**Solutions:**

1. Confirm the file exists and is non-empty: `ls -la /opt/hhh/repo/<path>`
2. If it's an empty directory instead of a file, `sudo rmdir` it, then
   re-clone/re-pull `/opt/hhh/repo` so the real file lands there.
3. Re-check permissions: `sudo chmod -R go+rX /opt/hhh`.

### Keycloak Container Unhealthy / `keycloak-init` Never Starts

**Problem:** Deploy fails with `dependency failed to start: container
hhh-keycloak is unhealthy`, and `hhh-keycloak-init` never runs.

**Solutions, in order of likelihood:**

1. **Missing `KC_HTTP_ENABLED=true`:** Keycloak 26.x refuses to boot at all
   in production mode without either HTTPS certs or this flag, since Traefik
   (not Keycloak) terminates TLS. Symptom: the container exits within ~1
   second with `Key material not provided to setup HTTPS...`. Already set on
   the `keycloak` service in `docker-compose.yml` — if this regresses,
   that's why.
2. **Missing `--health-enabled=true` on the `start` command:** Keycloak
   boots and runs fine, but Docker's healthcheck (`curl
   .../health/ready`) fails continuously because Keycloak doesn't expose
   that endpoint unless health checks are explicitly enabled. Symptom:
   Keycloak's own logs show a clean, successful boot (`Listening on:
   http://0.0.0.0:8080`) that runs for several minutes before a *graceful*
   shutdown — Docker gave up waiting on the healthcheck and stopped it, not
   a crash. Already set in `docker-compose.yml` (`command: start
   --import-realm --health-enabled=true`) — if this regresses, that's why.
3. **Healthcheck pointed at the wrong port:** enabling health checks in
   Keycloak 26.x also spins up a separate **management interface** (health
   + metrics), listening on **port 9000** by default — `/health/ready` is no
   longer served on the main port 8080 at all. Symptom: same as above (clean
   boot, graceful shutdown after the healthcheck gives up), but Keycloak's
   boot log will explicitly say `Listening on: http://0.0.0.0:8080.
   Management interface listening on http://0.0.0.0:9000.` The
   `healthcheck.test` in `docker-compose.yml` must target port **9000**, not
   8080 — if this regresses, that's why.
4. **`hhh-realm.json` permission denied:** see the group-vs-other permission
   gotcha in the [Bind-Mount Config
   Directory](#5-bind-mount-config-directory-required--portainer-ce-limitation)
   section — this file needs to be group- *or* other-readable by Keycloak's
   container UID, not just one or the other.

**Debugging tip:** Portainer tears down the whole stack automatically the
moment a deploy fails, often within a second or two — by the time you `docker
logs <container>` by hand, it may already say `No such container`. To catch
the real error, subscribe to Docker's live event stream *before* redeploying
so you attach to the log stream the moment the container starts, rather than
racing to fetch logs afterward:

```bash
sudo docker events --filter 'container=hhh-keycloak' --filter 'event=start' | head -1 | while read -r line; do
  sudo docker logs -f hhh-keycloak
done | tee /tmp/keycloak.log
```

Then redeploy and watch this terminal — it streams the container's real
startup output live, including whatever happens right before it's torn down.

---

## Monitoring

### Prometheus + Grafana (local)

`docker-compose.local.yml` includes Prometheus and Grafana. They start automatically with `make dev` or can be started alone:

```bash
docker compose -f docker-compose.local.yml up -d prometheus grafana
```

| Service    | Local URL                     | Port |
| ---------- | ----------------------------- | ---- |
| Prometheus | `http://prometheus.localhost` | 9090 |
| Grafana    | `http://grafana.localhost`    | 3002 |

Grafana credentials: `admin` / value of `KEYCLOAK_ADMIN_PASSWORD` in `.env`.

The pre-built **HHH App Metrics** dashboard (`monitoring/grafana/dashboards/hhh-app.json`) is auto-provisioned. It shows:

- HTTP request rate and error rate
- p50 / p95 / p99 latency
- Node.js heap and RSS memory
- Event loop lag
- Active handles and requests

Prometheus scrapes the Node.js app at `http://app:9091/metrics` (prom-client, standard default metrics + `http_request_duration_seconds` histogram). The scrape target and interval are configured in `monitoring/prometheus.yml`.

> **Production:** `docker-compose.yml` also runs Prometheus and Grafana. Prometheus has no published port and no Traefik route — it's reachable only from other containers on `hhh-proxy` (Grafana, and the app's own `/admin/system/overview` proxy), never directly from the internet. Grafana is exposed at `https://${DOMAIN}/grafana`, access-gated by Keycloak SSO (`GF_AUTH_GENERIC_OAUTH_*`, mapping the `admin`/`researcher` realm roles to Grafana's Admin/Editor roles) rather than a separate Traefik auth middleware.

### Critical Alerts

Alert emails go to `ALERT_EMAIL` via the generic `SMTP_*` credentials (no vendor-specific API — set once, works with any relay/provider). Two delivery paths, one set of credentials — see [docs/runbook.md](docs/runbook.md) for the full picture:

- **Backup failures** and **LLM-model-unavailable** fire directly from application code (`backup-service/backup.sh`, `API-service/alerting.py`) — independent of Grafana being up.
- **BullMQ job failures**, **service reachability**, and **5xx-rate spikes** are metric-driven and route through Grafana's unified alerting (`monitoring/grafana/provisioning/alerting/alerting.yaml`). `blackbox-exporter` (internal-only, no host mounts) probes every long-running service that doesn't expose its own Prometheus metrics.

To silence an alert during planned maintenance, add a Grafana mute timing (**Alerting → Mute timings**) rather than editing the provisioned rule files.

### Container Logs

View logs in Portainer:

- **Stacks** → `health-habit-hub-2` → click a container → **Logs**

Or via CLI:

```bash
docker logs -f <container-name>
```

### Resource Usage

View in Portainer:

- **Containers** → click a container → **Stats**

### Backup Status

Check latest backup:

```bash
docker exec hhh-backup ls -lh /backups/full_backup_*.tar.gz | tail -5
```

View backup manifest:

```bash
docker exec hhh-backup cat /backups/backup_*.manifest | tail -20
```

---

## Maintenance

### Updating Application Code

1. Run `make test` locally first (backend lint + unit/integration tests +
   `npm audit`, Flutter analyze + tests, Python API-service pytest, admin
   typecheck) — Portainer's auto-update has no CI gate of its own, so this is
   the only check before a push reaches production.
2. Push changes to `main` branch
3. Wait 5 minutes (or trigger a manual update in Portainer)
4. Verify deployment in Portainer logs

### Rotating Passwords

1. Generate a new secure value
2. Update it in Portainer's environment variables
3. Click **Update the stack**
4. Restart the affected containers

### Rotating `API_SERVICE_SECRET`

Both `hhh-app` and `hhh-recommender` read `API_SERVICE_SECRET` at startup. After updating the value in Portainer, redeploy the entire stack (or restart both containers) so both services use the same new secret simultaneously.

### Certificate Renewal

Automatic via Let's Encrypt — certificates auto-renew 30 days before expiry. Monitor Traefik logs for renewal notices.

---

## Security Best Practices

- [ ] All passwords are strong and unique
- [ ] `API_SERVICE_SECRET` generated with `openssl rand -hex 32`
- [ ] Internal tools reachable only via Keycloak SSO (admin role); LightRAG behind its own login
- [ ] Regular backups verified
- [ ] Security updates applied to base images
- [ ] Logs monitored for suspicious activity
- [ ] Firewall configured (only ports 80/443 open; SSH restricted)
- [ ] SSH key authentication enabled, root login disabled

---

## URLs Reference

| Service                 | Production URL                                | Local (`docker-compose.local.yml`)                                      | Direct Local Port                                                   |
| ----------------------- | --------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Backend API             | `https://habit.wiwi.tu-dresden.de/api/v1/`    | `http://app.localhost/api/v1/`                                          | `http://localhost:3000/api/v1/`                                     |
| Flutter Web App         | `https://habit.wiwi.tu-dresden.de`            | local mobile/web build pointing to local backend                        | —                                                                   |
| Admin Panel             | `https://habit.wiwi.tu-dresden.de/admin`      | `http://admin.localhost`                                                | `http://localhost:3001`                                             |
| Keycloak                | `https://habit.wiwi.tu-dresden.de/auth/`      | `http://keycloak.localhost`                                             | `http://localhost:8080`                                             |
| Keycloak Admin UI       | `https://habit.wiwi.tu-dresden.de/auth/admin` | `http://keycloak.localhost/admin/`                                      | `http://localhost:8080/admin/`                                      |
| Keycloak Realm Metadata | —                                             | `http://keycloak.localhost/realms/hhh/.well-known/openid-configuration` | `http://localhost:8080/realms/hhh/.well-known/openid-configuration` |
| Mongo Express           | `https://habit.wiwi.tu-dresden.de/mongo`      | not in `docker-compose.local.yml`                                       | `http://localhost:8081` (with `docker compose up`)                  |
| Translation             | `https://habit.wiwi.tu-dresden.de/translate`  | `http://translate.localhost`                                            | `http://localhost:5001`                                             |
| Neo4j Browser           | not exposed (internal-only, see below)        | `http://neo4j.localhost`                                                | `http://localhost:7474`                                             |
| LightRAG                | not exposed (internal-only)                   | `http://localhost:9622`                                                 | `http://localhost:9622`                                             |
| Recommender API docs    | —                                             | not routed via Traefik locally                                          | `http://localhost:8001/docs`                                        |
| Prometheus              | not exposed (internal-only)                   | `http://prometheus.localhost`                                           | `http://localhost:9090`                                             |
| Grafana                 | `https://habit.wiwi.tu-dresden.de/grafana`    | `http://grafana.localhost`                                              | `http://localhost:3002`                                             |
| Traefik Dashboard       | `https://habit.wiwi.tu-dresden.de/dashboard`  | `http://proxy.localhost`                                                | `http://localhost:8888`                                             |

---

## Accessing Neo4j in Production

Neo4j is not reachable from the internet in production, but it **is** published on the server's **loopback only** — `127.0.0.1:17474` (HTTP) / `127.0.0.1:17687` (Bolt) — specifically for SSH-tunnel admin access, alongside the always-available `docker exec ... cypher-shell` route. See [`docs/runbook.md`](docs/runbook.md) → "Connecting to Neo4j Browser" for both methods (direct bolt+s via an opened firewall port, and the recommended SSH-tunnel + `http://localhost:7474` approach) — that's the authoritative, kept-up-to-date version; don't duplicate it here.

For a quick ad-hoc query without a tunnel, `docker exec` goes through the Docker daemon rather than a published network port, so it works regardless:

```bash
ssh service@habit.wiwi.tu-dresden.de 'docker exec -it hhh-neo4j cypher-shell -u neo4j -p ${NEO4J_PASSWORD}'
```

For routine local development, use `docker-compose.local.yml`, where Neo4j Browser is reachable directly at `http://neo4j.localhost` or `http://localhost:7474` — no tunnel needed.

---

## Data Access and Management

### MongoDB Data

**Host paths:**

- Database files: `/mnt/data/appdata/hhh2/mongo/db`
- Config files: `/mnt/data/appdata/hhh2/mongo/config`

**Access via Mongo Express (Web UI):**

- URL: `https://habit.wiwi.tu-dresden.de/mongo`
- Auth: Keycloak SSO — log in with your Keycloak account (must hold the realm
  `admin` role). mongo-express's own basic auth is disabled.

**Initialization:**
MongoDB is automatically initialized on first run with:

- Database: `surveyjs`
- Initialization script: `mongo/entrypoint/surveyjs-init.js`

**Backup MongoDB:**

```bash
docker exec hhh-mongo mongodump \
  --username admin --password ${MONGO_PASSWORD} \
  --authenticationDatabase admin --out /tmp/backup

docker cp hhh-mongo:/tmp/backup ./mongo-backup-$(date +%Y%m%d)
```

**Restore MongoDB:**

```bash
docker cp ./mongo-backup-YYYYMMDD hhh-mongo:/tmp/restore

docker exec hhh-mongo mongorestore \
  --username admin --password ${MONGO_PASSWORD} \
  --authenticationDatabase admin /tmp/restore
```

**Direct CLI access:**

```bash
docker exec -it hhh-mongo mongosh -u admin -p ${MONGO_PASSWORD} --authenticationDatabase admin
```

### Neo4j Data

**Host paths:**

- Database files: `/mnt/data/appdata/hhh2/neo4j/data`
- Log files: `/mnt/data/appdata/hhh2/neo4j/logs`

**Access via Browser:** see "Accessing Neo4j Browser via SSH Tunnel" above.

**Backup Neo4j:**

```bash
docker stop hhh-neo4j
sudo tar -czf neo4j-backup-$(date +%Y%m%d).tar.gz /mnt/data/appdata/hhh2/neo4j/data
docker start hhh-neo4j
```

**Restore Neo4j:**

```bash
docker stop hhh-neo4j
sudo tar -xzf neo4j-backup-YYYYMMDD.tar.gz -C /
docker start hhh-neo4j
```

**Direct Cypher access:**

```bash
docker exec -it hhh-neo4j cypher-shell -u neo4j -p ${NEO4J_PASSWORD}
```

### LightRAG Data

**Storage:** Named volume `hhh-lightrag-data` (graph + vector knowledge base index). Also captured automatically by the nightly backup service.

**Backup LightRAG index:**

```bash
docker run --rm \
  -v hhh-lightrag-data:/data \
  -v $(pwd):/backup \
  alpine tar czf /backup/lightrag-backup-$(date +%Y%m%d).tar.gz -C /data .
```

**Restore LightRAG index:**

```bash
docker run --rm \
  -v hhh-lightrag-data:/data \
  -v $(pwd):/backup \
  alpine tar xzf /backup/lightrag-backup-YYYYMMDD.tar.gz -C /data
```

### Redis Data

**Storage:** Named volume `hhh-redis-data`

Redis is used for:

- Notification locks (preventing duplicate push notifications)
- Recommendation response caching

Redis data does not need to be backed up — it is a short-lived cache and will be repopulated automatically. If needed, the volume can be inspected with:

```bash
docker exec -it hhh-redis redis-cli
```

---

## Additional Notes

- Backups run daily (the backup container loops every 24 hours with a 2-minute startup delay)
- Backup retention: 14 days by default (configurable via `BACKUP_RETENTION_DAYS`), plus a cap of the last 10 scheduled backups regardless of age (configurable via `BACKUP_SCHEDULED_LIMIT`)
- All persistent data is stored in named Docker volumes or host-mounted directories under `/mnt/data/appdata/hhh2/`
- SSL certificates are stored in `/mnt/data/appdata/hhh2/traefik-certs/`
- LibreTranslate volume at `/mnt/data/appdata/hhh2/translate` must be owned by UID 1032 before first deploy
- Neo4j is not internet-reachable, but is published loopback-only (`127.0.0.1:17474`/`17687`) for SSH-tunnel admin access, or reachable directly via `docker exec -it hhh-neo4j cypher-shell` — see "Accessing Neo4j in Production" above

---

## Error Reporting (Sentry)

Both the backend and the Flutter app ship with **opt-in** Sentry crash
reporting — a silent no-op unless configured:

- **Backend:** set `SENTRY_DSN` in `.env` (and optionally
  `SENTRY_TRACES_SAMPLE_RATE`, default 0). Unhandled route errors are captured
  with route + method tags; request bodies and cookies are stripped before
  sending (`app/utils/errorReporting.js`).
- **Flutter:** build with `--dart-define=SENTRY_DSN=https://…`. PII,
  screenshots, and view hierarchies are disabled — participants stay anonymous
  in crash reports.

> **Data protection:** use a **self-hosted Sentry instance** on TU
> infrastructure (or an EU-region instance reviewed by the DPO) before
> enabling this in production. Without a DSN nothing is collected. For a
> longitudinal study, silent client crashes look identical to dropout —
> crash reporting separates the two.

---

## Secrets Handling & Rotation

### Principles

- `.env` files are **never** committed (`.gitignore`); `.env.example` carries
  placeholders only. CI uses throwaway values (see `nightly-e2e.yml`).
- On the production host, prefer **Portainer stack secrets / environment
  overrides** over flat `.env` files: secrets entered in Portainer are stored
  in its encrypted database instead of plaintext on disk, and redeploys don't
  depend on a hand-edited file. Migrate one variable at a time by moving it
  from `.env` into the Portainer stack editor's environment section.
- Restrict `.env` on the host: `chmod 600 .env`, owned by the deploy user.
- The rclone offsite-backup credentials live in
  `backup-service/rclone/rclone.conf` (git-ignored, `chmod 600`).

### Rotation checklist (do now, then on every team change)

| Secret                                               | Where used                                                                          | Rotate at                                                                                                                                           |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MONGO_PASSWORD`                                     | mongo, app, backup                                                                  | regenerate + redeploy stack                                                                                                                         |
| `NEO4J_PASSWORD`                                     | neo4j, app, api-service                                                             | regenerate + redeploy                                                                                                                               |
| `KEYCLOAK_ADMIN_PASSWORD`                            | keycloak, keycloak-init                                                             | Keycloak admin console + .env                                                                                                                       |
| `KEYCLOAK_ADMIN_CLIENT_SECRET` (hhh-backend client)  | app ↔ Keycloak                                                                      | regenerate + redeploy keycloak-init + app                                                                                                           |
| `KEYCLOAK_ADMIN_UI_CLIENT_SECRET` (hhh-admin client) | admin panel login                                                                   | regenerate + redeploy keycloak-init + admin                                                                                                         |
| `KEYCLOAK_ROPC_CLIENT_SECRET` (hhh-ropc client)      | onboarding, credential rotation, passphrase-based restore                           | regenerate + redeploy keycloak-init + app                                                                                                           |
| `GRAFANA_CLIENT_SECRET` (grafana client)             | Grafana SSO                                                                         | regenerate + redeploy keycloak-init + grafana                                                                                                       |
| `API_SERVICE_SECRET`                                 | app ↔ api-service                                                                   | regenerate + redeploy both                                                                                                                          |
| `LIGHTRAG_API_KEY`, `LLM_API_KEY`                    | lightrag, api-service                                                               | provider console                                                                                                                                    |
| `SMTP_USER` / `SMTP_PASS`                            | backup, LLM-outage, BullMQ, and reachability/5xx alert emails (see docs/runbook.md) | provider console or relay config                                                                                                                    |
| ~~`MAIL_USER` / `MAIL_PASS` (Mailjet)~~              | removed — replaced by generic SMTP above                                            | **revoke now** in the Mailjet console — previous values circulated in a repo working copy and were never rotated before the integration was removed |
| ~~`RECAPTCHA_*`~~                                    | removed 2026-06                                                                     | **revoke now** in the Google reCAPTCHA console — keys are unused but were exposed                                                                   |
| `SENTRY_DSN`                                         | app, mobile builds                                                                  | Sentry project settings (low sensitivity — write-only DSN)                                                                                          |

After any rotation: `docker compose up -d` (affected services) and run
`node scripts/smoke-e2e.mjs` against the deployment.

---

## Mobile App — Build, Install & Ship

### How the app is configured (read this first)

Backend URLs are **compile-time constants** (`String.fromEnvironment` in
`mobile/lib/config/app_config.dart`) — there is no runtime config file on the
device. The defaults are **mode-dependent**, so the common paths need no flags:

| Build mode                                          | Endpoints used                          |
| --------------------------------------------------- | --------------------------------------- |
| debug / profile (`flutter run`)                      | `localhost` (local dev stack)           |
| release (`flutter build ipa`, Xcode Product→Archive) | `https://habit.wiwi.tu-dresden.de/...`  |

This matters because an **Xcode archive cannot pass Flutter `--dart-define`
flags**. Before this was mode-dependent, archiving from Xcode silently produced
a localhost build that showed a **blank white screen** on device. See
`docs/guides/flutter-architecture.md` §7.

Override either default (e.g. a staging server) with:

```bash
flutter build ipa --release --dart-define-from-file=dart_defines_prod.json
```

If a *release* build is ever explicitly pointed at localhost, the app now renders
an on-screen configuration error naming the offending values instead of a white
screen (`_ConfigErrorApp` in `mobile/lib/main.dart`).

### Run locally in debug (development)

```bash
# start the backend first — debug builds target localhost
make dev                      # or: docker compose -f docker-compose.local.yml up

cd mobile
flutter run                   # attached device or simulator
flutter run -d chrome         # web
```

Hot reload, DevTools and breakpoints are available. Note a debug build **only
runs while tethered** to the Mac (JIT + Dart VM service) — it will flash and quit
if you unplug. Use `--release` for standalone use.

To debug against production instead:
`flutter run --dart-define-from-file=dart_defines_prod.json`

### Run a release build on a physical iPhone

```bash
cd mobile
flutter devices               # note your device id
flutter run --release -d <your-iphone-id>
```

No flags needed (release defaults to production). The app **stays installed**
after unplugging — 1 year with a paid Apple Developer account, 7 days with a free
personal Apple ID (then re-run to renew). With a personal profile, first launch
also needs: **Settings → General → VPN & Device Management → Trust**.

### Ship to TestFlight (step by step)

1. **Bump the build number** — every upload must be unique:
   ```yaml
   # mobile/pubspec.yaml
   version: 1.0.0+2      # was 1.0.0+1
   ```
2. **Check signing** (once): `open ios/Runner.xcworkspace` → Runner target →
   **Signing & Capabilities** → *Automatically manage signing* ✓, correct **Team**,
   and **Push Notifications** + **Background Modes → Remote notifications** present
   (required for FCM in a distribution build).
3. **Build the archive**:
   ```bash
   cd mobile
   flutter clean && flutter pub get
   flutter build ipa --release
   ```
   Produces `build/ios/archive/Runner.xcarchive`.
4. **Upload**: Xcode → **Window → Organizer → Archives** → select the archive →
   **Distribute App** → **App Store Connect** → **Upload** → defaults →
   *Automatically manage signing* → **Upload**.
   (Alternative: drag `build/ios/ipa/*.ipa` into the **Transporter** app.)
5. **Wait for processing** — App Store Connect → app → **TestFlight** tab shows
   "Processing" for ~5–15 min. Answer the **export compliance** prompt (standard
   HTTPS/TLS → exempt; or set `ITSAppUsesNonExemptEncryption=false` in `Info.plist`
   to skip it each time).
6. **Add testers** — **TestFlight → Internal Testing** → group → add testers →
   attach the build. Internal testing needs **no review** and is live in minutes.
   External testers (up to 10 000) require a one-time light **Beta App Review**.
7. **Install** — on the device, install **TestFlight** from the App Store, open the
   invite, tap **Install**. Later builds appear there automatically.

> **Login-gated app:** the study app requires a Keycloak account, so TestFlight
> "Test Information" (and later App Review) **must include working demo
> credentials**, or external/beta review is rejected. See
> `docs/app-store/review-information.md`.

### App icon & launch image

Both are real assets, not placeholders — `flutter build ipa` validates this:

- **App icon**: `mobile/ios/Runner/Assets.xcassets/AppIcon.appiconset/` (21 PNGs,
  generated from `mobile/assets/icon/app_icon.png`). No alpha, no rounded corners.
- **Launch image**: `mobile/ios/Runner/Assets.xcassets/LaunchImage.imageset/`
  (180 / 360 / 540 px, generated from the same source; the storyboard centres it).
  Flutter ships 1×1 px placeholders by default, which trips
  *"Launch image is set to the default placeholder icon"* — regenerate with:
  ```bash
  cd mobile/ios/Runner/Assets.xcassets/LaunchImage.imageset
  SRC=../../../../assets/icon/app_icon.png
  cp "$SRC" LaunchImage.png    && sips -z 180 180 LaunchImage.png
  cp "$SRC" LaunchImage@2x.png && sips -z 360 360 LaunchImage@2x.png
  cp "$SRC" LaunchImage@3x.png && sips -z 540 540 LaunchImage@3x.png
  ```

### Legal URLs required by the stores

| Field                     | URL                                                    |
| ------------------------- | ------------------------------------------------------ |
| Privacy Policy (required) | `https://habit.wiwi.tu-dresden.de/en/privacy`          |
| Imprint                   | `https://habit.wiwi.tu-dresden.de/en/imprint`          |
| Accessibility statement   | `https://habit.wiwi.tu-dresden.de/en/accessibility`    |

German variants use `/de/...`. These are server-rendered HTML pages (browsers get
a styled page, the mobile app gets JSON from the same URL via content
negotiation), so they open standalone for reviewers.

---

## Mobile Release Signing & Firebase API Keys

### Android release keystore

- The production signing keystore is **not** in the repo (git-ignored, per
  `mobile/android/.gitignore`). It lives only on the machine(s) that produce
  release builds, currently `~/health-habit-hub-release.jks` (Felix), alias
  `health-habit-hub`.
- `mobile/android/key.properties` (also git-ignored — see
  `key.properties.example` for the template) must point `storeFile` at that
  `.jks` and carry the store/key passwords for `flutter build` to produce a
  properly signed release APK/AAB. Without it, release builds silently fall
  back to debug signing (see comment in
  `mobile/android/app/build.gradle.kts`) and are not installable via Play
  Store updates.
- Release certificate SHA-1 (safe to publish — it's a public fingerprint, not
  a secret): `35:4E:B7:95:01:19:81:09:7C:CC:79:1B:7E:AC:D2:EA:CD:3B:F2:CE`.
  Re-derive with `keytool -list -v -keystore <path> -alias health-habit-hub`.
- **There is only one copy.** Losing this keystore means the app can never be
  updated under its current Play Store listing/signature again. Back it up
  (password manager attachment or encrypted storage) outside this machine.
- If this app is ever uploaded to Play Console for the first time, Google
  Play App Signing will take over as the actual upload/distribution key —
  check Play Console's signing key details before generating a second
  keystore for an app that's already been published once.

### Firebase API key restrictions (Google Cloud Console)

Firebase auto-creates unrestricted API keys per platform on project
`health-habit-hub-v2`. As of 2026-07-13 these were locked down under
**APIs & Services → Credentials**:

| Key                                    | Restriction                             | Value                                                                                                                                                                                                         |
| -------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Android key (`AIzaSyDpxvK…`)           | Application restrictions → Android apps | package `de.felixreinsch.healthhabithub` + release SHA-1 above                                                                                                                                                |
| iOS key (`AIzaSyDKPS…`)                | Application restrictions → iOS apps     | bundle ID `de.felixreinsch.healthhabithub`                                                                                                                                                                    |
| Browser key (auto created by Firebase) | —                                       | **deleted** — no client-side Firebase JS SDK usage anywhere in the repo (the app uses `firebase-admin` server-side via `app/services/notificationService.js`, authenticated by service account, not this key) |

**Why:** an unrestricted key extracted from the shipped app binary could be
used outside the signed app to hit any of the ~25 Firebase APIs enabled on
the project (quota abuse at minimum; more relevant if Firestore/Auth are ever
added to this project). Restricting to the app's package/bundle ID renders an
extracted key useless outside the signed release build.

**If you add a debug/dev-signed build that also needs Firebase working**, add
a second Android-apps entry to the Android key with the debug keystore's
SHA-1 (`keytool -list -v -keystore ~/.android/debug.keystore -alias
androiddebugkey -storepass android`) — otherwise only release builds signed
with the keystore above will be able to initialize Firebase.
