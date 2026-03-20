"""POST /api/v1/llm/recommend — M3.5 Habit Recommendation Generator.

Orchestrates M3.1 (extract-habits) + M3.2 (extract-profile) in parallel,
then M3.3 (retrieve) with the RAG query from M3.2, then generates
personalised recommendations via LLM.  Results are cached in Redis and
stored in MongoDB.
"""
from __future__ import annotations

import asyncio
import datetime
import hashlib
import json
import logging
import os
from pathlib import Path
from typing import Any, Dict, List, Optional
from uuid import uuid4

import motor.motor_asyncio
import redis.asyncio as aioredis
from fastapi import APIRouter
from pydantic import BaseModel

from llm_client import chat_complete
from routers.extract_habits import ExtractHabitsRequest
from routers.extract_habits import extract_habits as _extract_habits
from routers.extract_profile import ExtractProfileRequest
from routers.extract_profile import extract_profile as _extract_profile
from routers.retrieve import RetrieveRequest
from routers.retrieve import retrieve as _retrieve

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
# MongoDB setup (graceful — if unavailable, storage/feedback steps are skipped)
# ---------------------------------------------------------------------------
_MONGO_HOST = os.getenv("MONGO_HOST", "mongo")
_MONGO_PORT = int(os.getenv("MONGO_PORT", "27017"))
_MONGO_USER = os.getenv("MONGO_USER", "")
_MONGO_PASSWORD = os.getenv("MONGO_PASSWORD", "")
_MONGO_AUTH_SOURCE = os.getenv("MONGO_AUTH_SOURCE", "admin")
_MONGO_DB = os.getenv("MONGO_DB", "surveyjs")
# Allow a full URL override for testing / simpler config
_MONGO_URL = os.getenv("MONGO_URL", "")

_mongo_client: Optional[motor.motor_asyncio.AsyncIOMotorClient] = None  # type: ignore[type-arg]


def _get_mongo_db() -> Any:
    global _mongo_client
    if _mongo_client is None:
        if _MONGO_URL:
            url = _MONGO_URL
        elif _MONGO_USER and _MONGO_PASSWORD:
            url = (
                f"mongodb://{_MONGO_USER}:{_MONGO_PASSWORD}"
                f"@{_MONGO_HOST}:{_MONGO_PORT}/"
                f"?authSource={_MONGO_AUTH_SOURCE}"
            )
        else:
            url = f"mongodb://{_MONGO_HOST}:{_MONGO_PORT}/"
        _mongo_client = motor.motor_asyncio.AsyncIOMotorClient(url)
    return _mongo_client[_MONGO_DB]


# ---------------------------------------------------------------------------
# Prompt template
# ---------------------------------------------------------------------------
_PROMPT_PATH = Path(__file__).parent.parent / "prompts" / "recommend.txt"
_PROMPT_TEMPLATE = _PROMPT_PATH.read_text(encoding="utf-8")


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------
class RecommendRequest(BaseModel):
    user_id: str
    goal: str
    session_id: str


class SourceRef(BaseModel):
    filename: str
    excerpt: str


class RecommendationItem(BaseModel):
    title: str
    body: str
    rationale: str
    sources: List[SourceRef]


class RecommendResponse(BaseModel):
    recommendation_id: str
    goal: str
    recommendations: List[RecommendationItem]
    generated_at: str


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _cache_key(user_id: str, goal: str) -> str:
    digest = hashlib.sha256(f"{user_id}||{goal}".encode()).hexdigest()
    return f"recommend:{digest}"


def _parse_llm_response(
    raw: str, sources: List[Any]
) -> List[Dict[str, Any]]:
    """Parse LLM JSON; returns list of recommendation dicts (with sources attached)."""
    try:
        parsed = json.loads(raw.strip())
        items = parsed.get("recommendations", [])
        if not isinstance(items, list):
            return []
        source_refs = [{"filename": s.filename, "excerpt": s.excerpt} for s in sources]
        result: List[Dict[str, Any]] = []
        for item in items:
            if not isinstance(item, dict):
                continue
            result.append(
                {
                    "title": str(item.get("title", "")),
                    "body": str(item.get("body", "")),
                    "rationale": str(item.get("rationale", "")),
                    "sources": source_refs,
                }
            )
        return result
    except (json.JSONDecodeError, TypeError) as exc:
        logger.error("LLM returned unexpected format: %r (%s)", raw, exc)
        return []


