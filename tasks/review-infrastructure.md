# Infrastructure & Docker Configuration Review

**Reviewer**: Ralph (Senior Infrastructure Engineer perspective)
**Date**: 2026-03-21
**Scope**: `docker-compose.yml`, `docker-compose.prod.yml`, `.env.example`, `stack.env`, all Dockerfiles, `backup-service/backup.sh`, `backup-service/restore.sh`

---

## Summary

9 services orchestrated through Docker Compose across dev and prod environments. The architecture uses Traefik v3.0 as a reverse proxy with service-discovery routing, Alpine-based images with non-root execution, and a custom backup service covering all 4 databases. Production adds TLS via Let's Encrypt/TU Dresden ACME and a separate `docker-compose.prod.yml` override.

**Finding counts**: 5 Critical · 9 Major · 7 Minor

---

## 1. Service Configuration

### Critical

**C1 — Keycloak uses `dev-file` database in production**
`docker-compose.prod.yml` line 246: `KC_DB=dev-file`
The Keycloak `dev-file` backend is a single H2 file store not designed for production traffic. It has no clustering support, no replication, and no failover. A single JVM crash or disk hiccup corrupts the entire auth system. Fix: add a PostgreSQL service to `docker-compose.prod.yml` and set `KC_DB=postgres` with a mounted credential.

**C2 — Traefik insecure API / debug mode exposed in dev**
`docker-compose.yml` lines 6–8: `--api.insecure=true`, `--api.debug=true`
The insecure flag exposes the full Traefik REST API and dashboard without authentication on port 8888. Debug mode logs include internal routing decisions and middleware state. Anyone on the local machine (or local network if port is forwarded) can inspect or manipulate routing. Remove `--api.insecure` and `--api.debug`; add BasicAuth middleware in front of the dashboard even in dev.

### Major

**M1 — Missing health checks: Fuseki, Recommender, Admin**
`docker-compose.yml`, all services. Fuseki, the Python recommender, and the Next.js admin have no `healthcheck` stanzas. Docker cannot detect failures, `depends_on: condition: service_healthy` cannot gate dependent service startup, and the app may receive 502s silently during Fuseki or recommender restarts.

Fuseki check:
```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:3030/$/ping"]
  interval: 30s
  timeout: 10s
  retries: 5
  start_period: 45s
```
Recommender: add a `/health` endpoint to FastAPI (already has ASGI, one line), then similar curl check.

**M2 — Neo4j procedures unrestricted wildcard**
`docker-compose.yml` lines 168–169:
```
NEO4J_dbms_security_procedures_unrestricted=n10s.*
NEO4J_dbms_security_procedures_allowlist=n10s.*
```
A wildcard allowlist enables every current and future n10s procedure including those that load external URLs (`n10s.rdf.import.fetch`). Any authenticated Neo4j user can import arbitrary RDF from the internet. Replace with the minimal set actually used: `n10s.onto.import,n10s.rdf.import.inline,n10s.graphconfig.init`.

**M3 — No CPU/memory resource limits on any service**
Neither compose file defines `deploy.resources.limits`. Without limits a single runaway service (e.g. LibreTranslate loading language models, or a Neo4j full-graph query) can exhaust host RAM and OOM-kill all other containers. Add at least memory limits for the four heaviest services: Neo4j (2G), LibreTranslate (4G), MongoDB (1G), Recommender (1G).

**M4 — LibreTranslate rate limiting disabled in production**
`docker-compose.prod.yml` line 179: `LT_REQ_LIMIT=0`
Zero means unlimited requests per IP. LibreTranslate is routed through Traefik on `/translate` but has no Traefik rate-limit middleware. Any unauthenticated caller can saturate the translation service. Set `LT_REQ_LIMIT=100` (requests per minute) or add a Traefik `rateLimit` middleware label to the service.

