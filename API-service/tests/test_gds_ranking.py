"""Unit tests for routers._gds_ranking."""
from unittest.mock import AsyncMock, MagicMock

import pytest

from routers._gds_ranking import (
    _fetch_fastrp_embeddings,
    fetch_bcio_concepts,
    rerank_habits_with_graph,
    refresh_fastrp_embeddings,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_driver(session_results: list) -> MagicMock:
    """Build a mock Neo4j driver whose session().run().data() returns values in order."""
    mock_result = MagicMock()
    mock_result.data = AsyncMock(side_effect=session_results)

    mock_session = MagicMock()
    mock_session.run = AsyncMock(return_value=mock_result)
    mock_session.__aenter__ = AsyncMock(return_value=mock_session)
    mock_session.__aexit__ = AsyncMock(return_value=False)

    mock_driver = MagicMock()
    mock_driver.session = MagicMock(return_value=mock_session)
    return mock_driver


def _make_multi_session_driver(call_results: list) -> MagicMock:
    """Driver that returns different data() results on successive session().run() calls."""
    results_iter = iter(call_results)

    def _new_session():
        mock_result = MagicMock()
        mock_result.data = AsyncMock(return_value=next(results_iter))
        mock_session = MagicMock()
        mock_session.run = AsyncMock(return_value=mock_result)
        mock_session.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session.__aexit__ = AsyncMock(return_value=False)
        return mock_session

    mock_driver = MagicMock()
    mock_driver.session = MagicMock(side_effect=_new_session)
    return mock_driver


# ---------------------------------------------------------------------------
# refresh_fastrp_embeddings
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_refresh_returns_true_on_success():
    """Returns True when GDS projection and FastRP.write both succeed."""
    mock_session = MagicMock()
    mock_session.run = AsyncMock()
    mock_session.__aenter__ = AsyncMock(return_value=mock_session)
    mock_session.__aexit__ = AsyncMock(return_value=False)

    mock_driver = MagicMock()
    mock_driver.session = MagicMock(return_value=mock_session)

    result = await refresh_fastrp_embeddings(mock_driver)
    assert result is True


@pytest.mark.asyncio
async def test_refresh_returns_false_when_projection_fails():
    """Returns False when gds.graph.project raises (GDS not installed)."""
    call_count = 0

    async def _run_side_effect(*_):
        nonlocal call_count
        call_count += 1
        if call_count == 2:  # second call = project (first = drop)
            raise RuntimeError("GDS not available")

    mock_session = MagicMock()
    mock_session.run = AsyncMock(side_effect=_run_side_effect)
    mock_session.__aenter__ = AsyncMock(return_value=mock_session)
    mock_session.__aexit__ = AsyncMock(return_value=False)

    mock_driver = MagicMock()
    mock_driver.session = MagicMock(return_value=mock_session)

    result = await refresh_fastrp_embeddings(mock_driver)
    assert result is False


@pytest.mark.asyncio
async def test_refresh_returns_false_when_fastrp_write_fails():
    """Returns False when gds.fastRP.write raises."""
    call_count = 0

    async def _run_side_effect(*_):
        nonlocal call_count
        call_count += 1
        if call_count == 3:  # third call = fastRP.write
            raise RuntimeError("FastRP write failed")

    mock_session = MagicMock()
    mock_session.run = AsyncMock(side_effect=_run_side_effect)
    mock_session.__aenter__ = AsyncMock(return_value=mock_session)
    mock_session.__aexit__ = AsyncMock(return_value=False)

    mock_driver = MagicMock()
    mock_driver.session = MagicMock(return_value=mock_session)

    result = await refresh_fastrp_embeddings(mock_driver)
    assert result is False


# ---------------------------------------------------------------------------
# fetch_bcio_concepts
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_fetch_bcio_concepts_returns_empty_for_no_uuids():
    mock_driver = MagicMock()
    result = await fetch_bcio_concepts([], mock_driver)
    assert result == {}
    mock_driver.session.assert_not_called()


@pytest.mark.asyncio
async def test_fetch_bcio_concepts_maps_concepts():
    neo4j_records = [
        {"uuid": "h-1", "bcio_concepts": ["Habit formation", "Self-monitoring"]},
        {"uuid": "h-2", "bcio_concepts": ["Social support"]},
    ]
    driver = _make_driver([neo4j_records])

    result = await fetch_bcio_concepts(["h-1", "h-2"], driver)

    assert result["h-1"] == ["Habit formation", "Self-monitoring"]
    assert result["h-2"] == ["Social support"]


@pytest.mark.asyncio
async def test_fetch_bcio_concepts_filters_null_concepts():
    neo4j_records = [
        {"uuid": "h-1", "bcio_concepts": ["Habit formation", None, ""]},
    ]
    driver = _make_driver([neo4j_records])

    result = await fetch_bcio_concepts(["h-1"], driver)
    assert result["h-1"] == ["Habit formation"]


@pytest.mark.asyncio
async def test_fetch_bcio_concepts_returns_empty_on_driver_error():
    mock_session = MagicMock()
    mock_session.run = AsyncMock(side_effect=RuntimeError("Neo4j unavailable"))
    mock_session.__aenter__ = AsyncMock(return_value=mock_session)
    mock_session.__aexit__ = AsyncMock(return_value=False)
    mock_driver = MagicMock()
    mock_driver.session = MagicMock(return_value=mock_session)

    result = await fetch_bcio_concepts(["h-1"], mock_driver)
    assert result == {}


# ---------------------------------------------------------------------------
# rerank_habits_with_graph
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_rerank_returns_empty_for_empty_community():
    mock_driver = MagicMock()
    result = await rerank_habits_with_graph(["u-1"], [], mock_driver)
    assert result == []


@pytest.mark.asyncio
async def test_rerank_returns_unchanged_when_no_user_habits():
    """With no user habits, FastRP centroid cannot be computed — return unchanged."""
    habits = [
        {"uuid": "c-1", "sentence": "walk daily", "context": {}, "likes": 5, "score": 0.8},
        {"uuid": "c-2", "sentence": "drink water", "context": {}, "likes": 1, "score": 0.6},
    ]
    mock_driver = MagicMock()
    result = await rerank_habits_with_graph([], habits, mock_driver)
    # No reranking — returned unchanged
    assert result[0]["uuid"] == "c-1"
    assert result[1]["uuid"] == "c-2"


@pytest.mark.asyncio
async def test_rerank_returns_unchanged_when_no_fastrp_embeddings():
    """If no FastRP embeddings exist in Neo4j, habits are returned in original order."""
    habits = [
        {"uuid": "c-1", "sentence": "walk", "context": {}, "likes": 3, "score": 0.9},
        {"uuid": "c-2", "sentence": "jog", "context": {}, "likes": 0, "score": 0.5},
    ]
    # Both user and community FastRP queries return empty
    driver = _make_multi_session_driver([[], []])

    result = await rerank_habits_with_graph(["u-1", "u-2"], habits, driver)
    # No embeddings → falls back unchanged
    assert len(result) == 2
    assert result[0]["uuid"] == "c-1"


@pytest.mark.asyncio
async def test_rerank_applies_hybrid_scoring():
    """When FastRP embeddings are available, hybrid score changes ordering."""
    # User centroid will point in direction [1, 0, 0, 0]
    user_emb = [1.0, 0.0, 0.0, 0.0]
    # c-1 is orthogonal to user centroid → graph_score ≈ 0
    # c-2 is aligned with user centroid → graph_score ≈ 1
    habits = [
        {"uuid": "c-1", "sentence": "walk", "context": {}, "likes": 0, "score": 0.9},
        {"uuid": "c-2", "sentence": "jog", "context": {}, "likes": 0, "score": 0.5},
    ]
    c1_emb = [0.0, 1.0, 0.0, 0.0]  # orthogonal to user → low graph score
    c2_emb = [1.0, 0.0, 0.0, 0.0]  # aligned with user → high graph score

    driver = _make_multi_session_driver(
        [
            [{"uuid": "u-1", "emb": user_emb}],          # user habits FastRP
            [{"uuid": "c-1", "emb": c1_emb}, {"uuid": "c-2", "emb": c2_emb}],  # community FastRP
        ]
    )

    result = await rerank_habits_with_graph(["u-1"], habits, driver)

    # c-2 should rise above c-1 due to high graph alignment
    assert result[0]["uuid"] == "c-2"


@pytest.mark.asyncio
async def test_rerank_endorsement_boosts_liked_habits():
    """Habits with many likes get an endorsement boost in the hybrid score."""
    user_emb = [1.0, 0.0, 0.0, 0.0]
    # Both habits are equally aligned with user centroid
    emb = [1.0, 0.0, 0.0, 0.0]
    habits = [
        {"uuid": "c-low", "sentence": "low likes", "context": {}, "likes": 0, "score": 0.5},
        {"uuid": "c-high", "sentence": "many likes", "context": {}, "likes": 50, "score": 0.5},
    ]
    driver = _make_multi_session_driver(
        [
            [{"uuid": "u-1", "emb": user_emb}],
            [{"uuid": "c-low", "emb": emb}, {"uuid": "c-high", "emb": emb}],
        ]
    )

    result = await rerank_habits_with_graph(["u-1"], habits, driver)
    assert result[0]["uuid"] == "c-high"


@pytest.mark.asyncio
async def test_rerank_degrades_gracefully_on_driver_error():
    """If Neo4j is unreachable, habits are returned in original order without crashing."""
    habits = [
        {"uuid": "c-1", "sentence": "walk", "context": {}, "likes": 0, "score": 0.8},
    ]
    mock_session = MagicMock()
    mock_session.run = AsyncMock(side_effect=RuntimeError("connection refused"))
    mock_session.__aenter__ = AsyncMock(return_value=mock_session)
    mock_session.__aexit__ = AsyncMock(return_value=False)
    mock_driver = MagicMock()
    mock_driver.session = MagicMock(return_value=mock_session)

    result = await rerank_habits_with_graph(["u-1"], habits, mock_driver)
    assert len(result) == 1
    assert result[0]["uuid"] == "c-1"


# ---------------------------------------------------------------------------
# _fetch_fastrp_embeddings (internal helper — tested via public surface)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_fetch_fastrp_returns_empty_for_no_uuids():
    mock_driver = MagicMock()
    result = await _fetch_fastrp_embeddings([], mock_driver)
    assert result == {}
    mock_driver.session.assert_not_called()


@pytest.mark.asyncio
async def test_fetch_fastrp_returns_dict_keyed_by_uuid():
    records = [{"uuid": "h-1", "emb": [0.1, 0.2, 0.3]}]
    driver = _make_driver([records])

    result = await _fetch_fastrp_embeddings(["h-1"], driver)
    assert "h-1" in result
    assert result["h-1"] == [0.1, 0.2, 0.3]
