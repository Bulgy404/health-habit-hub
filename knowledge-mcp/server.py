"""MCP server wrapping LightRAG REST API for habit knowledge retrieval."""
import logging
import os

import httpx
from fastmcp import FastMCP

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

_LIGHTRAG_URL = os.environ.get("LIGHTRAG_URL", "http://lightrag:9621")
_LIGHTRAG_API_KEY = os.environ.get("LIGHTRAG_API_KEY", "")

mcp = FastMCP("knowledge-mcp")


def _headers() -> dict:
    h = {"Content-Type": "application/json"}
    if _LIGHTRAG_API_KEY:
        h["Authorization"] = f"Bearer {_LIGHTRAG_API_KEY}"
    return h


@mcp.tool()
async def search_knowledge(query: str, mode: str = "hybrid") -> str:
    """Search the habit knowledge base using LightRAG graph+vector retrieval.

    Args:
        query: The search query about habits, health interventions, or behaviour change.
        mode: Retrieval mode — 'hybrid' (default), 'local', 'global', 'naive', or 'mix'.

    Returns:
        Relevant context from the knowledge base as a text string.
    """
    logger.info("search_knowledge query=%r mode=%s", query[:80], mode)
    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            f"{_LIGHTRAG_URL}/query",
            headers=_headers(),
            json={"query": query, "mode": mode, "only_need_context": True},
        )
        logger.info("search_knowledge → LightRAG status=%d", resp.status_code)
        resp.raise_for_status()
        data = resp.json()
    return data.get("response") or ""


@mcp.tool()
async def ingest_document(content: str, doc_id: str) -> str:
    """Insert a text document into the LightRAG knowledge base.

    Args:
        content: The full text content to insert.
        doc_id: A unique identifier / filename for the document.

    Returns:
        Confirmation message from LightRAG.
    """
    logger.info("ingest_document doc_id=%r len=%d", doc_id, len(content))
    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.post(
            f"{_LIGHTRAG_URL}/documents/text",
            headers=_headers(),
            json={"text": content, "file_source": doc_id},
        )
        logger.info("ingest_document → LightRAG status=%d", resp.status_code)
        resp.raise_for_status()
        data = resp.json()
    return data.get("message") or data.get("status") or "Document ingested."


if __name__ == "__main__":
    mcp.run(transport="sse", host="0.0.0.0", port=8002)
