"""POST /api/v1/llm/translate-term — direct LLM translation of a short
controlled-vocabulary term (e.g. a BCIO concept label).

Distinct from translate_lang/refine_translation_lang, which are tuned for
translating a full personal habit sentence and preserving its tone. BCIO
concept labels are short ontology terms ("Physical activity",
"Self-monitoring of behaviour") — a habit-sentence prompt would produce
unnaturally verbose or "personal-toned" output for them.
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
_PROMPT_TEMPLATE = load_prompt_template("prompts/translate_term.txt")


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------
class TranslateTermRequest(BaseModel):
    """Input payload for the translate-term endpoint."""

    term: str = Field(..., min_length=1, max_length=200)
    source_language: str = Field(..., max_length=32)
    target_language: str = Field(..., max_length=32)


class TranslateTermResponse(BaseModel):
    """LLM translation of a short controlled-vocabulary term."""

    translation: str


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------
@router.post("/llm/translate-term", response_model=TranslateTermResponse)
async def translate_term(body: TranslateTermRequest) -> TranslateTermResponse:
    """Translate a short ontology/glossary term via the LLM.

    Args:
        body: Validated request payload with the term and source/target
            languages (ISO 639-1 codes).

    Returns:
        TranslateTermResponse with the LLM-translated term. Falls back to
        the original term if the LLM returns an empty response.

    Raises:
        HTTPException: 500 if the LLM call fails unexpectedly (propagated from chat_complete).
    """
    prompt = _PROMPT_TEMPLATE.format(
        source_language=display_language_name(body.source_language),
        target_language=display_language_name(body.target_language),
        term=body.term,
    )

    translation = await call_llm_with_fallback(
        prompt=prompt,
        fallback=body.term,
        temperature=0.2,
        llm_func=chat_complete,
    )

    return TranslateTermResponse(translation=translation)
