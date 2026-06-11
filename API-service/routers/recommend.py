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
from typing import Optional
from uuid import uuid4

import redis.asyncio as aioredis
from fastapi import APIRouter, Depends
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field

from auth import verify_service_token
from deps import get_mongo_db, get_redis
from llm_client import chat_complete
from routers.extract_habits import ExtractHabitsRequest
from routers.extract_habits import extract_habits as _extract_habits
from routers.extract_profile import ExtractProfileRequest
from routers.extract_profile import extract_profile as _extract_profile
from routers.retrieve import RetrieveRequest
from routers.retrieve import retrieve as _retrieve

logger = logging.getLogger(__name__)

router = APIRouter(dependencies=[Depends(verify_service_token)])

# ---------------------------------------------------------------------------
# Redis / MongoDB config
# ---------------------------------------------------------------------------
_REDIS_TTL = int(os.getenv("REDIS_TTL_SECONDS", "86400"))


async def _get_redis() -> Optional[aioredis.Redis]:
    """Compatibility seam for tests and fallback cache access."""
    return await get_redis()


# ---------------------------------------------------------------------------
# Prompt template
# ---------------------------------------------------------------------------
_PROMPT_PATH = Path(__file__).parent.parent / "prompts" / "recommend.txt"
_PROMPT_TEMPLATE = _PROMPT_PATH.read_text(encoding="utf-8")


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------
class RecommendRequest(BaseModel):
    """Input payload for the recommend endpoint."""

    user_id: str = Field(..., max_length=128)
    goal: str = Field(..., min_length=1, max_length=2000)
    session_id: str = Field(..., max_length=128)


class SourceRef(BaseModel):
    """A reference to a knowledge-base source used in a recommendation."""

    filename: str
    excerpt: str


class RecommendationItem(BaseModel):
    """A single personalised habit recommendation with rationale and source references."""

    title: str
    body: str
    rationale: str
    sources: list[SourceRef]


class RecommendResponse(BaseModel):
    """Full recommendation response with metadata and a list of recommendation items."""

    recommendation_id: str
    goal: str
    recommendations: list[RecommendationItem]
    generated_at: str


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _cache_key(user_id: str, goal: str) -> str:
    """Build a deterministic Redis key for a user+goal recommendation pair."""
    digest = hashlib.sha256(f"{user_id}||{goal}".encode()).hexdigest()
    return f"recommend:{digest}"


def _parse_llm_response(
    raw: str, sources: list[SourceItem]
) -> list[dict[str, object]]:
    """Parse LLM JSON; returns list of recommendation dicts (with sources attached)."""
    try:
        parsed = json.loads(raw.strip())
        items = parsed.get("recommendations", [])
        if not isinstance(items, list):
            return []
        source_refs = [{"filename": s.filename, "excerpt": s.excerpt} for s in sources]
        result: list[dict[str, object]] = []
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


async def _fetch_prior_feedback(user_id: str, goal: str, db: AsyncIOMotorDatabase) -> list[str]:
    """Fetch prior feedback comments for (user_id, goal) from MongoDB."""
    try:
        cursor = (
            db["recommendation_feedback"]
            .find({"userId": user_id, "goal": goal}, {"comment": 1, "_id": 0})
            .sort("created_at", -1)
            .limit(10)
        )
        comments: list[str] = []
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
    recs: list[dict[str, object]],
    generated_at: str,
    db: Optional[AsyncIOMotorDatabase] = None,
) -> None:
    """Persist the recommendation document to MongoDB."""
    if db is None:
        return
    try:
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
async def recommend(
    body: RecommendRequest,
    redis_client: Optional[aioredis.Redis] = Depends(get_redis),
    db: AsyncIOMotorDatabase = Depends(get_mongo_db),
) -> RecommendResponse:
    """Orchestrate the M3 pipeline and generate personalised habit recommendations.

    Runs M3.1 (extract-habits) + M3.2 (extract-profile) in parallel, then M3.3 (retrieve)
    for RAG context, fetches prior feedback, and calls the LLM to produce recommendations.
    Results are cached in Redis and persisted to MongoDB.

    Args:
        body: Validated request payload with user_id, goal, and session_id.
        redis_client: Injected Redis connection for cache read/write (optional, degrades gracefully).
        db: Injected MongoDB connection from FastAPI's dependency system.

    Returns:
        RecommendResponse with a unique recommendation_id, goal, recommendations list,
        and generated_at timestamp.

    Raises:
        HTTPException: 500 if the LLM call fails unexpectedly (propagated from chat_complete).
    """
    if redis_client is None:
        redis_client = await _get_redis()

    key = _cache_key(body.user_id, body.goal)

    # --- cache read ---
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
    prior_feedback = await _fetch_prior_feedback(body.user_id, body.goal, db)

    # --- Build prompt ---
    habits_json = json.dumps(
        [{"uuid": h.uuid, "sentence": h.sentence} for h in habits_resp.selected_habits],
        ensure_ascii=False,
        indent=2,
    )
    community_habits_json = json.dumps(
        [
            {
                "sentence": h.sentence,
                "context": {k: v for k, v in h.context.items() if v},
                "community_likes": h.likes,
            }
            for h in habits_resp.community_habits
        ],
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
        community_habits_json=community_habits_json,
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
        db=db,
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
