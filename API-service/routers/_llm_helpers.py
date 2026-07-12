"""Shared LLM invocation helpers for router modules."""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Awaitable, Callable, Optional

from fastapi import HTTPException, status

from llm_client import chat_complete

logger = logging.getLogger(__name__)

# Type alias for the LLM callable signature used by chat_complete.
_LLMCallable = Callable[..., Awaitable[str]]

# ISO 639-1 code -> display name used in translation prompt text.
LANGUAGE_DISPLAY_NAMES = {
    "en": "English",
    "de": "German",
    "ja": "Japanese",
    "fr": "French",
    "nl": "Dutch",
}


def display_language_name(code: str) -> str:
    """Map an ISO 639-1 code to its English display name for prompt text.

    Falls back to the raw code if it isn't one of the app's known locales.
    """
    return LANGUAGE_DISPLAY_NAMES.get(code.lower()[:2], code)


def load_prompt_template(relative_path: str) -> str:
    """Load a prompt template from the prompts directory.

    Args:
        relative_path: Path relative to the repo root, e.g.
            ``"prompts/refine_translation.txt"``.

    Returns:
        The prompt template string with ``{placeholder}`` slots.
    """
    path = Path(__file__).parent.parent / relative_path
    return path.read_text(encoding="utf-8")


async def call_llm_with_fallback(
    prompt: str,
    fallback: str,
    temperature: float = 0.3,
    llm_func: Optional[_LLMCallable] = None,
) -> str:
    """Call the LLM and return its stripped response, falling back on empty output.

    Args:
        prompt: The fully-formatted prompt to send.
        fallback: Value to return if the LLM produces an empty response.
        temperature: Sampling temperature (default 0.3 for refinement tasks).
        llm_func: Optional LLM callable to use instead of the default
            ``chat_complete``. Callers may pass their own module-level
            reference so that test patches applied to the calling module
            are respected.

    Returns:
        The LLM response string, or ``fallback`` if the response was empty.

    Raises:
        HTTPException: 503 if the LLM call fails.
    """
    fn = llm_func if llm_func is not None else chat_complete
    try:
        raw = await fn(
            messages=[{"role": "user", "content": prompt}],
            temperature=temperature,
        )
    except Exception as exc:  # noqa: BLE001
        logger.error("LLM call_llm_with_fallback call failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"error": "Translation service unavailable", "code": "llm_unavailable"},
        ) from exc
    result = raw.strip()
    if not result:
        logger.warning("LLM returned empty response — using fallback.")
        return fallback
    return result
