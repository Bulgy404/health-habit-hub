#!/usr/bin/env bash
# Deploy the Node.js backend (h3-app) service.
# Usage: ./scripts/deploy-backend.sh [--dry-run]
set -euo pipefail

DRY_RUN=false
HEALTH_URL="${HEALTH_URL:-http://localhost:3000/api/v1/health}"
HEALTH_TIMEOUT=60

run() {
  if [ "$DRY_RUN" = true ]; then
    echo "[dry-run] $*"
  else
    "$@"
  fi
}

wait_healthy() {
  local url="$1"
  local timeout="$2"
  local elapsed=0
  echo "Waiting for health check at $url (timeout: ${timeout}s)..."
  while [ "$elapsed" -lt "$timeout" ]; do
    if curl -sf "$url" 2>/dev/null | grep -q '"status":"ok"'; then
      echo "Health check passed."
      return 0
    fi
    sleep 2
    elapsed=$((elapsed + 2))
  done
  echo "ERROR: Health check timed out after ${timeout}s" >&2
  return 1
}

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    *) echo "Unknown argument: $arg" >&2; exit 1 ;;
  esac
done

echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] Deploying backend (app)..."
run docker compose build app
run docker compose up -d app

if [ "$DRY_RUN" = true ]; then
  echo "[dry-run] Would wait for health check at $HEALTH_URL"
else
  wait_healthy "$HEALTH_URL" "$HEALTH_TIMEOUT"
fi

echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] Backend deployed successfully."
