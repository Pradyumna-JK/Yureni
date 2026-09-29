from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.database import get_db
from app.services.hindsight_memory import HindsightMemoryService, MemoryUnavailableError

router = APIRouter(tags=["health"])


@router.get("/health")
def application_health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/api/health/db")
def database_health(db: Session = Depends(get_db)) -> dict[str, str]:
    try:
        db.execute(text("SELECT 1"))
    except Exception as error:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database unavailable") from error
    return {"status": "ok", "database": "connected"}


@router.get("/api/health/memory")
async def memory_health(settings: Settings = Depends(get_settings)) -> dict[str, str]:
    try:
        await HindsightMemoryService(settings).health()
    except MemoryUnavailableError as error:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(error)) from error
    return {"status": "ok", "memory": "connected"}
