"""Unit tests for the LLM_FALLBACK_MODEL retry + cooldown circuit breaker in llm_client.py."""
import time
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import httpx
import openai
import pytest

import llm_client


def _fake_response(text: str):
    return SimpleNamespace(
        choices=[SimpleNamespace(message=SimpleNamespace(content=text))]
    )


def _connection_error() -> openai.APIConnectionError:
    return openai.APIConnectionError(
        request=httpx.Request("POST", "https://example.test/v1/chat/completions")
    )


def _server_error() -> openai.InternalServerError:
    req = httpx.Request("POST", "https://example.test/v1/chat/completions")
    resp = httpx.Response(500, request=req)
    return openai.InternalServerError("boom", response=resp, body=None)


def _bad_request_error() -> openai.BadRequestError:
    req = httpx.Request("POST", "https://example.test/v1/chat/completions")
    resp = httpx.Response(400, request=req)
    return openai.BadRequestError("malformed prompt", response=resp, body=None)


@pytest.mark.asyncio
async def test_chat_complete_uses_primary_model_on_success():
    create_mock = AsyncMock(return_value=_fake_response("hi"))
    with (
        patch.object(llm_client, "_model", "primary-model"),
        patch.object(llm_client, "_fallback_model", "fallback-model"),
        patch.object(llm_client, "_model_down_until", {}),
        patch.object(llm_client._client.chat.completions, "create", new=create_mock),
    ):
        result = await llm_client.chat_complete([{"role": "user", "content": "hi"}])
    assert result == "hi"
    assert create_mock.call_count == 1
    assert create_mock.call_args.kwargs["model"] == "primary-model"


@pytest.mark.asyncio
async def test_chat_complete_falls_back_on_retryable_error():
    """Primary model down (e.g. connection error) → retried once against LLM_FALLBACK_MODEL."""
    create_mock = AsyncMock(
        side_effect=[_connection_error(), _fake_response("fallback reply")]
    )
    with (
        patch.object(llm_client, "_model", "primary-model"),
        patch.object(llm_client, "_fallback_model", "fallback-model"),
        patch.object(llm_client, "_model_down_until", {}),
        patch.object(llm_client._client.chat.completions, "create", new=create_mock),
    ):
        result = await llm_client.chat_complete([{"role": "user", "content": "hi"}])
    assert result == "fallback reply"
    assert create_mock.call_count == 2
    assert create_mock.call_args_list[0].kwargs["model"] == "primary-model"
    assert create_mock.call_args_list[1].kwargs["model"] == "fallback-model"


@pytest.mark.asyncio
async def test_chat_complete_raises_when_no_fallback_configured():
    create_mock = AsyncMock(side_effect=_connection_error())
    with (
        patch.object(llm_client, "_model", "primary-model"),
        patch.object(llm_client, "_fallback_model", None),
        patch.object(llm_client, "_model_down_until", {}),
        patch.object(llm_client._client.chat.completions, "create", new=create_mock),
    ):
        with pytest.raises(openai.APIConnectionError):
            await llm_client.chat_complete([{"role": "user", "content": "hi"}])
    assert create_mock.call_count == 1


@pytest.mark.asyncio
async def test_chat_complete_does_not_fall_back_on_request_error():
    """A malformed-request error (400) fails the same way on any model — no fallback attempt."""
    create_mock = AsyncMock(side_effect=_bad_request_error())
    with (
        patch.object(llm_client, "_model", "primary-model"),
        patch.object(llm_client, "_fallback_model", "fallback-model"),
        patch.object(llm_client, "_model_down_until", {}),
        patch.object(llm_client._client.chat.completions, "create", new=create_mock),
    ):
        with pytest.raises(openai.BadRequestError):
            await llm_client.chat_complete([{"role": "user", "content": "hi"}])
    assert create_mock.call_count == 1


@pytest.mark.asyncio
async def test_chat_complete_raises_when_fallback_also_fails():
    create_mock = AsyncMock(side_effect=[_connection_error(), _server_error()])
    with (
        patch.object(llm_client, "_model", "primary-model"),
        patch.object(llm_client, "_fallback_model", "fallback-model"),
        patch.object(llm_client, "_model_down_until", {}),
        patch.object(llm_client._client.chat.completions, "create", new=create_mock),
    ):
        with pytest.raises(openai.InternalServerError):
            await llm_client.chat_complete([{"role": "user", "content": "hi"}])
    assert create_mock.call_count == 2


