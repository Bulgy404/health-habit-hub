"""Shared LLM client for the API-service.

Reads OPENAI_API_KEY, LLM_MODEL, and LLM_TEMPERATURE from environment variables
and exposes a single async helper for all modules.
"""
import logging
import os
from typing import Any, Optional

import openai

logger = logging.getLogger(__name__)

_api_key = os.getenv("OPENAI_API_KEY", "")
_model = os.getenv("LLM_MODEL", "gpt-4o-mini")
_temperature = float(os.getenv("LLM_TEMPERATURE", "0.2"))

if not _api_key or _api_key == "REPLACE_WITH_YOUR_OPENAI_API_KEY":
    logger.warning(
        "OPENAI_API_KEY is not set or is a placeholder. "
        "LLM calls will fail until a valid key is provided."
    )

_client = openai.AsyncOpenAI(api_key=_api_key or "placeholder")


async def chat_complete(
    messages: list,
    model: Optional[str] = None,
    temperature: Optional[float] = None,
) -> str:
    """Send a chat completion request and return the assistant reply text.

    Args:
        messages: List of OpenAI-format message dicts (role/content).
        model: Override LLM_MODEL env var for this call.
        temperature: Override LLM_TEMPERATURE env var for this call.

    Returns:
        The assistant's reply as a plain string.
    """
    response = await _client.chat.completions.create(
        model=model or _model,
        temperature=temperature if temperature is not None else _temperature,
        messages=messages,
    )
    return response.choices[0].message.content or ""
