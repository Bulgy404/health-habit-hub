"""Unit tests for POST /api/v1/llm/recommend (single-LLM-call pipeline)."""
import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from main import app

# ---------------------------------------------------------------------------
# Shared stubs
# ---------------------------------------------------------------------------

_PERSONAL_HABITS = [
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
        "likes": 0,
        "score": 0.85,
    }
]

_COMMUNITY_HABITS = [
    {
        "uuid": "uuid-2",
        "sentence": "I cycle to work three times a week",
        "context": {
            "TIME": [],
            "PHYSICAL_SETTING": [],
            "PRIOR_BEHAVIOR": [],
            "OTHER_PEOPLE": [],
            "INTERNAL_STATE": [],
            "BEHAVIOR": ["cycle to work"],
            "REASONING": [],
        },
        "likes": 7,
        "score": 0.72,
    }
]

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
                "selected_habit_uuids": ["uuid-1"],
            },
            {
                "title": "Hydrate before exercise",
                "body": "Drink 500 ml of water 30 minutes before exercise.",
                "rationale": "Proper hydration enhances athletic performance.",
                "selected_habit_uuids": [],
            },
            {
                "title": "Strength training twice a week",
                "body": "Include two strength sessions per week to complement cardio.",
                "rationale": "Combined cardio and strength training maximises fitness gains.",
                "selected_habit_uuids": ["uuid-2"],
            },
        ]
    }
)


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
    with (
        patch("routers.recommend._get_redis", new=AsyncMock(return_value=None)),
        patch("routers.recommend._vector_search_user_habits", new=AsyncMock(return_value=_PERSONAL_HABITS)),
        patch("routers.recommend._vector_search_habits", new=AsyncMock(return_value=_COMMUNITY_HABITS)),
        patch("routers.recommend._fetch_all_questionnaire_responses", new=AsyncMock(return_value={})),
        patch("routers.recommend._fetch_user_profile", new=AsyncMock(return_value=None)),
        patch("routers.recommend._fetch_annotated_habits", new=AsyncMock(return_value=[])),
        patch("routers.recommend._fetch_prior_feedback", new=AsyncMock(return_value=[])),
        patch("routers.recommend._rerank_habits", new=AsyncMock(return_value=_COMMUNITY_HABITS)),
        patch("routers.recommend._fetch_bcio_concepts", new=AsyncMock(return_value={})),
        patch("routers.recommend._get_neo4j_driver", new=AsyncMock(return_value=MagicMock())),
        patch("routers.recommend._retrieve", new=AsyncMock(return_value=_make_retrieve_mock())),
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
    assert resp.headers["x-hhh-recommendation-cache"] == "miss"
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
    assert rec["sources"][0]["filename"] == "aerobic_exercise.pdf"


@pytest.mark.asyncio
async def test_habit_uuids_stored_but_not_exposed_to_client():
    """Graph provenance (habit UUIDs) is stored server-side but stripped from the response."""
    mock_store = AsyncMock()
    with (
        patch("routers.recommend._get_redis", new=AsyncMock(return_value=None)),
        patch("routers.recommend._vector_search_user_habits", new=AsyncMock(return_value=_PERSONAL_HABITS)),
        patch("routers.recommend._vector_search_habits", new=AsyncMock(return_value=_COMMUNITY_HABITS)),
        patch("routers.recommend._fetch_all_questionnaire_responses", new=AsyncMock(return_value={})),
        patch("routers.recommend._fetch_user_profile", new=AsyncMock(return_value=None)),
        patch("routers.recommend._fetch_annotated_habits", new=AsyncMock(return_value=[])),
        patch("routers.recommend._fetch_prior_feedback", new=AsyncMock(return_value=[])),
        patch("routers.recommend._rerank_habits", new=AsyncMock(return_value=_COMMUNITY_HABITS)),
        patch("routers.recommend._fetch_bcio_concepts", new=AsyncMock(return_value={})),
        patch("routers.recommend._get_neo4j_driver", new=AsyncMock(return_value=MagicMock())),
        patch("routers.recommend._retrieve", new=AsyncMock(return_value=_make_retrieve_mock())),
        patch("routers.recommend._store_recommendation", new=mock_store),
        patch("routers.recommend.chat_complete", new=AsyncMock(return_value=_LLM_REPLY)),
    ):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post(
                "/api/v1/llm/recommend",
                json={"user_id": "user-abc", "goal": "improve fitness", "session_id": "sess-1"},
            )

    data = resp.json()
    # Client payload carries no graph identifiers.
    for rec in data["recommendations"]:
        assert "selected_habit_uuids" not in rec
    # But the stored (debugging) copy keeps them.
    stored_recs = mock_store.call_args.kwargs["recs"]
    assert stored_recs[0]["selected_habit_uuids"] == ["uuid-1"]
    assert stored_recs[1]["selected_habit_uuids"] == []
    assert stored_recs[2]["selected_habit_uuids"] == ["uuid-2"]


@pytest.mark.asyncio
async def test_llm_is_called_exactly_once():
    """The pipeline must make exactly one LLM call — not three."""
    mock_llm = AsyncMock(return_value=_LLM_REPLY)

    with (
        patch("routers.recommend._get_redis", new=AsyncMock(return_value=None)),
        patch("routers.recommend._vector_search_user_habits", new=AsyncMock(return_value=_PERSONAL_HABITS)),
        patch("routers.recommend._vector_search_habits", new=AsyncMock(return_value=_COMMUNITY_HABITS)),
        patch("routers.recommend._fetch_all_questionnaire_responses", new=AsyncMock(return_value={})),
        patch("routers.recommend._fetch_user_profile", new=AsyncMock(return_value=None)),
        patch("routers.recommend._fetch_annotated_habits", new=AsyncMock(return_value=[])),
        patch("routers.recommend._fetch_prior_feedback", new=AsyncMock(return_value=[])),
        patch("routers.recommend._rerank_habits", new=AsyncMock(return_value=_COMMUNITY_HABITS)),
        patch("routers.recommend._fetch_bcio_concepts", new=AsyncMock(return_value={})),
        patch("routers.recommend._get_neo4j_driver", new=AsyncMock(return_value=MagicMock())),
        patch("routers.recommend._retrieve", new=AsyncMock(return_value=_make_retrieve_mock())),
        patch("routers.recommend._store_recommendation", new=AsyncMock()),
        patch("routers.recommend.chat_complete", new=mock_llm),
    ):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            await client.post(
                "/api/v1/llm/recommend",
                json={"user_id": "user-abc", "goal": "improve fitness", "session_id": "sess-x"},
            )

    mock_llm.assert_called_once()


@pytest.mark.asyncio
async def test_recommend_invalid_llm_json_returns_empty_list():
    """Malformed LLM JSON results in empty recommendations list (no crash)."""
    with (
        patch("routers.recommend._get_redis", new=AsyncMock(return_value=None)),
        patch("routers.recommend._vector_search_user_habits", new=AsyncMock(return_value=[])),
        patch("routers.recommend._vector_search_habits", new=AsyncMock(return_value=[])),
        patch("routers.recommend._fetch_all_questionnaire_responses", new=AsyncMock(return_value={})),
        patch("routers.recommend._fetch_user_profile", new=AsyncMock(return_value=None)),
        patch("routers.recommend._fetch_annotated_habits", new=AsyncMock(return_value=[])),
        patch("routers.recommend._fetch_prior_feedback", new=AsyncMock(return_value=[])),
        patch("routers.recommend._rerank_habits", new=AsyncMock(return_value=[])),
        patch("routers.recommend._fetch_bcio_concepts", new=AsyncMock(return_value={})),
        patch("routers.recommend._get_neo4j_driver", new=AsyncMock(return_value=MagicMock())),
        patch("routers.recommend._retrieve", new=AsyncMock(return_value=_make_retrieve_mock())),
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
    assert resp.json()["recommendations"] == []


@pytest.mark.asyncio
async def test_recommend_cache_hit_skips_pipeline():
    """When Redis has a cached result, the entire pipeline (including LLM) is NOT called."""
    cached = {
        "recommendation_id": "cached-id-123",
        "goal": "lose weight",
        "recommendations": [],
        "generated_at": "2026-01-01T00:00:00+00:00",
    }
    mock_redis = MagicMock()
    mock_redis.get = AsyncMock(return_value=json.dumps(cached))

    mock_search = AsyncMock()
    mock_llm = AsyncMock()

    with (
        patch("routers.recommend._get_redis", new=AsyncMock(return_value=mock_redis)),
        patch("routers.recommend._vector_search_user_habits", new=mock_search),
        patch("routers.recommend._vector_search_habits", new=mock_search),
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
    assert resp.json()["recommendation_id"] == "cached-id-123"
    assert resp.headers["x-hhh-recommendation-cache"] == "hit"
    mock_search.assert_not_called()
    mock_llm.assert_not_called()


@pytest.mark.asyncio
async def test_recommend_prior_feedback_included_in_prompt():
    """Prior feedback is fetched and appears in the LLM prompt."""
    captured: list = []

    async def mock_llm(messages, **_):
        captured.extend(messages)
        return _LLM_REPLY

    with (
        patch("routers.recommend._get_redis", new=AsyncMock(return_value=None)),
        patch("routers.recommend._vector_search_user_habits", new=AsyncMock(return_value=[])),
        patch("routers.recommend._vector_search_habits", new=AsyncMock(return_value=[])),
        patch("routers.recommend._fetch_all_questionnaire_responses", new=AsyncMock(return_value={})),
        patch("routers.recommend._fetch_user_profile", new=AsyncMock(return_value=None)),
        patch("routers.recommend._fetch_annotated_habits", new=AsyncMock(return_value=[])),
        patch(
            "routers.recommend._fetch_prior_feedback",
            new=AsyncMock(return_value=["I didn't like the running suggestion"]),
        ),
        patch("routers.recommend._rerank_habits", new=AsyncMock(return_value=[])),
        patch("routers.recommend._fetch_bcio_concepts", new=AsyncMock(return_value={})),
        patch("routers.recommend._get_neo4j_driver", new=AsyncMock(return_value=MagicMock())),
        patch("routers.recommend._retrieve", new=AsyncMock(return_value=_make_retrieve_mock())),
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
    user_prompt = next(m["content"] for m in captured if m["role"] == "user")
    assert "I didn't like the running suggestion" in user_prompt


@pytest.mark.asyncio
async def test_recommend_bcio_concepts_included_in_prompt():
    """BCIO concepts fetched for habits appear in the LLM prompt for explainability."""
    captured: list = []

    async def mock_llm(messages, **_):
        captured.extend(messages)
        return _LLM_REPLY

    bcio_map = {"uuid-1": ["Habit formation", "Self-monitoring"]}

    with (
        patch("routers.recommend._get_redis", new=AsyncMock(return_value=None)),
        patch("routers.recommend._vector_search_user_habits", new=AsyncMock(return_value=_PERSONAL_HABITS)),
        patch("routers.recommend._vector_search_habits", new=AsyncMock(return_value=[])),
        patch("routers.recommend._fetch_all_questionnaire_responses", new=AsyncMock(return_value={})),
        patch("routers.recommend._fetch_user_profile", new=AsyncMock(return_value=None)),
        patch("routers.recommend._fetch_annotated_habits", new=AsyncMock(return_value=[])),
        patch("routers.recommend._fetch_prior_feedback", new=AsyncMock(return_value=[])),
        patch("routers.recommend._rerank_habits", new=AsyncMock(return_value=[])),
        patch("routers.recommend._fetch_bcio_concepts", new=AsyncMock(return_value=bcio_map)),
        patch("routers.recommend._get_neo4j_driver", new=AsyncMock(return_value=MagicMock())),
        patch("routers.recommend._retrieve", new=AsyncMock(return_value=_make_retrieve_mock())),
        patch("routers.recommend._store_recommendation", new=AsyncMock()),
        patch("routers.recommend.chat_complete", new=mock_llm),
    ):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            await client.post(
                "/api/v1/llm/recommend",
                json={"user_id": "user-abc", "goal": "improve fitness", "session_id": "sess-4"},
            )

    prompt = next(m["content"] for m in captured if m["role"] == "user")
    assert "Habit formation" in prompt
    assert "Self-monitoring" in prompt


@pytest.mark.asyncio
async def test_recommend_stores_in_mongodb():
    """Successful recommendation is persisted via _store_recommendation."""
    mock_store = AsyncMock()

    with (
        patch("routers.recommend._get_redis", new=AsyncMock(return_value=None)),
        patch("routers.recommend._vector_search_user_habits", new=AsyncMock(return_value=[])),
        patch("routers.recommend._vector_search_habits", new=AsyncMock(return_value=[])),
        patch("routers.recommend._fetch_all_questionnaire_responses", new=AsyncMock(return_value={})),
        patch("routers.recommend._fetch_user_profile", new=AsyncMock(return_value=None)),
        patch("routers.recommend._fetch_annotated_habits", new=AsyncMock(return_value=[])),
        patch("routers.recommend._fetch_prior_feedback", new=AsyncMock(return_value=[])),
        patch("routers.recommend._rerank_habits", new=AsyncMock(return_value=[])),
        patch("routers.recommend._fetch_bcio_concepts", new=AsyncMock(return_value={})),
        patch("routers.recommend._get_neo4j_driver", new=AsyncMock(return_value=MagicMock())),
        patch("routers.recommend._retrieve", new=AsyncMock(return_value=_make_retrieve_mock())),
        patch("routers.recommend._store_recommendation", new=mock_store),
        patch("routers.recommend.chat_complete", new=AsyncMock(return_value=_LLM_REPLY)),
    ):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post(
                "/api/v1/llm/recommend",
                json={"user_id": "user-abc", "goal": "improve fitness", "session_id": "sess-5"},
            )

    assert resp.status_code == 200
    mock_store.assert_called_once()
    kw = mock_store.call_args.kwargs
    assert kw["user_id"] == "user-abc"
    assert kw["goal"] == "improve fitness"
    assert kw["session_id"] == "sess-5"


@pytest.mark.asyncio
async def test_recommend_graph_reranking_is_called():
    """GDS re-ranking (_rerank_habits) is invoked with user habit UUIDs."""
    mock_rerank = AsyncMock(return_value=_COMMUNITY_HABITS)

    with (
        patch("routers.recommend._get_redis", new=AsyncMock(return_value=None)),
        patch("routers.recommend._vector_search_user_habits", new=AsyncMock(return_value=_PERSONAL_HABITS)),
        patch("routers.recommend._vector_search_habits", new=AsyncMock(return_value=_COMMUNITY_HABITS)),
        patch("routers.recommend._fetch_all_questionnaire_responses", new=AsyncMock(return_value={})),
        patch("routers.recommend._fetch_user_profile", new=AsyncMock(return_value=None)),
        patch("routers.recommend._fetch_annotated_habits", new=AsyncMock(return_value=[])),
        patch("routers.recommend._fetch_prior_feedback", new=AsyncMock(return_value=[])),
        patch("routers.recommend._rerank_habits", new=mock_rerank),
        patch("routers.recommend._fetch_bcio_concepts", new=AsyncMock(return_value={})),
        patch("routers.recommend._get_neo4j_driver", new=AsyncMock(return_value=MagicMock())),
        patch("routers.recommend._retrieve", new=AsyncMock(return_value=_make_retrieve_mock())),
        patch("routers.recommend._store_recommendation", new=AsyncMock()),
        patch("routers.recommend.chat_complete", new=AsyncMock(return_value=_LLM_REPLY)),
    ):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            await client.post(
                "/api/v1/llm/recommend",
                json={"user_id": "user-abc", "goal": "improve fitness", "session_id": "sess-6"},
            )

    mock_rerank.assert_called_once()
    # First positional arg is the user habit UUID list
    user_uuids_arg = mock_rerank.call_args.args[0]
    assert "uuid-1" in user_uuids_arg
