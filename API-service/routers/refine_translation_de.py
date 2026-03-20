"""POST /api/v1/llm/refine-translation-de — tone-preserving German translation refinement."""
from __future__ import annotations

import logging
from pathlib import Path

from fastapi import APIRouter
from pydantic import BaseModel

from llm_client import chat_complete

logger = logging.getLogger(__name__)

router = APIRouter()

# ---------------------------------------------------------------------------
# Prompt template
# ---------------------------------------------------------------------------
_PROMPT_PATH = Path(__file__).parent.parent / "prompts" / "refine_translation_de.txt"
_PROMPT_TEMPLATE = _PROMPT_PATH.read_text(encoding="utf-8")


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------
class RefineTranslationDeRequest(BaseModel):
    original: str
    raw_translation: str


class RefineTranslationDeResponse(BaseModel):
    refined_translation: str


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------
@router.post("/llm/refine-translation-de", response_model=RefineTranslationDeResponse)
async def refine_translation_de(body: RefineTranslationDeRequest) -> RefineTranslationDeResponse:
    prompt = _PROMPT_TEMPLATE.format(
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

    return RefineTranslationDeResponse(refined_translation=refined)
