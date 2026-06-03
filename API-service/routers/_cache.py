"""Shared Redis cache utilities for LLM router modules."""
from __future__ import annotations

import logging
import os
from typing import Optional

import redis.asyncio as aioredis

logger = logging.getLogger(__name__)

_REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379")
_REDIS_TTL: int = int(os.getenv("REDIS_TTL_SECONDS", "86400"))

_redis: Optional[aioredis.Redis] = None


async def get_redis() -> Optional[aioredis.Redis]:
    """Return a shared Redis client, initialising lazily on first call.

    Returns None (and logs a warning) if Redis is unavailable so callers
    can degrade gracefully rather than failing hard.

    Returns:
        A connected aioredis.Redis instance, or None if the connection failed.
    """
    global _redis
    if _redis is not None:
        return _redis
    try:
        client: aioredis.Redis = aioredis.from_url(_REDIS_URL, decode_responses=True)
        await client.ping()  # type: ignore[misc]
        _redis = client
        return _redis
    except Exception as exc:  # noqa: BLE001
        logger.warning("Redis unavailable (%s) — caching disabled.", exc)
        return None


def make_cache_key(prefix: str, *parts: str) -> str:
    """Build a namespaced Redis key from prefix and variable parts.

    Args:
        prefix: Key namespace, e.g. ``"extract_habits"``.
        *parts: Values to hash into the key.

    Returns:
        A ``prefix:<sha256_hex>`` string safe for use as a Redis key.
    """
    import hashlib
    digest = hashlib.sha256("||".join(parts).encode()).hexdigest()
    return f"{prefix}:{digest}"
