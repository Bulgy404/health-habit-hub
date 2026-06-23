#!/bin/sh
set -e

export LLM_BINDING_HOST="${LLM_API_BASE:-https://api.openai.com/v1}"
export LLM_BINDING_API_KEY="${LLM_API_KEY}"
export EMBEDDING_BINDING_HOST="${EMBEDDING_API_BASE:-${LLM_API_BASE:-https://api.openai.com/v1}}"
export EMBEDDING_BINDING_API_KEY="${EMBEDDING_API_KEY:-${LLM_API_KEY}}"
# Allow a dedicated model for LightRAG extraction, independent of the main LLM_MODEL
export LLM_MODEL="${LIGHTRAG_LLM_MODEL:-${LLM_MODEL}}"

lightrag-server \
  --host 0.0.0.0 \
  --port 9621 \
  --working-dir /app/data \
  --llm-binding openai \
  --embedding-binding openai \
  --log-level INFO \
  --timeout 3600 \
  --max-async 4 &

SERVER_PID=$!

# Wait for server to accept connections
echo "[seed] Waiting for LightRAG to be ready..."
until curl -sf -H "X-API-Key: ${LIGHTRAG_API_KEY}" http://localhost:9621/documents >/dev/null 2>&1; do
  sleep 2
done
echo "[seed] LightRAG ready."

# Trigger a scan of /app/inputs so LightRAG picks up any new PDFs.
# LightRAG deduplicates by content hash, so already-indexed files are skipped.
if ls /app/inputs/*.pdf >/dev/null 2>&1; then
  echo "[seed] Triggering document scan..."
  curl -sf -X POST \
    -H "X-API-Key: ${LIGHTRAG_API_KEY}" \
    http://localhost:9621/documents/scan \
    && echo "[seed] Scan queued — indexing runs in background" \
    || echo "[seed] Scan request failed"
else
  echo "[seed] No PDFs found in /app/inputs — skipping seed."
fi

wait "$SERVER_PID"
