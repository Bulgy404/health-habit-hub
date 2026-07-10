"""Unit tests for POST /api/v1/llm/translate-lang."""
from unittest.mock import AsyncMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from main import app


@pytest.mark.asyncio
async def test_translate_lang_returns_llm_translation():
    """The LLM's direct translation is returned as-is."""
    translation = "毎朝走っています。"

    with patch(
        "routers.translate_lang.chat_complete",
        new=AsyncMock(return_value=translation),
    ):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post(
                "/api/v1/llm/translate-lang",
                json={
                    "original": "I go for a run every morning.",
                    "source_language": "en",
                    "target_language": "ja",
                },
            )

    assert resp.status_code == 200
    data = resp.json()
    assert data["translation"] == translation


@pytest.mark.asyncio
async def test_translate_lang_falls_back_to_original_on_empty_llm():
    """Empty LLM response causes the original text to be returned as a last resort."""
    original = "I go for a run every morning."

    with patch(
        "routers.translate_lang.chat_complete",
        new=AsyncMock(return_value=""),
    ):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post(
                "/api/v1/llm/translate-lang",
                json={
                    "original": original,
                    "source_language": "en",
                    "target_language": "fr",
                },
            )

    assert resp.status_code == 200
    data = resp.json()
    assert data["translation"] == original


@pytest.mark.asyncio
async def test_translate_lang_prompts_with_display_names_and_no_raw_translation():
    """The prompt uses full language names and has no raw_translation section."""
    captured_prompt = {}

    async def fake_chat_complete(messages, temperature=0.3):
        del temperature
        captured_prompt["text"] = messages[0]["content"]
        return "Ik ren elke ochtend."

    with patch(
        "routers.translate_lang.chat_complete",
        new=AsyncMock(side_effect=fake_chat_complete),
    ):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post(
                "/api/v1/llm/translate-lang",
                json={
                    "original": "I go for a run every morning.",
                    "source_language": "en",
                    "target_language": "nl",
                },
            )

    assert resp.status_code == 200
    assert "Dutch" in captured_prompt["text"]
    assert "English" in captured_prompt["text"]
    assert "raw_translation" not in captured_prompt["text"]
