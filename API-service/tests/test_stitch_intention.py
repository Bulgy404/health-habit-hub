"""Unit tests for routers.stitch_intention (mock LLM client)."""
from unittest.mock import AsyncMock, patch

import pytest

# Patch LLM client before importing the router
_mock_chat = AsyncMock(return_value="When I get up in the morning, I will go for a 30-minute walk.")


@pytest.fixture(autouse=True)
def _patch_llm():
    with patch("routers.stitch_intention.chat_complete", _mock_chat):
        yield


@pytest.mark.asyncio
async def test_stitch_returns_sentence():
    from routers.stitch_intention import stitch_intention, StitchIntentionRequest

    req = StitchIntentionRequest(action="go for a walk", cues=["after waking up"], language="en")
    result = await stitch_intention(req)
    assert isinstance(result.sentence, str)
    assert len(result.sentence) > 5


@pytest.mark.asyncio
async def test_stitch_strips_quotes():
    from routers.stitch_intention import stitch_intention, StitchIntentionRequest

    _mock_chat.return_value = '"When I wake up, I will exercise."'
    req = StitchIntentionRequest(action="exercise", cues=["when I wake up"], language="en")
    result = await stitch_intention(req)
    assert not result.sentence.startswith('"')
    assert not result.sentence.endswith('"')


@pytest.mark.asyncio
async def test_stitch_multi_cue():
    from routers.stitch_intention import stitch_intention, StitchIntentionRequest

    _mock_chat.return_value = "After breakfast and before leaving home, I will do 10 push-ups."
    req = StitchIntentionRequest(
        action="do push-ups",
        cues=["after breakfast", "before leaving home"],
        language="en",
    )
    result = await stitch_intention(req)
    assert "push-ups" in result.sentence or "push" in result.sentence.lower()
