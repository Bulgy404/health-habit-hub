"""Unit tests for POST /api/v1/llm/classify-context."""
import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from main import app


@pytest.mark.asyncio
async def test_habit_sentence_produces_nonempty_behavior():
    """A known habit sentence produces a non-empty BEHAVIOR field."""
    llm_reply = json.dumps({
        "TIME": ["every morning"],
        "PHYSICAL_SETTING": [],
        "PRIOR_BEHAVIOR": [],
        "OTHER_PEOPLE": [],
        "INTERNAL_STATE": [],
        "BEHAVIOR": ["walk 10 000 steps"],
        "REASONING": [],
    })

    with (
        patch("routers.classify_context._get_redis", new=AsyncMock(return_value=None)),
        patch("routers.classify_context.chat_complete", new=AsyncMock(return_value=llm_reply)),
    ):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post(
                "/api/v1/llm/classify-context",
                json={
                    "uuid": "test-uuid-001",
                    "sentence": "I walk 10 000 steps every morning",
                    "language": "en",
                },
            )

    assert resp.status_code == 200
    data = resp.json()
    assert data["uuid"] == "test-uuid-001"
    assert data["sentence"] == "I walk 10 000 steps every morning"
    assert data["language"] == "en"
    assert len(data["BEHAVIOR"]) > 0
    assert "walk 10 000 steps" in data["BEHAVIOR"]
    assert data["TIME"] == ["every morning"]


@pytest.mark.asyncio
async def test_non_habit_input_handled_gracefully():
    """Invalid JSON from LLM produces all-empty dimension lists (no crash)."""
    with (
        patch("routers.classify_context._get_redis", new=AsyncMock(return_value=None)),
        patch(
            "routers.classify_context.chat_complete",
            new=AsyncMock(return_value="not valid json at all"),
        ),
    ):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post(
                "/api/v1/llm/classify-context",
                json={
                    "uuid": "test-uuid-002",
                    "sentence": "The weather is nice today",
                    "language": "en",
                },
            )

    assert resp.status_code == 200
    data = resp.json()
    for dim in ["TIME", "PHYSICAL_SETTING", "PRIOR_BEHAVIOR", "OTHER_PEOPLE", "INTERNAL_STATE", "BEHAVIOR", "REASONING"]:
        assert isinstance(data[dim], list)
        assert data[dim] == []


@pytest.mark.asyncio
async def test_cache_hit_returns_cached_value():
    """When Redis has a cached result the LLM is NOT called."""
    cached_dims = {
        "TIME": ["after dinner"],
        "PHYSICAL_SETTING": ["at home"],
        "PRIOR_BEHAVIOR": [],
        "OTHER_PEOPLE": [],
        "INTERNAL_STATE": [],
        "BEHAVIOR": ["meditate for 20 minutes"],
        "REASONING": ["to reduce stress"],
    }
    cached_payload = json.dumps(cached_dims)

    mock_redis = MagicMock()
    mock_redis.get = AsyncMock(return_value=cached_payload)
    mock_redis.setex = AsyncMock()

    with (
        patch("routers.classify_context._get_redis", new=AsyncMock(return_value=mock_redis)),
        patch("routers.classify_context.chat_complete", new=AsyncMock()) as mock_llm,
    ):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post(
                "/api/v1/llm/classify-context",
                json={
                    "uuid": "test-uuid-003",
                    "sentence": "I meditate for 20 minutes at home after dinner to reduce stress",
                    "language": "en",
                },
            )

        mock_llm.assert_not_called()

    assert resp.status_code == 200
    data = resp.json()
    assert data["BEHAVIOR"] == ["meditate for 20 minutes"]
    assert data["TIME"] == ["after dinner"]
    assert data["PHYSICAL_SETTING"] == ["at home"]
    assert data["REASONING"] == ["to reduce stress"]
    assert data["uuid"] == "test-uuid-003"
