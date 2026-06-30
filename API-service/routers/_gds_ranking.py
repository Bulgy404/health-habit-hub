"""Neo4j GDS FastRP habit re-ranking and BCIO concept fetching.

FastRP (Fast Random Projection) generates graph-aware embeddings that capture
multi-hop neighbourhood structure — e.g. habits sharing BCIO concepts cluster
together even when their sentence embeddings differ.  This gives the recommender
a structural signal that pure cosine/vector search misses.

Setup (called once at startup via deps.py):
    await refresh_fastrp_embeddings(driver)

At recommendation time (called from recommend.py):
    community = await rerank_habits_with_graph(user_uuids, community_habits, driver)
    bcio      = await fetch_bcio_concepts(all_habit_uuids, driver)

All functions degrade gracefully if the Neo4j GDS plugin is not installed or
FastRP embeddings have not yet been computed — the recommendation pipeline
continues with semantic scores only.
"""
from __future__ import annotations

import logging
import math
from typing import Optional

import numpy as np

logger = logging.getLogger(__name__)

_GDS_GRAPH_NAME = "habit-behavior-graph"
_FASTRP_DIM = 128
_FASTRP_PROPERTY = "fastrp_embedding"


async def refresh_fastrp_embeddings(driver) -> bool:
    """Project the habit-context-BCIO graph and write FastRP embeddings to Habit nodes.

    Projects Habit, Context, and BCIOConcept nodes with HAS_CONTEXT and MAPS_TO
    relationships (undirected), then runs FastRP to write graph-topology embeddings
    as the `fastrp_embedding` property on every node in the projection.

    Safe to call repeatedly — drops the existing in-memory projection first.
    Returns True on success, False if GDS is unavailable or the graph is empty.
    """
    async with driver.session() as session:
        # Drop stale projection (ignore if it doesn't exist)
        try:
            await session.run(
                "CALL gds.graph.drop($name, false) YIELD graphName",
                name=_GDS_GRAPH_NAME,
            )
        except Exception:
            pass

        try:
            await session.run(
                """
                CALL gds.graph.project(
                    $name,
                    ['Habit', 'Context', 'BCIOConcept'],
                    {
                        HAS_CONTEXT: {orientation: 'UNDIRECTED'},
                        MAPS_TO: {orientation: 'UNDIRECTED'}
                    }
                ) YIELD graphName
                """,
                name=_GDS_GRAPH_NAME,
            )
        except Exception as exc:
            logger.warning("GDS graph projection failed (plugin may not be installed): %s", exc)
            return False

        try:
            await session.run(
                """
                CALL gds.fastRP.write(
                    $name,
                    {
                        embeddingDimension: $dim,
                        iterationWeights: [0.0, 1.0, 1.0],
                        writeProperty: $prop
                    }
                ) YIELD nodePropertiesWritten
                """,
                name=_GDS_GRAPH_NAME,
                dim=_FASTRP_DIM,
                prop=_FASTRP_PROPERTY,
            )
            logger.info("FastRP embeddings written to node property '%s'.", _FASTRP_PROPERTY)
            return True
        except Exception as exc:
            logger.warning("GDS fastRP.write failed: %s", exc)
            return False


async def fetch_bcio_concepts(
    habit_uuids: list[str], driver
) -> dict[str, list[str]]:
    """Return BCIO concept labels for each habit UUID via Habit→Context→BCIOConcept.

    Used to add behavioural-mechanism context to each habit entry in the LLM
    prompt, enabling the model to reference specific BCIOConcepts in rationales.
    Returns an empty dict on any error so the pipeline degrades gracefully.
    """
    if not habit_uuids:
        return {}
    try:
        async with driver.session() as session:
            result = await session.run(
                """
                MATCH (h:Habit)
                WHERE h.uuid IN $uuids
                OPTIONAL MATCH (h)-[:HAS_CONTEXT]->(c:Context)-[:MAPS_TO]->(b:BCIOConcept)
                RETURN h.uuid AS uuid,
                       collect(DISTINCT coalesce(b.label, b.prefLabel, b.name)) AS bcio_concepts
                """,
                uuids=habit_uuids,
            )
            records = await result.data()
    except Exception as exc:
        logger.warning("BCIO concept fetch failed: %s", exc)
        return {}

    return {
        r["uuid"]: [c for c in (r["bcio_concepts"] or []) if c]
        for r in records
        if r.get("uuid")
    }


