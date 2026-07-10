"""POST /api/v1/llm/refine-translation-lang — tone-preserving translation
refinement, parameterised by source and target language so one endpoint
covers all of the app's supported locales (en/de/ja/fr/nl) instead of a
near-duplicate endpoint and prompt file per language pair.
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
_PROMPT_TEMPLATE = load_prompt_template("prompts/refine_translation_lang.txt")

# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------
class RefineTranslationLangRequest(BaseModel):
    """Input payload for the language-agnostic refine-translation-lang endpoint."""

    original: str = Field(..., min_length=1, max_length=10000)
    raw_translation: str = Field(..., min_length=1, max_length=10000)
    source_language: str = Field(..., max_length=32)
    target_language: str = Field(..., max_length=32)


class RefineTranslationLangResponse(BaseModel):
    """LLM-refined translation preserving the tone and style of the original text."""

    refined_translation: str


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------
@router.post("/llm/refine-translation-lang", response_model=RefineTranslationLangResponse)
async def refine_translation_lang(
    body: RefineTranslationLangRequest,
) -> RefineTranslationLangResponse:
    """Refine a machine translation into any of the app's supported languages.

    Args:
        body: Validated request payload with original text, raw translation,
            and source/target languages (ISO 639-1 codes).

    Returns:
        RefineTranslationLangResponse with the LLM-refined translation string.
        Falls back to raw_translation if the LLM returns an empty response.

    Raises:
        HTTPException: 500 if the LLM call fails unexpectedly (propagated from chat_complete).
    """
    prompt = _PROMPT_TEMPLATE.format(
        source_language=display_language_name(body.source_language),
        target_language=display_language_name(body.target_language),
        original=body.original,
        raw_translation=body.raw_translation,
    )

    refined = await call_llm_with_fallback(
        prompt=prompt,
        fallback=body.raw_translation,
        temperature=0.3,
        llm_func=chat_complete,
    )

    return RefineTranslationLangResponse(refined_translation=refined)
