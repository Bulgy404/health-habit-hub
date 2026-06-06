"""POST /api/v1/llm/refine-translation — tone-preserving translation refinement."""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from auth import verify_service_token
from llm_client import chat_complete
from routers._llm_helpers import call_llm_with_fallback, load_prompt_template

logger = logging.getLogger(__name__)

router = APIRouter(dependencies=[Depends(verify_service_token)])

# ---------------------------------------------------------------------------
# Prompt template
# ---------------------------------------------------------------------------
_PROMPT_TEMPLATE = load_prompt_template("prompts/refine_translation.txt")


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------
class RefineTranslationRequest(BaseModel):
    """Input payload for the refine-translation endpoint."""

    original: str = Field(..., min_length=1, max_length=10000)
    raw_translation: str = Field(..., min_length=1, max_length=10000)
    language: str = Field(..., max_length=32)


class RefineTranslationResponse(BaseModel):
    """LLM-refined translation preserving the tone and style of the original text."""

    refined_translation: str


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------
@router.post("/llm/refine-translation", response_model=RefineTranslationResponse)
async def refine_translation(body: RefineTranslationRequest) -> RefineTranslationResponse:
    """Refine a machine translation to preserve the tone and style of the original.

    Args:
        body: Validated request payload with original text, raw translation, and target language.

    Returns:
        RefineTranslationResponse with the LLM-refined translation string.
        Falls back to raw_translation if the LLM returns an empty response.

    Raises:
        HTTPException: 500 if the LLM call fails unexpectedly (propagated from chat_complete).
    """
    prompt = _PROMPT_TEMPLATE.format(
        language=body.language,
        original=body.original,
        raw_translation=body.raw_translation,
    )

    refined = await call_llm_with_fallback(
        prompt=prompt,
        fallback=body.raw_translation,
        temperature=0.3,
        llm_func=chat_complete,
    )

    return RefineTranslationResponse(refined_translation=refined)
