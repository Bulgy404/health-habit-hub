# Production Deployment Guide

## Overview

This guide covers deploying Health Habit Hub to production using Portainer on the TU Dresden server.

**Production environment:**
- URL: `https://habit.wiwi.tu-dresden.de`
- Server IP: `141.76.16.16`
- Management: Portainer
- Auto-update: Every 5 minutes from `master` branch

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

| Service | Local URL | Notes |
|---------|-----------|-------|
| Main app via Traefik | `http://app.localhost` | Preferred browser URL for the app |
| Admin panel via Traefik | `http://admin.localhost` | Local Next.js admin UI |
| Traefik dashboard | `http://proxy.localhost` | Same dashboard as `http://localhost:8888` |
| Backend API | `http://localhost:3000/api/v1/health` | Main backend health check |
| Keycloak | `http://localhost:8080` | Realm + admin console |
| Keycloak Admin Console | `http://localhost:8080/admin/` | Login with `KEYCLOAK_ADMIN` / `KEYCLOAK_ADMIN_PASSWORD` |
| Keycloak Realm Metadata | `http://localhost:8080/realms/hhh/.well-known/openid-configuration` | Quick realm import check |
| Translation | `http://localhost:5001` | LibreTranslate in `docker-compose.local.yml` |
| Neo4j Browser | `http://localhost:7474` | Login with `neo4j` + `NEO4J_PASSWORD` (local-only — not published in production) |
| LightRAG | `http://localhost:9622` | Graph + vector knowledge base UI |
| Recommender | `http://localhost:8001/docs` | FastAPI docs |
| Redis | `localhost:6379` | No auth in local mode |
| Prometheus | `http://prometheus.localhost` | Scrapes app metrics from `app:9091` |
| Grafana | `http://grafana.localhost` | Login: `admin` / `KEYCLOAK_ADMIN_PASSWORD`. Pre-built HHH dashboard auto-provisioned |

