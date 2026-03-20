"""Unit tests for POST /api/v1/llm/map-bcio."""
from unittest.mock import AsyncMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from main import app


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _unit_vec(n: int, idx: int) -> list:
    """Return a unit vector of length *n* with 1.0 at position *idx*."""
    v = [0.0] * n
    v[idx] = 1.0
    return v


FAKE_CONCEPTS = [
    {
        "id": "http://bcio.bcw.ac.uk/ontology/bcio#PhysicalActivity",
        "label": "physical activity",
        "embedding": _unit_vec(4, 0),  # [1, 0, 0, 0]
    },
    {
        "id": "http://bcio.bcw.ac.uk/ontology/bcio#StressAnxiety",
        "label": "stress and anxiety",
        "embedding": _unit_vec(4, 1),  # [0, 1, 0, 0]
    },
    {
        "id": "http://bcio.bcw.ac.uk/ontology/bcio#MorningRoutine",
        "label": "morning routine",
        "embedding": _unit_vec(4, 2),  # [0, 0, 1, 0]
    },
]

FAKE_INDEX = {
    "hash": "fake-hash-abc123",
    "concepts": FAKE_CONCEPTS,
}


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_known_phrase_maps_to_correct_concept():
    """A known BCIO phrase maps to the correct concept with confidence > 0.75."""
    # Phrase embedding identical to "physical activity" → cosine similarity = 1.0
    phrase_embedding = _unit_vec(4, 0)

    with (
        patch("routers.map_bcio._get_index", new=AsyncMock(return_value=FAKE_INDEX)),
        patch(
            "routers.map_bcio._embed_texts",
            new=AsyncMock(return_value=[phrase_embedding]),
        ),
    ):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post(
                "/api/v1/llm/map-bcio",
                json={
                    "uuid": "test-uuid-001",
                    "context_phrases": {
                        "BEHAVIOR": ["physical activity"],
                    },
                },
            )

    assert resp.status_code == 200
    data = resp.json()
    assert len(data["mappings"]) == 1
    mapping = data["mappings"][0]
    assert mapping["phrase"] == "physical activity"
    assert mapping["dimension"] == "BEHAVIOR"
    assert mapping["bcio_concept_id"] == "http://bcio.bcw.ac.uk/ontology/bcio#PhysicalActivity"
    assert mapping["bcio_concept_label"] == "physical activity"
    assert mapping["confidence"] > 0.75


@pytest.mark.asyncio
async def test_low_confidence_phrases_excluded():
    """Phrases orthogonal to all concepts (confidence ≈ 0) are excluded from results."""
    # Orthogonal to all fake concept vectors → cosine similarity = 0.0
    phrase_embedding = _unit_vec(4, 3)

    with (
        patch("routers.map_bcio._get_index", new=AsyncMock(return_value=FAKE_INDEX)),
        patch(
            "routers.map_bcio._embed_texts",
            new=AsyncMock(return_value=[phrase_embedding]),
        ),
    ):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post(
                "/api/v1/llm/map-bcio",
                json={
                    "uuid": "test-uuid-002",
                    "context_phrases": {
                        "INTERNAL_STATE": ["some unrelated phrase"],
                    },
                },
            )

    assert resp.status_code == 200
    assert resp.json()["mappings"] == []


@pytest.mark.asyncio
async def test_multiple_phrases_mapped_independently():
    """Multiple phrases across dimensions are each mapped to their best concept."""
    # phrase 0 → physical activity (idx 0), phrase 1 → morning routine (idx 2)
    embeddings = [_unit_vec(4, 0), _unit_vec(4, 2)]

    with (
        patch("routers.map_bcio._get_index", new=AsyncMock(return_value=FAKE_INDEX)),
        patch(
            "routers.map_bcio._embed_texts",
            new=AsyncMock(return_value=embeddings),
        ),
    ):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post(
                "/api/v1/llm/map-bcio",
                json={
                    "uuid": "test-uuid-003",
                    "context_phrases": {
                        "BEHAVIOR": ["walking"],
                        "TIME": ["every morning"],
                    },
                },
            )

    assert resp.status_code == 200
    data = resp.json()
    assert len(data["mappings"]) == 2
    labels = {m["bcio_concept_label"] for m in data["mappings"]}
    assert "physical activity" in labels
    assert "morning routine" in labels


@pytest.mark.asyncio
async def test_empty_context_phrases_returns_empty_mappings():
    """Empty context_phrases dict returns empty mappings without calling _embed_texts."""
    with (
        patch("routers.map_bcio._get_index", new=AsyncMock(return_value=FAKE_INDEX)),
        patch("routers.map_bcio._embed_texts", new=AsyncMock()) as mock_embed,
    ):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post(
                "/api/v1/llm/map-bcio",
                json={
                    "uuid": "test-uuid-004",
                    "context_phrases": {},
                },
            )
        mock_embed.assert_not_called()

    assert resp.status_code == 200
    assert resp.json()["mappings"] == []


@pytest.mark.asyncio
async def test_missing_owl_file_returns_empty_mappings():
    """When the BCIO index is unavailable the endpoint returns empty mappings gracefully."""
    with patch("routers.map_bcio._get_index", new=AsyncMock(return_value=None)):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post(
                "/api/v1/llm/map-bcio",
                json={
                    "uuid": "test-uuid-005",
                    "context_phrases": {"BEHAVIOR": ["running"]},
                },
            )

    assert resp.status_code == 200
    assert resp.json()["mappings"] == []
