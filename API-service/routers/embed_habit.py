"""POST /api/v1/llm/embed-batch — batch-embed a list of texts.

Called by the Node.js backend during habit donation to embed the habit
sentence, its context phrases, and its BCIO concept labels in one API call.
The caller writes the returned vectors to their respective Neo4j nodes.
"""
from __future__ import annotations

import logging
from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from auth import verify_service_token
from routers._embeddings import embed_texts

logger = logging.getLogger(__name__)

router = APIRouter(dependencies=[Depends(verify_service_token)])

# Same per-string bound as the sentence-like fields on sibling endpoints
# (classify_habit.py, recommend.py, ...) — without it, a caller could submit
# up to 500 arbitrarily long strings, inflating embedding-API cost/latency.
_EmbedText = Annotated[str, Field(min_length=1, max_length=2000)]


class EmbedBatchRequest(BaseModel):
    texts: list[_EmbedText] = Field(..., min_length=1, max_length=500)


class EmbedBatchResponse(BaseModel):
    embeddings: list[list[float]]


@router.post("/llm/embed-batch", response_model=EmbedBatchResponse)
async def embed_batch(body: EmbedBatchRequest) -> EmbedBatchResponse:
    """Embed a list of texts and return vectors in the same order."""
    embeddings = await embed_texts(body.texts)
    return EmbedBatchResponse(embeddings=embeddings)
