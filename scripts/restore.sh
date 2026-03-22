#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/backups}"
KEYCLOAK_HOST="${KEYCLOAK_HOST:-keycloak}"
KEYCLOAK_ADMIN="${KEYCLOAK_ADMIN:-admin}"
KEYCLOAK_ADMIN_PASSWORD="${KEYCLOAK_ADMIN_PASSWORD:-}"

TIMESTAMP="${1:-}"

if [ -z "$TIMESTAMP" ]; then
  echo "Usage: $0 <timestamp>"
  echo "  timestamp: backup date string, e.g. 20260315_120000"
  echo ""
  echo "Available backups:"
  ls "$BACKUP_DIR"/full_backup_*.tar.gz 2>/dev/null | sed 's|.*full_backup_||;s|\.tar\.gz||' || echo "  (none found)"
  exit 1
fi

ARCHIVE="$BACKUP_DIR/full_backup_${TIMESTAMP}.tar.gz"

if [ ! -f "$ARCHIVE" ]; then
  echo "ERROR: Backup archive not found: $ARCHIVE"
  exit 1
fi

# Confirmation prompt
echo "Restore from ${TIMESTAMP}? This will overwrite current data. [y/N]"
read -r CONFIRM
if [ "$CONFIRM" != "y" ] && [ "$CONFIRM" != "Y" ]; then
  echo "Restore cancelled."
  exit 0
fi

WORK_DIR=$(mktemp -d)
trap 'rm -rf "$WORK_DIR"' EXIT

echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] Extracting backup archive..."
tar -xzf "$ARCHIVE" -C "$WORK_DIR"

# 1. Restore MongoDB
echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] 1/3 Restoring MongoDB..."
if [ -d "$WORK_DIR/mongo" ]; then
  mongorestore \
    --host=mongo:27017 \
    --username="${MONGO_USER:-}" \
    --password="${MONGO_PASSWORD:-}" \
    --authenticationDatabase=admin \
    --drop \
    "$WORK_DIR/mongo" \
    --quiet 2>/dev/null
  echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] ✓ MongoDB restored"
else
  echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] ⚠ Warning: mongo/ directory not found in backup, skipping"
fi

# 2. Restore Neo4j
echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] 2/3 Restoring Neo4j..."
if [ -f "$WORK_DIR/neo4j/neo4j.dump" ]; then
  # Stop Neo4j for restore
  echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')]   Stopping Neo4j..."
  docker stop h3-neo4j >/dev/null 2>&1 || true
  sleep 2

  # Copy dump file into a Docker volume
  docker volume create neo4j-restore-temp >/dev/null 2>&1 || true
  docker run --rm \
    -v neo4j-restore-temp:/restore \
    -v "$WORK_DIR/neo4j":/source:ro \
    alpine:latest \
    cp /source/neo4j.dump /restore/neo4j.dump

  # Run neo4j-admin load
  docker run --rm \
    --volumes-from h3-neo4j \
    -v neo4j-restore-temp:/restore:ro \
    neo4j:5 \
    neo4j-admin database load neo4j --from-path=/restore --overwrite-destination=true 2>/dev/null

  docker volume rm neo4j-restore-temp >/dev/null 2>&1 || true

  # Restart Neo4j
  echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')]   Restarting Neo4j..."
  docker start h3-neo4j >/dev/null 2>&1 || true
  echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] ✓ Neo4j restored"
else
  echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] ⚠ Warning: neo4j/neo4j.dump not found in backup, skipping"
fi

# 3. Restore Keycloak realm
echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] 3/3 Restoring Keycloak realm..."
if [ -f "$WORK_DIR/keycloak/hhh-realm.json" ]; then
  if [ -n "$KEYCLOAK_ADMIN_PASSWORD" ]; then
    KC_TOKEN=$(curl -sf -X POST \
      "http://${KEYCLOAK_HOST}:8080/realms/master/protocol/openid-connect/token" \
      -d "client_id=admin-cli&grant_type=password&username=${KEYCLOAK_ADMIN}&password=${KEYCLOAK_ADMIN_PASSWORD}" \
      2>/dev/null | jq -r '.access_token // empty' 2>/dev/null || true)

    if [ -n "$KC_TOKEN" ] && [ "$KC_TOKEN" != "null" ]; then
      # Delete existing hhh realm then re-import
      curl -sf -X DELETE \
        "http://${KEYCLOAK_HOST}:8080/admin/realms/hhh" \
        -H "Authorization: Bearer $KC_TOKEN" \
        2>/dev/null || true

      curl -sf -X POST \
        "http://${KEYCLOAK_HOST}:8080/admin/realms" \
        -H "Authorization: Bearer $KC_TOKEN" \
        -H "Content-Type: application/json" \
        -d "@$WORK_DIR/keycloak/hhh-realm.json" \
        2>/dev/null
      echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] ✓ Keycloak realm restored"
    else
      echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] ERROR: Could not obtain Keycloak admin token"
      exit 1
    fi
  else
    echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] ⚠ Warning: KEYCLOAK_ADMIN_PASSWORD not set, skipping Keycloak restore"
  fi
else
  echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] ⚠ Warning: keycloak/hhh-realm.json not found in backup, skipping"
fi

echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] =========================================="
echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] Restore from ${TIMESTAMP} completed."
echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] =========================================="
