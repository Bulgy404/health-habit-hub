"""POST /api/v1/llm/classify-habit — M1.1 Habit Classifier."""
from __future__ import annotations

import hashlib
import json
import logging
import os
from pathlib import Path
from typing import Optional
from uuid import uuid4

import redis.asyncio as aioredis
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from auth import verify_service_token
from llm_client import chat_complete

logger = logging.getLogger(__name__)

router = APIRouter(dependencies=[Depends(verify_service_token)])

# ---------------------------------------------------------------------------
# Redis setup (graceful — if unavailable the endpoint still works)
# ---------------------------------------------------------------------------
_REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
_REDIS_TTL = int(os.getenv("REDIS_TTL_SECONDS", "86400"))

_redis: Optional[aioredis.Redis] = None


async def _get_redis() -> Optional[aioredis.Redis]:
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


# ---------------------------------------------------------------------------
# Prompt template
# ---------------------------------------------------------------------------
_PROMPT_PATH = Path(__file__).parent.parent / "prompts" / "classify_habit.txt"
_PROMPT_TEMPLATE = _PROMPT_PATH.read_text(encoding="utf-8")


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------
class ClassifyHabitRequest(BaseModel):
    sentence: str = Field(..., min_length=1, max_length=2000)
    language: str = Field(..., max_length=32)
    user_id: str = Field(..., max_length=128)


class ClassifyHabitResponse(BaseModel):
    uuid: str
    sentence: str
    language: str
    is_habit: bool
    confidence: float


# ---------------------------------------------------------------------------
# Helper: cache key
# ---------------------------------------------------------------------------
def _cache_key(sentence: str, language: str) -> str:
    digest = hashlib.sha256(f"{sentence}||{language}".encode()).hexdigest()
    return f"classify_habit:{digest}"


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------
@router.post("/llm/classify-habit", response_model=ClassifyHabitResponse)
async def classify_habit(body: ClassifyHabitRequest) -> ClassifyHabitResponse:
    key = _cache_key(body.sentence, body.language)

    # --- cache read ---
    redis_client = await _get_redis()
    if redis_client is not None:
        try:
            cached = await redis_client.get(key)
            if cached:
                data = json.loads(cached)
                return ClassifyHabitResponse(
                    uuid=str(uuid4()),
                    sentence=body.sentence,
                    language=body.language,
                    is_habit=data["is_habit"],
                    confidence=data["confidence"],
                )
        except Exception as exc:  # noqa: BLE001
            logger.warning("Redis read error (%s) — falling back to LLM.", exc)

    # --- LLM call ---
    prompt = _PROMPT_TEMPLATE.format(
        language=body.language,
        sentence=body.sentence,
    )
    try:
        raw = await chat_complete(
            messages=[{"role": "user", "content": prompt}],
            temperature=0.0,
        )
    except Exception as exc:  # noqa: BLE001
        logger.error("LLM classify_habit call failed: %s", exc)
        raise HTTPException(
            status_code=503,
            detail={
                "error": "Classifier unavailable",
                "code": "llm_unavailable",
            },
        ) from exc

    try:
        parsed = json.loads(raw.strip())
        is_habit: bool = bool(parsed["is_habit"])
        confidence: float = float(parsed["confidence"])
    except (json.JSONDecodeError, KeyError, TypeError) as exc:
        logger.error("LLM returned unexpected format: %r (%s)", raw, exc)
        raise HTTPException(
            status_code=503,
            detail={
                "error": "Classifier returned invalid response",
                "code": "llm_invalid_response",
            },
        ) from exc

    # --- cache write ---
    if redis_client is not None:
        try:
            await redis_client.setex(
                key, _REDIS_TTL, json.dumps({"is_habit": is_habit, "confidence": confidence})
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning("Redis write error (%s) — result not cached.", exc)

    return ClassifyHabitResponse(
        uuid=str(uuid4()),
        sentence=body.sentence,
        language=body.language,
        is_habit=is_habit,
        confidence=confidence,
    )
