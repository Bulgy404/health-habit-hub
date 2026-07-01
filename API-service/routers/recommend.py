"""POST /api/v1/llm/recommend — M3.5 Habit Recommendation Generator.

Pipeline (single LLM call):
  1. 7-way parallel data fetch — Neo4j (personal + community habits), MongoDB
     (annotated habits, prior feedback), and backend HTTP (SLIQ, RAND-36, profile).
  2. Deterministic profile build  (_profile_builder)  — replaces LLM-2.
  3. GDS FastRP community re-ranking  (_gds_ranking)  — replaces LLM-1 selection.
  4. Parallel BCIO concept fetch + LightRAG retrieval.
  5. Single LLM call writes recommendations with selected_habit_uuids for
     explainability.

The /llm/extract-habits and /llm/extract-profile endpoints are unchanged and
remain available as standalone services.
"""
from __future__ import annotations

import asyncio
import datetime
import hashlib
import json
import logging
import os
from pathlib import Path
from typing import Any, Optional, cast
from uuid import uuid4

import redis.asyncio as aioredis
from fastapi import APIRouter, Depends
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field

from auth import verify_service_token
from deps import get_mongo_db, get_redis
from llm_client import chat_complete
from routers._gds_ranking import fetch_bcio_concepts as _fetch_bcio_concepts
from routers._gds_ranking import rerank_habits_with_graph as _rerank_habits
from routers._profile_builder import build_profile as _build_profile
from routers.extract_habits import _get_neo4j_driver
from routers.extract_habits import _vector_search_habits
from routers.extract_habits import _vector_search_user_habits
from routers.extract_habits import fetch_annotated_habits as _fetch_annotated_habits
from routers.extract_profile import _fetch_all_questionnaire_responses
from routers.extract_profile import _fetch_user_profile
from routers.retrieve import RetrieveRequest
from routers.retrieve import SourceItem
from routers.retrieve import retrieve as _retrieve

logger = logging.getLogger(__name__)

router = APIRouter(dependencies=[Depends(verify_service_token)])

_REDIS_TTL = int(os.getenv("REDIS_TTL_SECONDS", "86400"))

_PROMPT_PATH = Path(__file__).parent.parent / "prompts" / "recommend.txt"
_PROMPT_TEMPLATE = _PROMPT_PATH.read_text(encoding="utf-8")


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------
class RecommendRequest(BaseModel):
    user_id: str = Field(..., max_length=128)
    goal: str = Field(..., min_length=1, max_length=2000)
    session_id: str = Field(..., max_length=128)


class SourceRef(BaseModel):
    filename: str
    excerpt: str


class RecommendationItem(BaseModel):
    title: str
    body: str
    rationale: str
    sources: list[SourceRef]
    selected_habit_uuids: list[str] = Field(default_factory=list)


class RecommendResponse(BaseModel):
    recommendation_id: str
    goal: str
    recommendations: list[RecommendationItem]
    generated_at: str


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _cache_key(user_id: str, goal: str) -> str:
    digest = hashlib.sha256(f"{user_id}||{goal}".encode()).hexdigest()
    return f"recommend:{digest}"


async def _get_redis() -> Optional[aioredis.Redis]:
    return await get_redis()


def _parse_llm_response(
    raw: str, sources: list[SourceItem]
) -> list[dict[str, Any]]:
    """Parse LLM JSON; attach sources and extract selected_habit_uuids per item."""
    try:
        text = raw.strip()
        start, end = text.find("{"), text.rfind("}") + 1
        if start != -1 and end > start:
            text = text[start:end]
        parsed = json.loads(text)
        items = parsed.get("recommendations", [])
        if not isinstance(items, list):
            return []
        source_refs = [{"filename": s.filename, "excerpt": s.excerpt} for s in sources]
        result: list[dict[str, Any]] = []
        for item in items:
            if not isinstance(item, dict):
                continue
            uuids = item.get("selected_habit_uuids", [])
            if not isinstance(uuids, list):
                uuids = []
            result.append(
                {
                    "title": str(item.get("title", "")),
                    "body": str(item.get("body", "")),
                    "rationale": str(item.get("rationale", "")),
                    "sources": source_refs,
                    "selected_habit_uuids": [str(u) for u in uuids if u],
                }
            )
        return result
    except (json.JSONDecodeError, TypeError) as exc:
        logger.error("LLM returned unexpected format: %r (%s)", raw, exc)
        return []


async def _fetch_prior_feedback(
    user_id: str, goal: str, db: AsyncIOMotorDatabase
) -> list[str]:
    if db is None:
        return []
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
        logger.warning("Failed to fetch prior feedback: %s", exc)
        return []


async def _store_recommendation(
    recommendation_id: str,
    user_id: str,
    goal: str,
    session_id: str,
    recs: list[dict[str, Any]],
    generated_at: str,
    db: Optional[AsyncIOMotorDatabase] = None,
) -> None:
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


