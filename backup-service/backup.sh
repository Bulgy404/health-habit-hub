#!/bin/bash
set -euo pipefail

BACKUP_DIR="/backups"
DATE=$(date +%Y%m%d_%H%M%S)
START_TS=$(date +%s)
RETENTION_DAYS=${BACKUP_RETENTION_DAYS:-14}
# Scheduled (daily automatic) backups are additionally capped by count, using
# the same number as the time-based retention above, so a daily cron settles
# at "last $RETENTION_DAYS scheduled backups" in the admin UI instead of
# waiting on mtime to catch up. Manual/uploaded backups are unaffected.
SCHEDULED_BACKUP_LIMIT=$RETENTION_DAYS
ALERT_WEBHOOK_URL=${ALERT_WEBHOOK_URL:-}
# ALERT_EMAIL is the canonical critical-alerts recipient (also used by
# API-service and Grafana alerting — see docs/runbook.md). BACKUP_EMAIL is a
# deprecated alias, still read as a fallback for anyone who only set that one.
ALERT_EMAIL=${ALERT_EMAIL:-${BACKUP_EMAIL:-}}
# Full base URL including any relative path Keycloak is mounted at — prod
# runs Keycloak under /auth (KC_HTTP_RELATIVE_PATH=/auth, see docker-compose.yml),
# local dev does not. Set explicitly per-environment in each compose file
# rather than assumed here, matching KEYCLOAK_URL's meaning everywhere else
# in the codebase (app/services/keycloakAdminClient.js etc.).
KEYCLOAK_URL=${KEYCLOAK_URL:-http://keycloak:8080}
KEYCLOAK_ADMIN=${KEYCLOAK_ADMIN:-admin}
KEYCLOAK_ADMIN_PASSWORD=${KEYCLOAK_ADMIN_PASSWORD:-}
KC_DB_HOST=${KC_DB_HOST:-keycloak-db}
KC_DB_USERNAME=${KC_DB_USERNAME:-keycloak}
KC_DB_PASSWORD=${KC_DB_PASSWORD:-}
# Who/what asked for this run: "scheduled" (nightly loop, default), "manual"
# (admin UI trigger), or "pre_restore_safety" (auto-snapshot before a restore).
BACKUP_TRIGGER=${BACKUP_TRIGGER:-scheduled}

# Per-service opt-out, set by the admin UI's trigger toggles (via backup-api)
# or directly in the environment. Default: back up everything. Scheduled runs
# (the docker-compose command: sleep loop) never set these, so they always
# get all four — only a manual trigger can narrow the scope.
INCLUDE_MONGO=${BACKUP_INCLUDE_MONGO:-true}
INCLUDE_LIGHTRAG=${BACKUP_INCLUDE_LIGHTRAG:-true}
INCLUDE_NEO4J=${BACKUP_INCLUDE_NEO4J:-true}
INCLUDE_KEYCLOAK=${BACKUP_INCLUDE_KEYCLOAK:-true}

LOG_FILE="$BACKUP_DIR/backup.log"

# Error tracking (overall) and per-component success flags (for the manifest —
# these are independent of BACKUP_ERRORS since one component's restart failure
# shouldn't make another component's line lie about its own outcome).
BACKUP_ERRORS=0
ERROR_LOG=""
MONGO_OK=true
LIGHTRAG_OK=true
NEO4J_OK=true
KEYCLOAK_OK=true
KEYCLOAK_DB_OK=true

# shellcheck source=./lib.sh
source "$(dirname "$0")/lib.sh"

if ! acquire_lock; then
  echo "[$(date +"%Y-%m-%d %H:%M:%S")] ERROR: Another backup or restore is already running — aborting." >> "$LOG_FILE" 2>/dev/null || true
  echo "ERROR: Another backup or restore is already running — aborting."
  exit 1
fi
trap release_lock EXIT

# Timestamped logging to stdout and backup.log
log() {
  local ts
  ts=$(date +"%Y-%m-%d %H:%M:%S")
  echo "[$ts] $*" | tee -a "$LOG_FILE"
}

# Function to send alerts on failure
send_alert() {
  local message="$1"
  local status="$2"

  # Send webhook alert (Slack/Discord/etc)
  if [ -n "$ALERT_WEBHOOK_URL" ]; then
    curl -X POST "$ALERT_WEBHOOK_URL" \
      -H "Content-Type: application/json" \
      -d "{\"text\":\"🚨 Health Habit Hub Backup $status\",\"blocks\":[{\"type\":\"section\",\"text\":{\"type\":\"mrkdwn\",\"text\":\"$message\"}}]}" \
      2>/dev/null || log "Warning: Failed to send webhook alert"
  fi

  # Send email alert via generic SMTP (if ALERT_EMAIL + SMTP credentials configured)
  if [ -n "$ALERT_EMAIL" ]; then
    if send_smtp_mail "$ALERT_EMAIL" "🚨 Health Habit Hub Backup $status" "$message"; then
      log "Email alert sent to $ALERT_EMAIL"
    else
      log "Warning: Failed to send email alert (SMTP not configured or send failed)"
    fi
  fi
}

# Function to log errors
log_error() {
  local component="$1"
  local error="$2"
  BACKUP_ERRORS=$((BACKUP_ERRORS + 1))
  ERROR_LOG="${ERROR_LOG}❌ $component: $error\n"
  log "ERROR: $component - $error"
}

log "=========================================="
log "Starting backup: $DATE"
log "=========================================="

# Create backup directory structure
mkdir -p "$BACKUP_DIR/$DATE"

# 1. Backup MongoDB
# NOTE: The --out directory name ("mongo") must stay in sync with the restore path in restore.sh.
# If you rename this directory, update restore.sh to match.
log "1/5 Backing up MongoDB..."
if [ "$INCLUDE_MONGO" = "true" ]; then
  # Credentials go in a 0600 temp config file (--config), read via the
  # documented `uri` field, rather than --username/--password on the command
  # line — so they never show up in `ps aux` / `/proc/<pid>/cmdline`. jq's
  # @uri filter percent-encodes user/pass so special characters in either
  # can't break the connection-string syntax.
  MONGO_CONF=$(mktemp)
  chmod 600 "$MONGO_CONF"
  MONGO_URI=$(jq -rn --arg u "${MONGO_USER:-}" --arg p "${MONGO_PASSWORD:-}" \
    '"mongodb://\($u|@uri):\($p|@uri)@mongo:27017/?authSource=admin"')
  jq -n --arg uri "$MONGO_URI" '{uri:$uri}' > "$MONGO_CONF"
  if mongodump \
    --config="$MONGO_CONF" \
    --out="$BACKUP_DIR/$DATE/mongo" \
    --quiet 2>/dev/null; then
    log "✓ MongoDB backup completed"
  else
    MONGO_OK=false
    log_error "MongoDB" "mongodump failed"
  fi
  rm -f "$MONGO_CONF"
else
  log "⊘ MongoDB excluded from this backup (per trigger options)"
fi

# 2. Backup LightRAG index
log "2/5 Backing up LightRAG index..."
if [ "$INCLUDE_LIGHTRAG" = "true" ]; then
  if [ -d "/lightrag" ] && [ "$(ls -A /lightrag 2>/dev/null)" ]; then
    if tar -czf "$BACKUP_DIR/$DATE/lightrag-data.tar.gz" -C /lightrag . 2>/dev/null; then
      log "✓ LightRAG backup completed"
    else
      LIGHTRAG_OK=false
      log_error "LightRAG" "tar archive failed"
    fi
  else
    log "⚠ Warning: LightRAG volume is empty or not mounted"
    touch "$BACKUP_DIR/$DATE/lightrag-data.tar.gz"
  fi
else
  log "⊘ LightRAG excluded from this backup (per trigger options)"
fi

# 3. Backup Neo4j using native dump
log "3/5 Backing up Neo4j (using neo4j-admin dump)..."
if [ "$INCLUDE_NEO4J" = "true" ]; then
  log "  Stopping Neo4j for consistent backup..."
  mkdir -p "$BACKUP_DIR/$DATE/neo4j"

  # Stop Neo4j container
  if docker stop hhh-neo4j >/dev/null 2>&1; then
    sleep 2  # Give it a moment to shut down cleanly

    # Create a temporary volume and set permissions
    docker volume create neo4j-backup-temp >/dev/null 2>&1
    docker run --rm -v neo4j-backup-temp:/backup alpine:latest chmod 777 /backup

    # Perform the Neo4j dump
    NEO4J_DUMP_OUTPUT=$(docker run --rm \
      --volumes-from hhh-neo4j \
      -v neo4j-backup-temp:/backup \
      neo4j:5 \
      neo4j-admin database dump neo4j --to-path=/backup --overwrite-destination=true 2>&1)

    if echo "$NEO4J_DUMP_OUTPUT" | grep -q "Dump completed successfully"; then

      # Copy the dump into the neo4j/ subdirectory
      docker run --rm \
        -v neo4j-backup-temp:/source:ro \
        alpine:latest \
        tar -czf - -C /source neo4j.dump | tar -xzf - -C "$BACKUP_DIR/$DATE/neo4j/"

      # Clean up the temporary volume
      docker volume rm neo4j-backup-temp >/dev/null 2>&1

      log "✓ Neo4j dump completed"
    else
      NEO4J_OK=false
      log_error "Neo4j" "neo4j-admin dump failed"
      docker volume rm neo4j-backup-temp >/dev/null 2>&1 || true
    fi

    # Restart Neo4j
    log "  Restarting Neo4j..."
    if docker start hhh-neo4j >/dev/null 2>&1; then
      log "✓ Neo4j restarted"
    else
      log_error "Neo4j" "Failed to restart container"
    fi
  else
    NEO4J_OK=false
    log_error "Neo4j" "Failed to stop container for backup"
  fi
else
  log "⊘ Neo4j excluded from this backup (per trigger options)"
fi

# 4. Backup Keycloak: realm config (via admin API) + the actual Postgres
# database (via pg_dump). The realm export alone captures clients/roles/groups
# but NOT user accounts or credentials — those only live in keycloak-db, so
# losing that volume with only a realm export backed up would mean every
# admin/researcher account is unrecoverable.
log "4/5 Backing up Keycloak (realm config + database)..."
mkdir -p "$BACKUP_DIR/$DATE/keycloak"

if [ "$INCLUDE_KEYCLOAK" = "true" ]; then
  if [ -n "$KEYCLOAK_ADMIN_PASSWORD" ]; then
    # Credentials are piped to curl's stdin (--data @-) via a shell-builtin
    # printf instead of an inline -d argument, so they never appear in
    # `ps aux` / `/proc/<pid>/cmdline` for the curl subprocess.
    KC_TOKEN=$(printf 'client_id=admin-cli&grant_type=password&username=%s&password=%s' "$KEYCLOAK_ADMIN" "$KEYCLOAK_ADMIN_PASSWORD" | curl -sf -X POST \
      "${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token" \
      --data @- \
      2>/dev/null | jq -r '.access_token // empty' 2>/dev/null || true)

    if [ -n "$KC_TOKEN" ] && [ "$KC_TOKEN" != "null" ]; then
      if curl -sf \
        -X POST \
        "${KEYCLOAK_URL}/admin/realms/hhh/partial-export?exportClients=true&exportGroupsAndRoles=true" \
        -H "Authorization: Bearer $KC_TOKEN" \
        -H "Content-Type: application/json" \
        -o "$BACKUP_DIR/$DATE/keycloak/hhh-realm.json" \
        2>/dev/null; then
        log "✓ Keycloak realm export completed"
      else
        KEYCLOAK_OK=false
        log_error "Keycloak" "Realm export API call failed"
      fi
    else
      KEYCLOAK_OK=false
      log_error "Keycloak" "Failed to obtain admin token (check KEYCLOAK_ADMIN_PASSWORD)"
    fi
  else
    log "⚠ Warning: KEYCLOAK_ADMIN_PASSWORD not set, skipping Keycloak realm export"
  fi

  if [ -n "$KC_DB_PASSWORD" ]; then
    if PGPASSWORD="$KC_DB_PASSWORD" pg_dump \
      -h "$KC_DB_HOST" \
      -U "$KC_DB_USERNAME" \
      -d keycloak \
      -F c \
      -f "$BACKUP_DIR/$DATE/keycloak/keycloak-db.dump" 2>/dev/null; then
      log "✓ Keycloak database dump completed"
    else
      KEYCLOAK_DB_OK=false
      log_error "Keycloak" "pg_dump of keycloak-db failed"
    fi
  else
    KEYCLOAK_DB_OK=false
    log "⚠ Warning: KC_DB_PASSWORD not set, skipping Keycloak database dump"
  fi
else
  log "⊘ Keycloak excluded from this backup (per trigger options)"
fi

# 5. Create unified backup archive
log "5/5 Creating unified backup archive..."
if tar -czf "$BACKUP_DIR/full_backup_$DATE.tar.gz" -C "$BACKUP_DIR/$DATE" . 2>/dev/null; then
  log "✓ Unified archive created"
else
  log_error "Archive" "Failed to create unified backup archive"
fi

# Calculate size (human-readable for the text manifest/log, exact bytes for JSON)
BACKUP_SIZE=$(du -sh "$BACKUP_DIR/full_backup_$DATE.tar.gz" 2>/dev/null | cut -f1)
BACKUP_SIZE_BYTES=$(wc -c < "$BACKUP_DIR/full_backup_$DATE.tar.gz" 2>/dev/null | tr -d ' ' || echo 0)
[ -n "$BACKUP_SIZE_BYTES" ] || BACKUP_SIZE_BYTES=0
DURATION_SECONDS=$(( $(date +%s) - START_TS ))

# Clean up temporary directory
rm -rf "$BACKUP_DIR/$DATE"

# Generate backup manifest — per-component flags reflect whether that
# component's own step actually succeeded, independent of unrelated errors
# (e.g. a Keycloak failure must not make the MongoDB line say "Check logs").
# A component the admin excluded via trigger options reports "Excluded", not
# "✗ Check logs" — it was never attempted, not failed.
component_status() {
  local included="$1" ok="$2"
  if [ "$included" != "true" ]; then
    echo "Excluded"
  elif [ "$ok" = true ]; then
    echo "✓"
  else
    echo "✗ Check logs"
  fi
}

cat > "$BACKUP_DIR/backup_$DATE.manifest" <<EOF
Backup Date: $(date -u +"%Y-%m-%d %H:%M:%S UTC")
Trigger: $BACKUP_TRIGGER
MongoDB: $(component_status "$INCLUDE_MONGO" "$MONGO_OK")
LightRAG: $(component_status "$INCLUDE_LIGHTRAG" "$LIGHTRAG_OK")
Neo4j: $(component_status "$INCLUDE_NEO4J" "$NEO4J_OK")
Keycloak realm: $([ "$INCLUDE_KEYCLOAK" != "true" ] && echo "Excluded" || ([ -z "$KEYCLOAK_ADMIN_PASSWORD" ] && echo "Skipped (no credentials)" || ([ "$KEYCLOAK_OK" = true ] && echo "✓" || echo "✗ Check logs")))
Keycloak database: $([ "$INCLUDE_KEYCLOAK" != "true" ] && echo "Excluded" || ([ -z "$KC_DB_PASSWORD" ] && echo "Skipped (no credentials)" || ([ "$KEYCLOAK_DB_OK" = true ] && echo "✓" || echo "✗ Check logs")))
Size: $BACKUP_SIZE
File: full_backup_$DATE.tar.gz
Retention: $RETENTION_DAYS days
Errors: $BACKUP_ERRORS
EOF

# Structured sidecar manifest — this is what any automation (the backup-api
# status endpoint) should read; never regex the human-readable log/manifest.
# keycloakOk/keycloakDbOk are reported separately (realm-config export vs. the
# actual Postgres dump) since either can fail independently; the admin UI
# combines them into one "Keycloak" badge. The *Included flags distinguish "the
# admin excluded this component" from "it ran and failed" — both older
# manifests (missing these fields) and every "Included" default to true so a
# component that isn't reported as excluded reads as included, as before this
# feature existed.
jq -n \
  --arg date "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
  --arg file "full_backup_$DATE.tar.gz" \
  --arg trigger "$BACKUP_TRIGGER" \
  --argjson sizeBytes "$BACKUP_SIZE_BYTES" \
  --argjson mongoOk "$([ "$MONGO_OK" = true ] && echo true || echo false)" \
  --argjson mongoIncluded "$([ "$INCLUDE_MONGO" = true ] && echo true || echo false)" \
  --argjson lightragOk "$([ "$LIGHTRAG_OK" = true ] && echo true || echo false)" \
  --argjson lightragIncluded "$([ "$INCLUDE_LIGHTRAG" = true ] && echo true || echo false)" \
  --argjson neo4jOk "$([ "$NEO4J_OK" = true ] && echo true || echo false)" \
  --argjson neo4jIncluded "$([ "$INCLUDE_NEO4J" = true ] && echo true || echo false)" \
  --argjson keycloakOk "$([ "$KEYCLOAK_OK" = true ] && echo true || echo false)" \
  --argjson keycloakSkipped "$([ -z "$KEYCLOAK_ADMIN_PASSWORD" ] && echo true || echo false)" \
  --argjson keycloakDbOk "$([ "$KEYCLOAK_DB_OK" = true ] && echo true || echo false)" \
  --argjson keycloakDbSkipped "$([ -z "$KC_DB_PASSWORD" ] && echo true || echo false)" \
  --argjson keycloakIncluded "$([ "$INCLUDE_KEYCLOAK" = true ] && echo true || echo false)" \
  --argjson retentionDays "$RETENTION_DAYS" \
  --argjson errors "$BACKUP_ERRORS" \
  --arg errorLog "$ERROR_LOG" \
  --argjson durationSeconds "$DURATION_SECONDS" \
  '{date:$date, file:$file, trigger:$trigger, sizeBytes:$sizeBytes, mongoOk:$mongoOk, mongoIncluded:$mongoIncluded, lightragOk:$lightragOk, lightragIncluded:$lightragIncluded, neo4jOk:$neo4jOk, neo4jIncluded:$neo4jIncluded, keycloakOk:$keycloakOk, keycloakSkipped:$keycloakSkipped, keycloakDbOk:$keycloakDbOk, keycloakDbSkipped:$keycloakDbSkipped, keycloakIncluded:$keycloakIncluded, retentionDays:$retentionDays, errors:$errors, errorLog:$errorLog, durationSeconds:$durationSeconds}' \
  > "$BACKUP_DIR/backup_$DATE.manifest.json"

# Report results
log ""
if [ $BACKUP_ERRORS -eq 0 ]; then
  log "✓ Backup completed successfully!"
  log "  File: full_backup_$DATE.tar.gz"
  log "  Size: $BACKUP_SIZE"
else
  log "⚠ Backup completed with $BACKUP_ERRORS error(s)"
  printf "%b" "$ERROR_LOG" | tee -a "$LOG_FILE"
  send_alert "⚠ Backup completed with errors:\n$ERROR_LOG\nFile: full_backup_$DATE.tar.gz" "FAILED"
fi

# Clean up old backups
log ""
log "Cleaning up backups older than $RETENTION_DAYS days..."
DELETED_COUNT=$(find "$BACKUP_DIR" -name "full_backup_*.tar.gz" -mtime +$RETENTION_DAYS -delete -print 2>/dev/null | wc -l)
DELETED_MANIFESTS=$(find "$BACKUP_DIR" -name "backup_*.manifest" -mtime +$RETENTION_DAYS -delete -print 2>/dev/null | wc -l)
find "$BACKUP_DIR" -name "backup_*.manifest.json" -mtime +$RETENTION_DAYS -delete 2>/dev/null || true
# Uploaded backups (via the admin UI) age out on the same retention policy.
find "$BACKUP_DIR" -name "uploaded_*.tar.gz" -mtime +$RETENTION_DAYS -delete 2>/dev/null || true
find "$BACKUP_DIR" -name "uploaded_*.manifest.json" -mtime +$RETENTION_DAYS -delete 2>/dev/null || true

if [ "$DELETED_COUNT" -gt 0 ]; then
  log "✓ Deleted $DELETED_COUNT old backup(s) and $DELETED_MANIFESTS manifest(s)"
else
  log "  No old backups to delete"
fi

# Cap scheduled (daily automatic) backups by count, using the same number as
# the time-based retention above — read the surviving sidecar manifests, sort
# by date descending, and delete anything past the newest $SCHEDULED_BACKUP_LIMIT.
# Manual and uploaded backups are untouched by this cap.
log ""
log "Enforcing max $SCHEDULED_BACKUP_LIMIT scheduled backups..."
DELETED_SCHEDULED=0
EXCESS_SCHEDULED=$(
  for m in "$BACKUP_DIR"/backup_*.manifest.json; do
    [ -f "$m" ] || continue
    jq -r 'select(.trigger == "scheduled") | [.date, .file] | @tsv' "$m" 2>/dev/null || true
  done | sort -r | tail -n +$((SCHEDULED_BACKUP_LIMIT + 1)) | cut -f2
)
if [ -n "$EXCESS_SCHEDULED" ]; then
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    stem="${f%.tar.gz}"
    stem="${stem#full_backup_}"
    rm -f "$BACKUP_DIR/$f" "$BACKUP_DIR/backup_${stem}.manifest" "$BACKUP_DIR/backup_${stem}.manifest.json"
    DELETED_SCHEDULED=$((DELETED_SCHEDULED + 1))
  done <<< "$EXCESS_SCHEDULED"
fi
if [ "$DELETED_SCHEDULED" -gt 0 ]; then
  log "✓ Deleted $DELETED_SCHEDULED excess scheduled backup(s) beyond the last $SCHEDULED_BACKUP_LIMIT"
else
  log "  No excess scheduled backups to delete"
fi

# ── Optional offsite sync (rclone) ──────────────────────────────────────────
# Set OFFSITE_REMOTE (e.g. "tu-s3:hhh-backups" or "sftp-backup:backups") to
# mirror the local backup directory to an offsite destination. The rclone
# config is mounted read-only at /config/rclone/rclone.conf (see compose).
# Backups on the same host as the databases are NOT disaster-safe on their own.
if [ -n "${OFFSITE_REMOTE:-}" ]; then
  log ""
  log "Syncing backups offsite to ${OFFSITE_REMOTE}..."
  if command -v rclone >/dev/null 2>&1; then
    if rclone sync "$BACKUP_DIR" "$OFFSITE_REMOTE" \
        --config /config/rclone/rclone.conf \
        --include "full_backup_*.tar.gz" --include "backup_*.manifest" \
        >> "$LOG_FILE" 2>&1; then
      log "✓ Offsite sync completed"
    else
      log "✗ Offsite sync FAILED"
      ERROR_LOG="${ERROR_LOG}Offsite sync to ${OFFSITE_REMOTE} failed\n"
      BACKUP_ERRORS=$((BACKUP_ERRORS + 1))
      send_alert "⚠ Offsite backup sync failed (${OFFSITE_REMOTE})" "FAILED"
    fi
  else
    log "✗ OFFSITE_REMOTE set but rclone is not installed"
    BACKUP_ERRORS=$((BACKUP_ERRORS + 1))
  fi
else
  log ""
  log "OFFSITE_REMOTE not set — backups remain on this host only (configure offsite sync for disaster safety)"
fi

# List current backups
log ""
log "Current backups:"
ls -lh "$BACKUP_DIR"/full_backup_*.tar.gz 2>/dev/null | tail -5 | while IFS= read -r line; do
  log "  $line"
done || log "  No backups found"

log ""
log "=========================================="
log "Backup finished: $(date)"
log "=========================================="

# Exit with error code if backups failed
exit $BACKUP_ERRORS
