from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


def find_local_env_file() -> Path | None:
    """Use a project .env when running locally; containers receive env directly."""
    for directory in (Path.cwd(), *Path.cwd().parents):
        candidate = directory / ".env"
        if candidate.exists():
            return candidate
    return None


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=find_local_env_file(), extra="ignore")

    dealmind_env: str = "development"
    database_url: str
    hindsight_base_url: str = "http://localhost:8888"
    hindsight_api_key: str | None = None
    hindsight_timeout_seconds: float = 600.0
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "gpt-oss:20b"
    ollama_num_ctx: int = 16384
    ollama_reasoning_effort: str | None = None
    ollama_fallback_model: str = "gemma3:4b"
    tts_provider: str = "kokoro"
    tts_base_url: str = "http://localhost:7860"
    tts_model: str = "kokoro"
    tts_voice: str = "af_heart"
    tts_timeout_seconds: float = 60.0


@lru_cache
def get_settings() -> Settings:
    return Settings()
