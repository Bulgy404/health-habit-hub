#!/bin/bash
set -euo pipefail

BACKUP_FILE=$1
# Optional second arg: pass --skip-keycloak to skip the Keycloak realm
# reimport even if the archive contains one (used by the admin-UI restore
# flow for uploaded/foreign archives, where a malicious realm export is the
# single highest-blast-radius risk — Keycloak reimport there is opt-in).
SKIP_KEYCLOAK=false
if [ "${2:-}" = "--skip-keycloak" ]; then
  SKIP_KEYCLOAK=true
fi
RESTORE_DIR="/tmp/restore-$$"

# shellcheck source=./lib.sh
source "$(dirname "$0")/lib.sh"

if [ -z "$BACKUP_FILE" ]; then
  echo "Usage: docker compose run --rm backup /restore.sh <backup-file>"
  echo ""
  echo "Available backups:"
  ls -lh /backups/full_backup_*.tar.gz 2>/dev/null || echo "  No backups found"
  exit 1
fi

if [ ! -f "$BACKUP_FILE" ]; then
  echo "Error: Backup file not found: $BACKUP_FILE"
  exit 1
fi

echo "=========================================="
echo "WARNING: FULL SYSTEM RESTORE"
echo "=========================================="
echo "Restoring from: $(basename "$BACKUP_FILE")"
echo ""
echo "This operation will:"
echo "  - STOP and OVERWRITE MongoDB data"
echo "  - STOP and OVERWRITE LightRAG index"
echo "  - STOP and OVERWRITE Neo4j graph data"
echo "  - OVERWRITE Keycloak database and realm config (if backup present)"
echo "  - RESTART all affected containers"
echo ""
read -rp "Type 'YES' to continue: " confirm

if [ "$confirm" != "YES" ]; then
  echo "Restore cancelled."
  exit 0
fi

if ! acquire_lock; then
  echo "ERROR: Another backup or restore is already running — aborting."
  exit 1
fi
trap release_lock EXIT

echo ""
echo "Extracting backup archive..."
mkdir -p "$RESTORE_DIR"
# Combine with the lock-release trap set above so a corrupt/truncated archive
# (or any other failure past this point, under set -euo pipefail) still cleans
# up the partially-extracted directory instead of leaking it in /tmp.
trap 'release_lock; rm -rf "$RESTORE_DIR"' EXIT
tar -xzf "$BACKUP_FILE" -C "$RESTORE_DIR"
echo "✓ Archive extracted"

RESTORE_ERRORS=0

log_error() {
  local component="$1"
  local msg="$2"
  RESTORE_ERRORS=$((RESTORE_ERRORS + 1))
  echo "ERROR: $component - $msg"
}

# ── 1. MongoDB ────────────────────────────────────────────────────────────────

echo ""
echo "1/3 Restoring MongoDB..."
if [ -d "$RESTORE_DIR/mongo" ]; then
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
  if mongorestore \
    --config="$MONGO_CONF" \
    --drop \
    "$RESTORE_DIR/mongo" \
    --quiet 2>/dev/null; then
    echo "✓ MongoDB restored"
  else
    log_error "MongoDB" "mongorestore failed"
  fi
  rm -f "$MONGO_CONF"
else
  echo "Warning: No MongoDB backup found in archive"
fi

# ── 2. LightRAG index ─────────────────────────────────────────────────────────

echo ""
echo "2/3 Restoring LightRAG index..."
if [ -f "$RESTORE_DIR/lightrag-data.tar.gz" ] && [ -s "$RESTORE_DIR/lightrag-data.tar.gz" ]; then
  echo "  Stopping LightRAG..."
  if docker stop hhh-lightrag >/dev/null 2>&1; then
    sleep 2

    if docker run --rm \
      -v hhh-lightrag-data:/lightrag \
      -v "$RESTORE_DIR:/backup:ro" \
      alpine:latest \
      sh -c "rm -rf /lightrag/* && tar -xzf /backup/lightrag-data.tar.gz -C /lightrag/"; then
      echo "✓ LightRAG index restored"
    else
      log_error "LightRAG" "volume restore failed"
    fi

    echo "  Restarting LightRAG..."
    docker start hhh-lightrag >/dev/null 2>&1
    echo "✓ LightRAG restarted"
  else
    log_error "LightRAG" "failed to stop container"
  fi
else
  echo "Warning: No LightRAG backup found in archive"
fi

# ── 3. Neo4j ──────────────────────────────────────────────────────────────────

