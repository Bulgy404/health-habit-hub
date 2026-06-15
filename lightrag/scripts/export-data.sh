#!/bin/sh
# Copy pre-built LightRAG data out of the running container so it can be
# committed to git and baked into future image builds.
#
# Run this after all PDFs in lightrag/knowledge/ have finished processing:
#   ./lightrag/scripts/export-data.sh
#
# Then commit lightrag/data/ — the next docker build will ship with the
# knowledge base pre-built, so cold starts require no LLM calls.

set -e

CONTAINER="${LIGHTRAG_CONTAINER:-h3-2-lightrag}"
OUT_DIR="$(dirname "$0")/../data"

echo "Exporting LightRAG data from $CONTAINER → $OUT_DIR"
docker cp "$CONTAINER:/app/data/." "$OUT_DIR/"
echo "Done. Commit lightrag/data/ to enable pre-built cold starts."
