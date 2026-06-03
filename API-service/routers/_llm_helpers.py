"""Shared LLM invocation helpers for router modules."""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Awaitable, Callable, Optional

from llm_client import chat_complete

logger = logging.getLogger(__name__)

# Type alias for the LLM callable signature used by chat_complete.
_LLMCallable = Callable[..., Awaitable[str]]


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
    """
    fn = llm_func if llm_func is not None else chat_complete
    raw = await fn(
        messages=[{"role": "user", "content": prompt}],
        temperature=temperature,
    )
    result = raw.strip()
    if not result:
        logger.warning("LLM returned empty response — using fallback.")
        return fallback
    return result
