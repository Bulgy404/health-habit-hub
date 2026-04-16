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

There are two local modes:

1. `docker-compose.local.yml` — local Docker development stack. Starts the backend, Keycloak (dev-file DB), databases, Traefik, the Next.js admin panel, Redis, and the recommender with local-friendly defaults. Uses `*.localhost` hostnames via Traefik.
2. `docker-compose.yml` — full app-like stack that mirrors the shared Docker setup more closely and also exposes services on explicit localhost ports. Uses `dev-file` Keycloak, no Redis in this mode.

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
DB_PASSWORD=<local-fuseki-password>
ADMIN_PASSWORD=<local-fuseki-password>
API_SERVICE_SECRET=<local-api-service-secret>
OPENAI_API_KEY=<optional-but-needed-for-recommender-features>
```

Recommended local defaults already present in `.env.example`:
- `PATH_SUFFIX=localhost`
- `APP_HOST_PORT=3000`
- `TRAEFIK_HOST_PORT80=80`
- `TRAEFIK_HOST_PORT8080=8080`

Before using the full Traefik-based `docker-compose.yml`, change this in `.env` to avoid a port clash with Keycloak:

```env
TRAEFIK_HOST_PORT8080=8888
```

### 2. Clean Local Database Init

If you want a completely fresh local state, stop the local stack and remove its Docker volumes first:

```bash
docker compose -f docker-compose.local.yml down -v
docker compose down -v
```

This resets:
- MongoDB data
- Neo4j data
- Fuseki data
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
| Fuseki | `http://localhost:3030` | Basic auth with `admin` + `ADMIN_PASSWORD` |
| Translation | `http://localhost:5001` | LibreTranslate in `docker-compose.local.yml` |
| Neo4j Browser | `http://localhost:7474` | Login with `neo4j` + `NEO4J_PASSWORD` |
| Recommender | `http://localhost:8001/docs` | FastAPI docs |
| Redis | `localhost:6379` | No auth in local mode |

### 4. Start Full Local Stack

```bash
docker compose up -d --build
```

This stack also starts Traefik and the Next.js admin app. Use these local URLs:

| Service | Local URL |
|---------|-----------|
| Main app via Traefik | `http://app.localhost` |
| Admin panel via Traefik | `http://admin.localhost` |
| Traefik dashboard | `http://proxy.localhost` |
| Traefik raw dashboard port | `http://localhost:8888` |
| Keycloak admin console | `http://localhost:8080/admin/` |
| Recommender API docs | `http://localhost:8000/docs` |

Notes:
- `*.localhost` resolves locally on modern browsers, so `app.localhost` and `admin.localhost` should work without editing `/etc/hosts`.
- The admin app uses the `hhh-admin` Keycloak client and requires a Keycloak user with the `admin` or `researcher` realm role.
- `docker-compose.yml` does not include Redis; Redis is only present in `docker-compose.local.yml` and `docker-compose.prod.yml`.

### 5. Create a Local Admin User in Keycloak

1. Open `http://localhost:8080/admin/`
2. Log in with:
   - Username: value of `KEYCLOAK_ADMIN`
   - Password: value of `KEYCLOAK_ADMIN_PASSWORD`
3. Select realm `hhh`
4. Go to **Users** → **Add user**
5. Create a user, then set a password under **Credentials**
6. Under **Role mapping**, assign realm role `admin` or `researcher`
7. Open `http://admin.localhost` and sign in with that account

### 6. Verify Onboarding / Recovery Locally

After the local stack is healthy:

1. Open the Flutter app or frontend you are testing
2. Complete onboarding until the recovery passphrase is shown
3. Save the generated passphrase
4. Test restore/recovery using that passphrase

If participant creation fails, check:

```bash
docker logs h3-2-app --tail 100
docker logs h3-2-keycloak --tail 100
```

### 7. Re-apply Local Keycloak Config After Reset

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
- [ ] External Docker network `h3-proxy` created on the server:
  ```bash
  docker network create h3-proxy
  ```

