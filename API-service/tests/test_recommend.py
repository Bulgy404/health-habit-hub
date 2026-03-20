"""Unit tests for POST /api/v1/llm/recommend."""
import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from main import app

# ---------------------------------------------------------------------------
# Shared fixtures / stubs
# ---------------------------------------------------------------------------

_HABITS_RESPONSE = {
    "selected_habits": [
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
        }
    ],
    "habit_summary": "Walking 10 000 steps each morning supports a fitness goal.",
}

_PROFILE_RESPONSE = {
    "profile_summary": "Active person aiming to improve cardiovascular fitness.",
    "profile_detailed": "SLIQ: good sleep. RAND-36: high energy.",
    "rag_query": "cardiovascular fitness habits aerobic exercise",
}

_SOURCES_RESPONSE = {
    "sources": [
        {
            "filename": "aerobic_exercise.pdf",
            "category": "exercise",
            "excerpt": "Regular aerobic exercise improves cardiovascular health.",
            "score": 0.92,
        }
    ]
}

_LLM_REPLY = json.dumps(
    {
        "recommendations": [
            {
                "title": "Add a morning jog",
                "body": "Start with a 20-minute jog three times per week.",
                "rationale": "Aerobic exercise improves cardiovascular health (aerobic_exercise.pdf).",
            },
            {
                "title": "Hydrate before exercise",
                "body": "Drink 500 ml of water 30 minutes before exercise.",
                "rationale": "Proper hydration enhances athletic performance.",
            },
            {
                "title": "Strength training twice a week",
                "body": "Include two strength sessions per week to complement cardio.",
                "rationale": "Combined cardio and strength training maximises fitness gains.",
            },
        ]
    }
)


def _make_habits_mock():
    from routers.extract_habits import ExtractHabitsResponse, HabitEntry

    return ExtractHabitsResponse(
        selected_habits=[
            HabitEntry(**h) for h in _HABITS_RESPONSE["selected_habits"]
        ],
        habit_summary=_HABITS_RESPONSE["habit_summary"],
    )


def _make_profile_mock():
    from routers.extract_profile import ExtractProfileResponse

    return ExtractProfileResponse(**_PROFILE_RESPONSE)


def _make_retrieve_mock():
    from routers.retrieve import RetrieveResponse, SourceItem

    return RetrieveResponse(
        sources=[SourceItem(**s) for s in _SOURCES_RESPONSE["sources"]]
    )


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_recommend_returns_valid_response():
    """Full pipeline returns recommendation_id, goal, recommendations, generated_at."""
    mock_mongo_db = MagicMock()
    mock_mongo_db["recommendation_feedback"].find.return_value.__aiter__ = AsyncMock(
        return_value=iter([])
    )
    mock_insert = AsyncMock()
    mock_mongo_db["recommendations"].insert_one = mock_insert

    with (
        patch("routers.recommend._get_redis", new=AsyncMock(return_value=None)),
        patch("routers.recommend._extract_habits", new=AsyncMock(return_value=_make_habits_mock())),
        patch("routers.recommend._extract_profile", new=AsyncMock(return_value=_make_profile_mock())),
        patch("routers.recommend._retrieve", new=AsyncMock(return_value=_make_retrieve_mock())),
        patch("routers.recommend._fetch_prior_feedback", new=AsyncMock(return_value=[])),
        patch("routers.recommend._store_recommendation", new=AsyncMock()),
        patch("routers.recommend.chat_complete", new=AsyncMock(return_value=_LLM_REPLY)),
    ):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post(
                "/api/v1/llm/recommend",
                json={"user_id": "user-abc", "goal": "improve fitness", "session_id": "sess-1"},
            )

    assert resp.status_code == 200
    data = resp.json()
    assert "recommendation_id" in data
    assert data["goal"] == "improve fitness"
    assert isinstance(data["recommendations"], list)
    assert len(data["recommendations"]) == 3
    assert "generated_at" in data

    rec = data["recommendations"][0]
    assert "title" in rec
    assert "body" in rec
    assert "rationale" in rec
    assert isinstance(rec["sources"], list)
    # sources from RAG are attached to each recommendation
    assert rec["sources"][0]["filename"] == "aerobic_exercise.pdf"


