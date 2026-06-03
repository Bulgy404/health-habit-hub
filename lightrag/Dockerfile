FROM python:3.11-slim

WORKDIR /app

RUN pip install --no-cache-dir "lightrag-hku[api]==1.5.0" aiofiles

COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

RUN mkdir -p /app/data

ENV PYTHONUNBUFFERED=1

EXPOSE 9621

ENTRYPOINT ["/app/entrypoint.sh"]
