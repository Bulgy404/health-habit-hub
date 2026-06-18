"""Shared OpenAI-compatible embedding client.

Single source of truth for the embedding model configuration used across
map_bcio (BCIO concept matching) and embed_habit (habit vector storage).
"""
from __future__ import annotations

import os

import openai

EMBEDDING_MODEL: str = os.getenv("EMBEDDING_MODEL", "Qwen/Qwen3-Embedding-4B")
EMBEDDING_DIMENSIONS: int = int(os.getenv("EMBEDDING_DIMENSIONS", "2560"))

_EMBEDDING_API_BASE = os.getenv("EMBEDDING_API_BASE", os.getenv("LLM_API_BASE"))
_EMBEDDING_API_KEY = os.getenv("EMBEDDING_API_KEY", os.getenv("LLM_API_KEY", ""))

_EMBEDDING_TIMEOUT = float(os.getenv("EMBEDDING_TIMEOUT_SECONDS", "30"))

_client = openai.AsyncOpenAI(
    api_key=_EMBEDDING_API_KEY or "placeholder",
    base_url=_EMBEDDING_API_BASE or None,
    timeout=_EMBEDDING_TIMEOUT,
)


async def embed_texts(texts: list[str]) -> list[list[float]]:
    """Embed a list of texts using the configured OpenAI-compatible endpoint."""
    response = await _client.embeddings.create(model=EMBEDDING_MODEL, input=texts)
    return [item.embedding for item in response.data]