echo ""
echo "3/3 Restoring Neo4j..."
if [ -d "$RESTORE_DIR/neo4j" ] && [ -f "$RESTORE_DIR/neo4j/neo4j.dump" ]; then
  echo "  Stopping Neo4j..."
  if docker stop hhh-neo4j >/dev/null 2>&1; then
    sleep 2

    if docker run --rm \
      --volumes-from hhh-neo4j \
      -v "$RESTORE_DIR/neo4j:/backup:ro" \
      neo4j:5 \
      neo4j-admin database load neo4j --from-path=/backup --overwrite-destination=true 2>/dev/null; then
      echo "✓ Neo4j restored"
    else
      log_error "Neo4j" "neo4j-admin load failed"
    fi

    echo "  Restarting Neo4j..."
    docker start hhh-neo4j >/dev/null 2>&1
    echo "✓ Neo4j restarted"
  else
    log_error "Neo4j" "failed to stop container"
  fi
else
  echo "Warning: No Neo4j backup found in archive"
fi

# ── 4. Keycloak ───────────────────────────────────────────────────────────────
# Restores both the realm config (via admin API partialImport) and the actual
# Postgres database (via pg_restore) — the DB holds user accounts/credentials,
# which the realm export never contained. --skip-keycloak skips both.

echo ""
echo "Restoring Keycloak database (if backup present)..."
KC_DB_HOST="${KC_DB_HOST:-keycloak-db}"
KC_DB_USERNAME="${KC_DB_USERNAME:-keycloak}"
if [ "$SKIP_KEYCLOAK" = true ]; then
  echo "Skipped (--skip-keycloak requested)"
elif [ -f "$RESTORE_DIR/keycloak/keycloak-db.dump" ]; then
  if [ -n "${KC_DB_PASSWORD:-}" ]; then
    if PGPASSWORD="$KC_DB_PASSWORD" pg_restore \
      -h "$KC_DB_HOST" \
      -U "$KC_DB_USERNAME" \
      -d keycloak \
      --clean --if-exists \
      "$RESTORE_DIR/keycloak/keycloak-db.dump" 2>/dev/null; then
      echo "✓ Keycloak database restored"
    else
      log_error "Keycloak" "pg_restore of keycloak-db failed"
    fi
  else
    echo "Warning: KC_DB_PASSWORD not set, skipping Keycloak database restore"
  fi
else
  echo "Warning: No Keycloak database dump found in archive"
fi

echo ""
echo "Restoring Keycloak realm config (if backup present)..."
if [ "$SKIP_KEYCLOAK" = true ]; then
  echo "Skipped (--skip-keycloak requested)"
elif [ -f "$RESTORE_DIR/keycloak/hhh-realm.json" ]; then
  # See backup.sh for why this is a full base URL rather than a bare host —
  # prod mounts Keycloak under /auth, local dev doesn't.
  KEYCLOAK_URL="${KEYCLOAK_URL:-http://keycloak:8080}"
  KEYCLOAK_ADMIN="${KEYCLOAK_ADMIN:-admin}"

  if [ -n "${KEYCLOAK_ADMIN_PASSWORD:-}" ]; then
    # Credentials are piped to curl's stdin (--data @-) via a shell-builtin
    # printf instead of an inline -d argument, so they never appear in
    # `ps aux` / `/proc/<pid>/cmdline` for the curl subprocess.
    KC_TOKEN=$(printf 'client_id=admin-cli&grant_type=password&username=%s&password=%s' "$KEYCLOAK_ADMIN" "$KEYCLOAK_ADMIN_PASSWORD" | curl -sf -X POST \
      "${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token" \
      --data @- \
      2>/dev/null | jq -r '.access_token // empty' || true)

    if [ -n "$KC_TOKEN" ] && [ "$KC_TOKEN" != "null" ]; then
      if curl -sf -X POST \
        "${KEYCLOAK_URL}/admin/realms/hhh/partialImport" \
        -H "Authorization: Bearer $KC_TOKEN" \
        -H "Content-Type: application/json" \
        -d @"$RESTORE_DIR/keycloak/hhh-realm.json" \
        2>/dev/null; then
        echo "✓ Keycloak realm restored"
      else
        log_error "Keycloak" "partial import API call failed"
      fi
    else
      log_error "Keycloak" "failed to obtain admin token"
    fi
  else
    echo "Warning: KEYCLOAK_ADMIN_PASSWORD not set, skipping Keycloak restore"
  fi
else
  echo "Warning: No Keycloak backup found in archive"
fi

# ── Cleanup ───────────────────────────────────────────────────────────────────
# Handled by the `trap ... EXIT` set above (release_lock; rm -rf "$RESTORE_DIR"),
# which runs on every exit path, including a failed/corrupt tar extraction.

echo ""
echo "=========================================="
if [ $RESTORE_ERRORS -eq 0 ]; then
  echo "✓ Restore completed successfully!"
else
  echo "⚠ Restore completed with $RESTORE_ERRORS error(s) — check output above"
fi
echo "=========================================="
echo ""
echo "All affected containers have been restarted."

# Exit non-zero on any component failure — callers (including automation
# driving this script) must not treat a partial restore as a success.
exit $RESTORE_ERRORS
