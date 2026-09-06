# Health Habit Hub — Operations Runbook

This runbook covers every day-two operation: first-time setup, routine updates, rollback,
backup/restore, secret rotation, and troubleshooting. Every command block is copy-pasteable
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
11. [Critical Alerts](#critical-alerts)
12. [Queue & Cache Monitoring](#queue--cache-monitoring-local-dev)
    - [Dedicated analytics VM](#dedicated-analytics-vm)
13. [Troubleshooting](#troubleshooting)
    - [Keycloak 401 errors](#keycloak-401-errors--jwks-url-misconfigured)
    - [Keycloak DB unavailable — PostgreSQL not ready](#keycloak-db-unavailable--postgresql-not-ready)
    - [Neo4j connection refused — container not ready](#neo4j-connection-refused--container-not-ready)
    - [Neo4j failed to start — data directory permissions](#neo4j-failed-to-start--data-directory-permissions)
    - [Flutter web blank page — CORS issue](#flutter-web-blank-page--cors-issue)
    - [Recommender service unreachable](#recommender-service-unreachable--container-name-resolution)
    - [LibreTranslate down or returning empty translations](#libretranslate-down-or-returning-empty-translations)
    - [`website` gets Traefik's default cert instead of a real one](#website-gets-traefiks-default-cert-instead-of-a-real-one--empty-env-var-not-an-acme-failure)
14. [Filesystem Maintenance](#14-filesystem-maintenance)

---

## 1. Prerequisites

### Server Specification (minimum)

| Resource | Minimum          | Recommended      |
| -------- | ---------------- | ---------------- |
| CPU      | 4 vCPU           | 8 vCPU           |
| RAM      | 8 GB             | 16 GB            |
| Disk     | 40 GB SSD        | 100 GB SSD       |
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

| Port | Protocol | Purpose                                                                                                                      |
| ---- | -------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 80   | TCP      | HTTP (redirected to HTTPS by Traefik)                                                                                        |
| 443  | TCP      | HTTPS (Traefik TLS termination)                                                                                              |
| 7687 | TCP      | Neo4j Browser's bolt-over-websocket channel (Traefik-proxied, TLS; auth is Neo4j's own username/password), `NEO4J_BOLT_PORT` |
| 8080 | TCP      | Keycloak admin UI (restrict to trusted IPs in production)                                                                    |

> **Security note:** Port 8080 should be firewalled to admin IP ranges only.
> Never expose Neo4j (7474/7687) or MongoDB (27017) _directly_ — the only
> supported public path to Neo4j is through Traefik: the `/neo4j` Browser UI is
> Keycloak-SSO gated (admin role), and its bolt query channel on port 7687 uses
> Neo4j's own username/password. MongoDB stays fully internal; use mongo-express
> (`/mongo`, also SSO-gated) instead.

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

### Internal-tool access — Keycloak SSO (admin role)

The internal tools exposed for the admin portal's "System & Links" page —
**Prometheus** (`/prometheus`), **Bull Board** (`/queues`), **RedisInsight**
(`/redisinsight`), **Neo4j Browser UI** (`/neo4j`), **mongo-express** (`/mongo`)
— are gated by **Keycloak SSO** via `oauth2-proxy`, not by per-tool passwords.
There are no htpasswd hashes to manage anymore.

- **You log in with your normal Keycloak account.** Only accounts holding the
  realm **`admin`** role are allowed through; study participants (role `user`)
  are denied. Grant a teammate access by giving their Keycloak user the `admin`
  role — no config change or redeploy needed.
- **How it works:** `oauth2-proxy` (confidential Keycloak client `oauth2-proxy`,
  secret injected by `keycloak-init` from `OAUTH2_PROXY_CLIENT_SECRET`, cookie
  signed with `OAUTH2_PROXY_COOKIE_SECRET`) runs as a Traefik forward-auth
  backend. Each tool router carries the shared `sso-auth` forward-auth
  middleware (pointed at oauth2-proxy's root, so unauthenticated requests get a
  302 to Keycloak — not a dead 401); after login you land back on the tool.
- **Two exceptions, by design:**
  - **LightRAG** (`/lightrag`) is **not** on the SSO — it can't do OIDC. It uses
    its **own login** instead: `AUTH_ACCOUNTS=admin:${LIGHTRAG_AUTH_PASSWORD}` +
    `TOKEN_SECRET=${LIGHTRAG_TOKEN_SECRET}` on the lightrag service. This both
    fixes the old double-prompt loop and closes LightRAG's Guest-access hole
    (`LIGHTRAG_API_KEY` alone does not secure it — upstream: "even if only an API
    Key is configured, all APIs can still be accessed through the Guest account").
  - **Neo4j bolt** (port 7687) is raw TCP/websocket, not HTTP, so forward-auth
    can't apply. It's protected by Neo4j's own username/password (`NEO4J_AUTH`).
    Connect Neo4j Browser manually (auth type Username/Password, user `neo4j`,
    password `NEO4J_PASSWORD`); Browser's SSO auto-discovery error at `/neo4j`
    is cosmetic — connect by hand. **See "Connecting to Neo4j Browser" below**
    for the two connection methods (the direct `bolt+s://` route needs port 7687
    open in the perimeter firewall; the SSH tunnel does not).

**Secrets to set** (plaintext — no hashes, no `$`-escaping traps):
`OAUTH2_PROXY_CLIENT_SECRET`, `OAUTH2_PROXY_COOKIE_SECRET` (`openssl rand -base64
24` — must be 16/24/32 chars; the 44-char `rand -base64 32` is rejected),
`LIGHTRAG_AUTH_PASSWORD`, `LIGHTRAG_TOKEN_SECRET` (`openssl rand -hex 32`).

> **If a tool won't load after deploy:** check that (1) your Keycloak account has
> the `admin` role, (2) `keycloak-init` provisioned the client — on a realm that
> predates it, the init logs "oauth2-proxy client missing — creating it" and
> creates the client automatically (no volume recreation needed); a Keycloak 400
> "Client not found" on the `/auth/.../auth` redirect means that step didn't run,
> so check the `hhh-keycloak-init` logs — and (3) `OAUTH2_PROXY_CLIENT_SECRET`
> matches on both oauth2-proxy and the Keycloak client.

### Connecting to Neo4j Browser

The Neo4j Browser **page** (`https://<DOMAIN>/neo4j`) loads over 443 behind the
Keycloak SSO like the other tools. But its **bolt query connection** is a separate
channel on **port 7687**, and there are two ways to reach it. Auth is always
Neo4j's own: user `neo4j`, password `NEO4J_PASSWORD`.

**Method A — direct (requires port 7687 open in the perimeter firewall).**
The TU Dresden firewall blocks non-standard ports by default, so this only works
once 7687 is opened (via a ZIH firewall request for `TCP 7687` to `141.76.16.16`).
Then, in Neo4j Browser:

- Connect URL: `bolt+s://<DOMAIN>:7687` (`+s` — Traefik terminates TLS on 7687)
- Auth: Username / Password, `neo4j` / `NEO4J_PASSWORD`

Check whether 7687 is reachable: the server always _listens_
(`sudo ss -tlnp | grep 7687` shows docker-proxy); if an external client gets
"connection refused"/timeout, the firewall is still blocking it.

**Method B — SSH tunnel (no firewall change; recommended for admin use).**
The neo4j service publishes its HTTP (7474) and bolt (7687) ports on the
server's **loopback only** at `127.0.0.1:17474` / `127.0.0.1:17687` (see
docker-compose.yml). These are reachable _only_ from the server's localhost —
i.e. only through an SSH tunnel, never from the internet — so no firewall change
is involved. Tunnel BOTH ports:

```bash
# From your laptop (substitute your SSH login):
ssh -L 7474:localhost:17474 -L 7687:localhost:17687 service@141.76.16.16
```

Then, keeping that session open, open Neo4j Browser **served locally over http**:

```
http://localhost:7474
```

and connect with:

- Connect URL: `bolt://localhost:7687` — plain `bolt://`, **not** `bolt+s://`.
  (Browser may pre-fill the advertised `<DOMAIN>:7687`; overwrite it.)
- Auth: Username / Password, `neo4j` / `NEO4J_PASSWORD`

> **Why both ports, and why `http://localhost:7474` instead of the public
> `/neo4j` page:** the public Browser page is served over **HTTPS**, and an
> HTTPS page may not open an insecure `ws://` (plain bolt) socket — the browser
> blocks it as mixed content, with no error detail. Loading Browser from
> `http://localhost:7474` (also tunneled) keeps page and bolt both plain-over-
> localhost, so it connects. Also do **not** tunnel to the server's own
> `localhost:7687` — that's Traefik's TLS endpoint whose cert is for `<DOMAIN>`,
> not `localhost`. The loopback ports above target Neo4j directly, so they need
> no TLS and no container-IP lookup (the IP changes on every recreate).

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
    "neo4j": { "status": "ok", "latencyMs": 12 },
    "mongo": { "status": "ok", "latencyMs": 5 },
    "keycloak": { "status": "ok", "latencyMs": 30 },
    "recommender": { "status": "ok", "latencyMs": 8 }
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

The Keycloak step (realm export + `pg_dump` of `keycloak-db`) needs
`backup-service/backup.sh`/`restore.sh` to know Keycloak's base URL correctly
— prod runs Keycloak under `/auth` (`KC_HTTP_RELATIVE_PATH=/auth`), local dev
doesn't, so both scripts read a `KEYCLOAK_URL` env var (`.../auth` in
`docker-compose.yml`, no suffix in `docker-compose.local.yml`) rather than
hardcoding either. Local dev also has no `keycloak-db` at all (`KC_DB=dev-file`
— embedded, no Postgres), so `docker-compose.local.yml` explicitly clears
`KC_DB_PASSWORD` for the backup service, which makes the database-dump step
report "Skipped (no credentials)" locally instead of erroring.

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
  of _scheduled_ (automatic, `trigger: scheduled` in the manifest) backups
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
backend (`hhh-app`) and the Python recommender (`hhh-recommender`). Both services must be
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
> unavailable. Schedule rotations during low-traffic windows.

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
    "neo4j": { "status": "ok", "latencyMs": 12 },
    "mongo": { "status": "ok", "latencyMs": 5 },
    "keycloak": { "status": "ok", "latencyMs": 30 },
    "recommender": { "status": "ok", "latencyMs": 8 }
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

## 11. Critical Alerts

All critical-alert emails go to `ALERT_EMAIL` via generic SMTP (`SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS`/`SMTP_FROM`/`SMTP_STARTTLS` — set once in `.env`/Portainer, works with any relay/provider). Two independent delivery paths share these same credentials:

![Critical alerts flow: backup runs and LLM-unavailable events fire directly from application code via alerting.py/send_smtp_mail(); BullMQ job failures, service-down, and 5xx-spike events are metric-driven through Grafana's unified alerting; both paths send to the same ALERT_EMAIL using the same SMTP credentials](docs/assets/architecture/critical-alerts-flow.svg)

| Alert                   | Fires when                                                                                                              | Sent from                                                                                      | Debounce                                                                                                       |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Backup failure/success  | Every scheduled/manual `backup.sh` run                                                                                  | `backup-service/lib.sh`'s `send_smtp_mail()`, called from `backup.sh`'s `send_alert()`         | One email per run (not repeated)                                                                               |
| LLM model unavailable   | Primary model fails (`API-service/llm_client.py`'s circuit breaker)                                                     | `API-service/alerting.py`                                                                      | Once per `LLM_FALLBACK_COOLDOWN_S` (default 300s) per model — see the code comments in `llm_client.py` for why |
| LLM totally unavailable | Primary **and** `LLM_FALLBACK_MODEL` both fail                                                                          | Same as above                                                                                  | Once per `LLM_FALLBACK_COOLDOWN_S` per fallback model                                                          |
| BullMQ job failures     | A queued job exhausts all retry attempts (`bullmq_jobs_failed_total`, terminal failures only)                           | Grafana (`monitoring/grafana/provisioning/alerting/alerting.yaml`, rule `hhh-bullmq-failures`) | Grafana's own `group_wait`/`group_interval`/`repeat_interval` (30s/5m/4h)                                      |
| Service unreachable     | `blackbox-exporter` can't reach a service (TCP-connect or HTTP-GET) for 2+ consecutive minutes                          | Grafana, rule `hhh-reachability`                                                               | Same as above                                                                                                  |
| Backend 5xx spike       | Sustained 5xx rate > 0.1 req/s for 5+ minutes (tune the threshold in `alerting.yaml` once real traffic volume is known) | Grafana, rule `hhh-5xx-spike`                                                                  | Same as above                                                                                                  |
| Host filesystem low     | `/`, `/var`, or `/data` remains below 15% free for 10 minutes                                                           | Grafana, rule `hhh-host-disk-low`                                                              | Same as above                                                                                                  |
| Host memory low         | Available host memory remains below 10% for 10 minutes                                                                  | Grafana, rule `hhh-host-memory-low`                                                            | Same as above                                                                                                  |
| Container memory high   | A `hhh-*` container remains above 90% of its configured memory limit for 10 minutes                                     | Grafana, rule `hhh-container-memory-high`                                                      | Same as above                                                                                                  |
| Metrics exporter down   | A configured node-exporter or cAdvisor target is unreachable for 2 minutes                                              | Grafana, rule `hhh-metrics-exporter-down`                                                      | Same as above                                                                                                  |

The backup and LLM alerts fire directly from application code — they don't depend on Prometheus/Grafana being up. The other seven are metric-driven and route through Grafana's unified alerting engine.

### Testing each alert path

```bash
# Backup: trigger a manual backup and check for an email (success or failure)
docker exec hhh-backup /backup.sh

# LLM-down: temporarily point LLM_API_KEY or LLM_API_BASE at something
# unreachable, then make any request that calls chat_complete (e.g. POST
# /api/v1/llm/classify-habit through the app). Restore the real value
# afterwards — the circuit breaker recovers automatically once calls succeed
# again, no restart needed.

# BullMQ: check the counter directly
curl -s http://localhost:9091/metrics | grep bullmq_jobs_failed_total

# Reachability: stop a non-critical service and watch the probe flip
docker stop hhh-redis
curl -s 'http://localhost:9090/api/v1/query?query=probe_success{instance="redis:6379"}'
docker start hhh-redis

# Host/container metrics: both queries should return one or more series
curl -s 'http://localhost:9090/api/v1/query?query=node_memory_MemAvailable_bytes'
curl -s 'http://localhost:9090/api/v1/query?query=container_memory_working_set_bytes{name=~"hhh-.+"}'
```

### Muting alerts during planned maintenance

Don't edit the provisioned rule files for a temporary silence — they're reprovisioned on every Grafana restart. Instead, in Grafana: **Alerting → Mute timings** → create a timing covering the maintenance window, then add it to the `hhh-critical-alerts` notification policy for the duration. Remove it afterwards.

### Verifying the Grafana alerting config loaded correctly

```bash
curl -s -u "$GRAFANA_ADMIN_USER:$GRAFANA_ADMIN_PASSWORD" \
  https://<DOMAIN>/grafana/api/v1/provisioning/alert-rules | python3 -m json.tool
# Expect 7 rules: hhh-reachability, hhh-bullmq-failures, hhh-5xx-spike,
# hhh-host-disk-low, hhh-host-memory-low, hhh-container-memory-high,
# hhh-metrics-exporter-down,
# each with "provenance": "file"
```

---

## 12. Queue & Cache Monitoring (local dev)

Two browser UIs are available in local development to inspect the BullMQ habit-donation queue and the Redis cache.

### Bull Board — habit donation queue

Bull Board is mounted inside the app server and exposes a live view of the `habit-donations` BullMQ queue.

**URL:** http://app.localhost/queues (local) · https://$DOMAIN/queues (production)

Note the path is `/queues`, **not** `/admin/queues`: in production Traefik routes
`PathPrefix(/admin)` to the Next.js admin panel, so anything mounted under
`/admin` by the app server is unreachable from outside.

In local dev it is always on and needs no login — the app container is only
reachable from localhost. In production it is mounted only when
`ENABLE_QUEUE_DASHBOARD=true` (the compose default) and is gated by Keycloak SSO
(the `sso-auth` forward-auth middleware, admin role) on the `/queues` router.
Bull Board has **no authentication of its own**, so never expose `/queues`
without that gate.

What you can do:

- See job counts by state: waiting, active, completed, failed
- Inspect individual job payloads (habit sentence, userID, confidence)
- Retry failed jobs manually
- Pause / resume the queue

**Typical workflow after `make seed`:**

1. Open http://app.localhost/queues
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

**In production:** RedisInsight is deployed as a normal part of the stack (not
a manual start/stop step) and reachable at `https://<DOMAIN>/redisinsight`,
gated by Keycloak SSO (admin role, the `sso-auth` forward-auth middleware —
same as Prometheus, Bull Board, Neo4j Browser and mongo-express; see
docker-compose.yml). The connection to the app's Redis instance is pre-configured via `RI_REDIS_*`
env vars, so there's no "Add Redis Database" step to do by hand there.

### Dedicated analytics VM

The analytics integration is inert while its PostHog environment values are
blank. Once enabled, diagnose it in this order:

1. On the analytics VM, run `./manage.sh doctor` and `./manage.sh status`.
2. From `habitvm`, request `http://<analytics-private-address>:8000/_health`.
   A failure here is normally the TU firewall rule or PostHog itself.
3. Inspect Prometheus targets for `host="analyticsvm"` on ports 8000, 9100 and 8080. A blank `ANALYTICS_VM_HOST` intentionally creates no targets.
4. From an off-TU device, send through
   `https://<DOMAIN>/ingest/batch/`. The private analytics address and its UI
   must remain unreachable from that same device.
5. Confirm the Flutter build uses the public `/ingest` URL, never the private
   VM address; the backend must use `POSTHOG_SERVER_HOST` privately.
6. In Prometheus, confirm `up{job="traefik"} == 1` and that
   `traefik_router_requests_total{router="posthog-ingest@file"}` increases after
   a test event. Grafana warns after 12,500 ingest requests in 30 days, a
   conservative proxy for a possible 250,000-event month because SDK uploads
   can batch multiple events. Use PostHog's ingestion graph for the exact count.

If the `/ingest` router is absent, inspect the one-shot renderer before
debugging PostHog:

```bash
docker logs hhh-traefik-config
docker exec hhh-proxy cat /etc/traefik/dynamic/posthog-ingest.yml
```

A blank `http: {}` is correct when `POSTHOG_INTERNAL_URL` is empty. A malformed
origin, domain, port, or non-numeric rate limit makes `traefik-config` fail and
prevents the proxy from starting with a silently unsafe configuration.

Useful operations on the analytics VM:

```bash
./manage.sh status
./manage.sh logs web
./manage.sh logs clickhouse
./manage.sh backup
systemctl status hhh-analytics-backup.timer
journalctl -u hhh-analytics-backup.service --since today
```

Every backup creates PostgreSQL and ClickHouse archives plus a JSON manifest
with SHA-256 checksums and `offsite: true|false`. Kafka is transient and is not
backed up. A local backup with `offsite: false` does not protect against VM
loss. Restore drills use a scratch VM and the exact pinned PostHog revision;
never test a restore against the live study stack.

Do not “fix” ingestion by proxying PostHog `/`. Only `/i/`, `/e/`,
`/decide[/]`, `/flags[/]`, `/batch[/]`, and `/array/` under public `/ingest`
are allowed. A publicly reachable PostHog login page is a security incident:
blank `POSTHOG_INTERNAL_URL`, redeploy Traefik, and inspect the dynamic file.

---

## 13. Troubleshooting

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
> client secrets). Re-create any manually provisioned users and rotate client secrets
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
In production, the LightRAG WebUI is reachable directly at
`https://<DOMAIN>/lightrag/webui` (behind LightRAG's own login — user `admin`,
`LIGHTRAG_AUTH_PASSWORD`; not the Keycloak SSO) — no tunnel needed. The SSH
tunnel below is only for
reaching it from inside the Docker network directly (e.g. while debugging
`LIGHTRAG_API_PREFIX` itself, where the public route may not be trustworthy):

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
even for non-English or English habits respectively. App logs show
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

### `website` gets Traefik's default cert instead of a real one — empty env var, not an ACME failure

**Symptom:** Browsers show `net::ERR_CERT_AUTHORITY_INVALID` / "connection not
private" for `WEBSITE_DOMAIN` (e.g. `healthhabithub.de`), and inspecting the
certificate shows `CN=TRAEFIK DEFAULT CERT` rather than a Let's Encrypt one.
Often paired with a 404 from Traefik itself, since no router actually matches
the real incoming `Host` header.

**Root cause:** `WEBSITE_DOMAIN` is unset or empty in whatever env source is
actually live on the server — commonly because it was only set in a local
`.env` (gitignored, per-environment — never deployed) or never added to
Portainer's stack environment variables. Traefik's Docker-provider label
templating does **not** fail loudly on a missing variable: a rule written as
``Host(`${WEBSITE_DOMAIN}`) || Host(`www.${WEBSITE_DOMAIN}`)`` silently
renders as ` Host(`) || Host(`www.`) `` — syntactically valid, so nothing
crashes — which then makes Let's Encrypt reject the request outright:

```
Cannot issue for "www": Domain name needs at least one dot
```

The general lesson: a missing Traefik-templated env var is a silent
misconfiguration, not a startup failure. Don't assume the env var is correct
just because the stack came up healthy — check what Traefik actually rendered:

```bash
# What did Traefik actually see, not what you think you set:
docker logs hhh-proxy --tail 200 | grep -i "website\|acme"
# Look at the `rule=` in the output — if it shows empty backticks instead of
# the real domain, the env var isn't reaching this container.
```

**Fix:**

```bash
# Set WEBSITE_DOMAIN in THIS server's real .env (or Portainer env vars) —
# not just a local checkout — then:
docker compose up -d --force-recreate website
```

Traefik retries ACME automatically once the rule is valid — no manual
certificate request needed. Verify from outside:

```bash
curl -v https://healthhabithub.de/ 2>&1 | grep -i "subject\|issuer"
# Expected: Let's Encrypt, not TRAEFIK DEFAULT CERT
```

---

## 14. Filesystem Maintenance

The server has two LVM volume groups — a 49.5 GB `main` (btrfs `/` and `/var`)
and a 1 TB `data` (ext4, mounted at `/data`, holding Docker's `data-root` and
all HHH runtime data). The layout is documented in
[DEPLOYMENT.md § 7](../DEPLOYMENT.md#7-server-storage-layout). Databases live on
`/data`; the 20 GB root holds only the OS and the config clone.

### The btrfs free-space trap on `/`

**`df` is misleading on btrfs, and the number that actually matters is
`Device unallocated`.** btrfs carves the device into data and metadata chunks up
front. When unallocated space reaches zero and metadata needs to grow, you get
`ENOSPC` and a **read-only remount — while `df` still reports gigabytes free**.
On the root filesystem, with Docker running, that is an outage.

```bash
sudo btrfs filesystem usage /
```

Watch `Device unallocated`. Keep it above ~1–2 GB. Observed 2026-09-03: **13 MiB**.

A second symptom of the same problem is a large gap between live files and
reported usage — `du -xh --max-depth=2 /` showing ~6 GB while btrfs reports
14.49 GB used. The difference is pinned by snapshots.

### Cause: snapper snapshots

snapper runs an **hourly** timeline plus pre/post pairs around every `apt`
transaction. 33 snapshots had accumulated, pinning ~9 GB.

These snapshots protect **only the OS**. Mongo, Neo4j, Prometheus, LightRAG and
the audio recordings are all on `/data`, which is ext4 and not snapshotted at
all. So an hourly cadence buys an `apt upgrade` rollback and nothing else,
at the cost of the root partition.

```bash
sudo snapper list
```

### Fix — delete first, then balance

Order matters: deleting snapshots frees extents; balancing then returns
half-empty chunks to unallocated. Both run online, no downtime.

```bash
# 1. Delete old snapshots, keeping the last few days and the boot snapshot
sudo snapper delete <id> <id> ...

# 2. Compact half-empty data chunks back into unallocated space
sudo btrfs balance start -dusage=50 /
sudo btrfs filesystem usage /
```

Measured result (2026-09-03): unallocated 13 MiB → **5.01 GiB**, used
14.49 → 12.20 GiB, 5 of 25 chunks relocated, a few minutes.

### Prevention — cap snapper

Edit `/etc/snapper/configs/root`:

```
TIMELINE_LIMIT_HOURLY="0"
TIMELINE_LIMIT_DAILY="7"
TIMELINE_LIMIT_WEEKLY="4"
TIMELINE_LIMIT_MONTHLY="0"
TIMELINE_LIMIT_YEARLY="0"
NUMBER_LIMIT="10"
```

```bash
sudo snapper cleanup timeline && sudo snapper cleanup number
```

Daily snapshots plus the apt pre/post pairs are the right level here.

### Docker build cache

Usually the largest single consumer of `/data`. Observed at 34 GB, 28.8 GB of it
reclaimable — roughly two thirds of everything on the volume.

```bash
sudo docker system df                      # inspect first
sudo docker builder prune -f               # reclaim build cache
sudo docker image prune -f                 # dangling images
```

Safe to run at any time; it only discards cache and untagged layers. Worth doing
after any run of failed builds.

### Routine check

```bash
df -h / /var /data && sudo btrfs filesystem usage / | grep -i unallocated
```

### Known gaps

Two things this maintenance does **not** cover, both currently unaddressed:

- **No offsite backup replication.** `$HHH_DATA_DIR/rclone` is empty, so no
  remote is configured and every backup lives on the same VM as the data it
  protects. Losing the VM loses both. The machinery is already built and only
  needs configuring — see [Offsite sync](#offsite-sync).
- **The separate analytics VM still needs its private address after
  provisioning.** Its deployment package includes node-exporter and cAdvisor.
  Set `ANALYTICS_VM_HOST` on `habitvm` and allow only `habitvm` to reach ports
  8000/9100/8080 on the private network; the PostHog health probe, exporter
  target files, and `host: analyticsvm` labels are generated automatically.

---

_End of Runbook — see also [Architecture](architecture.md), [Data Model](data-model.md),
[API Reference](api/openapi.yaml), and [Admin Guide](guides/admin-guide.md)._

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

Backups land in `$HHH_DATA_DIR/backups` (production: `/data/hhh/backups`)
**on the same host as the databases** — by themselves they do not survive host
loss. Everything needed is already built (rclone ships in the backup image,
`OFFSITE_REMOTE` is wired in `docker-compose.yml`); it only needs configuring.
Until it is, every backup run logs:

```
OFFSITE_REMOTE not set — backups remain on this host only
```

To configure:

1. Create `rclone.conf` in the directory compose mounts at `/config/rclone` —
   that is **`$HHH_DATA_DIR/rclone/`**, i.e. `/data/hhh/rclone/rclone.conf` in
   production. Any rclone remote works (S3-compatible bucket, TU SFTP target).
2. Make it readable by the container's UID: `sudo chmod -R o+r /data/hhh/rclone`
   — the backup container runs as a non-root user and the mount is read-only.
3. Set `OFFSITE_REMOTE=<remote>:<path>` in the Portainer stack environment
   (e.g. `tu-s3:hhh-backups`).
4. **Recreate** the backup container — a restart is not enough for a new mount.

Every run then mirrors `full_backup_*.tar.gz` and the manifests offsite, and a
sync failure raises the alert webhook/email like any other backup error.

> ⚠️ **`rclone sync` mirrors deletions.** The offsite copy inherits local
> retention — when a 14-day-old archive is pruned here, the next run deletes it
> there too. That is disaster recovery, **not** an archive. If you need
> long-term retention (e.g. keeping monthly snapshots for the duration of a
> study), point `OFFSITE_REMOTE` at a bucket with versioning or object-lock
> enabled, or change the call to `rclone copy` in
> `backup-service/backup.sh` (~line 438) so the remote is append-only.

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
