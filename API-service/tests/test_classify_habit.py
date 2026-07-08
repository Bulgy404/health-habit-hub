"""Unit tests for POST /api/v1/llm/classify-habit."""
import json
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from main import app

PROMPT_PATH = Path(__file__).resolve().parent.parent / "prompts" / "classify_habit.txt"


@pytest.mark.asyncio
async def test_habit_sentence_returns_is_habit_true():
    """A sentence describing a recurring health habit → is_habit=True."""
    llm_reply = json.dumps({"is_habit": True, "confidence": 0.95})

    with (
        patch("routers.classify_habit._get_redis", new=AsyncMock(return_value=None)),
        patch("routers.classify_habit.chat_complete", new=AsyncMock(return_value=llm_reply)),
    ):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post(
                "/api/v1/llm/classify-habit",
                json={
                    "sentence": "I walk 10 000 steps every day",
                    "language": "en",
                    "user_id": "user-abc",
                },
            )

    assert resp.status_code == 200
    data = resp.json()
    assert data["is_habit"] is True
    assert data["confidence"] == pytest.approx(0.95)
    assert data["sentence"] == "I walk 10 000 steps every day"
    assert data["language"] == "en"
    assert "uuid" in data


@pytest.mark.asyncio
async def test_non_habit_sentence_returns_is_habit_false():
    """A general statement → is_habit=False."""
    llm_reply = json.dumps({"is_habit": False, "confidence": 0.88})

    with (
        patch("routers.classify_habit._get_redis", new=AsyncMock(return_value=None)),
        patch("routers.classify_habit.chat_complete", new=AsyncMock(return_value=llm_reply)),
    ):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post(
                "/api/v1/llm/classify-habit",
                json={
                    "sentence": "Exercise is beneficial for everyone",
                    "language": "en",
                    "user_id": "user-xyz",
                },
            )

    assert resp.status_code == 200
    data = resp.json()
    assert data["is_habit"] is False
    assert data["confidence"] == pytest.approx(0.88)


@pytest.mark.asyncio
async def test_cache_hit_returns_cached_value():
    """When Redis has a cached result the LLM is NOT called."""
    cached_payload = json.dumps({"is_habit": True, "confidence": 0.99})

    mock_redis = MagicMock()
    mock_redis.get = AsyncMock(return_value=cached_payload)
    mock_redis.setex = AsyncMock()

    with (
        patch("routers.classify_habit._get_redis", new=AsyncMock(return_value=mock_redis)),
        patch("routers.classify_habit.chat_complete", new=AsyncMock()) as mock_llm,
    ):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post(
                "/api/v1/llm/classify-habit",
                json={
                    "sentence": "I meditate for 20 minutes each morning",
                    "language": "en",
                    "user_id": "user-123",
                },
            )

        mock_llm.assert_not_called()

    assert resp.status_code == 200
    data = resp.json()
    assert data["is_habit"] is True
    assert data["confidence"] == pytest.approx(0.99)


def test_prompt_treats_implementation_intentions_as_habits():
    """Regression guard: the mobile app's guided habit-creation flow (and any
    habit later shared from a recommendation) submits cue-based
    "when/after X, I will Y" implementation-intention sentences, not free-text
    habit descriptions. The prompt previously excluded "an intention without a
    recurring pattern", which the LLM was classifying this cue-triggered,
    recurring phrasing under — silently rejecting it (persistRejectedHabit in
    habitDonationService.js), so those habits never got context extraction,
    BCIO mapping, or embeddings like a normally-donated habit does. Asserts
    the prompt explicitly carves out this phrasing so the fix isn't quietly
    reverted.
    """
    text = PROMPT_PATH.read_text()
    assert "implementation-intention" in text
    assert "when/after" in text or "when" in text.lower()
