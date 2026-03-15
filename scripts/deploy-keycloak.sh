#!/usr/bin/env bash
# Import HHH realm into Keycloak via admin API and restart the service.
# Usage: ./scripts/deploy-keycloak.sh [--dry-run]
# Requires: KEYCLOAK_ADMIN and KEYCLOAK_ADMIN_PASSWORD env vars (or values from stack.env)
set -euo pipefail

DRY_RUN=false
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REALM_FILE="$REPO_ROOT/keycloak/hhh-realm.json"
KEYCLOAK_URL="${KEYCLOAK_URL:-http://localhost:8080}"
KEYCLOAK_ADMIN="${KEYCLOAK_ADMIN:-admin}"
KEYCLOAK_ADMIN_PASSWORD="${KEYCLOAK_ADMIN_PASSWORD:-}"

run() {
  if [ "$DRY_RUN" = true ]; then
    echo "[dry-run] $*"
  else
    "$@"
  fi
}

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    *) echo "Unknown argument: $arg" >&2; exit 1 ;;
  esac
done

if [ "$DRY_RUN" = true ]; then
  echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] Deploying Keycloak (dry-run)..."
  echo "[dry-run] Get admin token from ${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token"
  echo "[dry-run] Import/update realm 'hhh' from $REALM_FILE via ${KEYCLOAK_URL}/admin/realms"
  echo "[dry-run] docker-compose restart keycloak"
  echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] Keycloak deployment complete (dry-run)."
  exit 0
fi

if [ -z "$KEYCLOAK_ADMIN_PASSWORD" ]; then
  echo "ERROR: KEYCLOAK_ADMIN_PASSWORD is not set" >&2
  exit 1
fi

if [ ! -f "$REALM_FILE" ]; then
  echo "ERROR: Realm file not found: $REALM_FILE" >&2
  exit 1
fi

echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] Obtaining Keycloak admin token..."
TOKEN=$(curl -sf -X POST \
  "${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "client_id=admin-cli&grant_type=password&username=${KEYCLOAK_ADMIN}&password=${KEYCLOAK_ADMIN_PASSWORD}" \
  | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo "ERROR: Failed to obtain Keycloak admin token" >&2
  exit 1
fi

echo "Admin token obtained."

# Check whether realm already exists
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer $TOKEN" \
  "${KEYCLOAK_URL}/admin/realms/hhh")

if [ "$HTTP_STATUS" = "200" ]; then
  echo "Realm 'hhh' exists — updating..."
  curl -sf -X PUT \
    "${KEYCLOAK_URL}/admin/realms/hhh" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "@$REALM_FILE"
  echo "Realm updated."
else
  echo "Realm 'hhh' not found (HTTP $HTTP_STATUS) — creating..."
  curl -sf -X POST \
    "${KEYCLOAK_URL}/admin/realms" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "@$REALM_FILE"
  echo "Realm created."
fi

echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] Restarting Keycloak service..."
docker-compose restart keycloak

echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] Keycloak deployed successfully."
