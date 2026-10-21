from fastapi import APIRouter, Depends, HTTPException, Response, status
import httpx
from pydantic import BaseModel, Field

from app.config import Settings, get_settings

router = APIRouter(prefix="/api/voice", tags=["voice"])


class TTSRequest(BaseModel):
    text: str = Field(min_length=1, max_length=1_500)
    voice: str | None = Field(default=None, max_length=80)
    speed: float = Field(default=1.0, ge=0.75, le=1.25)


@router.post("/tts")
async def synthesize_speech(
    payload: TTSRequest,
    settings: Settings = Depends(get_settings),
) -> Response:
    """Proxy local Kokoro TTS so the browser receives demo-safe audio."""
    if settings.tts_provider.lower() != "kokoro":
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Local neural voice is disabled. Browser speech fallback is available.",
        )

    request = {
        "model": settings.tts_model,
        "input": payload.text,
        "voice": payload.voice or settings.tts_voice,
        "speed": payload.speed,
        "response_format": "mp3",
    }
    try:
        async with httpx.AsyncClient(timeout=settings.tts_timeout_seconds) as client:
            response = await client.post(
                f"{settings.tts_base_url.rstrip('/')}/v1/audio/speech",
                json=request,
            )
            response.raise_for_status()
    except httpx.HTTPError as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Local Kokoro voice engine is unavailable. Falling back to browser voice is safe.",
        ) from error

    return Response(
        content=response.content,
        media_type=response.headers.get("content-type", "audio/mpeg"),
        headers={"Cache-Control": "no-store"},
    )
