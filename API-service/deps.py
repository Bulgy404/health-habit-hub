"""Shared lifespan-managed dependencies for the FastAPI app."""
from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager
from typing import AsyncGenerator, Optional

import motor.motor_asyncio
import redis.asyncio as aioredis
from fastapi import FastAPI
from motor.motor_asyncio import AsyncIOMotorDatabase

logger = logging.getLogger(__name__)

_redis: Optional[aioredis.Redis] = None
_mongo: Optional[motor.motor_asyncio.AsyncIOMotorClient] = None  # type: ignore[type-arg]


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """FastAPI lifespan context: initialise Redis, MongoDB, and warm up the BCIO index on startup."""
    global _redis, _mongo

    redis_url = os.environ.get("REDIS_URL", "redis://redis:6379")
    _redis = aioredis.from_url(redis_url, decode_responses=True)

    _build_mongo_client()

    from routers.map_bcio import _get_index
    try:
        await _get_index()
    except Exception as exc:  # noqa: BLE001
        logger.error("BCIO index warm-up failed: %s", exc)

    yield

    if _redis is not None:
        await _redis.aclose()
    if _mongo is not None:
        _mongo.close()


def _build_mongo_client() -> None:
    """Construct the shared AsyncIOMotorClient from environment variables and store it globally."""
    global _mongo
    mongo_url = os.environ.get("MONGO_URL", "")
    mongo_host = os.environ.get("MONGO_HOST", "mongo")
    mongo_port = int(os.environ.get("MONGO_PORT", "27017"))
    mongo_user = os.environ.get("MONGO_USER", "")
    mongo_password = os.environ.get("MONGO_PASSWORD", "")
    mongo_auth = os.environ.get("MONGO_AUTH_SOURCE", "admin")

    if mongo_url:
        url = mongo_url
    elif mongo_user and mongo_password:
        url = (
            f"mongodb://{mongo_user}:{mongo_password}"
            f"@{mongo_host}:{mongo_port}/?authSource={mongo_auth}"
        )
    else:
        url = f"mongodb://{mongo_host}:{mongo_port}/"

    _mongo = motor.motor_asyncio.AsyncIOMotorClient(url)


async def get_redis() -> Optional[aioredis.Redis]:
    """FastAPI dependency: return the shared Redis client, or None if not initialised."""
    return _redis


async def get_mongo_db() -> AsyncIOMotorDatabase:  # type: ignore[type-arg]
    """FastAPI dependency: return the configured MongoDB database handle.

    Returns:
        AsyncIOMotorDatabase for the database named by MONGO_DB (default: "surveyjs").

    Raises:
        AssertionError: If called before the lifespan initialises the MongoDB client.
    """
    assert _mongo is not None, "MongoDB client not initialised"
    db_name = os.environ.get("MONGO_DB", "surveyjs")
    return _mongo[db_name]