**M5 — backup/restore.sh MongoDB path mismatch**
`backup.sh` line 79 writes to `$BACKUP_DIR/$DATE/mongo/` but `restore.sh` line 48 looks for `$RESTORE_DIR/mongodb/`. The directory name differs by four characters. The restore script always prints "Warning: No MongoDB backup found" and silently skips MongoDB restoration. Change `restore.sh:48` from `if [ -d "$RESTORE_DIR/mongodb" ]` to `if [ -d "$RESTORE_DIR/mongo" ]`.

---

## 2. Networking

### Minor

**m1 — Single flat bridge network for all services**
All 9 services share the `h3-proxy` bridge. Fuseki, Neo4j, MongoDB, and Keycloak are all reachable from the app container and from each other with no segmentation. A compromise of the app container gives lateral movement to all databases. Consider splitting into `h3-db` (mongo, neo4j, fuseki) and `h3-auth` (keycloak) networks, with the app connecting to all three.

**m2 — Traefik has no healthcheck**
The Traefik container has no `healthcheck`. If Traefik crashes and Docker restarts it, services that depend on `proxy` with no health condition will not gate on its readiness. Add:
```yaml
healthcheck:
  test: ["CMD", "traefik", "healthcheck", "--ping"]
  interval: 30s
  timeout: 5s
  retries: 3
```
and enable the ping endpoint with `--ping` in the Traefik command.

---

## 3. Secrets Management

### Critical

**C3 — `.env` file with real credentials tracked in Git**
`git log --all -- .env` confirms the file is in history. All MongoDB, Neo4j, Fuseki, Keycloak, Mailjet, reCAPTCHA, and OpenAI credentials are in plaintext in the repository. US-071 addressed removing the live `.env` from the working tree but the history still contains the values. Every secret stored in it must be rotated. Going forward: `.env` in `.gitignore`, only `.env.example` with placeholder values committed.

**C4 — Weak / predictable default credential fallbacks in docker-compose.yml**
Examples:
- `MONGO_PASSWORD` defaults to `admin` (line 98)
- `NEO4J_PASSWORD` defaults to `neo4j_password_change_me` (line 165)
- `NEXTAUTH_SECRET` defaults to `change-me-in-production` (line 41)
- `KEYCLOAK_ADMIN_PASSWORD` defaults to `admin` (line 202)
- `ME_CONFIG_BASICAUTH_PASSWORD` hardcoded to `AiGhe7ahngoh5eiz` (line 242)

Any developer who runs `docker compose up` without a `.env` gets a running cluster with known credentials. Remove all default values from compose files — fail fast with a clear error if required env vars are missing.

**C5 — No secrets rotation mechanism**
No facility exists to rotate database passwords, JWT secrets, or API keys without redeploying the entire stack. The OpenAI key, Mailjet credentials, and reCAPTCHA secret are static. For a research platform handling participant data, credential rotation should be a documented operational procedure at minimum. Consider Docker Secrets (Swarm) or a Vault sidecar for production.

### Major

**M6 — `stack.env` is Git-tracked and contains production-like values**
`stack.env` is committed and contains Portainer environment variable defaults including the ACME email and partial credential templates. Even if the values are placeholders, this file establishes the credential naming convention and leaks the deployment topology. Treat `stack.env` the same as `.env`: add to `.gitignore`, keep only `stack.env.example`.

---

## 4. Volumes

### Major

**M7 — Neo4j backup requires container stop (service downtime)**
`backup-service/backup.sh` lines 104–130: the backup routine runs `docker stop h3-neo4j`, waits 30 s, calls `neo4j-admin dump`, then `docker start h3-neo4j`. This causes a hard outage of the graph database at 02:00 daily — any overnight batch jobs or scheduled recommendation generation will fail. Neo4j 5.x Enterprise supports online backup; the Community edition (used here) does not. Mitigations: (a) schedule in a low-traffic window and document the maintenance window, (b) snapshot the volume at the filesystem level using LVM or BTRFS snapshots instead of `neo4j-admin dump`, (c) evaluate the Enterprise backup plugin.

