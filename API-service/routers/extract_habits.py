"""POST /api/v1/llm/extract-habits — M3.1 Habit Extractor."""
from __future__ import annotations

import json
import logging
import os
from pathlib import Path
from typing import Any, Dict, List

from fastapi import APIRouter, Depends
from neo4j import AsyncGraphDatabase  # type: ignore[import]
from pydantic import BaseModel, Field

from auth import verify_service_token
from llm_client import chat_complete
from routers._cache import _REDIS_TTL, get_redis as _get_redis, make_cache_key

logger = logging.getLogger(__name__)

router = APIRouter(dependencies=[Depends(verify_service_token)])


# ---------------------------------------------------------------------------
# Neo4j setup
# ---------------------------------------------------------------------------
_NEO4J_URI = os.getenv("NEO4J_URI", "bolt://neo4j:7687")
_NEO4J_USER = os.getenv("NEO4J_USER", "neo4j")
_NEO4J_PASSWORD = os.getenv("NEO4J_PASSWORD", "password")

_DIMENSIONS = [
    "TIME",
    "PHYSICAL_SETTING",
    "PRIOR_BEHAVIOR",
    "OTHER_PEOPLE",
    "INTERNAL_STATE",
    "BEHAVIOR",
    "REASONING",
]


async def _fetch_habits_for_user(user_id: str) -> List[Dict[str, Any]]:
    """Fetch all Habit nodes (with context) for a given userID from Neo4j.

    Returns a list of dicts: {uuid, sentence, context: {dim: [phrases]}}
    """
    driver = AsyncGraphDatabase.driver(
        _NEO4J_URI, auth=(_NEO4J_USER, _NEO4J_PASSWORD)
    )
    habits: List[Dict[str, Any]] = []
    try:
        async with driver.session() as session:
            result = await session.run(
                """
                MATCH (h:Habit {userID: $user_id})
                OPTIONAL MATCH (h)-[:HAS_CONTEXT]->(c:Context)
                RETURN h.uuid AS uuid,
                       h.sentence AS sentence,
                       collect({dimension: c.dimension, text: c.text}) AS ctx_items
                """,
                user_id=user_id,
            )
            records = await result.fetch(1000)
            for record in records:
                ctx: Dict[str, List[str]] = {dim: [] for dim in _DIMENSIONS}
                for item in record["ctx_items"]:
                    dim = item.get("dimension")
                    text = item.get("text")
                    if dim and text and dim in ctx:
                        ctx[dim].append(text)
                habits.append(
                    {
                        "uuid": record["uuid"],
                        "sentence": record["sentence"],
                        "context": ctx,
                    }
                )
    except Exception as exc:  # noqa: BLE001
        logger.error("Neo4j query failed: %s", exc)
    finally:
        await driver.close()
    return habits


# ---------------------------------------------------------------------------
# Prompt template
# ---------------------------------------------------------------------------
_PROMPT_PATH = Path(__file__).parent.parent / "prompts" / "extract_habits.txt"
_PROMPT_TEMPLATE = _PROMPT_PATH.read_text(encoding="utf-8")


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------
class ExtractHabitsRequest(BaseModel):
    user_id: str = Field(..., max_length=128)
    goal: str = Field(..., min_length=1, max_length=2000)


class HabitEntry(BaseModel):
    uuid: str
    sentence: str
    context: Dict[str, List[str]]


class ExtractHabitsResponse(BaseModel):
    selected_habits: List[HabitEntry]
    habit_summary: str


# ---------------------------------------------------------------------------
# Helper: cache key
# ---------------------------------------------------------------------------
def _cache_key(user_id: str, goal: str) -> str:
    return make_cache_key("extract_habits", user_id, goal)


def _parse_llm_response(raw: str) -> tuple[List[str], str]:
    """Parse LLM JSON; returns (selected_uuids, habit_summary)."""
    try:
        parsed = json.loads(raw.strip())
        uuids = parsed.get("selected_habit_uuids", [])
        if not isinstance(uuids, list):
            uuids = []
        summary = parsed.get("habit_summary", "")
        if not isinstance(summary, str):
            summary = ""
        return uuids, summary
    except (json.JSONDecodeError, TypeError) as exc:
        logger.error("LLM returned unexpected format: %r (%s)", raw, exc)
        return [], "Could not extract relevant habits."


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------
@router.post("/llm/extract-habits", response_model=ExtractHabitsResponse)
async def extract_habits(body: ExtractHabitsRequest) -> ExtractHabitsResponse:
    key = _cache_key(body.user_id, body.goal)

    # --- cache read ---
    redis_client = await _get_redis()
    if redis_client is not None:
        try:
            cached = await redis_client.get(key)
            if cached:
                data = json.loads(cached)
                return ExtractHabitsResponse(**data)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Redis read error (%s) — falling back to Neo4j + LLM.", exc)

    # --- fetch habits from Neo4j ---
    all_habits = await _fetch_habits_for_user(body.user_id)

    if not all_habits:
        result = ExtractHabitsResponse(
            selected_habits=[],
            habit_summary="No habits found for this user.",
        )
        if redis_client is not None:
            try:
                await redis_client.setex(key, _REDIS_TTL, json.dumps(result.model_dump()))
            except Exception as exc:  # noqa: BLE001
                logger.warning("Redis write error (%s) — result not cached.", exc)
        return result

    # --- LLM call ---
    habits_json = json.dumps(
        [{"uuid": h["uuid"], "sentence": h["sentence"], "context": h["context"]} for h in all_habits],
        ensure_ascii=False,
        indent=2,
    )
    prompt = _PROMPT_TEMPLATE.format(goal=body.goal, habits_json=habits_json)
    raw = await chat_complete(
        messages=[{"role": "user", "content": prompt}],
        temperature=0.0,
    )

    selected_uuids, habit_summary = _parse_llm_response(raw)

    # filter to selected habits, preserving order
    uuid_set = set(selected_uuids)
    selected_habits = [
        HabitEntry(uuid=h["uuid"], sentence=h["sentence"], context=h["context"])
        for h in all_habits
        if h["uuid"] in uuid_set
    ]

    result = ExtractHabitsResponse(
        selected_habits=selected_habits,
        habit_summary=habit_summary,
    )

    # --- cache write ---
    if redis_client is not None:
        try:
            await redis_client.setex(key, _REDIS_TTL, json.dumps(result.model_dump()))
        except Exception as exc:  # noqa: BLE001
            logger.warning("Redis write error (%s) — result not cached.", exc)

    return result
