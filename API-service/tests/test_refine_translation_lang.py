"""Unit tests for POST /api/v1/llm/refine-translation-lang."""
from unittest.mock import AsyncMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from main import app


@pytest.mark.asyncio
async def test_refine_translation_lang_returns_refined_japanese():
    """LLM refinement is returned as the refined target-language translation."""
    refined = "毎朝走っています。"

    with patch(
        "routers.refine_translation_lang.chat_complete",
        new=AsyncMock(return_value=refined),
    ):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post(
                "/api/v1/llm/refine-translation-lang",
                json={
                    "original": "I go for a run every morning.",
                    "raw_translation": "毎朝走る。",
                    "source_language": "en",
                    "target_language": "ja",
                },
            )

    assert resp.status_code == 200
    data = resp.json()
    assert data["refined_translation"] == refined


@pytest.mark.asyncio
async def test_refine_translation_lang_falls_back_to_raw_on_empty_llm():
    """Empty LLM response causes raw_translation to be returned as fallback."""
    raw_translation = "Je cours chaque matin."

    with patch(
        "routers.refine_translation_lang.chat_complete",
        new=AsyncMock(return_value=""),
    ):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post(
                "/api/v1/llm/refine-translation-lang",
                json={
                    "original": "I go for a run every morning.",
                    "raw_translation": raw_translation,
                    "source_language": "en",
                    "target_language": "fr",
                },
            )

    assert resp.status_code == 200
    data = resp.json()
    assert data["refined_translation"] == raw_translation


@pytest.mark.asyncio
async def test_refine_translation_lang_prompts_with_display_names():
    """The prompt uses full language names, not raw ISO codes."""
    captured_prompt = {}

    async def fake_chat_complete(messages, temperature=0.3):
        del temperature
        captured_prompt["text"] = messages[0]["content"]
        return "Ik ren elke ochtend."

    with patch(
        "routers.refine_translation_lang.chat_complete",
        new=AsyncMock(side_effect=fake_chat_complete),
    ):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post(
                "/api/v1/llm/refine-translation-lang",
                json={
                    "original": "I go for a run every morning.",
                    "raw_translation": "Ik ren elke ochtend.",
                    "source_language": "en",
                    "target_language": "nl",
                },
            )

    assert resp.status_code == 200
    assert "Dutch" in captured_prompt["text"]
    assert "English" in captured_prompt["text"]