**M8 — Named volumes for Neo4j/Fuseki/LibreTranslate have no size limits**
Docker named volumes grow unbounded. A misbehaving Fuseki query or large ontology upload can fill the host disk. Add monitoring on `/mnt/data` disk usage; document volume size expectations in the operations runbook.

### Minor

**m3 — `backup.log` has no rotation**
`backup.sh` appends to `/backups/backup.log` indefinitely. After a year of daily runs the log will reach several hundred MB. Add a `logrotate` config or a size check at the top of `backup.sh` that renames and compresses the log when it exceeds 10 MB.

---

## 5. Production Readiness

### Major

**M9 — No centralised logging or monitoring**
Logs are written to Docker's default JSON-file driver with no rotation configuration and no aggregation. There is no Prometheus metrics endpoint, no Grafana dashboard, and no alerting beyond the backup webhook. Errors in the app or API service are only discoverable via `docker logs`. For a live research platform: (a) configure Docker's `json-file` driver with `max-size: 10m, max-file: 5` to at least cap log size; (b) expose `/metrics` from FastAPI and the Node.js app; (c) add a Loki+Grafana sidecar or forward to an external service.

### Minor

**m4 — `mongo` image unpinned in development**
`docker-compose.yml` uses `image: mongo` (implicit `:latest`). `docker-compose.prod.yml` correctly pins to `mongo:7.0`. An unintended `docker compose pull` in dev could pull a breaking MongoDB major version. Pin the dev image to `mongo:7.0` to match production.

**m5 — Recommender service uvicorn runs with default worker count (1)**
`API-service/Dockerfile` CMD: `uvicorn main:app --host 0.0.0.0 --port 8000`. Single-worker uvicorn blocks all requests while the LLM inference runs (can take several seconds). Add `--workers 2` or switch to `--loop uvloop` with async endpoints; at minimum document the single-threaded limitation.

**m6 — Admin healthcheck absent; Next.js standalone server starts slowly**
`docker-compose.yml` admin service has no healthcheck. The Next.js standalone server can take 10–15 s to initialise. Add a healthcheck on port 3001 with a 30 s start_period to prevent dependent-service race conditions.

**m7 — Keycloak realm file mounted read-only but realm can be modified via admin UI**
`./keycloak/hhh-realm.json:/opt/keycloak/data/import/hhh-realm.json:ro` (both compose files). The `:ro` mount prevents Keycloak from writing back to the file, which is correct — but changes made through the Keycloak admin console are written to the Keycloak data volume (not this file) and are lost on volume reset. Document this: the file is an import template, not a live config, and admin-console changes require re-exporting the realm and updating the file.

---

## 6. What Is Done Well

1. **Multi-stage builds** — `admin/Dockerfile` (3 stages) and `API-service/Dockerfile` produce minimal images. The admin runner stage copies only the standalone output and static files, which is the correct Next.js pattern.

2. **Non-root user execution in every image** — `app/` runs as `node`, `admin/` as `nextjs:1001`, `API-service/` as `appuser`, `fuseki/` inherits the upstream non-root user. US-077 added the non-root user to API-service. This reduces privilege escalation impact on container escape.

3. **Read-only volume mounts for init data** — Keycloak realm, Fuseki RDF init data, and the Docker socket in most services all carry `:ro`. This is a good defensive posture.

4. **Comprehensive backup coverage** — `backup-service/backup.sh` covers all 4 databases (MongoDB, Neo4j, Fuseki, Keycloak), generates a unified archive, tracks errors, sends webhook+email alerts, enforces retention, and writes a JSON manifest. This is well above average for a research platform.

5. **Health checks on core services** — App, MongoDB, Neo4j, and Keycloak all have `healthcheck` stanzas with appropriate `start_period` values (60 s for Neo4j, 120 s for prod Keycloak). `depends_on: condition: service_healthy` is used in the app service.

