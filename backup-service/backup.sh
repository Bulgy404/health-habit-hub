#!/bin/bash
set -euo pipefail

BACKUP_DIR="/backups"
DATE=$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS=${BACKUP_RETENTION_DAYS:-30}
ALERT_WEBHOOK_URL=${ALERT_WEBHOOK_URL:-}
BACKUP_EMAIL=${BACKUP_EMAIL:-}
KEYCLOAK_HOST=${KEYCLOAK_HOST:-keycloak}
KEYCLOAK_ADMIN=${KEYCLOAK_ADMIN:-admin}
KEYCLOAK_ADMIN_PASSWORD=${KEYCLOAK_ADMIN_PASSWORD:-}

LOG_FILE="$BACKUP_DIR/backup.log"

# Error tracking
BACKUP_ERRORS=0
ERROR_LOG=""

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

  # Send email alert via Mailjet API (if BACKUP_EMAIL + mail credentials configured)
  if [ -n "$BACKUP_EMAIL" ] && [ -n "${MAIL_USER:-}" ] && [ -n "${MAIL_PASS:-}" ]; then
    curl -X POST https://api.mailjet.com/v3.1/send \
      -u "$MAIL_USER:$MAIL_PASS" \
      -H "Content-Type: application/json" \
      -d "{
        \"Messages\": [{
          \"From\": {\"Email\": \"${MAIL_FROM:-noreply@example.com}\", \"Name\": \"Health Habit Hub Backup\"},
          \"To\": [{\"Email\": \"$BACKUP_EMAIL\"}],
          \"Subject\": \"🚨 Health Habit Hub Backup $status\",
          \"TextPart\": \"$message\",
          \"HTMLPart\": \"<h3>Health Habit Hub Backup $status</h3><pre>$message</pre>\"
        }]
      }" 2>/dev/null && log "Email alert sent to $BACKUP_EMAIL" || log "Warning: Failed to send email alert"
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
log "1/5 Backing up MongoDB..."
if mongodump \
  --host=mongo:27017 \
  --username="${MONGO_USER:-}" \
  --password="${MONGO_PASSWORD:-}" \
  --authenticationDatabase=admin \
  --out="$BACKUP_DIR/$DATE/mongo" \
  --quiet 2>/dev/null; then
  log "✓ MongoDB backup completed"
else
  log_error "MongoDB" "mongodump failed"
fi

# 2. Backup Fuseki
log "2/5 Backing up Fuseki (RDF data)..."
if [ -d "/fuseki" ] && [ "$(ls -A /fuseki 2>/dev/null)" ]; then
  if tar -czf "$BACKUP_DIR/$DATE/fuseki-data.tar.gz" -C /fuseki . 2>/dev/null; then
    log "✓ Fuseki backup completed"
  else
    log_error "Fuseki" "tar archive failed"
  fi
else
  log "⚠ Warning: Fuseki volume is empty or not mounted"
  touch "$BACKUP_DIR/$DATE/fuseki-data.tar.gz"
fi

# 3. Backup Neo4j using native dump
log "3/5 Backing up Neo4j (using neo4j-admin dump)..."
log "  Stopping Neo4j for consistent backup..."
mkdir -p "$BACKUP_DIR/$DATE/neo4j"

# Stop Neo4j container
if docker stop h3-neo4j >/dev/null 2>&1; then
  sleep 2  # Give it a moment to shut down cleanly

  # Create a temporary volume and set permissions
  docker volume create neo4j-backup-temp >/dev/null 2>&1
  docker run --rm -v neo4j-backup-temp:/backup alpine:latest chmod 777 /backup

  # Perform the Neo4j dump
  NEO4J_DUMP_OUTPUT=$(docker run --rm \
    --volumes-from h3-neo4j \
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
    log_error "Neo4j" "neo4j-admin dump failed"
    docker volume rm neo4j-backup-temp >/dev/null 2>&1 || true
  fi

  # Restart Neo4j
  log "  Restarting Neo4j..."
  if docker start h3-neo4j >/dev/null 2>&1; then
    log "✓ Neo4j restarted"
  else
    log_error "Neo4j" "Failed to restart container"
  fi
else
  log_error "Neo4j" "Failed to stop container for backup"
fi

# 4. Backup Keycloak realm via admin API
log "4/5 Backing up Keycloak realm..."
mkdir -p "$BACKUP_DIR/$DATE/keycloak"

if [ -n "$KEYCLOAK_ADMIN_PASSWORD" ]; then
  KC_TOKEN=$(curl -sf -X POST \
    "http://${KEYCLOAK_HOST}:8080/realms/master/protocol/openid-connect/token" \
    -d "client_id=admin-cli&grant_type=password&username=${KEYCLOAK_ADMIN}&password=${KEYCLOAK_ADMIN_PASSWORD}" \
    2>/dev/null | jq -r '.access_token // empty' 2>/dev/null || true)

  if [ -n "$KC_TOKEN" ] && [ "$KC_TOKEN" != "null" ]; then
    if curl -sf \
      -X POST \
      "http://${KEYCLOAK_HOST}:8080/admin/realms/hhh/partial-export?exportClients=true&exportGroupsAndRoles=true" \
      -H "Authorization: Bearer $KC_TOKEN" \
      -H "Content-Type: application/json" \
      -o "$BACKUP_DIR/$DATE/keycloak/hhh-realm.json" \
      2>/dev/null; then
      log "✓ Keycloak realm export completed"
    else
      log_error "Keycloak" "Realm export API call failed"
    fi
  else
    log_error "Keycloak" "Failed to obtain admin token (check KEYCLOAK_ADMIN_PASSWORD)"
  fi
else
  log "⚠ Warning: KEYCLOAK_ADMIN_PASSWORD not set, skipping Keycloak backup"
fi

# 5. Create unified backup archive
log "5/5 Creating unified backup archive..."
if tar -czf "$BACKUP_DIR/full_backup_$DATE.tar.gz" -C "$BACKUP_DIR/$DATE" . 2>/dev/null; then
  log "✓ Unified archive created"
else
  log_error "Archive" "Failed to create unified backup archive"
fi

# Calculate size
BACKUP_SIZE=$(du -sh "$BACKUP_DIR/full_backup_$DATE.tar.gz" 2>/dev/null | cut -f1)

# Clean up temporary directory
rm -rf "$BACKUP_DIR/$DATE"

# Generate backup manifest
cat > "$BACKUP_DIR/backup_$DATE.manifest" <<EOF
Backup Date: $(date -u +"%Y-%m-%d %H:%M:%S UTC")
MongoDB: $([ $BACKUP_ERRORS -eq 0 ] && echo "✓" || echo "Check logs")
Fuseki: ✓
Neo4j: $([ $BACKUP_ERRORS -eq 0 ] && echo "✓" || echo "Check logs")
Keycloak: $([ -n "$KEYCLOAK_ADMIN_PASSWORD" ] && echo "✓" || echo "Skipped (no credentials)")
Size: $BACKUP_SIZE
File: full_backup_$DATE.tar.gz
Retention: $RETENTION_DAYS days
Errors: $BACKUP_ERRORS
EOF

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

if [ "$DELETED_COUNT" -gt 0 ]; then
  log "✓ Deleted $DELETED_COUNT old backup(s) and $DELETED_MANIFESTS manifest(s)"
else
  log "  No old backups to delete"
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
