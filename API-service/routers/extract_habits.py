"""POST /api/v1/llm/extract-habits — M3.1 Habit Extractor."""
from __future__ import annotations

import asyncio
import json
import logging
import os
from pathlib import Path

from fastapi import APIRouter, Depends
from neo4j import AsyncGraphDatabase  # type: ignore[import]
from pydantic import BaseModel, Field

from auth import verify_service_token
from llm_client import chat_complete
from routers._cache import _REDIS_TTL, get_redis as _get_redis, make_cache_key
from routers._embeddings import embed_texts

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


_COMMUNITY_HABITS_LIMIT = int(os.getenv("COMMUNITY_HABITS_LIMIT", "10"))


async def _fetch_habits_for_user(user_id: str) -> list[dict[str, object]]:
    """Fetch all Habit nodes (with context) for a given userID from Neo4j.

    Returns a list of dicts: {uuid, sentence, context: {dim: [phrases]}}
    """
    driver = AsyncGraphDatabase.driver(
        _NEO4J_URI, auth=(_NEO4J_USER, _NEO4J_PASSWORD)
    )
    habits: list[dict[str, object]] = []
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
                ctx: dict[str, list[str]] = {dim: [] for dim in _DIMENSIONS}
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


async def _run_vector_query(
    session: object,
    index_name: str,
    embedding: list[float],
    cypher_tail: str,
    params: dict[str, object],
) -> list[dict[str, object]]:
    """Run a single vector index query and return raw records as dicts."""
    try:
        cypher = (
            f"CALL db.index.vector.queryNodes('{index_name}', $limit, $embedding) "
            f"YIELD node, score\n{cypher_tail}"
        )
        result = await session.run(cypher, embedding=embedding, **params)  # type: ignore[union-attr]
        return await result.data()
    except Exception as exc:  # noqa: BLE001
        logger.warning("Vector query on '%s' failed (index may not exist): %s", index_name, exc)
        return []


def _records_to_habits(records: list[dict]) -> dict[str, dict]:
    """Convert raw Neo4j records to a uuid-keyed habit dict."""
    habits: dict[str, dict] = {}
    for record in records:
        uuid = record.get("uuid")
        if not uuid:
            continue
        ctx: dict[str, list[str]] = {dim: [] for dim in _DIMENSIONS}
        for item in record.get("ctx_items", []):
            dim = item.get("dimension")
            text = item.get("text")
            if dim and text and dim in ctx:
                ctx[dim].append(text)
        score = float(record.get("score", 0.0))
        if uuid not in habits or score > float(habits[uuid]["score"]):
            habits[uuid] = {
                "uuid": uuid,
                "sentence": record.get("sentence", ""),
                "context": ctx,
                "likes": int(record.get("likes", 0) or 0),
                "score": score,
            }
    return habits


async def _vector_search_habits(
    goal: str, exclude_user_id: str
) -> list[dict[str, object]]:
    """Fan out across habit, context, and BCIO vector indexes to find community habits.

    Embeds the goal once, then queries all three Neo4j vector indexes in parallel:
    - habit_embedding_idx  : direct sentence-level match
    - context_embedding_idx: situational match (e.g. goal "feeling down" ≈ INTERNAL_STATE phrase)
    - bcio_embedding_idx   : behavior-technique match (e.g. goal ≈ "social support seeking")

    Results from all three paths are merged by habit UUID, keeping the max score.
    Returns an empty list gracefully if indexes do not yet exist.
    """
    try:
        query_embedding = (await embed_texts([goal]))[0]
    except Exception as exc:  # noqa: BLE001
        logger.warning("Embedding goal for vector search failed: %s", exc)
        return []

    driver = AsyncGraphDatabase.driver(
        _NEO4J_URI, auth=(_NEO4J_USER, _NEO4J_PASSWORD)
    )
    merged: dict[str, dict[str, object]] = {}
    limit = _COMMUNITY_HABITS_LIMIT
    params = {"limit": limit, "exclude_user_id": exclude_user_id}

    habit_tail = """
        WHERE node.userID <> $exclude_user_id AND node.is_habit = true
        WITH node AS h, score
        OPTIONAL MATCH (h)-[:HAS_CONTEXT]->(c:Context)
        RETURN h.uuid AS uuid,
               coalesce(h.translationEN, h.sentence) AS sentence,
               collect({dimension: c.dimension, text: c.text}) AS ctx_items,
               coalesce(h.annotations_like, 0) AS likes,
               score
    """
    context_tail = """
        MATCH (h:Habit)-[:HAS_CONTEXT]->(node)
        WHERE h.userID <> $exclude_user_id AND h.is_habit = true
        WITH h, score
        OPTIONAL MATCH (h)-[:HAS_CONTEXT]->(c:Context)
        RETURN h.uuid AS uuid,
               coalesce(h.translationEN, h.sentence) AS sentence,
               collect({dimension: c.dimension, text: c.text}) AS ctx_items,
               coalesce(h.annotations_like, 0) AS likes,
               score
    """
    bcio_tail = """
        MATCH (c:Context)-[:MAPS_TO]->(node)
        MATCH (h:Habit)-[:HAS_CONTEXT]->(c)
        WHERE h.userID <> $exclude_user_id AND h.is_habit = true
        WITH h, score
        OPTIONAL MATCH (h)-[:HAS_CONTEXT]->(ctx:Context)
        RETURN h.uuid AS uuid,
               coalesce(h.translationEN, h.sentence) AS sentence,
               collect({dimension: ctx.dimension, text: ctx.text}) AS ctx_items,
               coalesce(h.annotations_like, 0) AS likes,
               score
    """

    try:
        async with driver.session() as session:
            habit_records, context_records, bcio_records = await asyncio.gather(
                _run_vector_query(session, "habit_embedding_idx", query_embedding, habit_tail, params),
                _run_vector_query(session, "context_embedding_idx", query_embedding, context_tail, params),
                _run_vector_query(session, "bcio_embedding_idx", query_embedding, bcio_tail, params),
            )
    except Exception as exc:  # noqa: BLE001
        logger.warning("Neo4j session failed during vector search: %s", exc)
        return []
    finally:
        await driver.close()

    for source in (habit_records, context_records, bcio_records):
        for uuid, habit in _records_to_habits(source).items():
            if uuid not in merged or float(habit["score"]) > float(merged[uuid]["score"]):
                merged[uuid] = habit

    return sorted(merged.values(), key=lambda h: float(h["score"]), reverse=True)[:limit]