@pytest.mark.asyncio
async def test_chat_complete_skips_fallback_when_same_as_primary():
    """LLM_FALLBACK_MODEL equal to the resolved model would just retry the same dead model."""
    create_mock = AsyncMock(side_effect=_connection_error())
    with (
        patch.object(llm_client, "_model", "same-model"),
        patch.object(llm_client, "_fallback_model", "same-model"),
        patch.object(llm_client, "_model_down_until", {}),
        patch.object(llm_client._client.chat.completions, "create", new=create_mock),
    ):
        with pytest.raises(openai.APIConnectionError):
            await llm_client.chat_complete([{"role": "user", "content": "hi"}])
    assert create_mock.call_count == 1


@pytest.mark.asyncio
async def test_chat_complete_per_call_model_override_still_falls_back():
    """A caller-supplied `model=` (e.g. LLM_RECOMMEND_MODEL) also gets fallback protection."""
    create_mock = AsyncMock(
        side_effect=[_connection_error(), _fake_response("fallback reply")]
    )
    with (
        patch.object(llm_client, "_model", "primary-model"),
        patch.object(llm_client, "_fallback_model", "fallback-model"),
        patch.object(llm_client, "_model_down_until", {}),
        patch.object(llm_client._client.chat.completions, "create", new=create_mock),
    ):
        result = await llm_client.chat_complete(
            [{"role": "user", "content": "hi"}], model="recommend-model"
        )
    assert result == "fallback reply"
    assert create_mock.call_args_list[0].kwargs["model"] == "recommend-model"
    assert create_mock.call_args_list[1].kwargs["model"] == "fallback-model"


# ---------------------------------------------------------------------------
# Cooldown circuit breaker
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_chat_complete_marks_model_down_after_failure():
    create_mock = AsyncMock(
        side_effect=[_connection_error(), _fake_response("fallback reply")]
    )
    with (
        patch.object(llm_client, "_model", "primary-model"),
        patch.object(llm_client, "_fallback_model", "fallback-model"),
        patch.object(llm_client, "_fallback_cooldown_s", 300.0),
        patch.object(llm_client, "_model_down_until", {}),
        patch.object(llm_client._client.chat.completions, "create", new=create_mock),
    ):
        await llm_client.chat_complete([{"role": "user", "content": "hi"}])
        assert llm_client._model_down_until.get("primary-model", 0.0) > time.monotonic()


@pytest.mark.asyncio
async def test_chat_complete_skips_primary_while_in_cooldown():
    """A second call while the primary is still in cooldown goes straight to fallback —
    no wasted attempt (and thus no timeout latency) against the known-down model."""
    create_mock = AsyncMock(return_value=_fake_response("fallback reply"))
    with (
        patch.object(llm_client, "_model", "primary-model"),
        patch.object(llm_client, "_fallback_model", "fallback-model"),
        patch.object(
            llm_client, "_model_down_until", {"primary-model": time.monotonic() + 300}
        ),
        patch.object(llm_client._client.chat.completions, "create", new=create_mock),
    ):
        result = await llm_client.chat_complete([{"role": "user", "content": "hi"}])
    assert result == "fallback reply"
    assert create_mock.call_count == 1
    assert create_mock.call_args.kwargs["model"] == "fallback-model"


@pytest.mark.asyncio
async def test_chat_complete_retries_primary_after_cooldown_expires():
    """Once the cooldown window has passed, the primary is tried again automatically."""
    create_mock = AsyncMock(return_value=_fake_response("primary reply"))
    with (
        patch.object(llm_client, "_model", "primary-model"),
        patch.object(llm_client, "_fallback_model", "fallback-model"),
        # Cooldown timestamp already in the past → expired.
        patch.object(llm_client, "_model_down_until", {"primary-model": 0.0}),
        patch.object(llm_client._client.chat.completions, "create", new=create_mock),
    ):
        result = await llm_client.chat_complete([{"role": "user", "content": "hi"}])
    assert result == "primary reply"
    assert create_mock.call_args.kwargs["model"] == "primary-model"
    # Success clears any (now-stale) cooldown record for next time.
    assert "primary-model" not in llm_client._model_down_until
