FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir "lightrag-hku[api]==1.5.0" aiofiles

COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# Seed knowledge PDFs — uploaded on first start by entrypoint
COPY knowledge/ /app/inputs/

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