# ---------------------------------------------------------------------------
# Prompt template
# ---------------------------------------------------------------------------
_PROMPT_PATH = Path(__file__).parent.parent / "prompts" / "extract_habits.txt"
_PROMPT_TEMPLATE = _PROMPT_PATH.read_text(encoding="utf-8")


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------
class ExtractHabitsRequest(BaseModel):
    """Input payload for the extract-habits endpoint."""

    user_id: str = Field(..., max_length=128)
    goal: str = Field(..., min_length=1, max_length=2000)


class HabitEntry(BaseModel):
    """A single habit with its UUID, sentence, and BCIO context dimension phrases."""

    uuid: str
    sentence: str
    context: dict[str, list[str]]
    likes: int = 0


class ExtractHabitsResponse(BaseModel):
    """LLM-selected habits most relevant to the user's goal, plus a summary."""

    selected_habits: list[HabitEntry]
    habit_summary: str
    community_habits: list[HabitEntry] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Helper: cache key
# ---------------------------------------------------------------------------
def _cache_key(user_id: str, goal: str) -> str:
    """Build a namespaced Redis cache key for the extract-habits result."""
    return make_cache_key("extract_habits", user_id, goal)


def _parse_llm_response(raw: str) -> tuple[list[str], str]:
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
    """Select the user's most goal-relevant habits from Neo4j using an LLM.

    Args:
        body: Validated request payload with user_id and goal description.

    Returns:
        ExtractHabitsResponse containing the LLM-selected habits and a habit summary.

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
                return ExtractHabitsResponse(**data)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Redis read error (%s) — falling back to Neo4j + LLM.", exc)

    # --- fetch user habits + community habits in parallel ---
    all_habits, community_raw = await asyncio.gather(
        _fetch_habits_for_user(body.user_id),
        _vector_search_habits(body.goal, body.user_id),
    )

    community_habits = [
        HabitEntry(
            uuid=h["uuid"],
            sentence=h["sentence"],
            context=h["context"],
            likes=int(h.get("likes", 0)),
        )
        for h in community_raw
    ]

    if not all_habits:
        result = ExtractHabitsResponse(
            selected_habits=[],
            habit_summary="No habits found for this user.",
            community_habits=community_habits,
        )
        if redis_client is not None:
            try:
                await redis_client.setex(key, _REDIS_TTL, json.dumps(result.model_dump()))
            except Exception as exc:  # noqa: BLE001
                logger.warning("Redis write error (%s) — result not cached.", exc)
        return result

    # --- LLM call to filter user's own habits ---
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
        community_habits=community_habits,
    )

    # --- cache write ---
    if redis_client is not None:
        try:
            await redis_client.setex(key, _REDIS_TTL, json.dumps(result.model_dump()))
        except Exception as exc:  # noqa: BLE001
            logger.warning("Redis write error (%s) — result not cached.", exc)

    return result
