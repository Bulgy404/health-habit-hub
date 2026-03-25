#!/usr/bin/env bash
# Import HHH realm into Keycloak via admin API and restart the service.
# Usage: ./scripts/deploy-keycloak.sh [--dry-run]
# Requires: KEYCLOAK_ADMIN and KEYCLOAK_ADMIN_PASSWORD env vars (or values from stack.env)
set -euo pipefail

DRY_RUN=false
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REALM_FILE="$REPO_ROOT/keycloak/hhh-realm.json"
USER_PROFILE_FILE="$REPO_ROOT/keycloak/hhh-user-profile.json"
KEYCLOAK_URL="${KEYCLOAK_URL:-http://localhost:8080}"
KEYCLOAK_ADMIN="${KEYCLOAK_ADMIN:-admin}"
KEYCLOAK_ADMIN_PASSWORD="${KEYCLOAK_ADMIN_PASSWORD:-}"
KEYCLOAK_ADMIN_CLIENT_SECRET="${KEYCLOAK_ADMIN_CLIENT_SECRET:-}"

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
  echo "[dry-run] Apply user profile schema from $USER_PROFILE_FILE via ${KEYCLOAK_URL}/admin/realms/hhh/users/profile"
  echo "[dry-run] Align hhh-backend client secret and grant realm-management realm-admin to its service account"
  echo "[dry-run] docker compose restart keycloak"
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

if [ ! -f "$USER_PROFILE_FILE" ]; then
  echo "ERROR: User profile file not found: $USER_PROFILE_FILE" >&2
  exit 1
fi

echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] Obtaining Keycloak admin token..."
TOKEN=$(curl -sf -X POST \
  "${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "client_id=admin-cli&grant_type=password&username=${KEYCLOAK_ADMIN}&password=${KEYCLOAK_ADMIN_PASSWORD}" \
  | jq -r '.access_token')

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

echo "Applying bare-user profile schema..."
curl -sf -X PUT \
  "${KEYCLOAK_URL}/admin/realms/hhh/users/profile" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "@$USER_PROFILE_FILE"
echo "User profile schema applied."

BACKEND_CLIENT_ID=$(curl -sf \
  -H "Authorization: Bearer $TOKEN" \
  "${KEYCLOAK_URL}/admin/realms/hhh/clients?clientId=hhh-backend" \
  | jq -r '.[0].id')

if [ -z "$BACKEND_CLIENT_ID" ] || [ "$BACKEND_CLIENT_ID" = "null" ]; then
  echo "ERROR: Failed to resolve hhh-backend client ID" >&2
  exit 1
fi

if [ -n "$KEYCLOAK_ADMIN_CLIENT_SECRET" ]; then
  echo "Aligning hhh-backend client secret from KEYCLOAK_ADMIN_CLIENT_SECRET..."
  curl -sf -X PUT \
    "${KEYCLOAK_URL}/admin/realms/hhh/clients/${BACKEND_CLIENT_ID}" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "$(curl -sf \
      -H "Authorization: Bearer $TOKEN" \
      "${KEYCLOAK_URL}/admin/realms/hhh/clients/${BACKEND_CLIENT_ID}" \
      | jq --arg secret "$KEYCLOAK_ADMIN_CLIENT_SECRET" '.secret = $secret')"
  echo "hhh-backend client secret aligned."
else
  echo "WARNING: KEYCLOAK_ADMIN_CLIENT_SECRET not set; skipping hhh-backend secret alignment."
fi

SERVICE_ACCOUNT_USER_ID=$(curl -sf \
  -H "Authorization: Bearer $TOKEN" \
  "${KEYCLOAK_URL}/admin/realms/hhh/clients/${BACKEND_CLIENT_ID}/service-account-user" \
  | jq -r '.id')
REALM_MANAGEMENT_CLIENT_ID=$(curl -sf \
  -H "Authorization: Bearer $TOKEN" \
  "${KEYCLOAK_URL}/admin/realms/hhh/clients?clientId=realm-management" \
  | jq -r '.[0].id')
REALM_ADMIN_ROLE=$(curl -sf \
  -H "Authorization: Bearer $TOKEN" \
  "${KEYCLOAK_URL}/admin/realms/hhh/clients/${REALM_MANAGEMENT_CLIENT_ID}/roles/realm-admin")

echo "Granting realm-management realm-admin to the hhh-backend service account..."
curl -sf -X POST \
  "${KEYCLOAK_URL}/admin/realms/hhh/users/${SERVICE_ACCOUNT_USER_ID}/role-mappings/clients/${REALM_MANAGEMENT_CLIENT_ID}" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "[$REALM_ADMIN_ROLE]" \
  >/dev/null || true
echo "hhh-backend service account role ensured."

echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] Restarting Keycloak service..."
docker compose restart keycloak

echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] Keycloak deployed successfully."