@pytest.mark.asyncio
async def test_recommend_invalid_llm_json_returns_empty_list():
    """Malformed LLM JSON results in empty recommendations list (no crash)."""
    with (
        patch("routers.recommend._get_redis", new=AsyncMock(return_value=None)),
        patch("routers.recommend._extract_habits", new=AsyncMock(return_value=_make_habits_mock())),
        patch("routers.recommend._extract_profile", new=AsyncMock(return_value=_make_profile_mock())),
        patch("routers.recommend._retrieve", new=AsyncMock(return_value=_make_retrieve_mock())),
        patch("routers.recommend._fetch_prior_feedback", new=AsyncMock(return_value=[])),
        patch("routers.recommend._store_recommendation", new=AsyncMock()),
        patch("routers.recommend.chat_complete", new=AsyncMock(return_value="not valid json")),
    ):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post(
                "/api/v1/llm/recommend",
                json={"user_id": "user-abc", "goal": "improve fitness", "session_id": "sess-1"},
            )

    assert resp.status_code == 200
    data = resp.json()
    assert data["recommendations"] == []
    assert "recommendation_id" in data


@pytest.mark.asyncio
async def test_recommend_cache_hit_skips_pipeline():
    """When Redis has a cached result, the LLM pipeline is NOT called."""
    cached = {
        "recommendation_id": "cached-id-123",
        "goal": "lose weight",
        "recommendations": [],
        "generated_at": "2026-01-01T00:00:00+00:00",
    }
    mock_redis = MagicMock()
    mock_redis.get = AsyncMock(return_value=json.dumps(cached))

    mock_extract_habits = AsyncMock()
    mock_extract_profile = AsyncMock()
    mock_retrieve = AsyncMock()
    mock_llm = AsyncMock()

    with (
        patch("routers.recommend._get_redis", new=AsyncMock(return_value=mock_redis)),
        patch("routers.recommend._extract_habits", new=mock_extract_habits),
        patch("routers.recommend._extract_profile", new=mock_extract_profile),
        patch("routers.recommend._retrieve", new=mock_retrieve),
        patch("routers.recommend.chat_complete", new=mock_llm),
    ):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post(
                "/api/v1/llm/recommend",
                json={"user_id": "user-abc", "goal": "lose weight", "session_id": "sess-2"},
            )

    assert resp.status_code == 200
    data = resp.json()
    assert data["recommendation_id"] == "cached-id-123"
    mock_extract_habits.assert_not_called()
    mock_extract_profile.assert_not_called()
    mock_retrieve.assert_not_called()
    mock_llm.assert_not_called()


@pytest.mark.asyncio
async def test_recommend_prior_feedback_included_in_prompt():
    """Prior feedback is fetched and used (verifies it reaches the LLM prompt)."""
    captured_prompts: list = []

    async def mock_llm(messages, **kwargs):
        captured_prompts.extend(messages)
        return _LLM_REPLY

    with (
        patch("routers.recommend._get_redis", new=AsyncMock(return_value=None)),
        patch("routers.recommend._extract_habits", new=AsyncMock(return_value=_make_habits_mock())),
        patch("routers.recommend._extract_profile", new=AsyncMock(return_value=_make_profile_mock())),
        patch("routers.recommend._retrieve", new=AsyncMock(return_value=_make_retrieve_mock())),
        patch(
            "routers.recommend._fetch_prior_feedback",
            new=AsyncMock(return_value=["I didn't like the running suggestion"]),
        ),
        patch("routers.recommend._store_recommendation", new=AsyncMock()),
        patch("routers.recommend.chat_complete", new=mock_llm),
    ):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post(
                "/api/v1/llm/recommend",
                json={"user_id": "user-abc", "goal": "improve fitness", "session_id": "sess-3"},
            )

    assert resp.status_code == 200
    assert len(captured_prompts) > 0
    prompt_content = captured_prompts[0]["content"]
    assert "I didn't like the running suggestion" in prompt_content


@pytest.mark.asyncio
async def test_recommend_stores_in_mongodb():
    """Successful recommendation is stored via _store_recommendation."""
    mock_store = AsyncMock()

    with (
        patch("routers.recommend._get_redis", new=AsyncMock(return_value=None)),
        patch("routers.recommend._extract_habits", new=AsyncMock(return_value=_make_habits_mock())),
        patch("routers.recommend._extract_profile", new=AsyncMock(return_value=_make_profile_mock())),
        patch("routers.recommend._retrieve", new=AsyncMock(return_value=_make_retrieve_mock())),
        patch("routers.recommend._fetch_prior_feedback", new=AsyncMock(return_value=[])),
        patch("routers.recommend._store_recommendation", new=mock_store),
        patch("routers.recommend.chat_complete", new=AsyncMock(return_value=_LLM_REPLY)),
    ):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post(
                "/api/v1/llm/recommend",
                json={"user_id": "user-abc", "goal": "improve fitness", "session_id": "sess-4"},
            )

    assert resp.status_code == 200
    mock_store.assert_called_once()
    call_kwargs = mock_store.call_args
    assert call_kwargs.kwargs["user_id"] == "user-abc"
    assert call_kwargs.kwargs["goal"] == "improve fitness"
    assert call_kwargs.kwargs["session_id"] == "sess-4"
