"""POST /api/v1/llm/refine-translation — tone-preserving translation refinement."""
from __future__ import annotations

import logging
from pathlib import Path

from fastapi import APIRouter
from pydantic import BaseModel, Field

from llm_client import chat_complete

logger = logging.getLogger(__name__)

router = APIRouter()

# ---------------------------------------------------------------------------
# Prompt template
# ---------------------------------------------------------------------------
_PROMPT_PATH = Path(__file__).parent.parent / "prompts" / "refine_translation.txt"
_PROMPT_TEMPLATE = _PROMPT_PATH.read_text(encoding="utf-8")


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------
class RefineTranslationRequest(BaseModel):
    original: str = Field(..., min_length=1, max_length=10000)
    raw_translation: str = Field(..., min_length=1, max_length=10000)
    language: str = Field(..., max_length=32)


class RefineTranslationResponse(BaseModel):
    refined_translation: str


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------
@router.post("/llm/refine-translation", response_model=RefineTranslationResponse)
async def refine_translation(body: RefineTranslationRequest) -> RefineTranslationResponse:
    prompt = _PROMPT_TEMPLATE.format(
        language=body.language,
        original=body.original,
        raw_translation=body.raw_translation,
    )

    raw = await chat_complete(
        messages=[{"role": "user", "content": prompt}],
        temperature=0.3,
    )

    refined = raw.strip()
    if not refined:
        logger.warning("LLM returned empty response — falling back to raw_translation.")
        refined = body.raw_translation

    return RefineTranslationResponse(refined_translation=refined)
