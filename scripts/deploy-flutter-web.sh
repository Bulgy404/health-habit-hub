#!/usr/bin/env bash
# Build Flutter web and copy output to app/public/flutter/.
# Usage: ./scripts/deploy-flutter-web.sh [--dry-run]
set -euo pipefail

DRY_RUN=false
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MOBILE_DIR="$REPO_ROOT/mobile"
FLUTTER_OUT_DIR="$REPO_ROOT/app/public/flutter"

run() {
  if [ "$DRY_RUN" = true ]; then
    echo "[dry-run] $*"
  else
    "$@"
  fi
}

run_in_dir() {
  local dir="$1"
  shift
  if [ "$DRY_RUN" = true ]; then
    echo "[dry-run] (cd $dir && $*)"
  else
    (cd "$dir" && "$@")
  fi
}

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    *) echo "Unknown argument: $arg" >&2; exit 1 ;;
  esac
done

echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] Building Flutter web..."
run_in_dir "$MOBILE_DIR" flutter build web

echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] Copying build output to $FLUTTER_OUT_DIR..."
if [ "$DRY_RUN" = true ]; then
  echo "[dry-run] mkdir -p $FLUTTER_OUT_DIR"
  echo "[dry-run] cp -r $MOBILE_DIR/build/web/ $FLUTTER_OUT_DIR/"
else
  mkdir -p "$FLUTTER_OUT_DIR"
  cp -r "$MOBILE_DIR/build/web/." "$FLUTTER_OUT_DIR/"
fi

echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] Flutter web deployed successfully."