6. **Dev/prod configuration separation** — `docker-compose.prod.yml` cleanly overrides dev settings: pins MongoDB to 7.0, sets TLS, configures ACME, uses `always` restart, applies host bind-mounts for persistent data, and sets longer Keycloak start periods. The pattern is correct and easy to follow.

7. **Traefik production TLS** — HTTP→HTTPS redirect, Let's Encrypt / TU Dresden ACME, cert stored in persistent volume, StripPrefix middleware for sub-path routing — all correctly configured.

8. **Watch mode for development** — `develop.watch` on the app service maps source changes to live reloads. This is a Docker Compose v2.22+ feature used well.

9. **Alpine-based images** — All custom images except `API-service/` (which correctly uses `python:3.11-slim`) use Alpine. Image sizes are minimised and the attack surface is reduced.

10. **Interactive confirmation in restore.sh** — `restore.sh` requires the operator to type "YES" before any destructive restore. This prevents accidental data loss.

---

## 7. Prioritised Improvements

### Critical (address before next production deployment)

| # | Issue | File | Fix |
|---|-------|------|-----|
| C1 | Keycloak `dev-file` DB in production | `docker-compose.prod.yml:246` | Switch to PostgreSQL service |
| C2 | Traefik `--api.insecure=true` + `--api.debug=true` | `docker-compose.yml:6–8` | Remove both flags; add BasicAuth to dashboard |
| C3 | `.env` with real credentials in Git history | `.env`, `.gitignore` | Rotate all secrets; ensure `.env` is gitignored |
| C4 | Weak/hardcoded default credential fallbacks | `docker-compose.yml` multiple lines | Remove all defaults; fail fast on missing env vars |
| C5 | No secrets rotation mechanism | Operational gap | Document rotation procedure; evaluate Docker Secrets |

### Major (address within the next sprint)

| # | Issue | File | Fix |
|---|-------|------|-----|
| M1 | Missing healthchecks: Fuseki, Recommender, Admin | Both compose files | Add healthcheck stanzas; add `/health` to FastAPI |
| M2 | Neo4j unrestricted wildcard procedure allowlist | `docker-compose.yml:168–169` | Replace `n10s.*` with explicit procedure list |
| M3 | No CPU/memory resource limits | Both compose files | Add `deploy.resources.limits` per service |
| M4 | LibreTranslate `LT_REQ_LIMIT=0` | `docker-compose.prod.yml:179` | Set `LT_REQ_LIMIT=100` or add Traefik rateLimit |
| M5 | `backup/restore.sh` MongoDB path mismatch | `restore.sh:48` | ✅ Resolved (US-155) — Changed `mongodb` → `mongo`; sync comments added to both files |
| M6 | `stack.env` committed with deployment values | `stack.env`, `.gitignore` | Gitignore; keep only `stack.env.example` |
| M7 | Neo4j backup causes daily container stop | `backup.sh:104–130` | Document maintenance window; evaluate fs-level snapshot |
| M8 | Named volumes unbounded | Both compose files | Add disk monitoring; document expected sizes |
| M9 | No centralised logging or monitoring | All services | Add `json-file` log limits; expose metrics |

### Minor (address in next cleanup pass)

| # | Issue | File | Fix |
|---|-------|------|-----|
| m1 | Single flat network, all services co-resident | Both compose files | Segment into db, auth, app networks |
| m2 | Traefik has no healthcheck | Both compose files | Add `--ping` and healthcheck |
| m3 | `backup.log` no rotation | `backup.sh` | Add size check or logrotate config |
| m4 | `mongo` image unpinned in dev | `docker-compose.yml` | Pin to `mongo:7.0` |
| m5 | uvicorn single worker | `API-service/Dockerfile` | Add `--workers 2` or document limitation |
| m6 | Admin service no healthcheck | Both compose files | Add healthcheck with 30 s start_period |
| m7 | Keycloak realm `:ro` semantics undocumented | Both compose files | Add comment explaining import-only semantics |
