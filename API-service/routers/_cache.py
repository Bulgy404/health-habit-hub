"""Shared Redis cache utilities for LLM router modules."""
from __future__ import annotations

import logging
import os
from typing import Optional

import redis.asyncio as aioredis

logger = logging.getLogger(__name__)

_REDIS_TTL: int = int(os.getenv("REDIS_TTL_SECONDS", "86400"))


async def get_redis() -> Optional[aioredis.Redis]:
    """Return the shared Redis client, delegating to deps.py's lifespan-managed instance.

    This module used to lazily create and own a second connection pool (with
    double-checked locking) using a *different* default REDIS_URL fallback
    than deps.py's lifespan-managed client (``redis://localhost:6379`` here
    vs. ``redis://redis:6379`` there) — so unless REDIS_URL was set
    identically in both places, classify_habit.py, classify_context.py,
    extract_habits.py, and extract_profile.py (all of which import
    ``get_redis`` from this module) could end up talking to a different
    Redis instance/pool than main.py/recommend.py did.

    Now delegates to deps.get_redis() so there is exactly one client and one
    connection pool for the whole app; deps.py's lifespan handler owns
    creation on startup and closing on shutdown. The import is local (rather
    than at module scope) to avoid a load-order dependency between the two
    modules.

    Returns:
        The shared aioredis.Redis instance, or None if the lifespan hasn't
        initialised one (e.g. Redis was unreachable at startup, or this is
        called outside of the FastAPI app's lifespan — a script, or a test
        that hasn't overridden it).
    """
    from deps import get_redis as _deps_get_redis

    return await _deps_get_redis()


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
