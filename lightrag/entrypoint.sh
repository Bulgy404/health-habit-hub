#!/bin/sh
set -e

export LLM_BINDING_HOST="${LLM_API_BASE:-https://api.openai.com/v1}"
export LLM_BINDING_API_KEY="${LLM_API_KEY}"
export EMBEDDING_BINDING_HOST="${EMBEDDING_API_BASE:-${LLM_API_BASE:-https://api.openai.com/v1}}"
export EMBEDDING_BINDING_API_KEY="${EMBEDDING_API_KEY:-${LLM_API_KEY}}"
# Allow a dedicated model for LightRAG extraction, independent of the main LLM_MODEL
PRIMARY_LLM_MODEL="${LIGHTRAG_LLM_MODEL:-${LLM_MODEL}}"
FALLBACK_LLM_MODEL="${LLM_FALLBACK_MODEL:-}"
HEALTH_CHECK_INTERVAL_S="${LLM_HEALTH_CHECK_INTERVAL_S:-120}"

# LightRAG's extraction/query calls run inside the lightrag-hku package and
# can't be retried per-request against a different model, unlike the
# API-service (see API-service/llm_client.py, which does this per-call with
# a cooldown). Model selection is a `lightrag-server` startup argument, so the
# best we can do here is: probe periodically, and if the primary model's
# health flips, restart lightrag-server on the other model. This is the
# single point of control for both — same LLM_FALLBACK_MODEL var, same
# probe request shape. A restart briefly interrupts in-flight requests, but
# LightRAG is built for this: interrupted documents land in PROCESSING/FAILED
# status and `/documents/reprocess_failed` (called automatically below after
# every restart) picks them back up using its per-chunk LLM cache.
SERVER_PID=""
ACTIVE_MODEL=""

probe_model() {
  # $1 = model name. Returns 0 (success) if it answers 200, 1 otherwise.
  #
  # Must request response_format=json_object, same as LightRAG's real
  # extract/keyword/query calls (lightrag-hku always asks for structured
  # JSON output for those roles). Some vLLM backends support plain chat
  # completions fine while their guided-JSON/structured-output path 500s
  # independently — a bare unstructured ping would then report the model
  # "healthy" and this script would never fail over, even though every real
  # request keeps failing (see the alias-huge-no-thinking incident: JSON-mode
  # calls errored with Hosted_vllmException while the model itself was up).
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 20 -X POST \
    "${LLM_BINDING_HOST}/chat/completions" \
    -H "Authorization: Bearer ${LLM_BINDING_API_KEY}" \
    -H "Content-Type: application/json" \
    -d "{\"model\":\"$1\",\"messages\":[{\"role\":\"user\",\"content\":\"Reply with {\\\"ok\\\":true}\"}],\"max_tokens\":16,\"response_format\":{\"type\":\"json_object\"}}" \
    2>/dev/null || echo "000")
  [ "$code" = "200" ]
}

wait_until_ready() {
  echo "[lightrag] Waiting for LightRAG to accept connections..."
  until curl -sf -H "X-API-Key: ${LIGHTRAG_API_KEY}" http://localhost:9621/documents >/dev/null 2>&1; do
    sleep 2
  done
  echo "[lightrag] LightRAG ready."
}

start_server() {
  # $1 = model to use for this run.
  export LLM_MODEL="$1"
  ACTIVE_MODEL="$1"
  echo "[lightrag] Starting lightrag-server with model '$1'"
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
}

restart_server_on() {
  # $1 = model to switch to.
  kill "$SERVER_PID" 2>/dev/null || true
  sleep 2
  kill -9 "$SERVER_PID" 2>/dev/null || true
  wait "$SERVER_PID" 2>/dev/null || true
  start_server "$1"
  wait_until_ready
  # Interrupted-by-restart documents land in PROCESSING/FAILED; pick them
  # back up automatically instead of waiting for someone to notice.
  curl -sf -X POST -H "X-API-Key: ${LIGHTRAG_API_KEY}" \
    http://localhost:9621/documents/reprocess_failed >/dev/null 2>&1 \
    && echo "[lightrag] Reprocessing of any interrupted documents queued." \
    || echo "[lightrag] Reprocess request failed (no documents yet is normal)."
}

HAS_FALLBACK=false
if [ -n "$FALLBACK_LLM_MODEL" ] && [ "$FALLBACK_LLM_MODEL" != "$PRIMARY_LLM_MODEL" ]; then
  HAS_FALLBACK=true
elif [ -n "$FALLBACK_LLM_MODEL" ]; then
  echo "[lightrag] WARNING: LLM_FALLBACK_MODEL ('${FALLBACK_LLM_MODEL}') is the same as the effective primary model ('${PRIMARY_LLM_MODEL}', from LIGHTRAG_LLM_MODEL or LLM_MODEL) — fallback disabled. If the primary provider goes down, every query will fail with no automatic recovery. Set LLM_FALLBACK_MODEL to a genuinely different model alias."
fi

# --- Initial model selection ---
if [ "$HAS_FALLBACK" = "true" ]; then
  echo "[lightrag] Probing primary LLM model '${PRIMARY_LLM_MODEL}'..."
  if probe_model "$PRIMARY_LLM_MODEL"; then
    echo "[lightrag] Primary model healthy."
    start_server "$PRIMARY_LLM_MODEL"
  else
    echo "[lightrag] Primary model unavailable — starting on LLM_FALLBACK_MODEL='${FALLBACK_LLM_MODEL}'."
    start_server "$FALLBACK_LLM_MODEL"
  fi
else
  start_server "$PRIMARY_LLM_MODEL"
fi

wait_until_ready

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

# Pick up any document left in PROCESSING/FAILED state by a previous
# container run (crash, OOM kill, host restart) — same recovery used after
# a mid-run model-flip restart below.
curl -sf -X POST -H "X-API-Key: ${LIGHTRAG_API_KEY}" \
  http://localhost:9621/documents/reprocess_failed >/dev/null 2>&1 \
  && echo "[lightrag] Reprocessing of any previously interrupted documents queued." \
  || true

# --- Supervisor loop ---
# This *is* the container's long-running process from here on: it keeps
# lightrag-server alive (restarting it if it crashes) and, when a fallback is
# configured, periodically re-probes the primary model so the active model
# self-heals in both directions without anyone having to restart the
# container by hand.
while true; do
  sleep "$HEALTH_CHECK_INTERVAL_S"

  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "[lightrag] lightrag-server (pid $SERVER_PID) exited unexpectedly — restarting on '${ACTIVE_MODEL}'."
    start_server "$ACTIVE_MODEL"
    wait_until_ready
    continue
  fi

  [ "$HAS_FALLBACK" = "true" ] || continue

  if [ "$ACTIVE_MODEL" = "$FALLBACK_LLM_MODEL" ]; then
    if probe_model "$PRIMARY_LLM_MODEL"; then
      echo "[lightrag] Primary model '${PRIMARY_LLM_MODEL}' recovered — restarting on primary."
      restart_server_on "$PRIMARY_LLM_MODEL"
    fi
  else
    if ! probe_model "$PRIMARY_LLM_MODEL"; then
      echo "[lightrag] Primary model '${PRIMARY_LLM_MODEL}' unavailable — restarting on LLM_FALLBACK_MODEL='${FALLBACK_LLM_MODEL}'."
      restart_server_on "$FALLBACK_LLM_MODEL"
    fi
  fi
done