async def rerank_habits_with_graph(
    user_habit_uuids: list[str],
    community_habits: list[dict],
    driver,
) -> list[dict]:
    """Re-rank community habits using a three-signal hybrid score.

    Blends:
      50% semantic score  — cosine of sentence embedding vs goal (already set)
      30% graph score     — cosine of habit FastRP embedding vs user centroid
      20% endorsement     — log-normalised community like count

    The user centroid is the mean of FastRP embeddings of the user's existing
    habits: it represents the user's current position in behaviour-change concept
    space.  Community habits structurally close to that position score higher.

    Falls back to the original ordering when FastRP embeddings are absent.
    """
    if not community_habits:
        return community_habits

    user_centroid: Optional[np.ndarray] = None
    if user_habit_uuids:
        user_centroid = await _compute_user_centroid(user_habit_uuids, driver)

    fastrp_by_uuid: dict[str, list[float]] = {}
    if user_centroid is not None:
        fastrp_by_uuid = await _fetch_fastrp_embeddings(
            [h["uuid"] for h in community_habits], driver
        )

    # If no FastRP data is available, return habits in their original order
    if user_centroid is None and not fastrp_by_uuid:
        return community_habits

    max_likes = max((int(h.get("likes", 0)) for h in community_habits), default=1) or 1

    for habit in community_habits:
        semantic = float(habit.get("score", 0.0))

        graph_score = 0.0
        if user_centroid is not None:
            emb_raw = fastrp_by_uuid.get(str(habit["uuid"]))
            if emb_raw:
                emb = np.array(emb_raw, dtype=np.float32)
                norm = float(np.linalg.norm(emb))
                if norm > 0:
                    graph_score = float(np.dot(user_centroid, emb / norm))

        likes = int(habit.get("likes", 0))
        endorsement = math.log1p(likes) / math.log1p(max_likes)
        habit["score"] = 0.5 * semantic + 0.3 * graph_score + 0.2 * endorsement

    return sorted(community_habits, key=lambda h: float(h.get("score", 0)), reverse=True)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

async def _compute_user_centroid(
    user_habit_uuids: list[str], driver
) -> Optional[np.ndarray]:
    """Return the normalised centroid of the user's habits' FastRP embeddings."""
    embeddings = await _fetch_fastrp_embeddings(user_habit_uuids, driver)
    if not embeddings:
        return None
    mat = np.array(list(embeddings.values()), dtype=np.float32)
    centroid = mat.mean(axis=0)
    norm = float(np.linalg.norm(centroid))
    return centroid / norm if norm > 0 else None


async def _fetch_fastrp_embeddings(
    uuids: list[str], driver
) -> dict[str, list[float]]:
    """Return {uuid: fastrp_embedding} for Habit nodes that have the property set."""
    if not uuids:
        return {}
    try:
        async with driver.session() as session:
            result = await session.run(
                f"MATCH (h:Habit) WHERE h.uuid IN $uuids "
                f"AND h.{_FASTRP_PROPERTY} IS NOT NULL "
                f"RETURN h.uuid AS uuid, h.{_FASTRP_PROPERTY} AS emb",
                uuids=uuids,
            )
            records = await result.data()
        return {r["uuid"]: r["emb"] for r in records if r.get("uuid")}
    except Exception as exc:
        logger.warning("FastRP embedding fetch failed: %s", exc)
        return {}
