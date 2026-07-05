#!/usr/bin/env bash
set -euo pipefail

# Verifies that the hhh-flutter OIDC client has the required default scopes so
# access tokens always contain stable identity claims (especially `sub`).
#
# Note:
# - `openid` is requested explicitly by app token requests (onboard/restore).
# - On newer Keycloak versions, `openid` may not be exposed as a regular
#   default-client-scope entry in this endpoint.
#
# Usage:
#   scripts/verify-keycloak-claims.sh
#   scripts/verify-keycloak-claims.sh --fix
#
# Environment:
#   Reads KEYCLOAK_ADMIN and KEYCLOAK_ADMIN_PASSWORD from .env

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ ! -f .env ]]; then
  echo "ERROR: .env not found in repository root." >&2
  exit 1
fi

set -a
source .env
set +a

: "${KEYCLOAK_ADMIN:?KEYCLOAK_ADMIN is required in .env}"
: "${KEYCLOAK_ADMIN_PASSWORD:?KEYCLOAK_ADMIN_PASSWORD is required in .env}"

KC_CONTAINER="${KC_CONTAINER:-hhh-keycloak}"
KC_SERVER="${KC_SERVER:-http://localhost:8080}"
KC_REALM="${KC_REALM:-hhh}"
KC_CLIENT_ID="${KC_CLIENT_ID:-hhh-flutter}"

required_scopes=("basic" "profile" "email" "roles")
fix_mode=false
if [[ "${1:-}" == "--fix" ]]; then
  fix_mode=true
fi

echo "Verifying Keycloak default scopes for client '$KC_CLIENT_ID' in realm '$KC_REALM'..."

docker exec "$KC_CONTAINER" /opt/keycloak/bin/kcadm.sh config credentials \
  --server "$KC_SERVER" \
  --realm master \
  --user "$KEYCLOAK_ADMIN" \
  --password "$KEYCLOAK_ADMIN_PASSWORD" >/dev/null

client_json="$(
  docker exec "$KC_CONTAINER" /opt/keycloak/bin/kcadm.sh get clients \
    -r "$KC_REALM" \
    -q clientId="$KC_CLIENT_ID"
)"

client_id="$(echo "$client_json" | sed -n 's/.*"id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n1)"

if [[ -z "$client_id" ]]; then
  echo "ERROR: Could not resolve client id for '$KC_CLIENT_ID' in realm '$KC_REALM'." >&2
  exit 1
fi

scopes_json="$(
  docker exec "$KC_CONTAINER" /opt/keycloak/bin/kcadm.sh get "clients/${client_id}/default-client-scopes" \
    -r "$KC_REALM"
)"

missing=()
for scope in "${required_scopes[@]}"; do
  if ! echo "$scopes_json" | grep -q "\"name\"[[:space:]]*:[[:space:]]*\"${scope}\""; then
    missing+=("$scope")
  fi
done

if [[ ${#missing[@]} -gt 0 && "$fix_mode" == true ]]; then
  echo "Applying auto-fix for missing scopes: ${missing[*]}"
  for scope in "${missing[@]}"; do
    scope_json="$(
      docker exec "$KC_CONTAINER" /opt/keycloak/bin/kcadm.sh get client-scopes \
        -r "$KC_REALM" \
        -q name="$scope"
    )"
    scope_id="$(echo "$scope_json" | sed -n 's/.*"id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n1)"
    if [[ -z "$scope_id" ]]; then
      echo "ERROR: Could not resolve client scope id for '$scope'." >&2
      exit 1
    fi
    docker exec "$KC_CONTAINER" /opt/keycloak/bin/kcadm.sh update \
      "clients/${client_id}/default-client-scopes/${scope_id}" \
      -r "$KC_REALM" >/dev/null
    echo "Added default scope '$scope'."
  done

  scopes_json="$(
    docker exec "$KC_CONTAINER" /opt/keycloak/bin/kcadm.sh get "clients/${client_id}/default-client-scopes" \
      -r "$KC_REALM"
  )"
  missing=()
  for scope in "${required_scopes[@]}"; do
    if ! echo "$scopes_json" | grep -q "\"name\"[[:space:]]*:[[:space:]]*\"${scope}\""; then
      missing+=("$scope")
    fi
  done
fi

if [[ ${#missing[@]} -gt 0 ]]; then
  echo "ERROR: Missing required default scopes on '$KC_CLIENT_ID': ${missing[*]}" >&2
  if [[ "$fix_mode" == true ]]; then
    echo "Auto-fix attempted but some scopes are still missing." >&2
  else
    echo "Run: make fix-keycloak" >&2
  fi
  echo "Expected source of truth: keycloak/hhh-realm.json" >&2
  exit 1
fi

echo "OK: '$KC_CLIENT_ID' default scopes include: ${required_scopes[*]}"
