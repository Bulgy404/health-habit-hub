"""Health Habit Hub — API-service (FastAPI)."""
import logging

from fastapi import FastAPI

from routers.classify_habit import router as classify_habit_router

logging.basicConfig(level=logging.INFO)

app = FastAPI(title="HHH API Service", version="1.0.0")

app.include_router(classify_habit_router, prefix="/api/v1")


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}
