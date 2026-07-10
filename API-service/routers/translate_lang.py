"""POST /api/v1/llm/translate-lang — direct LLM translation with no draft to
refine.

Used as a fallback when LibreTranslate itself is unreachable, so a
translation can still be produced (by asking the LLM to translate from
scratch) instead of the habit going without one entirely.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from auth import verify_service_token
from llm_client import chat_complete
from routers._llm_helpers import (
    call_llm_with_fallback,
    display_language_name,
    load_prompt_template,
)

logger = logging.getLogger(__name__)

router = APIRouter(dependencies=[Depends(verify_service_token)])

# ---------------------------------------------------------------------------
# Prompt template
# ---------------------------------------------------------------------------
_PROMPT_TEMPLATE = load_prompt_template("prompts/translate_lang.txt")


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------
class TranslateLangRequest(BaseModel):
    """Input payload for the direct-translation translate-lang endpoint."""

    original: str = Field(..., min_length=1, max_length=10000)
    source_language: str = Field(..., max_length=32)
    target_language: str = Field(..., max_length=32)


class TranslateLangResponse(BaseModel):
    """LLM translation produced with no machine-translated draft to refine."""

    translation: str


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------
@router.post("/llm/translate-lang", response_model=TranslateLangResponse)
async def translate_lang(body: TranslateLangRequest) -> TranslateLangResponse:
    """Translate a habit sentence directly via the LLM, with no draft available.

    Args:
        body: Validated request payload with original text and source/target
            languages (ISO 639-1 codes).

    Returns:
        TranslateLangResponse with the LLM-produced translation string. Falls
        back to the original text if the LLM returns an empty response (last
        resort — the caller should treat that as "translation unavailable").

    Raises:
        HTTPException: 500 if the LLM call fails unexpectedly (propagated from chat_complete).
    """
    prompt = _PROMPT_TEMPLATE.format(
        source_language=display_language_name(body.source_language),
        target_language=display_language_name(body.target_language),
        original=body.original,
    )

    translation = await call_llm_with_fallback(
        prompt=prompt,
        fallback=body.original,
        temperature=0.3,
        llm_func=chat_complete,
    )

    return TranslateLangResponse(translation=translation)
