"""Unit tests for POST /api/v1/llm/extract-habits."""
import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from main import app

_HABITS = [
    {
        "uuid": "uuid-1",
        "sentence": "I walk 10 000 steps every morning",
        "context": {
            "TIME": ["every morning"],
            "PHYSICAL_SETTING": [],
            "PRIOR_BEHAVIOR": [],
            "OTHER_PEOPLE": [],
            "INTERNAL_STATE": [],
            "BEHAVIOR": ["walk 10 000 steps"],
            "REASONING": [],
        },
    },
    {
        "uuid": "uuid-2",
        "sentence": "I drink a glass of water before each meal",
        "context": {
            "TIME": ["before each meal"],
            "PHYSICAL_SETTING": [],
            "PRIOR_BEHAVIOR": [],
            "OTHER_PEOPLE": [],
            "INTERNAL_STATE": [],
            "BEHAVIOR": ["drink a glass of water"],
            "REASONING": ["to stay hydrated"],
        },
    },
]

_LLM_REPLY = json.dumps({
    "selected_habit_uuids": ["uuid-1"],
    "habit_summary": "Walking 10 000 steps each morning supports a general fitness goal.",
})


@pytest.mark.asyncio
async def test_returns_selected_habits():
    """LLM-selected habit UUIDs are returned with full context."""
    with (
        patch("routers.extract_habits._get_redis", new=AsyncMock(return_value=None)),
        patch("routers.extract_habits._fetch_habits_for_user", new=AsyncMock(return_value=_HABITS)),
        patch("routers.extract_habits.chat_complete", new=AsyncMock(return_value=_LLM_REPLY)),
    ):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post(
                "/api/v1/llm/extract-habits",
                json={"user_id": "user-abc", "goal": "improve fitness"},
            )

    assert resp.status_code == 200
    data = resp.json()
    assert len(data["selected_habits"]) == 1
    habit = data["selected_habits"][0]
    assert habit["uuid"] == "uuid-1"
    assert habit["sentence"] == "I walk 10 000 steps every morning"
    assert "walk 10 000 steps" in habit["context"]["BEHAVIOR"]
    assert data["habit_summary"] != ""


@pytest.mark.asyncio
async def test_empty_habits_returns_no_selection():
    """When the user has no habits, return empty list without calling LLM."""
    mock_llm = AsyncMock()
    with (
        patch("routers.extract_habits._get_redis", new=AsyncMock(return_value=None)),
        patch("routers.extract_habits._fetch_habits_for_user", new=AsyncMock(return_value=[])),
        patch("routers.extract_habits.chat_complete", new=mock_llm),
    ):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post(
                "/api/v1/llm/extract-habits",
                json={"user_id": "unknown-user", "goal": "lose weight"},
            )

    assert resp.status_code == 200
    data = resp.json()
    assert data["selected_habits"] == []
    assert "No habits found" in data["habit_summary"]
    mock_llm.assert_not_called()


@pytest.mark.asyncio
async def test_invalid_llm_json_returns_empty_selection():
    """Malformed LLM response produces empty selection and fallback summary."""
    with (
        patch("routers.extract_habits._get_redis", new=AsyncMock(return_value=None)),
        patch("routers.extract_habits._fetch_habits_for_user", new=AsyncMock(return_value=_HABITS)),
        patch("routers.extract_habits.chat_complete", new=AsyncMock(return_value="not valid json")),
    ):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post(
                "/api/v1/llm/extract-habits",
                json={"user_id": "user-abc", "goal": "improve fitness"},
            )

    assert resp.status_code == 200
    data = resp.json()
    assert data["selected_habits"] == []
    assert isinstance(data["habit_summary"], str)


@pytest.mark.asyncio
async def test_cache_hit_skips_neo4j_and_llm():
    """When Redis has a cached result, Neo4j and LLM are NOT called."""
    cached_result = {
        "selected_habits": [
            {
                "uuid": "uuid-2",
                "sentence": "I drink a glass of water before each meal",
                "context": {
                    "TIME": ["before each meal"],
                    "PHYSICAL_SETTING": [],
                    "PRIOR_BEHAVIOR": [],
                    "OTHER_PEOPLE": [],
                    "INTERNAL_STATE": [],
                    "BEHAVIOR": ["drink a glass of water"],
                    "REASONING": ["to stay hydrated"],
                },
            }
        ],
        "habit_summary": "Hydration habits support weight management goals.",
    }

    mock_redis = MagicMock()
    mock_redis.get = AsyncMock(return_value=json.dumps(cached_result))
    mock_redis.setex = AsyncMock()
    mock_neo4j = AsyncMock()
    mock_llm = AsyncMock()

    with (
        patch("routers.extract_habits._get_redis", new=AsyncMock(return_value=mock_redis)),
        patch("routers.extract_habits._fetch_habits_for_user", new=mock_neo4j),
        patch("routers.extract_habits.chat_complete", new=mock_llm),
    ):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post(
                "/api/v1/llm/extract-habits",
                json={"user_id": "user-abc", "goal": "lose weight"},
            )

        mock_neo4j.assert_not_called()
        mock_llm.assert_not_called()

    assert resp.status_code == 200
    data = resp.json()
    assert len(data["selected_habits"]) == 1
    assert data["selected_habits"][0]["uuid"] == "uuid-2"