async def _fetch_prior_feedback(user_id: str, goal: str) -> List[str]:
    """Fetch prior feedback comments for (user_id, goal) from MongoDB."""
    try:
        db = _get_mongo_db()
        cursor = (
            db["recommendation_feedback"]
            .find({"userId": user_id, "goal": goal}, {"comment": 1, "_id": 0})
            .sort("created_at", -1)
            .limit(10)
        )
        comments: List[str] = []
        async for doc in cursor:
            comment = doc.get("comment", "")
            if comment:
                comments.append(comment)
        return comments
    except Exception as exc:  # noqa: BLE001
        logger.warning("Failed to fetch prior feedback from MongoDB: %s", exc)
        return []


async def _store_recommendation(
    recommendation_id: str,
    user_id: str,
    goal: str,
    session_id: str,
    recs: List[Dict[str, Any]],
    generated_at: str,
) -> None:
    """Persist the recommendation document to MongoDB."""
    try:
        db = _get_mongo_db()
        await db["recommendations"].insert_one(
            {
                "recommendation_id": recommendation_id,
                "userId": user_id,
                "goal": goal,
                "session_id": session_id,
                "recommendations": recs,
                "generated_at": generated_at,
            }
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("Failed to store recommendation in MongoDB: %s", exc)


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------
@router.post("/llm/recommend", response_model=RecommendResponse)
async def recommend(body: RecommendRequest) -> RecommendResponse:
    key = _cache_key(body.user_id, body.goal)

    # --- cache read ---
    redis_client = await _get_redis()
    if redis_client is not None:
        try:
            cached = await redis_client.get(key)
            if cached:
                data = json.loads(cached)
                return RecommendResponse(**data)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Redis read error (%s) — falling back to LLM.", exc)

    # --- M3.1 + M3.2 in parallel ---
    habits_resp, profile_resp = await asyncio.gather(
        _extract_habits(ExtractHabitsRequest(user_id=body.user_id, goal=body.goal)),
        _extract_profile(ExtractProfileRequest(user_id=body.user_id, goal=body.goal)),
    )

    # --- M3.3: RAG retrieval using rag_query from M3.2 ---
    rag_query = profile_resp.rag_query or body.goal
    retrieve_resp = await _retrieve(RetrieveRequest(rag_query=rag_query))

    # --- Fetch prior feedback from MongoDB (M3.6 collection) ---
    prior_feedback = await _fetch_prior_feedback(body.user_id, body.goal)

    # --- Build prompt ---
    habits_json = json.dumps(
        [{"uuid": h.uuid, "sentence": h.sentence} for h in habits_resp.selected_habits],
        ensure_ascii=False,
        indent=2,
    )
    sources_json = json.dumps(
        [
            {"filename": s.filename, "excerpt": s.excerpt, "score": s.score}
            for s in retrieve_resp.sources
        ],
        ensure_ascii=False,
        indent=2,
    )
    feedback_text = (
        "\n".join(f"- {c}" for c in prior_feedback) if prior_feedback else "None"
    )

    prompt = _PROMPT_TEMPLATE.format(
        goal=body.goal,
        profile_summary=profile_resp.profile_summary,
        profile_detailed=profile_resp.profile_detailed,
        habit_summary=habits_resp.habit_summary,
        habits_json=habits_json,
        sources_json=sources_json,
        prior_feedback=feedback_text,
    )

    # --- LLM call ---
    raw = await chat_complete(
        messages=[{"role": "user", "content": prompt}],
        temperature=0.2,
    )

    recs = _parse_llm_response(raw, retrieve_resp.sources)

    recommendation_id = str(uuid4())
    generated_at = datetime.datetime.now(datetime.timezone.utc).isoformat()

    # --- Store in MongoDB ---
    await _store_recommendation(
        recommendation_id=recommendation_id,
        user_id=body.user_id,
        goal=body.goal,
        session_id=body.session_id,
        recs=recs,
        generated_at=generated_at,
    )

    result = RecommendResponse(
        recommendation_id=recommendation_id,
        goal=body.goal,
        recommendations=[RecommendationItem(**r) for r in recs],
        generated_at=generated_at,
    )

    # --- cache write ---
    if redis_client is not None:
        try:
            await redis_client.setex(key, _REDIS_TTL, json.dumps(result.model_dump()))
        except Exception as exc:  # noqa: BLE001
            logger.warning("Redis write error (%s) — result not cached.", exc)

    return result
