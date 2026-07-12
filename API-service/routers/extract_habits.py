"""POST /api/v1/llm/extract-habits — M3.1 Habit Extractor."""
from __future__ import annotations

import asyncio
import json
import logging
import os
from pathlib import Path
from typing import Any

import numpy as np
from fastapi import APIRouter, Depends, HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from neo4j import AsyncGraphDatabase  # type: ignore[import]
from pydantic import BaseModel, Field

from auth import verify_service_token
from llm_client import chat_complete
from routers._cache import _REDIS_TTL, get_redis as _get_redis, make_cache_key
from routers._embeddings import embed_texts
from routers._goal_guard import GOAL_ISOLATION_SYSTEM_MSG, GOAL_REJECTED_MSG, _INJECTION_RE

logger = logging.getLogger(__name__)

router = APIRouter(dependencies=[Depends(verify_service_token)])


# ---------------------------------------------------------------------------
# Neo4j setup — module-level singleton driver to avoid per-call handshake cost
# ---------------------------------------------------------------------------
_NEO4J_URI = os.getenv("NEO4J_URI", "bolt://neo4j:7687")
_NEO4J_USER = os.getenv("NEO4J_USER", "neo4j")
_NEO4J_PASSWORD = os.getenv("NEO4J_PASSWORD", "password")

_neo4j_driver = None
_neo4j_lock: asyncio.Lock = asyncio.Lock()


async def _get_neo4j_driver():
    """Return a shared Neo4j driver, creating it once on first use."""
    global _neo4j_driver
    if _neo4j_driver is not None:
        return _neo4j_driver
    async with _neo4j_lock:
        if _neo4j_driver is not None:
            return _neo4j_driver
        _neo4j_driver = AsyncGraphDatabase.driver(
            _NEO4J_URI, auth=(_NEO4J_USER, _NEO4J_PASSWORD)
        )
        return _neo4j_driver


async def close_neo4j_driver() -> None:
    """Close the shared Neo4j driver on app shutdown, if one was ever created.

    Mirrors deps.py's lifespan shutdown handling of Redis/Mongo — this driver
    is a module-level singleton created lazily on first use (or eagerly during
    lifespan startup's FastRP warm-up), so it must be closed explicitly rather
    than left to the OS to reap the connection on process exit.
    """
    global _neo4j_driver
    async with _neo4j_lock:
        if _neo4j_driver is not None:
            await _neo4j_driver.close()
            _neo4j_driver = None

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
_USER_HABITS_LIMIT = int(os.getenv("USER_HABITS_LIMIT", "10"))


def _cosine_scores(
    goal_vec: "np.ndarray", habit_embeddings: list[list[float]]
) -> list[float]:
    """Return cosine similarities between goal_vec and each habit embedding."""
    if not habit_embeddings:
        return []
    mat = np.array(habit_embeddings, dtype=np.float32)
    norms = np.linalg.norm(mat, axis=1, keepdims=True)
    goal_norm = float(np.linalg.norm(goal_vec))
    if goal_norm == 0:
        return [0.0] * len(habit_embeddings)
    norms = np.where(norms == 0, 1.0, norms)
    return (mat @ goal_vec / (norms.squeeze(1) * goal_norm)).tolist()


async def _vector_search_user_habits(
    goal: str, user_id: str
) -> list[dict[str, Any]]:
    """Return the user's own habits ranked by semantic similarity to the goal.

    Embeds the goal once, fetches all of the user's donated habits with their
    stored embeddings (bounded at 200 — no user will exceed this), ranks them
    by cosine similarity in Python, and returns the top USER_HABITS_LIMIT.

    Falls back to an unranked fetch (capped at USER_HABITS_LIMIT) when the
    user's habits have no embeddings yet (pre-embedding donation path).
    """
    try:
        goal_embedding = (await embed_texts([goal]))[0]
        goal_vec = np.array(goal_embedding, dtype=np.float32)
    except Exception as exc:  # noqa: BLE001
        logger.warning("Failed to embed goal for user habit search: %s", exc)
        return []

    try:
        driver = await _get_neo4j_driver()
        async with driver.session() as session:
            result = await session.run(
                """
                MATCH (h:Habit {userID: $user_id, is_habit: true})
                OPTIONAL MATCH (h)-[:HAS_CONTEXT]->(c:Context)
                RETURN h.uuid    AS uuid,
                       coalesce(h.translationEN, h.sentence) AS sentence,
                       collect({dimension: c.dimension, text: c.text}) AS ctx_items,
                       h.embedding AS embedding
                """,
                user_id=user_id,
            )
            records = await result.fetch(200)
    except Exception as exc:  # noqa: BLE001
        logger.error("Neo4j user-habit fetch failed: %s", exc)
        return []

    if not records:
        return []

    # Separate habits with and without embeddings
    with_emb: list[dict] = []
    without_emb: list[dict] = []
    for rec in records:
        ctx: dict[str, list[str]] = {dim: [] for dim in _DIMENSIONS}
        for item in rec.get("ctx_items") or []:
            d = item.get("dimension")
            t = item.get("text")
            if d and t and d in ctx:
                ctx[d].append(t)
        entry = {
            "uuid": rec["uuid"],
            "sentence": rec["sentence"],
            "context": ctx,
            "likes": 0,
        }
        if rec.get("embedding"):
            entry["_embedding"] = rec["embedding"]
            with_emb.append(entry)
        else:
            without_emb.append(entry)

    if with_emb:
        scores = _cosine_scores(goal_vec, [h["_embedding"] for h in with_emb])
        for h, s in zip(with_emb, scores):
            h["score"] = float(s)
            del h["_embedding"]
        with_emb.sort(key=lambda h: h["score"], reverse=True)
        return with_emb[: _USER_HABITS_LIMIT]

    # Fallback: no embeddings — return most-recently-added, capped
    logger.info(
        "User %s has %d habits but none have embeddings — returning unranked.",
        user_id, len(without_emb),
    )
    return without_emb[: _USER_HABITS_LIMIT]


