"""Shared LLM client for the API-service.

Reads OPENAI_API_KEY, LLM_MODEL, and LLM_TEMPERATURE from environment variables
and exposes a single async helper for all modules.
"""
import logging
import os
from typing import Optional

import openai

logger = logging.getLogger(__name__)

_api_key = os.getenv("LLM_API_KEY", "")
_model = os.getenv("LLM_MODEL", "gpt-4o-mini")
_temperature = float(os.getenv("LLM_TEMPERATURE", "0.2"))
_api_base = os.getenv("LLM_API_BASE")
# Keep total time (attempts × timeout) below the Node proxy's
# RECOMMENDER_TIMEOUT_MS (default 180s), or the client sees a 504.
_timeout = float(os.getenv("LLM_TIMEOUT_S", "120"))
_max_retries = int(os.getenv("LLM_MAX_RETRIES", "0"))

if not _api_key or _api_key in ("REPLACE_WITH_YOUR_API_KEY", "CHANGE_THIS_API_KEY"):
    logger.warning(
        "LLM_API_KEY is not set or is a placeholder. "
        "LLM calls will fail until a valid key is provided."
    )

_client = openai.AsyncOpenAI(
    api_key=_api_key or "placeholder",
    base_url=_api_base or None,
    max_retries=_max_retries,
)


async def chat_complete(
    messages: list,
    model: Optional[str] = None,
    temperature: Optional[float] = None,
    max_tokens: Optional[int] = None,
) -> str:
    """Send a chat completion request and return the assistant reply text.

    Args:
        messages: List of OpenAI-format message dicts (role/content).
        model: Override LLM_MODEL env var for this call.
        temperature: Override LLM_TEMPERATURE env var for this call.
        max_tokens: Optional hard cap on the completion length.

    Returns:
        The assistant's reply as a plain string.
    """
    import time

    resolved_model = model or _model
    prompt_chars = sum(len(str(m.get("content", ""))) for m in messages)
    logger.info(
        "chat_complete start: model=%s prompt_chars=%d timeout=%.0fs",
        resolved_model, prompt_chars, _timeout,
    )
    start = time.monotonic()
    extra: dict = {}
    if max_tokens is not None and max_tokens > 0:
        extra["max_tokens"] = max_tokens
    try:
        response = await _client.chat.completions.create(
            model=resolved_model,
            temperature=temperature if temperature is not None else _temperature,
            messages=messages,
            timeout=_timeout,
            **extra,
        )
    except Exception as exc:
        logger.error(
            "chat_complete failed after %.1fs: model=%s %s: %s",
            time.monotonic() - start, resolved_model, type(exc).__name__, exc,
        )
        raise
    logger.info(
        "chat_complete done in %.1fs: model=%s", time.monotonic() - start, resolved_model
    )
    return response.choices[0].message.content or ""
