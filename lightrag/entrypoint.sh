#!/bin/sh
# Map HHH env vars to LightRAG's expected names
export LLM_BINDING_HOST="${LLM_API_BASE:-https://api.openai.com/v1}"
export LLM_BINDING_API_KEY="${LLM_API_KEY}"
export EMBEDDING_BINDING_HOST="${EMBEDDING_API_BASE:-${LLM_API_BASE:-https://api.openai.com/v1}}"
export EMBEDDING_BINDING_API_KEY="${EMBEDDING_API_KEY:-${LLM_API_KEY}}"

exec lightrag-server \
  --host 0.0.0.0 \
  --port 9621 \
  --working-dir /app/data \
  --llm-binding openai \
  --embedding-binding openai \
  --log-level INFO
