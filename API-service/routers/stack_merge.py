"""POST /api/v1/llm/stack-merge — §7.1 Habit Stacking.

Merge an anchor habit and a new behaviour into a single implementation
intention of the form "After I [anchor], I will [new behaviour]", written in the
user's language. Modelled on the stitch-intention endpoint; the anchor need not
be a habit the user already tracks in the app.
"""
from __future__ import annotations

import logging
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from auth import verify_service_token
from llm_client import chat_complete

logger = logging.getLogger(__name__)

router = APIRouter(dependencies=[Depends(verify_service_token)])

# ---------------------------------------------------------------------------
# Prompt template
# ---------------------------------------------------------------------------
_PROMPT_PATH = Path(__file__).parent.parent / "prompts" / "stack_merge.txt"
_PROMPT_TEMPLATE = _PROMPT_PATH.read_text(encoding="utf-8")


class StackMergeRequest(BaseModel):
    """Input for merging an anchor habit and a new behaviour."""

    anchor_text: str = Field(..., min_length=1, max_length=2000, description="The existing anchor habit")
    new_behavior_text: str = Field(..., min_length=1, max_length=2000, description="The new behaviour to stack on")
    language: str = Field("en", max_length=10, description="ISO 639-1 output language code")


class StackMergeResponse(BaseModel):
    """Result: one combined implementation intention sentence."""

    sentence: str


@router.post("/llm/stack-merge", response_model=StackMergeResponse)
async def stack_merge(body: StackMergeRequest) -> StackMergeResponse:
    """Combine an anchor habit and a new behaviour into one intention sentence.

    Raises:
        HTTPException: 503 if the LLM call fails.
    """
    prompt = _PROMPT_TEMPLATE.format(
        language=body.language,
        anchor_text=body.anchor_text,
        new_behavior_text=body.new_behavior_text,
    )

    try:
        raw = await chat_complete(
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
        )
    except Exception as exc:  # noqa: BLE001
        logger.error("LLM stack_merge call failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"error": "Stack merge unavailable", "code": "llm_unavailable"},
        ) from exc

    sentence = raw.strip().strip('"').strip("'")
    return StackMergeResponse(sentence=sentence)
