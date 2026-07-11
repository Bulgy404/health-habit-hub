"""Unit tests for POST /api/v1/llm/translate-term."""
from unittest.mock import AsyncMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from main import app


@pytest.mark.asyncio
async def test_translate_term_returns_llm_translation():
    """The LLM's translation of a short term is returned as-is."""
    translation = "Körperliche Aktivität"

    with patch(
        "routers.translate_term.chat_complete",
        new=AsyncMock(return_value=translation),
    ):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post(
                "/api/v1/llm/translate-term",
                json={
                    "term": "Physical activity",
                    "source_language": "en",
                    "target_language": "de",
                },
            )

    assert resp.status_code == 200
    data = resp.json()
    assert data["translation"] == translation


@pytest.mark.asyncio
async def test_translate_term_falls_back_to_original_on_empty_llm():
    """Empty LLM response causes the original term to be returned."""
    term = "Self-monitoring"

    with patch(
        "routers.translate_term.chat_complete",
        new=AsyncMock(return_value=""),
    ):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post(
                "/api/v1/llm/translate-term",
                json={
                    "term": term,
                    "source_language": "en",
                    "target_language": "fr",
                },
            )

    assert resp.status_code == 200
    data = resp.json()
    assert data["translation"] == term


@pytest.mark.asyncio
async def test_translate_term_prompts_with_display_names():
    """The prompt uses full language names, not raw ISO codes."""
    captured_prompt = {}

    async def fake_chat_complete(messages, temperature=0.2):
        del temperature
        captured_prompt["text"] = messages[0]["content"]
        return "Zelfmonitoring"

    with patch(
        "routers.translate_term.chat_complete",
        new=AsyncMock(side_effect=fake_chat_complete),
    ):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post(
                "/api/v1/llm/translate-term",
                json={
                    "term": "Self-monitoring",
                    "source_language": "en",
                    "target_language": "nl",
                },
            )

    assert resp.status_code == 200
    assert "Dutch" in captured_prompt["text"]
    assert "English" in captured_prompt["text"]
