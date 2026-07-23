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

Place the PDFs on the server (outside the repo checkout) and point
`LIGHTRAG_KNOWLEDGE_DIR` at that directory:

```bash
# on the server
sudo mkdir -p /opt/hhh/knowledge
sudo cp your-documents/*.pdf /opt/hhh/knowledge/

# .env / Portainer stack variable
LIGHTRAG_KNOWLEDGE_DIR=/opt/hhh/knowledge
```

`docker-compose.yml` mounts it read-only at `/app/inputs`. On start,
`entrypoint.sh` scans that directory and ingests any PDFs it finds. The mount is
optional — with no documents the entrypoint logs
`[seed] No PDFs found in /app/inputs — skipping seed.` and LightRAG starts
normally.

## What may go in here

- Open-access literature under a licence that permits redistribution
  (e.g. CC-BY), with attribution
- Documents you or the university hold the rights to
- Your own summaries, notes, and study material

Do **not** add publisher PDFs, paywalled articles, or anything whose licence you
have not checked.
