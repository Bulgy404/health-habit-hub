"""POST /api/v1/llm/extract-profile — M3.2 User Profile Extractor."""
from __future__ import annotations

import asyncio
import json
import logging
import os
from pathlib import Path
from typing import Optional

import httpx
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from auth import verify_service_token
from llm_client import chat_complete
from routers._cache import _REDIS_TTL, get_redis as _get_redis, make_cache_key

logger = logging.getLogger(__name__)

router = APIRouter(dependencies=[Depends(verify_service_token)])


# ---------------------------------------------------------------------------
# Backend API setup — for fetching questionnaire responses
# ---------------------------------------------------------------------------
_BACKEND_URL = os.getenv("BACKEND_URL", "http://app:3000")
_SERVICE_SECRET = os.getenv("API_SERVICE_SECRET", "")


async def _fetch_questionnaire_response(user_id: str, slug: str) -> Optional[dict[str, object]]:
    """Fetch the most recent questionnaire response for a user via the service endpoint.

    Uses GET /api/v1/questionnaire-responses/service/:userId/:slug authenticated
    with X-Service-Auth-Token header (API_SERVICE_SECRET).
    Returns the response dict or None if not found / unavailable.
    """
    if not _SERVICE_SECRET:
        logger.warning("API_SERVICE_SECRET not set — cannot fetch questionnaire responses.")
        return None

    url = f"{_BACKEND_URL}/api/v1/questionnaire-responses/service/{user_id}/{slug}"
    headers = {"X-Service-Auth-Token": _SERVICE_SECRET}
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


async def _fetch_user_profile(user_id: str) -> Optional[dict[str, object]]:
    """Fetch the user's structured profile from the user_profiles collection.

    Uses GET /api/v1/user-profile/service/:userId authenticated
    with X-Service-Auth-Token header.
    """
    if not _SERVICE_SECRET:
        logger.warning("API_SERVICE_SECRET not set — cannot fetch user profile.")
        return None

    url = f"{_BACKEND_URL}/api/v1/user-profile/service/{user_id}"
    headers = {"X-Service-Auth-Token": _SERVICE_SECRET}
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url, headers=headers)
        if resp.status_code == 200:
            return resp.json()
        if resp.status_code == 404:
            logger.info("No user profile found for user %s.", user_id)
        else:
            logger.warning(
                "Unexpected status %d fetching user profile for user %s.",
                resp.status_code,
                user_id,
            )
    except Exception as exc:  # noqa: BLE001
        logger.warning("Failed to fetch user profile for user %s: %s", user_id, exc)
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
    """Input payload for the extract-profile endpoint."""

    user_id: str = Field(..., max_length=128)
    goal: str = Field(..., min_length=1, max_length=2000)


class ExtractProfileResponse(BaseModel):
    """Summarised user profile and RAG query derived from questionnaire responses."""

    profile_summary: str
    profile_detailed: str
    rag_query: str


# ---------------------------------------------------------------------------
# Helper: cache key
# ---------------------------------------------------------------------------
def _cache_key(user_id: str, goal: str) -> str:
    """Build a namespaced Redis cache key for the extract-profile result."""
    return make_cache_key("extract_profile", user_id, goal)


def _parse_llm_response(raw: str) -> Optional[dict[str, str]]:
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
    """Build a structured user profile from questionnaire responses using an LLM.

    Args:
        body: Validated request payload with user_id and goal description.

    Returns:
        ExtractProfileResponse with profile_summary, profile_detailed, and rag_query.

    Raises:
        HTTPException: 500 if the LLM call fails unexpectedly (propagated from chat_complete).
    """
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
    sliq_data, rand36_data, profile_data = await asyncio.gather(
        _fetch_questionnaire_response(body.user_id, "sliq"),
        _fetch_questionnaire_response(body.user_id, "rand-36"),
        _fetch_user_profile(body.user_id),
    )

    sliq_json = json.dumps(sliq_data.get("answers", {}) if sliq_data else {}, ensure_ascii=False)
    rand36_json = json.dumps(
        rand36_data.get("answers", {}) if rand36_data else {}, ensure_ascii=False
    )
    profile_text = ""
    if profile_data and profile_data.get("fields"):
        lines = [
            f"{f['questionText']}: {f['label']}"
            for f in profile_data["fields"]
            if f.get("questionText") and f.get("label")
        ]
        profile_text = "\n".join(lines)

    # --- LLM call ---
    prompt = _PROMPT_TEMPLATE.format(
        goal=body.goal,
        sliq_json=sliq_json,
        rand36_json=rand36_json,
        profile_json=profile_text,
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
