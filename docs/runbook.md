# Health Habit Hub — Operations Runbook

This runbook covers every day-two operation: first-time setup, routine updates, rollback,
backup/restore, secret rotation, and troubleshooting.  Every command block is copy-pasteable
and is annotated with the expected output.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [First-time Setup](#first-time-setup)
3. [Per-service Updates](#per-service-updates)
4. [Full-stack Deploy](#full-stack-deploy)
5. [Rollback](#rollback)
6. [Backup Verification](#backup-verification)
7. [Restore from Backup](#restore-from-backup)
8. [Rotating Secrets](#rotating-secrets)
9. [Adding an Admin User](#adding-an-admin-user)
10. [Checking Service Health](#checking-service-health)
11. [Queue & Cache Monitoring](#queue--cache-monitoring-local-dev)
12. [Troubleshooting](#troubleshooting)
    - [Keycloak 401 errors](#keycloak-401-errors--jwks-url-misconfigured)
    - [Keycloak DB unavailable — PostgreSQL not ready](#keycloak-db-unavailable--postgresql-not-ready)
    - [Neo4j connection refused — container not ready](#neo4j-connection-refused--container-not-ready)
    - [Neo4j failed to start — data directory permissions](#neo4j-failed-to-start--data-directory-permissions)
    - [Flutter web blank page — CORS issue](#flutter-web-blank-page--cors-issue)
    - [Recommender service unreachable](#recommender-service-unreachable--container-name-resolution)
    - [LibreTranslate down or returning empty translations](#libretranslate-down-or-returning-empty-translations)

---

## 1. Prerequisites

### Server Specification (minimum)

| Resource | Minimum | Recommended |
|----------|---------|-------------|
| CPU      | 4 vCPU  | 8 vCPU      |
| RAM      | 8 GB    | 16 GB       |
| Disk     | 40 GB SSD | 100 GB SSD |
| OS       | Ubuntu 22.04 LTS | Ubuntu 22.04 LTS |

### Required Software

```
docker --version
# Docker version 24.0.0 or later required
# Expected: Docker version 24.x.x, build ...

docker compose version
# Docker Compose version 2.20.0 or later required
# Expected: Docker Compose version v2.x.x

git --version
# Expected: git version 2.x.x
```

### Open Ports

| Port | Protocol | Purpose |
|------|----------|---------|
| 80   | TCP      | HTTP (redirected to HTTPS by Traefik) |
| 443  | TCP      | HTTPS (Traefik TLS termination) |
| 8080 | TCP      | Keycloak admin UI (restrict to trusted IPs in production) |

> **Security note:** Port 8080 should be firewalled to admin IP ranges only.
> Never expose Neo4j (7474/7687) or MongoDB (27017) externally.

---

## 2. First-time Setup

### 2.1 Clone the repository

```bash
git clone https://github.com/your-org/health-habit-hub.git
cd health-habit-hub
```

Expected output:
```
Cloning into 'health-habit-hub'...
remote: Enumerating objects: ...
```

### 2.2 Create `.env` from template

```bash
cp .env.example .env
```

Open `.env` and replace every `CHANGE_THIS_*` placeholder:

```bash
# Required: change all passwords before first boot
DOMAIN=your.domain.com
KEYCLOAK_ADMIN_PASSWORD=<strong-password>
KC_DB_PASSWORD=<strong-password>      # Keycloak PostgreSQL DB password
MONGO_PASSWORD=<strong-password>
NEO4J_PASSWORD=<strong-password>
ADMIN_PASSWORD=<strong-password>      # application admin
API_SERVICE_SECRET=<hex-secret>       # shared secret between hhh-app and hhh-recommender
LIGHTRAG_API_KEY=<hex-secret>         # bearer token protecting LightRAG REST API
```

Generate a strong value for `API_SERVICE_SECRET`:
```bash
openssl rand -hex 32
```

> **Critical:** Never commit `.env` to Git. It is already covered by the `.env*` /
> `!.env.example` rule in `.gitignore`, so no action is needed.

### 2.3 Start all services

```bash
docker compose up -d
```

Expected output (services pulling/building, then starting):
```
[+] Running 12/12
 ✔ Container hhh-proxy        Started
 ✔ Container hhh-mongo          Started
 ✔ Container hhh-neo4j          Started
 ✔ Container hhh-keycloak       Started
 ✔ Container hhh-recommender    Started
 ✔ Container hhh-lightrag       Started
 ✔ Container hhh-knowledge-mcp  Started
 ✔ Container hhh-redis          Started
 ✔ Container hhh-app            Started
 ✔ Container hhh-mongo-express   Started
 ✔ Container hhh-translate Started
 ✔ Container hhh-backup         Started
```

### 2.4 Verify all services are healthy

```bash
docker compose ps
```

Expected: every service shows `Up` or `healthy` (Keycloak can take 60–90 s on first boot).

```bash
curl -s http://localhost:3000/api/v1/health | python3 -m json.tool
```

Expected output (all services reachable):
```json
{
    "status": "ok",
    "services": {
        "neo4j":      { "status": "ok", "latencyMs": 12 },
        "mongo":      { "status": "ok", "latencyMs":  5 },
        "keycloak":   { "status": "ok", "latencyMs": 30 },
        "recommender":{ "status": "ok", "latencyMs":  8 }
    }
}
```

### 2.5 Import Keycloak realm (first time only)

The realm is imported automatically via `--import-realm` on first boot.
Verify it is present:

```bash
curl -s -o /dev/null -w "%{http_code}" \
  http://localhost:8080/realms/hhh/.well-known/openid-configuration
```

Expected output: `200`

If the realm is missing, run the deploy script manually:

```bash
bash scripts/deploy-keycloak.sh
```

---

## 3. Per-service Updates

### 3.1 Update the Node.js backend

```bash
bash scripts/deploy-backend.sh
```

Expected output:
```
[2026-03-15T10:00:00Z] Building hhh-app...
[2026-03-15T10:00:30Z] Starting hhh-app...
[2026-03-15T10:00:35Z] Health check passed.
```

### 3.2 Update Flutter web (static files)

Rebuild the Flutter web app and copy assets into the backend's public directory:

```bash
bash scripts/deploy-flutter-web.sh
```

Expected output:
```
[2026-03-15T10:01:00Z] Building Flutter web...
[2026-03-15T10:02:00Z] Copying build/web to app/public/flutter/...
[2026-03-15T10:02:01Z] Flutter web deployed.
```

### 3.3 Update the Python recommender

```bash
bash scripts/deploy-recommender.sh
```

Expected output:
```
[2026-03-15T10:03:00Z] Building recommender...
[2026-03-15T10:03:20Z] Starting recommender...
[2026-03-15T10:03:22Z] Recommender deployed.
```

### 3.4 Update Keycloak realm configuration

```bash
bash scripts/deploy-keycloak.sh
```

Expected output:
```
[2026-03-15T10:04:00Z] Importing Keycloak realm hhh...
[2026-03-15T10:04:05Z] Realm imported. Restarting keycloak...
[2026-03-15T10:04:30Z] Keycloak deploy complete.
```

---

## 4. Full-stack Deploy

Use the orchestrator script to deploy all services in dependency order with health checks
between each step:

```bash
bash scripts/deploy-full.sh
```

Expected output (abridged):
```
[2026-03-15T10:00:00Z] Starting full-stack deployment...
[2026-03-15T10:00:00Z] Version 1.0.0 is tagged — OK.
[2026-03-15T10:00:00Z] === Step: Backend ===
...
[2026-03-15T10:00:35Z] Health check passed.
[2026-03-15T10:00:35Z] === Step: Keycloak ===
...
[2026-03-15T10:01:10Z] Health check passed.
[2026-03-15T10:01:10Z] === Step: Recommender ===
...
[2026-03-15T10:01:30Z] Health check passed.
[2026-03-15T10:01:30Z] === Step: Flutter Web ===
...
[2026-03-15T10:02:45Z] Full-stack deployment complete.
```

### Dry-run mode (preview commands without executing)

```bash
bash scripts/deploy-full.sh --dry-run
```

---

## 5. Rollback

### 5.1 Roll back to a previous release tag

```bash
# List available tags
git tag --list 'v*' | sort -V | tail -10
# Example output:
# v0.9.0
# v1.0.0

# Check out the previous tag
git checkout v0.9.0

# Redeploy
bash scripts/deploy-full.sh
```

### 5.2 Roll back a single service

```bash
# Example: roll back only the backend
git checkout v0.9.0 -- app/
bash scripts/deploy-backend.sh

# Restore HEAD afterwards
git checkout HEAD -- app/
```

---

## 6. Backup Verification

> **Prefer the admin UI.** The admin panel's **Backups** page (admin role
> only) shows the last backup, per-component status, and lets you trigger a
> backup or restore without shell access — see the
> [Admin Guide](guides/admin-guide.md#15-managing-backups). The steps below are the
> manual/shell fallback for when the admin UI itself is unreachable, or for
> deeper inspection.

Backups run on a loop in the `hhh-backup` container (`container_name` in
`docker-compose.yml`) — not real cron. The loop waits ~2 minutes after the
container starts, then runs every 24 hours, so "around 02:00 UTC" only holds
if the container hasn't been restarted since. `hhh-backup` also runs a small
internal HTTP API (`backup-service/api/`) that only the admin panel's
backend talks to over the internal Docker network — it is never reachable
from outside the stack.

### 6.1 List available backups

```bash
docker exec hhh-backup ls /backups/
```

Expected output:
```
full_backup_20260315_020000.tar.gz
backup_20260315_020000.manifest
backup_20260315_020000.manifest.json
full_backup_20260314_020000.tar.gz
backup_20260314_020000.manifest
backup_20260314_020000.manifest.json
backup.log
```

The `.manifest.json` sidecar next to each archive is what the admin UI reads
for status — it has an explicit boolean per component (`mongoOk`,
`lightragOk`, `neo4jOk`, `keycloakOk`), independent of each other, so a
Keycloak failure can never make the MongoDB line lie about its own outcome.
The `.manifest` file is the same information in human-readable form.

### 6.2 Inspect the backup log

```bash
docker exec hhh-backup tail -50 /backups/backup.log
```

Expected output (successful run):
```
[2026-03-15 02:00:01] Starting backup...
[2026-03-15 02:00:02] 1/5 Backing up MongoDB...
[2026-03-15 02:00:05] ✓ MongoDB backup completed
[2026-03-15 02:00:05] 2/5 Backing up LightRAG index...
[2026-03-15 02:00:08] ✓ LightRAG backup completed
[2026-03-15 02:00:08] 3/5 Backing up Neo4j (using neo4j-admin dump)...
[2026-03-15 02:00:13] ✓ Neo4j backup completed
[2026-03-15 02:00:13] 4/5 Backing up Keycloak realm...
[2026-03-15 02:00:16] ✓ Keycloak backup completed
[2026-03-15 02:00:16] 5/5 Creating unified backup archive...
[2026-03-15 02:00:18] Backup complete. Size: 24M
```

### 6.3 Verify archive integrity

```bash
ARCHIVE=$(docker exec hhh-backup ls -t /backups/full_backup_*.tar.gz | head -1)
docker exec hhh-backup tar -tzf "$ARCHIVE" | head -20
```

Expected output: a list of paths inside the archive (mongo/, lightrag-data.tar.gz, neo4j/, keycloak/).

### 6.4 Retention and cleanup

Two independent limits prune `/backups/` after every run, so the archive
directory doesn't grow unbounded:

- **`BACKUP_RETENTION_DAYS`** (default `14`) — deletes backups (archive +
  manifest + manifest.json) older than this many days, regardless of trigger.
- **`BACKUP_SCHEDULED_LIMIT`** (default `10`) — additionally caps the number
  of *scheduled* (automatic, `trigger: scheduled` in the manifest) backups
  kept, deleting the oldest excess ones even if they're within the retention
  window. This exists so the admin panel's Backups list doesn't pile up with
  a backup for every single day indefinitely. Manual/uploaded backups
  (`trigger: manual` / `trigger: upload`) are **not** counted or capped by
  this limit — only time-based retention applies to them.

To check what would be pruned without waiting for the next scheduled run:

```bash
docker exec hhh-backup sh -c \
  'for m in /backups/backup_*.manifest.json; do jq -r "[.date,.trigger] | @tsv" "$m"; done | sort -r'
```

Both `backup.sh` (dumps) and `restore.sh`'s `neo4j-admin` step talk to Docker
through `docker-socket-proxy` (`hhh-docker-socket-proxy`), not a mounted
`docker.sock` — the `backup` container has no direct host Docker access.
`docker-socket-proxy` only allows the specific container/volume/image calls
those scripts issue and lives on an isolated `hhh-backup-internal` network
that nothing else joins.

---

## 7. Restore from Backup

> **Warning:** This operation overwrites all live data. Prefer the admin
> UI's Backups page (Section 6, above) — it takes a safety backup
> automatically before restoring, requires typing the exact filename to
> confirm, and records who did it. Use the manual procedure below only when
> the admin UI itself is unreachable.

The actual entry point is `backup-service/restore.sh <path-to-archive>`, run
inside the `backup` container (there is no `scripts/restore.sh` in this
repo — a prior version of this runbook referenced one that never existed).
`restore.sh` takes an atomic lock shared with `backup.sh`, so a scheduled or
manually-triggered backup can never run concurrently with it.

```bash
# 1. Take a safety backup of current state (skip only if you already have a
#    known-good, recent one — restore.sh does NOT do this for you when run
#    directly like this, unlike the admin UI's restore flow)
docker exec hhh-backup /backup.sh

# 2. List available archives
docker exec hhh-backup ls -t /backups/full_backup_*.tar.gz

# 3. Run the restore script against the full path inside the container
docker exec -it hhh-backup /restore.sh /backups/full_backup_20260314_020000.tar.gz
```

Expected interaction:
```
==========================================
WARNING: FULL SYSTEM RESTORE
==========================================
Restoring from: full_backup_20260314_020000.tar.gz

This operation will:
  - STOP and OVERWRITE MongoDB data
  - STOP and OVERWRITE LightRAG index
  - STOP and OVERWRITE Neo4j graph data
  - OVERWRITE Keycloak realm (if backup present)
  - RESTART all affected containers

Type 'YES' to continue: YES

Extracting backup archive...
✓ Archive extracted

1/3 Restoring MongoDB...
✓ MongoDB restored

2/3 Restoring LightRAG index...
✓ LightRAG index restored

3/3 Restoring Neo4j...
✓ Neo4j restored

Restoring Keycloak realm (if backup present)...
✓ Keycloak realm restored

==========================================
✓ Restore completed successfully!
==========================================
```

`restore.sh` exits non-zero if any component failed (it previously always
exited 0 even on a partial failure — fixed; do not rely on old copies of
this script's exit code). To skip the Keycloak reimport (e.g. restoring an
archive uploaded from elsewhere, where you don't want to trust its realm
export), pass `--skip-keycloak` as a second argument.

After restore, verify service health:

```bash
curl -s http://localhost:3000/api/v1/health | python3 -m json.tool
# Expected: {"status":"ok", ...}
```

---

## 8. Rotating Secrets

### 8.1 Change the Keycloak admin password

```bash
# Update .env
nano .env
# Change KEYCLOAK_ADMIN_PASSWORD to the new value

# Restart Keycloak to pick up the new env var
docker compose up -d keycloak
```

Verify the new password works:
```bash
curl -s -o /dev/null -w "%{http_code}" \
  -X POST http://localhost:8080/realms/master/protocol/openid-connect/token \
  -d "client_id=admin-cli&grant_type=password&username=admin&password=<new-password>"
# Expected: 200
```

### 8.2 Rotate the `hhh-backend` client secret

1. Log in to the Keycloak admin console at `http://localhost:8080`.
2. Navigate to **Realm: hhh → Clients → hhh-backend → Credentials**.
3. Click **Regenerate Secret** and copy the new value.
4. Update `.env`:
   ```
   KEYCLOAK_CLIENT_SECRET=<new-secret>
   ```
5. Redeploy the backend:
   ```bash
   bash scripts/deploy-backend.sh
   ```

### 8.3 Update JWKS URL if Keycloak hostname changes

```bash
# In .env:
KEYCLOAK_JWKS_URL=https://your.domain.com/auth/realms/hhh/protocol/openid-connect/certs

# Redeploy backend
bash scripts/deploy-backend.sh
```

### 8.4 Rotate `API_SERVICE_SECRET`

`API_SERVICE_SECRET` is a shared secret used to authenticate requests between the Node.js
backend (`hhh-app`) and the Python recommender (`hhh-recommender`).  Both services must be
restarted together after rotation.

```bash
# 1. Generate a new secret
NEW_SECRET=$(openssl rand -hex 32)
echo "New secret: $NEW_SECRET"

# 2. Update .env
nano .env
# Change the line:  API_SERVICE_SECRET=<new-secret>

# 3. Restart both services simultaneously so there is no window where they hold different secrets
docker compose up -d hhh-app hhh-recommender
```

Expected output:
```
[+] Running 2/2
 ✔ Container hhh-app         Started
 ✔ Container hhh-recommender Started
```

Verify both services are back up:
```bash
curl -s http://localhost:3000/api/v1/health | python3 -m json.tool
# Expected: {"status":"ok", "services": {..., "recommender": {"status":"ok", ...}}}

curl -s http://localhost:8000/health
# Expected: {"status":"ok"}
```

> **Note:** There is a brief period during container restart where the recommender is
> unavailable.  Schedule rotations during low-traffic windows.

### 8.5 Rotate `LIGHTRAG_API_KEY`

`LIGHTRAG_API_KEY` is the bearer token that `lightrag`, `knowledge-mcp`, and `recommender` all share. All three must be restarted together after rotation.

```bash
# 1. Generate a new secret
NEW_SECRET=$(openssl rand -hex 32)
echo "New secret: $NEW_SECRET"

# 2. Update .env
nano .env
# Change the line:  LIGHTRAG_API_KEY=<new-secret>

# 3. Restart all three services simultaneously
docker compose up -d hhh-lightrag hhh-knowledge-mcp hhh-recommender
```

Verify LightRAG is back up:
```bash
curl -s http://localhost:9621/health
# Expected: {"status":"ok"}
```

---

## 9. Adding an Admin User

### 9.1 Via Keycloak Admin Console

1. Open `http://localhost:8080/admin` (or `https://your.domain.com/auth/admin`).
2. Log in as the Keycloak admin.
3. Select realm **hhh**.
4. Go to **Users → Add user**.
5. Set username (e.g. `researcher-jane`), click **Create**.
6. On the **Credentials** tab: set a temporary password.
7. On the **Role mappings** tab: assign realm role **admin** or **researcher**.

### 9.2 Via the HHH Admin API

```bash
# Obtain an admin JWT first
TOKEN=$(curl -s -X POST \
  "http://localhost:8080/realms/hhh/protocol/openid-connect/token" \
  -d "client_id=hhh-flutter&grant_type=password&username=admin&password=<admin-pass>" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

# Create a new participant (the API auto-assigns credentials)
curl -s -X POST http://localhost:3000/api/v1/admin/participants \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"group": "G1"}' | python3 -m json.tool
```

Expected output:
```json
{
    "userId": "p-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    "username": "p-xxxxxxxx",
    "password": "auto-generated-password",
    "tokenCardUrl": "/api/v1/admin/participants/p-xxxx.../token-card"
}
```

---

## 10. Checking Service Health

### Quick health check (Node.js backend aggregate)

```bash
curl -s http://localhost:3000/api/v1/health | python3 -m json.tool
```

Expected output:
```json
{
    "status": "ok",
    "services": {
        "neo4j":      { "status": "ok", "latencyMs": 12 },
        "mongo":      { "status": "ok", "latencyMs":  5 },
        "keycloak":   { "status": "ok", "latencyMs": 30 },
        "recommender":{ "status": "ok", "latencyMs":  8 }
    }
}
```

### Python recommender health check

```bash
curl -s http://localhost:8000/health
# Expected: {"status":"ok"}
```

### Redis health check

```bash
docker compose exec hhh-redis redis-cli ping
# Expected: PONG
```

### Check individual containers

```bash
# Show status of all containers
docker compose ps

# Stream logs for a specific service
docker compose logs -f hhh-app

# Check last 50 lines of Neo4j logs
docker compose logs --tail=50 hhh-neo4j

# Check Keycloak startup
docker compose logs --tail=100 hhh-keycloak | grep -E "started|error|WARN"

# Check recommender logs
docker compose logs --tail=50 hhh-recommender

# Check Redis logs
docker compose logs --tail=50 hhh-redis
```

### Automated monitoring

The CI health check script polls until `status: ok`:

```bash
HEALTH_URL=http://localhost:3000/api/v1/health
for i in $(seq 1 30); do
  STATUS=$(curl -sf "$HEALTH_URL" 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('status',''))" 2>/dev/null || echo "")
  [ "$STATUS" = "ok" ] && echo "All services healthy." && exit 0
  echo "Waiting... ($i/30)"
  sleep 2
done
echo "ERROR: Services not healthy after 60s" && exit 1
```

---

## 11. Queue & Cache Monitoring (local dev)

Two browser UIs are available in local development to inspect the BullMQ habit-donation queue and the Redis cache.

### Bull Board — habit donation queue

Bull Board is mounted inside the app server and exposes a live view of the `habit-donations` BullMQ queue.

**URL:** http://app.localhost/admin/queues

Only available when `NODE_ENV !== production`. No extra login required in local dev — the app container is only reachable from localhost.

What you can do:
- See job counts by state: waiting, active, completed, failed
- Inspect individual job payloads (habit sentence, userID, confidence)
- Retry failed jobs manually
- Pause / resume the queue

**Typical workflow after `make seed`:**
1. Open http://app.localhost/admin/queues
2. Watch jobs move from **Waiting** → **Active** → **Completed** in real time
3. If a job lands in **Failed**, click it to read the error and retry

### RedisInsight — full Redis key browser

RedisInsight is a separate Docker service that provides a GUI for browsing all Redis keys, including BullMQ's internal structures.

**URL:** http://redis-insight.localhost  
**Direct port:** http://localhost:5540

First-time setup (one-off):
1. Open http://redis-insight.localhost
2. Click **Add Redis Database**
3. Fill in:
   - Host: `redis` (Docker service name)
   - Port: `6379`
   - Password: value of `REDIS_PASSWORD` from your `.env`
4. Click **Add Redis Database**

What you can see:
- `bull:habit-donations:*` — BullMQ job hashes, sorted sets for each state
- `bull:habit-donations:completed` — completed job IDs (kept 24 h)
- `bull:habit-donations:failed` — failed job IDs (kept 24 h)
- All other Redis keys used by the app (recommendation cache, notification locks)

**Start/stop RedisInsight:**
```bash
# Start (it starts automatically with make dev)
docker compose -f docker-compose.local.yml up -d redis-insight

# Stop
docker compose -f docker-compose.local.yml stop redis-insight
```

---

## 12. Troubleshooting

### Keycloak 401 errors — JWKS URL misconfigured

**Symptom:** All API calls return `{"error":"Unauthorized"}` even with a valid token.

**Diagnosis:**
```bash
# Check the JWKS URL the app is using
docker compose exec hhh-app env | grep KEYCLOAK_JWKS_URL
# Expected: KEYCLOAK_JWKS_URL=http://keycloak:8080/realms/hhh/protocol/openid-connect/certs

# Verify the endpoint is reachable from inside the app container
docker compose exec hhh-app \
  wget -qO- http://keycloak:8080/realms/hhh/protocol/openid-connect/certs | head -c 100
# Expected: {"keys":[{"kid":"...
```

**Fix:**
```bash
# Update .env with the correct internal URL (container hostname)
KEYCLOAK_JWKS_URL=http://keycloak:8080/realms/hhh/protocol/openid-connect/certs

bash scripts/deploy-backend.sh
```

---

### Keycloak DB unavailable — PostgreSQL not ready

**Symptom:** `hhh-keycloak` fails to start or enters a restart loop; Keycloak logs show
`Unable to connect to datasource` or `Connection refused` pointing to `keycloak-db:5432`.

**Diagnosis:**
```bash
# Check whether the keycloak-db container is running and healthy
docker compose ps hhh-keycloak-db
# Expected: Up (healthy)

# If not healthy, inspect the PostgreSQL logs
docker compose logs --tail=30 hhh-keycloak-db
# Common errors:
#   "FATAL: password authentication failed" → KC_DB_PASSWORD mismatch
#   "database 'keycloak' does not exist" → volume was wiped, re-init required

# Verify the credentials env vars are set correctly in the Keycloak container
docker compose exec hhh-keycloak env | grep KC_DB
# Expected:
#   KC_DB=postgres
#   KC_DB_URL=jdbc:postgresql://keycloak-db:5432/keycloak
#   KC_DB_USERNAME=keycloak
#   KC_DB_PASSWORD=<your-password>

# Test connectivity from the Keycloak container to the DB
docker compose exec hhh-keycloak \
  sh -c 'nc -zv keycloak-db 5432 && echo OK || echo FAIL'
# Expected: OK
```

**Fix — keycloak-db not started or unhealthy:**
```bash
# Start the database first
docker compose up -d hhh-keycloak-db

# Wait for it to become healthy (check every 5 seconds)
for i in $(seq 1 12); do
  STATUS=$(docker inspect --format='{{.State.Health.Status}}' hhh-keycloak-db 2>/dev/null)
  [ "$STATUS" = "healthy" ] && echo "DB healthy." && break
  echo "Waiting for DB... ($i/12)"; sleep 5
done

# Then start Keycloak
docker compose up -d hhh-keycloak
```

**Fix — password mismatch between keycloak-db and Keycloak:**
```bash
# Stop both services
docker compose stop hhh-keycloak hhh-keycloak-db

# Remove the database volume to force re-initialisation with the correct password
docker volume rm hhh-keycloak-db-data

# Ensure KC_DB_USERNAME and KC_DB_PASSWORD are consistent in .env
# Then restart both services
docker compose up -d hhh-keycloak-db hhh-keycloak

# After Keycloak starts, verify the realm was imported
curl -s -o /dev/null -w "%{http_code}" \
  http://localhost:8080/realms/hhh/.well-known/openid-configuration
# Expected: 200
```

> **Note:** Removing `hhh-keycloak-db-data` destroys all Keycloak data (users, sessions,
> client secrets).  Re-create any manually provisioned users and rotate client secrets
> after volume re-initialisation.

---

### Neo4j connection refused — container not ready

**Symptom:** Health endpoint returns `{"status":"error"}` for neo4j, or app logs show
`ServiceUnavailable: WebSocket connection failure`.

**Diagnosis:**
```bash
docker compose logs --tail=30 hhh-neo4j | grep -E "Started|ERROR|WARN"
# If Neo4j is still initializing you will see: "Bolt enabled on 0.0.0.0:7687."  not yet present
```

**Fix:**
```bash
# Wait for Neo4j to finish initial startup (can take 30–60 s on first boot)
docker compose exec hhh-neo4j \
  cypher-shell -u neo4j -p "$NEO4J_PASSWORD" "RETURN 1 AS ok;"
# Expected: ok: 1

# If stuck, restart the container
docker compose restart hhh-neo4j
```

---

### Neo4j failed to start — data directory permissions

**Symptom:** `hhh-neo4j` enters a restart loop; logs show
`ERROR Failed to start Neo4j: Store unavailable` or `java.io.IOException: Permission denied`.

**Diagnosis:**
```bash
docker compose logs --tail=30 hhh-neo4j | grep -i "error\|permission"
# Look for: "Permission denied" or "Cannot open file"

# Check host directory ownership
ls -la /mnt/data/appdata/hhh/neo4j/
# Expected: owned by UID 7474 (neo4j user inside container)
```

**Fix:**
```bash
# Stop the container
docker compose stop hhh-neo4j

# Correct ownership (neo4j user = UID 7474)
sudo chown -R 7474:7474 /mnt/data/appdata/hhh/neo4j

# Restart
docker compose up -d hhh-neo4j

# Verify startup
docker compose logs -f hhh-neo4j | grep -E "Started|Bolt enabled|ERROR"
# Expected: "Bolt enabled on 0.0.0.0:7687."
```

If Neo4j still fails to start after fixing permissions, check disk space:
```bash
df -h /mnt/data/
# Neo4j needs at least 1 GB free for a fresh start
```

---

### Flutter web blank page — CORS issue

**Symptom:** The Flutter web app loads but API calls fail; browser console shows
`Access-Control-Allow-Origin` errors.

**Diagnosis:**
```bash
curl -s -I -X OPTIONS http://localhost:3000/api/v1/health \
  -H "Origin: http://localhost:5000" | grep -i access-control
# Expected header: Access-Control-Allow-Origin: *  (or your domain)
```

**Fix:**
```bash
# Check CORS config in app/routes/apiRouter.js — ensure the CORS middleware allows your Flutter web origin
docker compose exec hhh-app env | grep ALLOWED_ORIGINS
# Add your origin to the comma-separated ALLOWED_ORIGINS in .env if missing, e.g.:
#   ALLOWED_ORIGINS=http://admin.localhost,http://researcher.localhost,https://your.domain.com

bash scripts/deploy-backend.sh
```

---

### LightRAG unreachable or knowledge base not responding

**Symptom:** Habit recommendations return empty sources; admin portal Knowledge Base page shows errors; `POST /api/v1/llm/retrieve` returns 502.

**Diagnosis:**
```bash
# Check LightRAG container status
docker compose ps hhh-lightrag

# Check LightRAG health directly
curl -s http://localhost:9621/health
# Expected: {"status":"ok"}

# Check LightRAG logs for errors
docker compose logs --tail=50 hhh-lightrag

# Verify LIGHTRAG_URL and LIGHTRAG_API_KEY are set on recommender
docker compose exec hhh-recommender env | grep LIGHTRAG
```

**Fix:**
```bash
# Restart LightRAG and knowledge-mcp (recommender will follow via depends_on)
docker compose up -d hhh-lightrag hhh-knowledge-mcp hhh-recommender
```

> **Note:** LightRAG takes ~30 seconds to initialize its storage on first start. Wait for `{"status":"ok"}` from `curl http://localhost:9621/health` before considering it failed.

**Graph visualization:**
The LightRAG graph UI is at `http://localhost:9621` inside Docker. Access it from the server via SSH tunnel:
```bash
ssh -L 9622:localhost:9621 your-server
# Then open http://localhost:9622 in your browser
```

---

### Recommender service unreachable — container name resolution

**Symptom:** `GET /api/v1/recommend/:userId` returns 502 or timeout; app logs show
`connect ECONNREFUSED` or `getaddrinfo ENOTFOUND recommender`.

**Diagnosis:**
```bash
# Verify the recommender container is running
docker compose ps hhh-recommender
# Expected: Up (healthy) or Up N seconds

# Check the RECOMMENDER_URL env var in the app
docker compose exec hhh-app env | grep RECOMMENDER_URL
# Expected: RECOMMENDER_URL=http://recommender:8000

# Test connectivity from inside the app container
docker compose exec hhh-app \
  wget -qO- http://recommender:8000/health 2>&1 | head -c 200
# Expected: {"status":"ok"}

# Check the recommender's own health endpoint directly
curl -s http://localhost:8000/health
# Expected: {"status":"ok"}
```

**Fix:**
```bash
# If the recommender is stopped, restart it
bash scripts/deploy-recommender.sh
```

If the container name `recommender` cannot be resolved, ensure both services share the same
Docker network (check `docker-compose.yml` `networks:` section for `hhh-app` and `recommender`).

---

### LibreTranslate down or returning empty translations

**Symptom 1:** Habit donation succeeds but `translationEN` or `translationDE` is `null`
even for non-English or English habits respectively.  App logs show
`WARN [habitsRouter] translateAndRefine failed, falling back to raw translation` or
`WARN [habitsRouter] translateToGerman failed`.

**Symptom 2:** `hhh-translate` is in a restart loop or shows `unhealthy`.

**Diagnosis:**
```bash
# Check container status
docker compose ps hhh-translate
# Expected: Up (healthy)

# Check LibreTranslate logs for startup errors
docker compose logs --tail=50 hhh-translate
# Common errors:
#   "Permission denied" on /home/libretranslate/.local → UID 1032 issue
#   "No module named argostranslate" → language pack not downloaded

# Test LibreTranslate directly from inside the app container
docker compose exec hhh-app \
  wget -qO- "http://translate:5000/translate" \
  --post-data '{"q":"Hello","source":"en","target":"de","format":"text"}' \
  --header 'Content-Type: application/json' 2>&1 | head -c 200
# Expected: {"translatedText":"Hallo"}
```

**Fix — UID 1032 volume permission issue:**
```bash
# Stop LibreTranslate
docker compose stop hhh-translate

# Fix ownership (libretranslate user = UID 1032)
sudo chown -R 1032:1032 /mnt/data/appdata/hhh/translate

# Restart
docker compose up -d hhh-translate

# Watch logs for successful language pack loading
docker compose logs -f hhh-translate | grep -E "Loaded|Error|ready"
# Expected: "Loaded en -> de" and "Loaded de -> en" (and ja variants if LT_LOAD_ONLY includes ja)
```

**Fix — LibreTranslate is up but translations are empty (LLM refinement failing):**

LibreTranslate itself is healthy but the LLM refinement step in the API-service is failing.
The backend falls back to the raw (unrefined) LibreTranslate output, so `translationEN`/`translationDE`
will be populated with unrefined machine translations rather than null.

```bash
# Check the API-service (recommender) logs
docker compose logs --tail=50 hhh-recommender | grep -E "error|ERROR|refine"
# Common cause: LLM_API_KEY not set or rate-limited

# Verify the env var is present
docker compose exec hhh-recommender env | grep LLM_API_KEY
# Expected: LLM_API_KEY=sk-...
```

Update `.env` with a valid key and redeploy the recommender:
```bash
bash scripts/deploy-recommender.sh
```

---

*End of Runbook — see also [Architecture](architecture.md), [Data Model](data-model.md),
[API Reference](api/openapi.yaml), and [Admin Guide](guides/admin-guide.md).*

---

## Backup & Restore

### Known limitation: Neo4j backup downtime window

The nightly backup runs `neo4j-admin database dump`, which **stops the Neo4j
container** for the duration of the dump (typically < 1 minute on current data
volumes). During this window, habit donation, explore feeds, and admin stats
return errors. The backup loop starts ~02:00 (container start + 120 s + 24 h
cycles), i.e. during the lowest-traffic period. If the dataset grows enough
for this to matter, switch to Neo4j Enterprise online backup or accept dumps
from a replica.

### Offsite sync

Backups land in `./backups` **on the same host as the databases** — by
themselves they do not survive host loss. Configure offsite sync:

1. Create `backup-service/rclone/rclone.conf` on the host (git-ignored) with a
   remote, e.g. an S3-compatible bucket or TU SFTP target.
2. Set `OFFSITE_REMOTE=<remote>:<path>` in `.env`.
3. Recreate the backup container. Every nightly run then mirrors
   `full_backup_*.tar.gz` + manifests offsite; sync failures trigger the
   alert webhook/email like any other backup error.

### Restore drill (run quarterly — an untested backup is not a backup)

On a scratch machine or the staging host:

```bash
# 1. Fetch the latest archive (from offsite if testing disaster recovery)
tar -xzf full_backup_<DATE>.tar.gz -C /tmp/restore

# 2. MongoDB
docker compose up -d mongo
docker exec -i hhh-mongo mongorestore --archive < /tmp/restore/<DATE>/mongo.archive

# 3. Neo4j (container must be stopped for load)
docker compose stop neo4j
docker run --rm -v <neo4j-data-volume>:/data -v /tmp/restore/<DATE>/neo4j:/backup \
  neo4j:5 neo4j-admin database load neo4j --from-path=/backup --overwrite-destination
docker compose start neo4j

# 4. LightRAG
docker run --rm -v <lightrag-data-volume>:/lightrag -v /tmp/restore/<DATE>:/backup alpine \
  sh -c "rm -rf /lightrag/* && tar -xzf /backup/lightrag-data.tar.gz -C /lightrag"

# 5. Keycloak realm
# Import /tmp/restore/<DATE>/hhh-realm.json via Keycloak admin console
# (Realm settings → Partial import) or --import-realm on a fresh instance.

# 6. Verify
node scripts/smoke-e2e.mjs   # against the restored stack
```

Record date, archive used, duration, and any surprises in the study log.
`backup-service/restore.sh` automates steps 2–4 on the production host.
