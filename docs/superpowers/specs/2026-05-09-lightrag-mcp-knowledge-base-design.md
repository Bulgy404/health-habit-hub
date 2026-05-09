# LightRAG + MCP Knowledge Base — Design Spec

**Date:** 2026-05-09  
**Status:** Approved  
**Branch:** platform_unified

---

## Goal

Replace the current in-memory vector RAG system in the API-service with LightRAG (graph + vector retrieval) running as an isolated Docker container. Add an MCP server container that wraps LightRAG for use by the habit recommendation pipeline and external Claude tooling. Update the admin portal to support PDF/TXT/MD uploads and link to LightRAG's built-in graph visualization UI.

---

## Architecture

### New containers

| Container | Build context | Internal port | Host port | Purpose |
|---|---|---|---|---|
| `lightrag` | `./lightrag/` | `9621` | `9622` | LightRAG HTTP server — REST API + graph visualization UI |
| `knowledge-mcp` | `./knowledge-mcp/` | `8002` | `8002` | FastMCP server wrapping LightRAG REST API |

### Unchanged containers

All existing containers (`recommender`, `app`, `admin`, `mongo`, `neo4j`, `keycloak`, `redis`, `fuseki`, `translate`, `proxy`) are untouched except where noted below.

### Data flow — document ingestion

```
Admin portal → POST /api/v1/kb (Node.js)
  → POST /api/v1/kb (API-service proxy)
  → POST http://lightrag:9621/insert_file
  → LightRAG: entity extraction + graph build + vector index (scads AI API)
  → stored in lightrag-data volume
```

### Data flow — retrieval

```
Recommendation pipeline → POST /api/v1/llm/retrieve (API-service)
  → POST http://lightrag:9621/query (mode=hybrid)
  → LightRAG: graph context + vector search combined
  → RetrieveResponse{sources:[{filename,category,excerpt,score}]}
```

---

## Component changes

### 1. `lightrag/` (new directory)

```
lightrag/
  Dockerfile         # pip install lightrag-hku[api]; uvicorn entry
  requirements.txt   # lightrag-hku[api]
  entrypoint.sh      # sets env vars, starts lightrag server
```

LightRAG server is started with:
- `--host 0.0.0.0 --port 9621`
- `--working-dir /app/data` (mounted volume)
- LLM and embedding config from env vars pointing to scads AI API
- Bearer token auth using `LIGHTRAG_API_KEY`
- Logging: stdout, INFO level, json-file Docker driver

### 2. `knowledge-mcp/` (new directory)

```
knowledge-mcp/
  server.py          # FastMCP app
  Dockerfile
  requirements.txt   # fastmcp, httpx
```

MCP tools:

**`search_knowledge(query: str, mode: str = "hybrid") → str`**
- Calls `POST http://lightrag:9621/query`
- Returns formatted context string for use in recommendation prompts

**`ingest_document(content: str, doc_id: str) → str`**
- Calls `POST http://lightrag:9621/insert`
- Returns confirmation message

Transport: SSE at `http://knowledge-mcp:8002/sse`  
Logging: every tool call logs tool name, input, and LightRAG response status to stdout.

### 3. `API-service/routers/retrieve.py` (replaced)

Remove: in-memory index, chunking, cosine similarity, PDF embedding, `numpy`/`pypdf` usage.

New implementation — thin HTTP client over LightRAG REST:

| Endpoint | Action |
|---|---|
| `POST /api/v1/llm/retrieve` | `POST lightrag:9621/query` mode=hybrid |
| `GET /api/v1/kb` | `GET lightrag:9621/documents` |
| `POST /api/v1/kb` | `POST lightrag:9621/insert_file` |
| `DELETE /api/v1/kb/{filename}` | `DELETE lightrag:9621/documents/{doc_id}` |
| `POST /api/v1/kb/reindex` | Removed (LightRAG indexes incrementally) |

`RetrieveResponse` shape unchanged: `{sources: [{filename, category, excerpt, score}]}`.  
`KbEntry` shape unchanged: `{filename, category, file_size, has_summary, upload_date}`.

`requirements.txt`: add `respx>=0.21.0` for test mocking. Remove `numpy` usage from this file (numpy stays in requirements for other routers).

### 4. `API-service/tests/test_retrieve.py` (rewritten)

Mock LightRAG HTTP endpoints with `respx`. Test:
- `POST /api/v1/llm/retrieve` → calls LightRAG query, returns mapped sources
- `GET /api/v1/kb` → returns document list
- `POST /api/v1/kb` → streams file to LightRAG, returns 201
- `DELETE /api/v1/kb/{filename}` → calls LightRAG delete

### 5. `admin/src/app/(admin)/knowledge-base/page.tsx` (updated)

- Upload modal: accept `.pdf,.txt,.md`; validate extension client-side
- Remove "Re-index" button (incremental indexing makes it obsolete)
- Add "View Graph" button in header → opens `http://localhost:9622` in new tab
- `KbEntry` type and fetch logic unchanged

### 6. `docker-compose.local.yml` (updated)

Add `lightrag` and `knowledge-mcp` services with:
- `env_file: .env`
- `logging: driver: json-file, options: {max-size: 10m, max-file: 3}`
- `restart: on-failure:3`
- `depends_on: [lightrag]` for knowledge-mcp
- `lightrag-data` volume declared in top-level `volumes:` block

### 7. `.env` / `.env.example` (updated)

New variables:
```
LIGHTRAG_URL=http://lightrag:9621
LIGHTRAG_API_KEY=dev-lightrag-secret
LIGHTRAG_HOST_PORT=9622
```

---

## Environment variables

| Variable | Used by | Purpose |
|---|---|---|
| `LIGHTRAG_URL` | API-service, knowledge-mcp | Base URL for LightRAG REST API |
| `LIGHTRAG_API_KEY` | lightrag, API-service, knowledge-mcp | Bearer token for LightRAG auth |
| `LIGHTRAG_HOST_PORT` | docker-compose | Host port for graph UI (default 9622) |
| `LLM_API_KEY`, `LLM_API_BASE`, `LLM_MODEL` | lightrag | scads AI LLM for entity extraction |
| `EMBEDDING_MODEL`, `EMBEDDING_API_BASE`, `EMBEDDING_API_KEY` | lightrag | scads AI embeddings |

---

## Out of scope

- Changes to Neo4j (LightRAG uses isolated file storage)
- Changes to `app/routes/kbRouter.js` (proxy unchanged)
- Changes to any other API-service routers
- Changes to admin auth, middleware, or sidebar
- Production docker-compose changes (local only for now)

---

## Documentation updates

- `docs/guides/local-dev.md`: add lightrag + knowledge-mcp to services table; add LIGHTRAG_* to env setup; note graph UI at localhost:9622
- `docs/architecture.md`: add both containers with roles, ports, env vars