def _habits_to_json(
    habits: list[dict], bcio_by_uuid: dict[str, list[str]]
) -> str:
    """Serialise a habit list for the LLM prompt, including bcio_concepts."""
    return json.dumps(
        [
            {
                "uuid": h["uuid"],
                "sentence": h["sentence"],
                "context": {k: v for k, v in h["context"].items() if v},
                "bcio_concepts": bcio_by_uuid.get(str(h["uuid"]), []),
                "likes": int(h.get("likes", 0)),
            }
            for h in habits
        ],
        ensure_ascii=False,
        indent=2,
    )


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

    Runs all data fetches in parallel (no LLM calls at this stage), then applies
    GDS FastRP re-ranking, builds the profile deterministically, and makes a single
    LLM call to write recommendations.  Each recommendation includes
    selected_habit_uuids identifying which Neo4j habit nodes informed it.

    Args:
        body: Validated request payload with user_id, goal, and session_id.
        redis_client: Injected Redis connection (optional, degrades gracefully).
        db: Injected MongoDB connection.

    Returns:
        RecommendResponse with recommendation_id, goal, recommendations, and
        generated_at timestamp.
    """
    if redis_client is None:
        redis_client = await _get_redis()

    key = _cache_key(body.user_id, body.goal)

    # --- Cache read ---
    if redis_client is not None:
        try:
            cached = await redis_client.get(key)
            if cached:
                return RecommendResponse(**json.loads(cached))
        except Exception as exc:  # noqa: BLE001
            logger.warning("Redis read error (%s) — falling back to pipeline.", exc)

    # --- Stage 1: parallel data fetch (zero LLM calls) ---
    _gathered = await asyncio.gather(
        _vector_search_user_habits(body.goal, body.user_id),
        _vector_search_habits(body.goal, body.user_id),
        _fetch_all_questionnaire_responses(body.user_id),
        _fetch_user_profile(body.user_id),
        _fetch_annotated_habits(body.user_id, db),
        _fetch_prior_feedback(body.user_id, body.goal, db),
    )
    personal_habits = cast(list[dict], _gathered[0])
    community_raw = cast(list[dict], _gathered[1])
    questionnaire_responses = cast(dict, _gathered[2])
    profile_data = cast(Optional[dict], _gathered[3])
    annotated_raw = cast(list[dict], _gathered[4])
    prior_feedback = cast(list[str], _gathered[5])

    # --- Stage 2: deterministic profile + graph re-ranking (zero LLM calls) ---
    profile = _build_profile(body.goal, questionnaire_responses, profile_data)

    driver = await _get_neo4j_driver()
    user_habit_uuids = [str(h["uuid"]) for h in personal_habits]
    community_habits = await _rerank_habits(user_habit_uuids, list(community_raw), driver)

    # Merge candidate pool: personal first (own context), then community
    seen: set[str] = set()
    candidate_pool: list[dict] = []
    for h in personal_habits:
        uuid = str(h["uuid"])
        if uuid not in seen:
            seen.add(uuid)
            candidate_pool.append(h)
    for h in community_habits:
        uuid = str(h["uuid"])
        if uuid not in seen:
            seen.add(uuid)
            candidate_pool.append(h)

    # --- Stage 3: BCIO concepts + LightRAG in parallel ---
    all_candidate_uuids = [str(h["uuid"]) for h in candidate_pool[:20]]
    annotated_uuids = [str(h["uuid"]) for h in annotated_raw if h.get("uuid")]

    bcio_by_uuid, retrieve_resp = await asyncio.gather(
        _fetch_bcio_concepts(list(dict.fromkeys(all_candidate_uuids + annotated_uuids)), driver),
        _retrieve(RetrieveRequest(rag_query=profile.rag_query)),
    )

    # --- Build prompt ---
    personal_habits_json = _habits_to_json(candidate_pool[:10], bcio_by_uuid)
    community_habits_json = _habits_to_json(
        [h for h in candidate_pool[10:] if str(h["uuid"]) not in {str(p["uuid"]) for p in personal_habits}]
        if len(candidate_pool) > 10 else [],
        bcio_by_uuid,
    )
    annotated_habits_json = _habits_to_json(annotated_raw, bcio_by_uuid)
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
        profile_summary=profile.profile_summary,
        profile_detailed=profile.profile_detailed,
        personal_habits_json=personal_habits_json,
        annotated_habits_json=annotated_habits_json,
        community_habits_json=community_habits_json,
        sources_json=sources_json,
        prior_feedback=feedback_text,
    )

    # --- Stage 4: single LLM call ---
    raw = await chat_complete(
        messages=[{"role": "user", "content": prompt}],
        temperature=0.2,
    )

    recs = _parse_llm_response(raw, retrieve_resp.sources)

    recommendation_id = str(uuid4())
    generated_at = datetime.datetime.now(datetime.timezone.utc).isoformat()

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

    # --- Cache write ---
    if redis_client is not None:
        try:
            await redis_client.setex(key, _REDIS_TTL, json.dumps(result.model_dump()))
        except Exception as exc:  # noqa: BLE001
            logger.warning("Redis write error (%s) — result not cached.", exc)

    return result
