"""Unit tests for POST /api/v1/llm/extract-profile."""
import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from main import app

_SLIQ_RESPONSE = {
    "userId": "user-abc",
    "questionnaireSlug": "sliq",
    "answers": {
        "sliq_sleep_quality": "3",
        "sliq_sleep_duration": "6",
        "sliq_daytime_sleepiness": "2",
    },
}

_RAND36_RESPONSE = {
    "userId": "user-abc",
    "questionnaireSlug": "rand-36",
    "answers": {
        "rand36_physical_functioning": "4",
        "rand36_energy": "3",
        "rand36_mental_health": "4",
    },
}

_USER_PROFILE_RESPONSE = {
    "userId": "user-abc",
    "fields": [
        {"questionId": "age", "questionText": "Age", "value": 21, "label": "18–24"},
        {"questionId": "gender", "questionText": "Gender", "value": "male", "label": "Male"},
    ],
    "updatedAt": "2026-04-27T10:00:00.000Z",
}

_LLM_REPLY = json.dumps({
    "profile_summary": "The user has mild sleep issues and moderate physical health.",
    "profile_detailed": (
        "The user reports fair sleep quality (SLIQ score: 3/5) with short sleep duration "
        "of approximately 6 hours. Physical functioning and energy levels are moderate "
        "per RAND-36. Mental health scores are within normal range. The user's goal of "
        "improving overall fitness is supported by a foundation of moderate health status "
        "but may be constrained by low energy and sleep quality. Improving sleep duration "
        "and quality could be a meaningful first step toward achieving the stated goal."
    ),
    "rag_query": (
        "Evidence-based interventions for improving physical fitness in adults with "
        "mild sleep problems and moderate energy levels."
    ),
})


@pytest.mark.asyncio
async def test_returns_profile_with_questionnaire_and_user_profile_data():
    """Questionnaire data + user profile are fetched, LLM is called, profile returned."""
    with (
        patch("routers.extract_profile._get_redis", new=AsyncMock(return_value=None)),
        patch(
            "routers.extract_profile._fetch_questionnaire_response",
            new=AsyncMock(side_effect=[_SLIQ_RESPONSE, _RAND36_RESPONSE]),
        ),
        patch(
            "routers.extract_profile._fetch_user_profile",
            new=AsyncMock(return_value=_USER_PROFILE_RESPONSE),
        ),
        patch("routers.extract_profile.chat_complete", new=AsyncMock(return_value=_LLM_REPLY)),
    ):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post(
                "/api/v1/llm/extract-profile",
                json={"user_id": "user-abc", "goal": "improve fitness"},
            )

    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data["profile_summary"], str)
    assert len(data["profile_summary"]) > 0
    assert isinstance(data["profile_detailed"], str)
    assert len(data["profile_detailed"]) > 0
    assert isinstance(data["rag_query"], str)
    assert len(data["rag_query"]) > 0


@pytest.mark.asyncio
async def test_missing_questionnaire_data_still_returns_profile():
    """When questionnaire responses are unavailable (None), LLM still called with empty data."""
    with (
        patch("routers.extract_profile._get_redis", new=AsyncMock(return_value=None)),
        patch(
            "routers.extract_profile._fetch_questionnaire_response",
            new=AsyncMock(return_value=None),
        ),
        patch(
            "routers.extract_profile._fetch_user_profile",
            new=AsyncMock(return_value=None),
        ),
        patch("routers.extract_profile.chat_complete", new=AsyncMock(return_value=_LLM_REPLY)),
    ):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post(
                "/api/v1/llm/extract-profile",
                json={"user_id": "user-xyz", "goal": "lose weight"},
            )

    assert resp.status_code == 200
    data = resp.json()
    assert "profile_summary" in data
    assert "profile_detailed" in data
    assert "rag_query" in data


@pytest.mark.asyncio
async def test_user_profile_fields_formatted_as_readable_text():
    """profile_text passed to LLM contains human-readable label lines, not raw JSON."""
    captured_prompt = {}

    async def fake_chat_complete(messages, **kwargs):
        captured_prompt["content"] = messages[0]["content"]
        return _LLM_REPLY

    with (
        patch("routers.extract_profile._get_redis", new=AsyncMock(return_value=None)),
        patch(
            "routers.extract_profile._fetch_questionnaire_response",
            new=AsyncMock(return_value=None),
        ),
        patch(
            "routers.extract_profile._fetch_user_profile",
            new=AsyncMock(return_value=_USER_PROFILE_RESPONSE),
        ),
        patch("routers.extract_profile.chat_complete", new=fake_chat_complete),
    ):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            await client.post(
                "/api/v1/llm/extract-profile",
                json={"user_id": "user-abc", "goal": "improve fitness"},
            )

    prompt = captured_prompt["content"]
    assert "Age: 18–24" in prompt
    assert "Gender: Male" in prompt
    assert '"value": 21' not in prompt


@pytest.mark.asyncio
async def test_invalid_llm_json_returns_fallback():
    """Malformed LLM response returns fallback profile."""
    with (
        patch("routers.extract_profile._get_redis", new=AsyncMock(return_value=None)),
        patch(
            "routers.extract_profile._fetch_questionnaire_response",
            new=AsyncMock(return_value=None),
        ),
        patch(
            "routers.extract_profile._fetch_user_profile",
            new=AsyncMock(return_value=None),
        ),
        patch(
            "routers.extract_profile.chat_complete",
            new=AsyncMock(return_value="not valid json"),
        ),
    ):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post(
                "/api/v1/llm/extract-profile",
                json={"user_id": "user-abc", "goal": "improve sleep"},
            )

    assert resp.status_code == 200
    data = resp.json()
    assert "profile_summary" in data
    assert "rag_query" in data
    assert data["rag_query"] == "improve sleep"


@pytest.mark.asyncio
async def test_cache_hit_skips_backend_and_llm():
    """When Redis has a cached result, backend and LLM are NOT called."""
    cached_result = {
        "profile_summary": "Cached summary.",
        "profile_detailed": "Cached detailed profile.",
        "rag_query": "Cached rag query for fitness.",
    }

    mock_redis = MagicMock()
    mock_redis.get = AsyncMock(return_value=json.dumps(cached_result))
    mock_redis.setex = AsyncMock()
    mock_backend = AsyncMock()
    mock_user_profile = AsyncMock()
    mock_llm = AsyncMock()

    with (
        patch("routers.extract_profile._get_redis", new=AsyncMock(return_value=mock_redis)),
        patch("routers.extract_profile._fetch_questionnaire_response", new=mock_backend),
        patch("routers.extract_profile._fetch_user_profile", new=mock_user_profile),
        patch("routers.extract_profile.chat_complete", new=mock_llm),
    ):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post(
                "/api/v1/llm/extract-profile",
                json={"user_id": "user-abc", "goal": "improve fitness"},
            )

        mock_backend.assert_not_called()
        mock_user_profile.assert_not_called()
        mock_llm.assert_not_called()

    assert resp.status_code == 200
    data = resp.json()
    assert data["profile_summary"] == "Cached summary."
    assert data["rag_query"] == "Cached rag query for fitness."
