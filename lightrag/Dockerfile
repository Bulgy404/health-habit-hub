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

ENV PYTHONUNBUFFERED=1

EXPOSE 9621

ENTRYPOINT ["/app/entrypoint.sh"]