Notes:
- `*.localhost` resolves locally on modern browsers, so `app.localhost` and `admin.localhost` should work without editing `/etc/hosts`.
- The admin app uses the `hhh-admin` Keycloak client and requires a Keycloak user with the `admin` or `researcher` realm role.
- Redis is included in both `docker-compose.yml` and `docker-compose.local.yml` — it is the API-service response cache and is required by both stacks.
- The `backup` service and its `docker-socket-proxy` sidecar also start with this stack — see [`docs/runbook.md`](docs/runbook.md) for how backups work locally.

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
- [ ] Mailjet API credentials obtained (<https://app.mailjet.com/account/api_keys>)
  - API key
  - Secret key
  - Sender domain verified

### 4. Security — Generate Secure Values
- [ ] MongoDB password (`MONGO_PASSWORD`)
- [ ] Mongo Express password (`MONGO_EXPRESS_PASSWORD`)
- [ ] Neo4j password (`NEO4J_PASSWORD`)
- [ ] Keycloak admin password (`KEYCLOAK_ADMIN_PASSWORD`)
- [ ] Keycloak PostgreSQL password (`KC_DB_PASSWORD`)
- [ ] Traefik dashboard hash: `htpasswd -nb admin your-password`
- [ ] **API service shared secret** (`API_SERVICE_SECRET`): `openssl rand -hex 32`

### 5. Volume Permissions (First Deploy Only)

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
- **Repository URL:** `https://github.com/helict/health-habit-hub-2`
- **Repository reference:** `refs/heads/master`
- **Compose path:** `docker-compose.yml`
- **GitOps updates:** Enable
  - Polling interval: 5 minutes
  - Re-pull image: Enable
  - Force redeployment: Enable

### Step 4: Override Environment Variables

The `stack.env` file in the repository contains placeholder values. Override every `CHANGE_THIS_*` entry in Portainer's environment variable section before deploying.

#### Required Overrides

```env
# Passwords — generate secure values!
MONGO_PASSWORD=<your-secure-mongo-password>
MONGO_EXPRESS_PASSWORD=<your-secure-mongo-express-password>
NEO4J_PASSWORD=<your-secure-neo4j-password>

# Keycloak
KEYCLOAK_ADMIN=admin
KEYCLOAK_ADMIN_PASSWORD=<your-secure-keycloak-admin-password>
KC_DB_PASSWORD=<your-secure-keycloak-db-password>

# API service shared secret — MUST match in both hhh-app and hhh-recommender
# Generate with: openssl rand -hex 32
API_SERVICE_SECRET=<your-shared-api-service-secret>

# Traefik Dashboard (generate: htpasswd -nb admin your-password)
TRAEFIK_DASHBOARD_AUTH=<your-htpasswd-hash>

# Mailjet (from Mailjet dashboard)
MAIL_USER=<mailjet-api-key>
MAIL_PASS=<mailjet-secret-key>

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

| Container | Role |
|-----------|------|
| `hhh-proxy` | Traefik reverse proxy |
| `hhh-app` | Node.js backend API |
| `hhh-mongo` | MongoDB — survey responses, recommendations, user preferences |
| `hhh-mongo-express` | MongoDB web UI |
| `hhh-neo4j` | Neo4j graph database — habit graph, BCIO ontology |
| `hhh-redis` | Redis — notification locks and recommendation caching |
| `hhh-translate` | LibreTranslate — EN↔DE habit translation |
| `hhh-keycloak-db` | PostgreSQL — Keycloak backend database |
| `hhh-keycloak` | Keycloak identity provider — authentication and authorisation |
| `hhh-recommender` | Python FastAPI recommender service — habit classification, BCIO mapping, LLM refinement |
| `hhh-lightrag` | LightRAG — graph + vector knowledge base |
| `hhh-knowledge-mcp` | MCP server exposing the knowledge base to AI agents |
| `hhh-admin` | Next.js admin panel — study management UI |
| `hhh-backup` | Backup service |

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
   |-- hhh-neo4j        Graph DB — internal-only, no published port (see below)
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
- Portainer polls the `master` branch every 5 minutes
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

---

## Monitoring

### Prometheus + Grafana (local)

`docker-compose.local.yml` includes Prometheus and Grafana. They start automatically with `make dev` or can be started alone:

```bash
docker compose -f docker-compose.local.yml up -d prometheus grafana
```

| Service | Local URL | Port |
|---------|-----------|------|
| Prometheus | `http://prometheus.localhost` | 9090 |
| Grafana | `http://grafana.localhost` | 3002 |

Grafana credentials: `admin` / value of `KEYCLOAK_ADMIN_PASSWORD` in `.env`.

The pre-built **HHH App Metrics** dashboard (`monitoring/grafana/dashboards/hhh-app.json`) is auto-provisioned. It shows:
- HTTP request rate and error rate
- p50 / p95 / p99 latency
- Node.js heap and RSS memory
- Event loop lag
- Active handles and requests

Prometheus scrapes the Node.js app at `http://app:9091/metrics` (prom-client, standard default metrics + `http_request_duration_seconds` histogram). The scrape target and interval are configured in `monitoring/prometheus.yml`.

> **Production:** `docker-compose.yml` also runs Prometheus and Grafana. Prometheus has no published port and no Traefik route — it's reachable only from other containers on `hhh-proxy` (Grafana, and the app's own `/admin/system/overview` proxy), never directly from the internet. Grafana is exposed at `https://${DOMAIN}/grafana`, access-gated by Keycloak SSO (`GF_AUTH_GENERIC_OAUTH_*`, mapping the `admin`/`researcher` realm roles to Grafana's Admin/Editor roles) rather than a separate Traefik auth middleware.

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
1. Push changes to `master` branch
2. Wait 5 minutes (or trigger a manual update in Portainer)
3. Verify deployment in Portainer logs

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
- [ ] Traefik dashboard protected with `TRAEFIK_DASHBOARD_AUTH`
- [ ] Regular backups verified
- [ ] Security updates applied to base images
- [ ] Logs monitored for suspicious activity
- [ ] Firewall configured (only ports 80/443 open; SSH restricted)
- [ ] SSH key authentication enabled, root login disabled

---

## URLs Reference

| Service | Production URL | Local (`docker-compose.local.yml`) | Direct Local Port |
|---------|---------------|------------------------------------|-------------------|
| Backend API | `https://habit.wiwi.tu-dresden.de/api/v1/` | `http://app.localhost/api/v1/` | `http://localhost:3000/api/v1/` |
| Flutter Web App | `https://habit.wiwi.tu-dresden.de` | local mobile/web build pointing to local backend | — |
| Admin Panel | `https://habit.wiwi.tu-dresden.de/admin` | `http://admin.localhost` | `http://localhost:3001` |
| Keycloak | `https://habit.wiwi.tu-dresden.de/auth/` | `http://keycloak.localhost` | `http://localhost:8080` |
| Keycloak Admin UI | `https://habit.wiwi.tu-dresden.de/auth/admin` | `http://keycloak.localhost/admin/` | `http://localhost:8080/admin/` |
| Keycloak Realm Metadata | — | `http://keycloak.localhost/realms/hhh/.well-known/openid-configuration` | `http://localhost:8080/realms/hhh/.well-known/openid-configuration` |
| Mongo Express | `https://habit.wiwi.tu-dresden.de/mongo` | not in `docker-compose.local.yml` | `http://localhost:8081` (with `docker compose up`) |
| Translation | `https://habit.wiwi.tu-dresden.de/translate` | `http://translate.localhost` | `http://localhost:5001` |
| Neo4j Browser | not exposed (internal-only, see below) | `http://neo4j.localhost` | `http://localhost:7474` |
| LightRAG | not exposed (internal-only) | `http://localhost:9622` | `http://localhost:9622` |
| Recommender API docs | — | not routed via Traefik locally | `http://localhost:8001/docs` |
| Prometheus | not exposed (internal-only) | `http://prometheus.localhost` | `http://localhost:9090` |
| Grafana | `https://habit.wiwi.tu-dresden.de/grafana` | `http://grafana.localhost` | `http://localhost:3002` |
| Traefik Dashboard | `https://habit.wiwi.tu-dresden.de/dashboard` | `http://proxy.localhost` | `http://localhost:8888` |

---

## Accessing Neo4j in Production

Neo4j is internal-only in production: `docker-compose.yml` does not publish ports 7474/7687 on the host at all (same treatment as Prometheus), so there is nothing to reach even with an SSH tunnel. Neo4j is only reachable from other containers on the internal `hhh-proxy` network.

For ad-hoc production queries, use `cypher-shell` directly inside the container over SSH — this works because `docker exec` goes through the Docker daemon, not a published network port, so no port needs to be open:

```bash
ssh service@habit.wiwi.tu-dresden.de 'docker exec -it hhh-neo4j cypher-shell -u neo4j -p ${NEO4J_PASSWORD}'
```

Or SSH in first and run it interactively:

```bash
ssh service@habit.wiwi.tu-dresden.de
docker exec -it hhh-neo4j cypher-shell -u neo4j -p ${NEO4J_PASSWORD} -a bolt://localhost:7687
```

If you need the graphical Neo4j Browser for a one-off investigation, temporarily publish the port yourself (e.g. `docker run --rm -it --network hhh-proxy --link hhh-neo4j alpine ...` or a short-lived `docker compose` port override), use it, then remove the override — do not leave 7474/7687 published on the host as a standing change. For routine local development, use `docker-compose.local.yml`, where Neo4j Browser is already reachable at `http://neo4j.localhost`.

---

## Data Access and Management

### MongoDB Data

**Host paths:**
- Database files: `/mnt/data/appdata/hhh2/mongo/db`
- Config files: `/mnt/data/appdata/hhh2/mongo/config`

**Access via Mongo Express (Web UI):**
- URL: `https://habit.wiwi.tu-dresden.de/mongo`
- Username: `admin` (from `MONGO_EXPRESS_USER`)
- Password: value of `MONGO_EXPRESS_PASSWORD` in Portainer

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
- Neo4j has no published port in production (internal-only) — use `docker exec -it hhh-neo4j cypher-shell` over SSH, see "Accessing Neo4j in Production" above

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

| Secret | Where used | Rotate at |
|---|---|---|
| `MONGO_PASSWORD` | mongo, app, backup | regenerate + redeploy stack |
| `NEO4J_PASSWORD` | neo4j, app, api-service | regenerate + redeploy |
| `KEYCLOAK_ADMIN_PASSWORD` | keycloak, keycloak-init | Keycloak admin console + .env |
| `KEYCLOAK_SECRET` (hhh-admin client) | admin panel | Keycloak → Clients → hhh-admin → Credentials |
| `API_SERVICE_SECRET` | app ↔ api-service | regenerate + redeploy both |
| `LIGHTRAG_API_KEY`, `LLM_API_KEY` | lightrag, api-service | provider console |
| `MAIL_USER` / `MAIL_PASS` (Mailjet) | backup alerts | **rotate now** — previous values circulated in a repo working copy |
| ~~`RECAPTCHA_*`~~ | removed 2026-06 | **revoke now** in the Google reCAPTCHA console — keys are unused but were exposed |
| `SENTRY_DSN` | app, mobile builds | Sentry project settings (low sensitivity — write-only DSN) |

After any rotation: `docker compose up -d` (affected services) and run
`node scripts/smoke-e2e.mjs` against the deployment.
