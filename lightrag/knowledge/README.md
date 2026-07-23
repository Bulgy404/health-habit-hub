# LightRAG knowledge corpus

Source documents for the LightRAG knowledge base live in this directory at
**deploy time only**. They are deliberately **not committed** and **not baked
into the Docker image**.

## Why

This repository is public, and the corpus may contain third-party,
copyright-protected literature (e.g. journal articles) that we are **not
licensed to redistribute**. Committing such a file publishes it; `COPY`-ing it
into the image ships it with every pull. Using a paper internally for research
is not the same as redistributing it.

A copyrighted article was previously committed here and baked into the image.
It has been removed from the working tree, from the image build, and purged
from git history (2026-07-23).

## How to provide documents

`/app/inputs` **must be writable** — the LightRAG WebUI's upload endpoint writes
uploaded files there. A read-only mount makes uploads fail with
`500 [Errno 30] Read-only file system`.

### Option A — upload through the WebUI (default, recommended)

By default `docker-compose.yml` mounts the named volume `lightrag-inputs`
(`hhh-lightrag-inputs`) at `/app/inputs`. Docker initialises it from the image's
`/app/inputs`, which is owned by the non-root `lightrag` user, so it is writable
out of the box and uploads persist across redeploys.

Just open the LightRAG WebUI (`https://<DOMAIN>/lightrag/webui/`) and use
**Documents → Upload**. Nothing to configure.

### Option B — stage files from a host directory

Set `LIGHTRAG_KNOWLEDGE_DIR` to an **absolute** host path:

```bash
# on the server
sudo mkdir -p /opt/hhh/knowledge
sudo cp your-documents/*.pdf /opt/hhh/knowledge/

# the container runs as a non-root user, so make the directory writable by it,
# otherwise WebUI uploads fail with EACCES (permission denied):
sudo chown -R 999:999 /opt/hhh/knowledge   # check the uid: docker exec hhh-lightrag id -u

# .env / Portainer stack variable
LIGHTRAG_KNOWLEDGE_DIR=/opt/hhh/knowledge
```

On start, `entrypoint.sh` scans `/app/inputs` and ingests any PDFs it finds.
Either way the corpus is optional — with no documents the entrypoint logs
`[seed] No PDFs found in /app/inputs — skipping seed.` and LightRAG starts
normally.

## What may go in here

- Open-access literature under a licence that permits redistribution
  (e.g. CC-BY), with attribution
- Documents you or the university hold the rights to
- Your own summaries, notes, and study material

Do **not** add publisher PDFs, paywalled articles, or anything whose licence you
have not checked.
