"""Health Habit Hub — API-service (FastAPI)."""
import logging
import os

from fastapi import FastAPI

_secret = os.environ.get("API_SERVICE_SECRET")
if not _secret:
    raise RuntimeError(
        "API_SERVICE_SECRET environment variable is required but not set."
    )

from deps import lifespan
from routers.classify_context import router as classify_context_router
from routers.classify_habit import router as classify_habit_router
from routers.extract_habits import router as extract_habits_router
from routers.extract_profile import router as extract_profile_router
from routers.map_bcio import router as map_bcio_router
from routers.recommend import router as recommend_router
from routers.refine_translation import router as refine_translation_router
from routers.refine_translation_de import router as refine_translation_de_router
from routers.retrieve import router as retrieve_router

logging.basicConfig(level=logging.INFO)

app = FastAPI(title="HHH API Service", version="1.0.0", lifespan=lifespan)

app.include_router(classify_habit_router, prefix="/api/v1")
app.include_router(classify_context_router, prefix="/api/v1")
app.include_router(map_bcio_router, prefix="/api/v1")
app.include_router(extract_habits_router, prefix="/api/v1")
app.include_router(extract_profile_router, prefix="/api/v1")
app.include_router(refine_translation_router, prefix="/api/v1")
app.include_router(refine_translation_de_router, prefix="/api/v1")
app.include_router(retrieve_router, prefix="/api/v1")
app.include_router(recommend_router, prefix="/api/v1")


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}
