import json
from collections.abc import Callable

import httpx

from app.config import Settings


class LLMUnavailableError(RuntimeError):
    pass


class InvalidLLMResponseError(RuntimeError):
    pass


class OllamaService:
    """Configurable local LLM boundary; no routes call Ollama directly."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    async def structured(
        self, prompt: str, required_keys: set[str],
        validate: Callable[[dict[str, object]], None] | None = None,
    ) -> dict[str, object]:
        response_text = await self._generate(prompt)
        try:
            payload = json.loads(response_text)
            if not isinstance(payload, dict) or not required_keys.issubset(payload):
                raise ValueError("missing required keys")
            if validate:
                validate(payload)
            return payload
        except (json.JSONDecodeError, ValueError) as first_error:
            repair_prompt = (
                "Return valid JSON only. Required keys are "
                f"{sorted(required_keys)}. Validation error: {first_error}.\n"
                f"Original task and evidence:\n{prompt}\nRepair this output:\n{response_text}"
            )
            repaired = await self._generate(repair_prompt)
            try:
                payload = json.loads(repaired)
                if not isinstance(payload, dict) or not required_keys.issubset(payload):
                    raise ValueError("missing required keys")
                if validate:
                    validate(payload)
                return payload
            except (json.JSONDecodeError, ValueError) as error:
                raise InvalidLLMResponseError("Ollama returned invalid structured output") from error

    async def _generate(self, prompt: str) -> str:
        request = {
            "model": self._settings.ollama_model,
            "prompt": prompt,
            "stream": False,
            "format": "json",
            "options": {"temperature": 0, "num_ctx": self._settings.ollama_num_ctx},
        }
        if self._settings.ollama_reasoning_effort:
            request["think"] = self._settings.ollama_reasoning_effort
        try:
            async with httpx.AsyncClient(timeout=180.0) as client:
                response = await client.post(f"{self._settings.ollama_base_url}/api/generate", json=request)
                response.raise_for_status()
                payload = response.json()
        except httpx.HTTPError as error:
            raise LLMUnavailableError("Ollama is unavailable; retry shortly") from error
        output = payload.get("response")
        if not isinstance(output, str) or not output.strip():
            raise InvalidLLMResponseError("Ollama did not return an answer")
        return output
