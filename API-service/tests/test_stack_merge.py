"""Unit tests for routers.stack_merge (mock LLM client) — §7.1 Habit Stacking."""
from unittest.mock import AsyncMock, patch

import pytest

_mock_chat = AsyncMock(
    return_value="After I make my morning coffee, I will take my vitamins."
)


@pytest.fixture(autouse=True)
def _patch_llm():
    with patch("routers.stack_merge.chat_complete", _mock_chat):
        yield


@pytest.mark.asyncio
async def test_stack_merge_returns_sentence():
    from routers.stack_merge import stack_merge, StackMergeRequest

    req = StackMergeRequest(
        anchor_text="make my morning coffee",
        new_behavior_text="take my vitamins",
        language="en",
    )
    result = await stack_merge(req)
    assert isinstance(result.sentence, str)
    assert len(result.sentence) > 5
    assert "vitamins" in result.sentence.lower()


@pytest.mark.asyncio
async def test_stack_merge_strips_quotes():
    from routers.stack_merge import stack_merge, StackMergeRequest

    _mock_chat.return_value = '"After I brush my teeth, I will floss."'
    req = StackMergeRequest(
        anchor_text="brush my teeth",
        new_behavior_text="floss",
        language="en",
    )
    result = await stack_merge(req)
    assert not result.sentence.startswith('"')
    assert not result.sentence.endswith('"')


@pytest.mark.asyncio
async def test_stack_merge_passes_language_into_prompt():
    from routers import stack_merge as module

    _mock_chat.return_value = "Nachdem ich Kaffee gekocht habe, nehme ich meine Vitamine."
    req = module.StackMergeRequest(
        anchor_text="Kaffee kochen",
        new_behavior_text="Vitamine nehmen",
        language="de",
    )
    await module.stack_merge(req)
    # The rendered prompt (first positional arg's message content) must carry
    # the requested language and both inputs.
    sent_messages = _mock_chat.call_args.kwargs["messages"]
    prompt = sent_messages[0]["content"]
    assert "de" in prompt
    assert "Kaffee kochen" in prompt
    assert "Vitamine nehmen" in prompt
