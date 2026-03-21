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
8. [Rotating Keycloak Secrets](#rotating-keycloak-secrets)
9. [Adding an Admin User](#adding-an-admin-user)
10. [Checking Service Health](#checking-service-health)
11. [Troubleshooting](#troubleshooting)
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
> Never expose Neo4j (7474/7687), MongoDB (27017), or Fuseki (3030) externally.

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

### 2.2 Create `stack.env` from template

```bash
cp stack.env stack.env.local
```

Open `stack.env.local` and replace every `CHANGE_THIS_*` placeholder:

```bash
# Required: change all passwords before first boot
DOMAIN=your.domain.com
KEYCLOAK_ADMIN_PASSWORD=<strong-password>
MONGO_PASSWORD=<strong-password>
NEO4J_PASSWORD=<strong-password>
DB_PASSWORD=<strong-password>     # Fuseki
ADMIN_PASSWORD=<strong-password>  # application admin
```

> **Critical:** Never commit `stack.env.local` to Git.  Add it to `.gitignore` if needed.

### 2.3 Start all services

```bash
docker compose --env-file stack.env.local up -d
```

Expected output (services pulling/building, then starting):
```
[+] Running 10/10
 ✔ Container h3-traefik     Started
 ✔ Container h3-mongo       Started
 ✔ Container h3-neo4j       Started
 ✔ Container h3-fuseki      Started
 ✔ Container h3-keycloak    Started
 ✔ Container h3-recommender Started
 ✔ Container h3-app         Started
 ✔ Container h3-mongoexpress Started
 ✔ Container h3-libretranslate Started
 ✔ Container h3-backup      Started
```

### 2.4 Verify all services are healthy

```bash
docker compose --env-file stack.env.local ps
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
        "fuseki":     { "status": "ok", "latencyMs": 18 },
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
[2026-03-15T10:00:00Z] Building h3-app...
[2026-03-15T10:00:30Z] Starting h3-app...
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

Backups are created daily at 02:00 UTC by the `h3-backup` container.

### 6.1 List available backups

```bash
docker exec h3-backup ls /backups/
```

Expected output:
```
full_backup_20260315_020000.tar.gz
full_backup_20260314_020000.tar.gz
backup.log
```

### 6.2 Inspect the backup log

```bash
docker exec h3-backup tail -50 /backups/backup.log
```

Expected output (successful run):
```
[2026-03-15 02:00:01] Starting backup...
[2026-03-15 02:00:02] 1/4 Dumping MongoDB...
[2026-03-15 02:00:05] MongoDB dump complete.
[2026-03-15 02:00:05] 2/4 Dumping Neo4j...
[2026-03-15 02:00:10] Neo4j dump complete.
[2026-03-15 02:00:10] 3/4 Dumping Fuseki...
[2026-03-15 02:00:11] Fuseki dump complete.
[2026-03-15 02:00:11] 4/4 Exporting Keycloak realm...
[2026-03-15 02:00:14] Keycloak export complete.
[2026-03-15 02:00:15] Archiving to full_backup_20260315_020000.tar.gz...
[2026-03-15 02:00:18] Backup complete. Size: 24M
```

### 6.3 Verify archive integrity

```bash
ARCHIVE=$(docker exec h3-backup ls /backups/full_backup_*.tar.gz | tail -1)
docker exec h3-backup tar -tzf "$ARCHIVE" | head -20
```

Expected output: a list of paths inside the archive (mongo/, neo4j/, fuseki/, keycloak/).

---

## 7. Restore from Backup

> **Warning:** This operation overwrites all live data. Take a fresh backup first.

```bash
# 1. Take a safety backup of current state
docker exec h3-backup /backup.sh

# 2. List available timestamps
docker exec h3-backup ls /backups/ | grep full_backup
# Example: full_backup_20260314_020000.tar.gz → timestamp is 20260314_020000

# 3. Run the restore script (runs inside the backup container which has mongorestore/docker CLI)
bash scripts/restore.sh 20260314_020000
```

Expected interaction:
```
Restore from 20260314_020000? This will overwrite current data. [y/N]
y
[2026-03-15 10:00:00] Extracting backup archive...
[2026-03-15 10:00:02] 1/3 Restoring MongoDB...
[2026-03-15 10:00:06] ✓ MongoDB restored
[2026-03-15 10:00:06] 2/3 Restoring Neo4j...
[2026-03-15 10:00:18] ✓ Neo4j restored
[2026-03-15 10:00:18] 3/3 Restoring Keycloak realm...
[2026-03-15 10:00:22] ✓ Keycloak realm restored
[2026-03-15 10:00:22] ==========================================
[2026-03-15 10:00:22] Restore from 20260314_020000 completed.
[2026-03-15 10:00:22] ==========================================
```

After restore, verify service health:

```bash
curl -s http://localhost:3000/api/v1/health | python3 -m json.tool
# Expected: {"status":"ok", ...}
```

---

## 8. Rotating Keycloak Secrets

### 8.1 Change the Keycloak admin password

```bash
# Update stack.env.local
nano stack.env.local
# Change KEYCLOAK_ADMIN_PASSWORD to the new value

# Restart Keycloak to pick up the new env var
docker compose --env-file stack.env.local up -d keycloak
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
4. Update `stack.env.local`:
   ```
   KEYCLOAK_CLIENT_SECRET=<new-secret>
   ```
5. Redeploy the backend:
   ```bash
   bash scripts/deploy-backend.sh
   ```

### 8.3 Update JWKS URL if Keycloak hostname changes

```bash
# In stack.env.local:
KEYCLOAK_JWKS_URL=https://your.domain.com/auth/realms/hhh/protocol/openid-connect/certs

# Redeploy backend
bash scripts/deploy-backend.sh
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

### Quick health check

```bash
curl -s http://localhost:3000/api/v1/health | python3 -m json.tool
```

### Check individual containers

```bash
# Show status of all containers
docker compose --env-file stack.env.local ps

# Stream logs for a specific service
docker compose --env-file stack.env.local logs -f h3-app

# Check last 50 lines of Neo4j logs
docker compose --env-file stack.env.local logs --tail=50 h3-neo4j

# Check Keycloak startup
docker compose --env-file stack.env.local logs --tail=100 h3-keycloak | grep -E "started|error|WARN"
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

## 11. Troubleshooting

### Keycloak 401 errors — JWKS URL misconfigured

**Symptom:** All API calls return `{"error":"Unauthorized"}` even with a valid token.

**Diagnosis:**
```bash
# Check the JWKS URL the app is using
docker compose --env-file stack.env.local exec h3-app env | grep KEYCLOAK_JWKS_URL
# Expected: KEYCLOAK_JWKS_URL=http://keycloak:8080/realms/hhh/protocol/openid-connect/certs

# Verify the endpoint is reachable from inside the app container
docker compose --env-file stack.env.local exec h3-app \
  wget -qO- http://keycloak:8080/realms/hhh/protocol/openid-connect/certs | head -c 100
# Expected: {"keys":[{"kid":"...
```

**Fix:**
```bash
# Update stack.env.local with the correct internal URL (container hostname)
KEYCLOAK_JWKS_URL=http://keycloak:8080/realms/hhh/protocol/openid-connect/certs

bash scripts/deploy-backend.sh
```

---

### Neo4j connection refused — container not ready

**Symptom:** Health endpoint returns `{"status":"error"}` for neo4j, or app logs show
`ServiceUnavailable: WebSocket connection failure`.

**Diagnosis:**
```bash
docker compose --env-file stack.env.local logs --tail=30 h3-neo4j | grep -E "Started|ERROR|WARN"
# If Neo4j is still initializing you will see: "Bolt enabled on 0.0.0.0:7687."  not yet present
```

**Fix:**
```bash
# Wait for Neo4j to finish initial startup (can take 30–60 s on first boot)
docker compose --env-file stack.env.local exec h3-neo4j \
  cypher-shell -u neo4j -p "$NEO4J_PASSWORD" "RETURN 1 AS ok;"
# Expected: ok: 1

# If stuck, restart the container
docker compose --env-file stack.env.local restart h3-neo4j
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
# Check CORS config in app/app.js — ensure the CORS middleware allows your Flutter web origin
docker compose --env-file stack.env.local exec h3-app env | grep CORS
# Add CORS_ORIGIN=https://your.domain.com to stack.env.local if missing

bash scripts/deploy-backend.sh
```

---

### Recommender service unreachable — container name resolution

**Symptom:** `GET /api/v1/recommend/:userId` returns 502 or timeout; app logs show
`connect ECONNREFUSED` or `getaddrinfo ENOTFOUND recommender`.

**Diagnosis:**
```bash
# Verify the recommender container is running
docker compose --env-file stack.env.local ps h3-recommender
# Expected: Up (healthy) or Up N seconds

# Check the RECOMMENDER_URL env var in the app
docker compose --env-file stack.env.local exec h3-app env | grep RECOMMENDER_URL
# Expected: RECOMMENDER_URL=http://recommender:8000

# Test connectivity from inside the app container
docker compose --env-file stack.env.local exec h3-app \
  wget -qO- http://recommender:8000/health 2>&1 | head -c 200
# Expected: {"status":"ok"} or similar JSON
```

**Fix:**
```bash
# If the recommender is stopped, restart it
bash scripts/deploy-recommender.sh
```

If the container name `recommender` cannot be resolved, ensure both services share the same
Docker network (check `docker-compose.yml` `networks:` section for `h3-app` and `recommender`).

---

---

### Neo4j failed to start — data directory permissions

**Symptom:** `h3-neo4j` enters a restart loop; logs show
`ERROR Failed to start Neo4j: Store unavailable` or `java.io.IOException: Permission denied`.

**Diagnosis:**
```bash
docker compose --env-file stack.env.local logs --tail=30 h3-neo4j | grep -i "error\|permission"
# Look for: "Permission denied" or "Cannot open file"

# Check host directory ownership
ls -la /mnt/data/appdata/hhh/neo4j/
# Expected: owned by UID 7474 (neo4j user inside container)
```

**Fix:**
```bash
# Stop the container
docker compose --env-file stack.env.local stop h3-neo4j

# Correct ownership (neo4j user = UID 7474)
sudo chown -R 7474:7474 /mnt/data/appdata/hhh/neo4j

# Restart
docker compose --env-file stack.env.local up -d h3-neo4j

# Verify startup
docker compose --env-file stack.env.local logs -f h3-neo4j | grep -E "Started|Bolt enabled|ERROR"
# Expected: "Bolt enabled on 0.0.0.0:7687."
```

If Neo4j still fails to start after fixing permissions, check disk space:
```bash
df -h /mnt/data/
# Neo4j needs at least 1 GB free for a fresh start
```

---

### LibreTranslate down or returning empty translations

**Symptom 1:** Habit donation succeeds but `translationEN` or `translationDE` is `null`
even for non-English or English habits respectively.  App logs show
`WARN [habitsRouter] translateAndRefine failed, falling back to raw translation` or
`WARN [habitsRouter] translateToGerman failed`.

**Symptom 2:** `h3-translate` is in a restart loop or shows `unhealthy`.

**Diagnosis:**
```bash
# Check container status
docker compose --env-file stack.env.local ps h3-translate
# Expected: Up (healthy)

# Check LibreTranslate logs for startup errors
docker compose --env-file stack.env.local logs --tail=50 h3-translate
# Common errors:
#   "Permission denied" on /home/libretranslate/.local → UID 1032 issue
#   "No module named argostranslate" → language pack not downloaded

# Test LibreTranslate directly from inside the app container
docker compose --env-file stack.env.local exec h3-app \
  wget -qO- "http://translate:5000/translate" \
  --post-data '{"q":"Hello","source":"en","target":"de","format":"text"}' \
  --header 'Content-Type: application/json' 2>&1 | head -c 200
# Expected: {"translatedText":"Hallo"}
```

**Fix — UID 1032 volume permission issue:**
```bash
# Stop LibreTranslate
docker compose --env-file stack.env.local stop h3-translate

# Fix ownership (libretranslate user = UID 1032)
sudo chown -R 1032:1032 /mnt/data/appdata/hhh/translate

# Restart
docker compose --env-file stack.env.local up -d h3-translate

# Watch logs for successful language pack loading
docker compose --env-file stack.env.local logs -f h3-translate | grep -E "Loaded|Error|ready"
# Expected: "Loaded en -> de" and "Loaded de -> en" (and ja variants if LT_LOAD_ONLY includes ja)
```

**Fix — LibreTranslate is up but translations are empty (LLM refinement failing):**

LibreTranslate itself is healthy but the LLM refinement step in the API-service is failing.
The backend falls back to the raw (unrefined) LibreTranslate output, so `translationEN`/`translationDE`
will be populated with unrefined machine translations rather than null.

```bash
# Check the API-service (recommender) logs
docker compose --env-file stack.env.local logs --tail=50 h3-recommender | grep -E "error|ERROR|refine"
# Common cause: OPENAI_API_KEY not set or rate-limited

# Verify the env var is present
docker compose --env-file stack.env.local exec h3-recommender env | grep OPENAI_API_KEY
# Expected: OPENAI_API_KEY=sk-...
```

Update `stack.env.local` with a valid key and redeploy the recommender:
```bash
bash scripts/deploy-recommender.sh
```

---

### Keycloak DB unavailable — PostgreSQL not ready

**Symptom:** `h3-keycloak` fails to start or enters a restart loop; Keycloak logs show
`Unable to connect to datasource` or `Connection refused` pointing to `keycloak-db:5432`.

**Diagnosis:**
```bash
# Check whether the keycloak-db container is running and healthy
docker compose --env-file stack.env.local ps h3-keycloak-db
# Expected: Up (healthy)

# If not healthy, inspect the PostgreSQL logs
docker compose --env-file stack.env.local logs --tail=30 h3-keycloak-db
# Common errors:
#   "FATAL: password authentication failed" → KC_DB_PASSWORD mismatch
#   "database 'keycloak' does not exist" → volume was wiped, re-init required

# Verify the credentials env vars are set correctly in the Keycloak container
docker compose --env-file stack.env.local exec h3-keycloak env | grep KC_DB
# Expected:
#   KC_DB=postgres
#   KC_DB_URL=jdbc:postgresql://keycloak-db:5432/keycloak
#   KC_DB_USERNAME=keycloak
#   KC_DB_PASSWORD=<your-password>

# Test connectivity from the Keycloak container to the DB
docker compose --env-file stack.env.local exec h3-keycloak \
  sh -c 'nc -zv keycloak-db 5432 && echo OK || echo FAIL'
# Expected: OK
```

**Fix — keycloak-db not started or unhealthy:**
```bash
# Start the database first
docker compose --env-file stack.env.local up -d h3-keycloak-db

# Wait for it to become healthy (check every 5 seconds)
for i in $(seq 1 12); do
  STATUS=$(docker inspect --format='{{.State.Health.Status}}' h3-keycloak-db 2>/dev/null)
  [ "$STATUS" = "healthy" ] && echo "DB healthy." && break
  echo "Waiting for DB... ($i/12)"; sleep 5
done

# Then start Keycloak
docker compose --env-file stack.env.local up -d h3-keycloak
```

**Fix — password mismatch between keycloak-db and Keycloak:**
```bash
# Stop both services
docker compose --env-file stack.env.local stop h3-keycloak h3-keycloak-db

# Remove the database volume to force re-initialisation with the correct password
docker volume rm h3-keycloak-db-data

# Ensure KC_DB_USERNAME and KC_DB_PASSWORD are consistent in stack.env.local
# Then restart both services
docker compose --env-file stack.env.local up -d h3-keycloak-db h3-keycloak

# After Keycloak starts, verify the realm was imported
curl -s -o /dev/null -w "%{http_code}" \
  http://localhost:8080/realms/hhh/.well-known/openid-configuration
# Expected: 200
```

> **Note:** Removing `h3-keycloak-db-data` destroys all Keycloak data (users, sessions,
> client secrets).  Re-create any manually provisioned users and rotate client secrets
> after volume re-initialisation.

---

*End of Runbook — see also [Architecture](architecture.md), [Data Model](data-model.md),
[API Reference](api/openapi.yaml), and [Admin Guide](guides/admin-guide.md).*
