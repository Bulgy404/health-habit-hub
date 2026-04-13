"""POST /api/v1/llm/classify-context — M1.2 Context Extractor."""
from __future__ import annotations

import hashlib
import json
import logging
import os
from pathlib import Path
from typing import List, Optional

import redis.asyncio as aioredis
from fastapi import APIRouter, Depends
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
_PROMPT_PATH = Path(__file__).parent.parent / "prompts" / "classify_context.txt"
_PROMPT_TEMPLATE = _PROMPT_PATH.read_text(encoding="utf-8")

# The 7 BCIO context dimensions
_DIMENSIONS = [
    "TIME",
    "PHYSICAL_SETTING",
    "PRIOR_BEHAVIOR",
    "OTHER_PEOPLE",
    "INTERNAL_STATE",
    "BEHAVIOR",
    "REASONING",
]


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------
class ClassifyContextRequest(BaseModel):
    uuid: str = Field(..., max_length=128)
    sentence: str = Field(..., min_length=1, max_length=2000)
    language: str = Field(..., max_length=32)


class ClassifyContextResponse(BaseModel):
    uuid: str
    sentence: str
    language: str
    TIME: List[str]
    PHYSICAL_SETTING: List[str]
    PRIOR_BEHAVIOR: List[str]
    OTHER_PEOPLE: List[str]
    INTERNAL_STATE: List[str]
    BEHAVIOR: List[str]
    REASONING: List[str]


# ---------------------------------------------------------------------------
# Helper: cache key
# ---------------------------------------------------------------------------
def _cache_key(sentence: str, language: str) -> str:
    digest = hashlib.sha256(f"{sentence}||{language}".encode()).hexdigest()
    return f"classify_context:{digest}"


def _empty_dimensions() -> dict:
    return {dim: [] for dim in _DIMENSIONS}


def _parse_llm_response(raw: str) -> dict:
    """Parse LLM JSON response into dimension dict; returns empty dims on error."""
    try:
        parsed = json.loads(raw.strip())
        result = {}
        for dim in _DIMENSIONS:
            val = parsed.get(dim, [])
            result[dim] = val if isinstance(val, list) else []
        return result
    except (json.JSONDecodeError, TypeError) as exc:
        logger.error("LLM returned unexpected format: %r (%s)", raw, exc)
        return _empty_dimensions()


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------
@router.post("/llm/classify-context", response_model=ClassifyContextResponse)
async def classify_context(body: ClassifyContextRequest) -> ClassifyContextResponse:
    key = _cache_key(body.sentence, body.language)

    # --- cache read ---
    redis_client = await _get_redis()
    if redis_client is not None:
        try:
            cached = await redis_client.get(key)
            if cached:
                dims = json.loads(cached)
                return ClassifyContextResponse(
                    uuid=body.uuid,
                    sentence=body.sentence,
                    language=body.language,
                    **dims,
                )
        except Exception as exc:  # noqa: BLE001
            logger.warning("Redis read error (%s) — falling back to LLM.", exc)

    # --- LLM call ---
    prompt = _PROMPT_TEMPLATE.format(
        language=body.language,
        sentence=body.sentence,
    )
    raw = await chat_complete(
        messages=[{"role": "user", "content": prompt}],
        temperature=0.0,
    )

    dims = _parse_llm_response(raw)

    # --- cache write ---
    if redis_client is not None:
        try:
            await redis_client.setex(key, _REDIS_TTL, json.dumps(dims))
        except Exception as exc:  # noqa: BLE001
            logger.warning("Redis write error (%s) — result not cached.", exc)

    return ClassifyContextResponse(
        uuid=body.uuid,
        sentence=body.sentence,
        language=body.language,
        **dims,
    )
