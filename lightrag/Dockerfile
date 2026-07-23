FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir "lightrag-hku[api]==1.5.0" aiofiles

COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# Knowledge corpus is deliberately NOT baked into the image.
#
# The seed documents may be third-party, copyright-protected literature that we
# are not licensed to redistribute, and this image/repository is public. Baking
# them in would distribute them with every pull.
#
# Instead, mount the documents at /app/inputs at run time (see the
# LIGHTRAG_KNOWLEDGE_DIR bind mount on the lightrag service in
# docker-compose.yml). The entrypoint scans /app/inputs on start and simply
# logs "No PDFs found" when the directory is empty, so the image runs fine
# without any corpus.
RUN mkdir -p /app/inputs

# Pre-built index data — seeds an empty volume so cold starts skip LLM processing.
# Regenerate with: ./lightrag/scripts/export-data.sh
COPY data/ /app/data/

# Non-root: /app/data is a named volume (lightrag-data), so Docker
# initializes it from this ownership on first creation — unlike a host bind
# mount, this is safe to chown at build time.
RUN groupadd --system lightrag && useradd --system --gid lightrag lightrag \
    && chown -R lightrag:lightrag /app
USER lightrag

ENV PYTHONUNBUFFERED=1

EXPOSE 9621

ENTRYPOINT ["/app/entrypoint.sh"]