### 2. DNS Configuration
- [ ] Domain `habit.wiwi.tu-dresden.de` resolves to `141.76.16.16`
- [ ] DNS propagation complete (verified with `dig habit.wiwi.tu-dresden.de`)

### 3. External Services
- [ ] Google reCAPTCHA keys obtained (<https://www.google.com/recaptcha/admin>)
  - Site key
  - Secret key
  - Domain `habit.wiwi.tu-dresden.de` added
- [ ] Mailjet API credentials obtained (<https://app.mailjet.com/account/api_keys>)
  - API key
  - Secret key
  - Sender domain verified

### 4. Security — Generate Secure Values
- [ ] Fuseki admin password (`ADMIN_PASSWORD`)
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

Failure to do this will cause `h3-2-translate` to start but fail to persist language packs, resulting in empty translation responses.

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
- **Compose path:** `docker-compose.prod.yml`
- **GitOps updates:** Enable
  - Polling interval: 5 minutes
  - Re-pull image: Enable
  - Force redeployment: Enable

### Step 4: Override Environment Variables

The `stack.env` file in the repository contains placeholder values. Override every `CHANGE_THIS_*` entry in Portainer's environment variable section before deploying.

#### Required Overrides

```env
# Passwords — generate secure values!
ADMIN_PASSWORD=<your-secure-fuseki-password>
MONGO_PASSWORD=<your-secure-mongo-password>
MONGO_EXPRESS_PASSWORD=<your-secure-mongo-express-password>
NEO4J_PASSWORD=<your-secure-neo4j-password>

# Keycloak
KEYCLOAK_ADMIN=admin
KEYCLOAK_ADMIN_PASSWORD=<your-secure-keycloak-admin-password>
KC_DB_PASSWORD=<your-secure-keycloak-db-password>

# API service shared secret — MUST match in both h3-2-app and h3-2-recommender
# Generate with: openssl rand -hex 32
API_SERVICE_SECRET=<your-shared-api-service-secret>

# Traefik Dashboard (generate: htpasswd -nb admin your-password)
TRAEFIK_DASHBOARD_AUTH=<your-htpasswd-hash>

# reCAPTCHA (from Google)
RECAPTCHA_SITEKEY=<your-production-site-key>
RECAPTCHA_SECRETKEY=<your-production-secret-key>

# Mailjet (from Mailjet dashboard)
MAIL_USER=<mailjet-api-key>
MAIL_PASS=<mailjet-secret-key>

# OpenAI (for habit classification, BCIO mapping, translation refinement, recommendations)
OPENAI_API_KEY=<your-openai-api-key>
```

#### Optional Overrides

```env
# Backup alerts (Slack/Discord/Teams webhook)
ALERT_WEBHOOK_URL=<your-webhook-url>

# Backup retention
BACKUP_RETENTION_DAYS=14

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
| `h3-2-proxy` | Traefik reverse proxy |
| `h3-2-app` | Node.js backend API |
| `h3-2-fuseki` | Apache Jena Fuseki RDF/SPARQL database |
| `h3-2-mongo` | MongoDB — survey responses, recommendations, user preferences |
| `h3-2-mongo-express` | MongoDB web UI |
| `h3-2-neo4j` | Neo4j graph database — habit graph, BCIO ontology |
| `h3-2-redis` | Redis — notification locks and recommendation caching |
| `h3-2-translate` | LibreTranslate — EN↔DE habit translation |
| `h3-2-keycloak-db` | PostgreSQL — Keycloak backend database |
| `h3-2-keycloak` | Keycloak identity provider — authentication and authorisation |
| `h3-2-recommender` | Python FastAPI recommender service — habit classification, BCIO mapping, LLM refinement |
| `h3-2-admin` | Next.js admin panel — study management UI |
| `h3-2-backup` | Backup service |

### 2. Verify SSL Certificate
- Check Traefik logs: look for "certificate obtained"
- Visit `https://habit.wiwi.tu-dresden.de`
- Verify valid SSL certificate (green padlock)

### 3. Test Services

- [ ] Main application: `https://habit.wiwi.tu-dresden.de`
- [ ] Admin panel: `https://habit.wiwi.tu-dresden.de/admin`
- [ ] Mongo Express: `https://habit.wiwi.tu-dresden.de/mongo`
- [ ] Fuseki (requires auth): `https://habit.wiwi.tu-dresden.de/fuseki`
- [ ] Translation API: `https://habit.wiwi.tu-dresden.de/translate`
- [ ] Neo4j browser: `http://localhost:7474` (via SSH tunnel — see below)
- [ ] Traefik dashboard: `https://habit.wiwi.tu-dresden.de/dashboard`

### 4. Run One-time Migration Scripts (First Deploy of This Branch Only)

#### 4a. Migrate Legacy `hhh__Habit` Nodes to New Habit Schema

All existing `hhh__Habit` nodes (from the old n10s/RDF pipeline) must be copied into the new `Habit` schema before the stats and explore-feed endpoints will show historical donations. Run this once after the first deploy:

```bash
docker exec h3-2-app node scripts/run-migration.js
```

Expected output:
```
[migration] Found 42 hhh__Habit node(s): 42 to migrate, 0 already exist.
[migration] Running step 1/2…
[migration] Running step 2/2…
[migration] Done. Migrated 42 habits, skipped 0 (already exist).
```

The script is **idempotent** — running it again produces:
```
[migration] Found 42 hhh__Habit node(s): 0 to migrate, 42 already exist.
[migration] Done. Migrated 0 habits, skipped 42 (already exist).
```

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
docker exec h3-2-app node scripts/backfill-de-translations.js
```

Dry-run mode (preview changes without writing):

```bash
docker exec h3-2-app node scripts/backfill-de-translations.js --dry-run
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
docker exec h3-2-app node scripts/migrate-habits-bcio.js
```

### 5. Test Backup System

Check backup logs:
```bash
docker logs h3-2-backup
```

Verify backup files are created:
- Location: `./backups` directory on the host (bind-mounted into the container at `/backups`)
- Format: `full_backup_YYYYMMDD_HHMMSS.tar.gz`

---

## Network Architecture

### How It Works

1. **External Traffic:** Internet → Ports 80/443 → Traefik (`h3-2-proxy`)
2. **Internal Routing:** Traefik inspects Host/Path and routes to the appropriate service via the `h3-proxy` bridge network
3. **Service Communication:** All services share the `h3-proxy` external Docker network; they address each other by service/container name

> **Note:** In production (`docker-compose.prod.yml`) the network is named `h3-proxy` (external). It must be created on the host before the first deploy: `docker network create h3-proxy`.
>
> In local mode (`docker-compose.local.yml`) the network is named `h3-2-proxy` and is created by Docker Compose automatically.

### Network Diagram

```
Internet
   |
Port 80/443
   |
Traefik (h3-2-proxy)
   |
h3-proxy network (bridge)
   |-- h3-2-app          Node.js backend API
   |-- h3-2-admin        Next.js admin panel
   |-- h3-2-recommender  Python FastAPI — LLM/BCIO/recommendations
   |-- h3-2-redis        Redis — notification locks, recommendation cache
   |-- h3-2-keycloak     Keycloak — ports 8080 exposed for admin UI
   |-- h3-2-keycloak-db  PostgreSQL — Keycloak database (internal only)
   |-- h3-2-fuseki       RDF/SPARQL
   |-- h3-2-mongo        MongoDB
   |-- h3-2-mongo-express MongoDB UI
   |-- h3-2-neo4j        Graph DB — ports 7474/7687 exposed for SSH tunnel
   |-- h3-2-translate    LibreTranslate — UID 1032, volume chown required
   `-- h3-2-backup       Backup service
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
   docker logs h3-2-proxy | grep -i certificate
   ```

### Services Can't Communicate

**Problem:** App can't connect to MongoDB / Fuseki / Neo4j / Redis

**Solutions:**
1. Verify all containers are on the same network:
   ```bash
   docker network inspect h3-proxy
   ```
2. Check service names match those in `docker-compose.prod.yml` (internal hostnames are the service keys: `mongo`, `fuseki`, `neo4j`, `redis`, `recommender`)
3. Verify environment variables in Portainer

### Recommender / API Service Errors

**Problem:** `h3-2-recommender` or `h3-2-app` returns auth errors on internal calls

**Solution:** Ensure `API_SERVICE_SECRET` is set to the **same value** in Portainer for both services and that neither container has a stale value cached. Redeploy the stack after updating the secret.

### Backup Failures

**Problem:** Backup container shows errors

**Solutions:**
1. Check backup logs:
   ```bash
   docker logs h3-2-backup
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
docker exec h3-2-backup ls -lh /backups/full_backup_*.tar.gz | tail -5
```

View backup manifest:
```bash
docker exec h3-2-backup cat /backups/backup_*.manifest | tail -20
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
Both `h3-2-app` and `h3-2-recommender` read `API_SERVICE_SECRET` at startup. After updating the value in Portainer, redeploy the entire stack (or restart both containers) so both services use the same new secret simultaneously.

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
| Fuseki | `https://habit.wiwi.tu-dresden.de/fuseki` | `http://fuseki.localhost` | `http://localhost:3030` |
| Translation | `https://habit.wiwi.tu-dresden.de/translate` | `http://translate.localhost` | `http://localhost:5001` |
| Neo4j Browser | SSH tunnel only (see below) | `http://neo4j.localhost` | `http://localhost:7474` |
| Recommender API docs | — | not routed via Traefik locally | `http://localhost:8001/docs` |
| Traefik Dashboard | `https://habit.wiwi.tu-dresden.de/dashboard` | `http://proxy.localhost` | `http://localhost:8888` |

---

## Accessing Neo4j Browser via SSH Tunnel

Neo4j Browser requires an SSH tunnel for secure access. The container exposes ports 7474 and 7687 on the host but these are not publicly accessible through Traefik.

### What is SSH Tunneling?

SSH tunneling (port forwarding) creates a secure encrypted connection that forwards traffic from your local machine to the remote server. This lets you access Neo4j's browser and Bolt protocol without exposing those ports to the internet.

### Connection Methods

#### Option 1: Using Domain Name (Recommended)

```bash
ssh -L 7474:localhost:7474 -L 7687:localhost:7687 service@habit.wiwi.tu-dresden.de
```

#### Option 2: Using IP Address

```bash
ssh -L 7474:localhost:7474 -L 7687:localhost:7687 service@141.76.16.16
```

### How to Access Neo4j Browser

1. **Start the SSH tunnel** in a terminal (keep it open):
   ```bash
   ssh -L 7474:localhost:7474 -L 7687:localhost:7687 service@141.76.16.16
   ```

2. **Open Neo4j Browser** in your web browser:
   - Navigate to: `http://localhost:7474`

3. **Authenticate** with Neo4j credentials:
   - **Username:** `neo4j`
   - **Password:** value of `NEO4J_PASSWORD` in Portainer
   - **Connection URL:** `neo4j://localhost:7687` (auto-populated)

4. The tunnel maps:
   - Port 7474 (HTTP Browser): `localhost:7474` → `server:7474`
   - Port 7687 (Bolt Protocol): `localhost:7687` → `server:7687`

### Advanced: Cypher Shell

```bash
# After SSH tunnel is open, in another terminal:
docker exec -it h3-2-neo4j cypher-shell -u neo4j -p ${NEO4J_PASSWORD} -a bolt://localhost:7687
```

Or directly via SSH (no tunnel needed):
```bash
ssh service@141.76.16.16 'docker exec -it h3-2-neo4j cypher-shell -u neo4j -p ${NEO4J_PASSWORD}'
```

### Troubleshooting SSH Tunnel

**"Connection refused" on localhost:7474**
- Ensure the SSH tunnel terminal is still open
- Verify Neo4j container is running: `docker ps | grep neo4j`
- Check if another process is using port 7474 locally: `lsof -i :7474`

**SSH connection fails**
- Verify SSH key authentication is configured
- Test with verbose output: `ssh -v service@141.76.16.16`

**Neo4j authentication fails**
- Verify `NEO4J_PASSWORD` in Portainer matches what you are using
- Check Neo4j container logs: `docker logs h3-2-neo4j | tail -20`

**Dropped connections after inactivity**
- Add keepalive: `ssh -o ServerAliveInterval=60 -L 7474:localhost:7474 -L 7687:localhost:7687 service@141.76.16.16`
- Consider running the tunnel inside `screen` or `tmux`

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
docker exec h3-2-mongo mongodump \
  --username admin --password ${MONGO_PASSWORD} \
  --authenticationDatabase admin --out /tmp/backup

docker cp h3-2-mongo:/tmp/backup ./mongo-backup-$(date +%Y%m%d)
```

**Restore MongoDB:**
```bash
docker cp ./mongo-backup-YYYYMMDD h3-2-mongo:/tmp/restore

docker exec h3-2-mongo mongorestore \
  --username admin --password ${MONGO_PASSWORD} \
  --authenticationDatabase admin /tmp/restore
```

**Direct CLI access:**
```bash
docker exec -it h3-2-mongo mongosh -u admin -p ${MONGO_PASSWORD} --authenticationDatabase admin
```

### Neo4j Data

**Host paths:**
- Database files: `/mnt/data/appdata/hhh2/neo4j/data`
- Log files: `/mnt/data/appdata/hhh2/neo4j/logs`

**Access via Browser:** see "Accessing Neo4j Browser via SSH Tunnel" above.

**Backup Neo4j:**
```bash
docker stop h3-2-neo4j
sudo tar -czf neo4j-backup-$(date +%Y%m%d).tar.gz /mnt/data/appdata/hhh2/neo4j/data
docker start h3-2-neo4j
```

**Restore Neo4j:**
```bash
docker stop h3-2-neo4j
sudo tar -xzf neo4j-backup-YYYYMMDD.tar.gz -C /
docker start h3-2-neo4j
```

**Direct Cypher access:**
```bash
docker exec -it h3-2-neo4j cypher-shell -u neo4j -p ${NEO4J_PASSWORD}
```

### Fuseki Data

**Storage:** Named volume `h3-2-fuseki-data`

**Backup Fuseki:**
```bash
docker run --rm \
  -v h3-2-fuseki-data:/data \
  -v $(pwd):/backup \
  alpine tar czf /backup/fuseki-backup-$(date +%Y%m%d).tar.gz -C /data .
```

**Restore Fuseki:**
```bash
docker run --rm \
  -v h3-2-fuseki-data:/data \
  -v $(pwd):/backup \
  alpine tar xzf /backup/fuseki-backup-YYYYMMDD.tar.gz -C /data
```

### Redis Data

**Storage:** Named volume `h3-2-redis-data`

Redis is used for:
- Notification locks (preventing duplicate push notifications)
- Recommendation response caching

Redis data does not need to be backed up — it is a short-lived cache and will be repopulated automatically. If needed, the volume can be inspected with:

```bash
docker exec -it h3-2-redis redis-cli
```

---

## Additional Notes

- Backups run daily (the backup container loops every 24 hours with a 2-minute startup delay)
- Backup retention: 14 days by default (configurable via `BACKUP_RETENTION_DAYS`)
- All persistent data is stored in named Docker volumes or host-mounted directories under `/mnt/data/appdata/hhh2/`
- SSL certificates are stored in `/mnt/data/appdata/hhh2/traefik-certs/`
- LibreTranslate volume at `/mnt/data/appdata/hhh2/translate` must be owned by UID 1032 before first deploy
- Neo4j requires an SSH tunnel for browser access in production