async def _run_vector_query(
    session: object,
    index_name: str,
    embedding: list[float],
    cypher_tail: str,
    params: dict[str, Any],
) -> list[dict[str, Any]]:
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


def _records_to_habits(records: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    """Convert raw Neo4j records to a uuid-keyed habit dict."""
    habits: dict[str, dict[str, Any]] = {}
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
) -> list[dict[str, Any]]:
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

    merged: dict[str, dict[str, Any]] = {}  # uuid → habit dict
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

    async def _query_in_own_session(index_name: str, cypher_tail: str) -> list[dict[str, Any]]:
        driver = await _get_neo4j_driver()
        async with driver.session() as session:
            return await _run_vector_query(session, index_name, query_embedding, cypher_tail, params)

    try:
        habit_records, context_records, bcio_records = await asyncio.gather(
            _query_in_own_session("habit_embedding_idx", habit_tail),
            _query_in_own_session("context_embedding_idx", context_tail),
            _query_in_own_session("bcio_embedding_idx", bcio_tail),
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("Neo4j session failed during vector search: %s", exc)
        return []

    for source in (habit_records, context_records, bcio_records):
        for uuid, habit in _records_to_habits(source).items():
            if uuid not in merged or float(habit["score"]) > float(merged[uuid]["score"]):
                merged[uuid] = habit

    return sorted(merged.values(), key=lambda h: float(h["score"]), reverse=True)[:limit]


# ---------------------------------------------------------------------------
# Annotated habits (liked / saved by this user from the community)
# ---------------------------------------------------------------------------

async def fetch_annotated_habits(
    user_id: str,
    db: AsyncIOMotorDatabase,
) -> list[dict[str, Any]]:
    """Return habits this user has liked or saved, with full Neo4j context.

    Queries MongoDB habit_annotations for types helpful/iDoThis/like, then
    fetches the matching Habit nodes from Neo4j.  Returns [] on any error so
    the caller's pipeline degrades gracefully.
    """
    try:
        # Capped like _vector_search_user_habits' fetch(200) — an active
        # user's full annotation history is otherwise unbounded and would
        # feed straight into a Neo4j IN-list and, downstream, an LLM prompt.
        cursor = db["habit_annotations"].find(
            {"userId": user_id, "type": {"$in": ["helpful", "iDoThis", "like"]}},
            {"habitId": 1, "_id": 0},
        ).limit(200)
        raw_uuids: list[str] = []
        async for doc in cursor:
            hid = doc.get("habitId")
            if hid:
                raw_uuids.append(str(hid))
    except Exception as exc:  # noqa: BLE001
        logger.warning("MongoDB annotated-habits fetch failed for user %s: %s", user_id, exc)
        return []

    if not raw_uuids:
        return []

    uuids = list(dict.fromkeys(raw_uuids))  # deduplicate, preserve insertion order
    try:
        driver = await _get_neo4j_driver()
        async with driver.session() as session:
            result = await session.run(
                """
                MATCH (h:Habit {is_habit: true})
                WHERE h.uuid IN $uuids
                OPTIONAL MATCH (h)-[:HAS_CONTEXT]->(c:Context)
                RETURN h.uuid AS uuid,
                       coalesce(h.translationEN, h.sentence) AS sentence,
                       collect({dimension: c.dimension, text: c.text}) AS ctx_items,
                       coalesce(h.annotations_like, 0) AS likes
                """,
                uuids=uuids,
            )
            records = await result.data()
    except Exception as exc:  # noqa: BLE001
        logger.error("Neo4j fetch of annotated habits failed: %s", exc)
        return []

    habits: list[dict[str, Any]] = []
    for rec in records:
        ctx: dict[str, list[str]] = {dim: [] for dim in _DIMENSIONS}
        for item in rec.get("ctx_items", []):
            d = item.get("dimension")
            t = item.get("text")
            if d and t and d in ctx:
                ctx[d].append(t)
        habits.append(
            {
                "uuid": rec["uuid"],
                "sentence": rec["sentence"],
                "context": ctx,
                "likes": int(rec.get("likes", 0) or 0),
            }
        )
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
        text = raw.strip()
        start, end = text.find("{"), text.rfind("}") + 1
        if start != -1 and end > start:
            text = text[start:end]
        parsed = json.loads(text)
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
    """Select the most goal-relevant habits from the full Neo4j graph using an LLM.

    Builds a candidate pool by merging:
    - The user's own donated habits (personal, highly contextual)
    - Community habits retrieved via semantic vector search on the goal embedding

    The LLM then selects the best-fitting habits from this combined pool.
    Users with no donated habits still receive recommendations from the community graph.

    Args:
        body: Validated request payload with user_id and goal description.

    Returns:
        ExtractHabitsResponse with LLM-selected habits, a summary, and the raw
        community vector-search results for the caller to display separately.

    Raises:
        HTTPException: 422 if the goal fails the prompt-injection pre-screen;
            503 if the LLM call fails.
    """
    if _INJECTION_RE.search(body.goal):
        logger.warning(
            "Goal rejected by injection screen for user %s: %r", body.user_id, body.goal
        )
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=GOAL_REJECTED_MSG
        )

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

    # --- vector-search both pools in parallel ---
    # personal: user's own habits ranked by semantic similarity to goal (top USER_HABITS_LIMIT)
    # community: other users' habits via 3-index fan-out (top COMMUNITY_HABITS_LIMIT)
    personal_habits, community_raw = await asyncio.gather(
        _vector_search_user_habits(body.goal, body.user_id),
        _vector_search_habits(body.goal, body.user_id),
    )

    # community_habits field: all vector-search results for the caller to display
    community_habits = [
        HabitEntry(
            uuid=h["uuid"],
            sentence=h["sentence"],
            context=h["context"],
            likes=int(h.get("likes", 0)),
        )
        for h in community_raw
    ]

    # Build a merged candidate pool: personal first (more contextually relevant),
    # then community vector results. Dedup by UUID so the LLM sees each habit once.
    seen: set[str] = set()
    candidate_pool: list[dict[str, Any]] = []
    for h in personal_habits:
        if h["uuid"] not in seen:
            seen.add(str(h["uuid"]))
            candidate_pool.append(h)
    for h in community_raw:
        if str(h["uuid"]) not in seen:
            seen.add(str(h["uuid"]))
            candidate_pool.append(h)

    if not candidate_pool:
        logger.info(
            "No habits found in either personal or community graph for user %s — "
            "community habit graph may be empty.",
            body.user_id,
        )
        result = ExtractHabitsResponse(
            selected_habits=[],
            habit_summary="No relevant habits found yet — the community graph may still be growing.",
            community_habits=community_habits,
        )
        if redis_client is not None:
            try:
                await redis_client.setex(key, _REDIS_TTL, json.dumps(result.model_dump()))
            except Exception as exc:  # noqa: BLE001
                logger.warning("Redis write error (%s) — result not cached.", exc)
        return result

    # --- LLM: select best-fit habits from the merged pool ---
    habits_json = json.dumps(
        [{"uuid": h["uuid"], "sentence": h["sentence"], "context": h["context"]} for h in candidate_pool],
        ensure_ascii=False,
        indent=2,
    )
    prompt = _PROMPT_TEMPLATE.format(goal=body.goal, habits_json=habits_json)
    try:
        raw = await chat_complete(
            messages=[
                {"role": "system", "content": GOAL_ISOLATION_SYSTEM_MSG},
                {"role": "user", "content": prompt},
            ],
            temperature=0.0,
        )
    except Exception as exc:  # noqa: BLE001
        logger.error("LLM extract_habits call failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"error": "Habit extractor unavailable", "code": "llm_unavailable"},
        ) from exc

    selected_uuids, habit_summary = _parse_llm_response(raw)

    # Reconstruct selected entries from the merged pool, preserving LLM order
    uuid_to_habit = {str(h["uuid"]): h for h in candidate_pool}
    selected_habits = [
        HabitEntry(
            uuid=str(uuid),
            sentence=str(uuid_to_habit[uuid]["sentence"]),
            context=uuid_to_habit[uuid]["context"],  # type: ignore[arg-type]
            likes=int(uuid_to_habit[uuid].get("likes", 0) or 0),
        )
        for uuid in selected_uuids
        if uuid in uuid_to_habit
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
