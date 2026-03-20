"""Health Habit Hub — API-service (FastAPI)."""
import logging

from fastapi import FastAPI

logging.basicConfig(level=logging.INFO)

app = FastAPI(title="HHH API Service", version="1.0.0")


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}
