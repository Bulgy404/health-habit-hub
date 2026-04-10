"""POST /api/v1/llm/extract-profile — M3.2 User Profile Extractor."""
from __future__ import annotations

import hashlib
import json
import logging
import os
from pathlib import Path
from typing import Any, Dict, Optional

import httpx
import redis.asyncio as aioredis
from fastapi import APIRouter
from pydantic import BaseModel, Field

from llm_client import chat_complete

logger = logging.getLogger(__name__)

router = APIRouter()

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
# Backend API setup — for fetching questionnaire responses
# ---------------------------------------------------------------------------
_BACKEND_URL = os.getenv("BACKEND_URL", "http://app:3000")
_SERVICE_TOKEN = os.getenv("SERVICE_AUTH_TOKEN", "")


async def _fetch_questionnaire_response(user_id: str, slug: str) -> Optional[Dict[str, Any]]:
    """Fetch the most recent questionnaire response for a user from the Node.js backend.

    Uses GET /api/v1/questionnaire-responses/me/:slug with a service auth token.
    Returns the response dict or None if not found / unavailable.
    """
    if not _SERVICE_TOKEN:
        logger.warning("SERVICE_AUTH_TOKEN not set — cannot fetch questionnaire responses.")
        return None

    url = f"{_BACKEND_URL}/api/v1/questionnaire-responses/me/{slug}"
    headers = {
        "Authorization": f"Bearer {_SERVICE_TOKEN}",
        "X-Service-User-Id": user_id,
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url, headers=headers)
        if resp.status_code == 200:
            return resp.json()
        if resp.status_code == 404:
            logger.info("No %s response found for user %s.", slug, user_id)
        else:
            logger.warning(
                "Unexpected status %d fetching %s for user %s.", resp.status_code, slug, user_id
            )
    except Exception as exc:  # noqa: BLE001
        logger.warning("Failed to fetch %s questionnaire for user %s: %s", slug, user_id, exc)
    return None


# ---------------------------------------------------------------------------
# Prompt template
# ---------------------------------------------------------------------------
_PROMPT_PATH = Path(__file__).parent.parent / "prompts" / "extract_profile.txt"
_PROMPT_TEMPLATE = _PROMPT_PATH.read_text(encoding="utf-8")


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------
class ExtractProfileRequest(BaseModel):
    user_id: str = Field(..., max_length=128)
    goal: str = Field(..., min_length=1, max_length=2000)


class ExtractProfileResponse(BaseModel):
    profile_summary: str
    profile_detailed: str
    rag_query: str


# ---------------------------------------------------------------------------
# Helper: cache key
# ---------------------------------------------------------------------------
def _cache_key(user_id: str, goal: str) -> str:
    digest = hashlib.sha256(f"{user_id}||{goal}".encode()).hexdigest()
    return f"extract_profile:{digest}"


def _parse_llm_response(raw: str) -> Optional[Dict[str, str]]:
    """Parse LLM JSON response; returns None on error."""
    try:
        parsed = json.loads(raw.strip())
        profile_summary = parsed.get("profile_summary", "")
        profile_detailed = parsed.get("profile_detailed", "")
        rag_query = parsed.get("rag_query", "")
        if not isinstance(profile_summary, str):
            profile_summary = ""
        if not isinstance(profile_detailed, str):
            profile_detailed = ""
        if not isinstance(rag_query, str):
            rag_query = ""
        return {
            "profile_summary": profile_summary,
            "profile_detailed": profile_detailed,
            "rag_query": rag_query,
        }
    except (json.JSONDecodeError, TypeError) as exc:
        logger.error("LLM returned unexpected format: %r (%s)", raw, exc)
        return None


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------
@router.post("/llm/extract-profile", response_model=ExtractProfileResponse)
async def extract_profile(body: ExtractProfileRequest) -> ExtractProfileResponse:
    key = _cache_key(body.user_id, body.goal)

    # --- cache read ---
    redis_client = await _get_redis()
    if redis_client is not None:
        try:
            cached = await redis_client.get(key)
            if cached:
                data = json.loads(cached)
                return ExtractProfileResponse(**data)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Redis read error (%s) — falling back to backend + LLM.", exc)

    # --- fetch questionnaire responses ---
    sliq_data, rand36_data = None, None
    sliq_data = await _fetch_questionnaire_response(body.user_id, "sliq")
    rand36_data = await _fetch_questionnaire_response(body.user_id, "rand-36")

    sliq_json = json.dumps(sliq_data.get("answers", {}) if sliq_data else {}, ensure_ascii=False)
    rand36_json = json.dumps(
        rand36_data.get("answers", {}) if rand36_data else {}, ensure_ascii=False
    )

    # --- LLM call ---
    prompt = _PROMPT_TEMPLATE.format(
        goal=body.goal,
        sliq_json=sliq_json,
        rand36_json=rand36_json,
    )
    raw = await chat_complete(
        messages=[{"role": "user", "content": prompt}],
        temperature=0.0,
    )

    parsed = _parse_llm_response(raw)
    if parsed is None:
        parsed = {
            "profile_summary": "Could not extract user profile.",
            "profile_detailed": "The profile extraction failed due to an unexpected LLM response.",
            "rag_query": body.goal,
        }

    result = ExtractProfileResponse(**parsed)

    # --- cache write ---
    if redis_client is not None:
        try:
            await redis_client.setex(key, _REDIS_TTL, json.dumps(result.model_dump()))
        except Exception as exc:  # noqa: BLE001
            logger.warning("Redis write error (%s) — result not cached.", exc)

    return result
