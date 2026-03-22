#!/usr/bin/env bash
# Deploy the Python recommender service.
# Usage: ./scripts/deploy-recommender.sh [--dry-run]
set -euo pipefail

DRY_RUN=false

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

echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] Deploying recommender service..."
run docker compose build recommender
run docker compose up -d recommender

echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] Recommender deployed successfully."
