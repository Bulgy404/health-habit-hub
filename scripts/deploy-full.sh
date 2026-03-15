#!/usr/bin/env bash
# Full-stack deploy orchestrator: deploys all services in order with health checks.
# Usage: ./scripts/deploy-full.sh [--dry-run]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HEALTH_URL="${HEALTH_URL:-http://localhost:3000/api/v1/health}"
HEALTH_TIMEOUT=60
DRY_RUN=false
DRY_RUN_FLAG=""

ts() {
  date -u '+%Y-%m-%dT%H:%M:%SZ'
}

log() {
  echo "[$(ts)] $*"
}

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true; DRY_RUN_FLAG="--dry-run" ;;
    *) echo "Unknown argument: $arg" >&2; exit 1 ;;
  esac
done

# Warn if git tag not bumped since last deploy
check_version_bump() {
  local changelog="${SCRIPT_DIR}/../CHANGELOG.md"
  if [ ! -f "$changelog" ]; then
    echo "WARN: CHANGELOG.md not found — skipping version bump check." >&2
    return
  fi

  # Extract the latest version from CHANGELOG.md (e.g. ## [1.2.3] or ## 1.2.3)
  local changelog_version
  changelog_version=$(grep -oE '\[?[0-9]+\.[0-9]+\.[0-9]+\]?' "$changelog" | head -1 | tr -d '[]')

  if [ -z "$changelog_version" ]; then
    echo "WARN: Could not parse version from CHANGELOG.md — skipping version bump check." >&2
    return
  fi

  # Check if a git tag matches this version (with or without 'v' prefix)
  local tag_exists=false
  if git -C "${SCRIPT_DIR}/.." tag --list "v${changelog_version}" "v${changelog_version}" 2>/dev/null | grep -q .; then
    tag_exists=true
  elif git -C "${SCRIPT_DIR}/.." tag --list "${changelog_version}" 2>/dev/null | grep -q .; then
    tag_exists=true
  fi

  if [ "$tag_exists" = false ]; then
    echo "WARN: CHANGELOG.md version ${changelog_version} has no matching git tag (v${changelog_version}). Consider tagging before deploying." >&2
  else
    log "Version ${changelog_version} is tagged — OK."
  fi
}

wait_healthy() {
  local url="$1"
  local timeout="$2"
  local elapsed=0
  log "Polling health check at ${url} (timeout: ${timeout}s)..."
  while [ "$elapsed" -lt "$timeout" ]; do
    if curl -sf "$url" 2>/dev/null | grep -q '"status":"ok"'; then
      log "Health check passed."
      return 0
    fi
    sleep 2
    elapsed=$((elapsed + 2))
  done
  echo "ERROR: Health check timed out after ${timeout}s" >&2
  return 1
}

run_step() {
  local step_name="$1"
  local script="$2"
  log "=== Step: ${step_name} ==="
  if [ "$DRY_RUN" = true ]; then
    bash "$script" --dry-run
  else
    bash "$script"
  fi
  log "=== ${step_name} complete ==="
}

log "Starting full-stack deployment${DRY_RUN:+ (dry-run)}..."

check_version_bump

# 1. Deploy backend
run_step "Backend" "${SCRIPT_DIR}/deploy-backend.sh"

# Health check after backend
if [ "$DRY_RUN" = true ]; then
  log "[dry-run] Would poll health check at ${HEALTH_URL}"
else
  wait_healthy "$HEALTH_URL" "$HEALTH_TIMEOUT"
fi

# 2. Deploy Keycloak
run_step "Keycloak" "${SCRIPT_DIR}/deploy-keycloak.sh"

# Health check
if [ "$DRY_RUN" = true ]; then
  log "[dry-run] Would poll health check at ${HEALTH_URL}"
else
  wait_healthy "$HEALTH_URL" "$HEALTH_TIMEOUT"
fi

# 3. Deploy recommender
run_step "Recommender" "${SCRIPT_DIR}/deploy-recommender.sh"

# Health check
if [ "$DRY_RUN" = true ]; then
  log "[dry-run] Would poll health check at ${HEALTH_URL}"
else
  wait_healthy "$HEALTH_URL" "$HEALTH_TIMEOUT"
fi

# 4. Deploy Flutter web
run_step "Flutter Web" "${SCRIPT_DIR}/deploy-flutter-web.sh"

log "Full-stack deployment complete."
