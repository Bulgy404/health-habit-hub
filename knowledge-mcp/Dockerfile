FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY server.py .

RUN groupadd --system mcp && useradd --system --gid mcp mcp \
    && chown -R mcp:mcp /app
USER mcp

ENV PYTHONUNBUFFERED=1

EXPOSE 8002

CMD ["python", "server.py"]
