import json

import pytest

from app.services.llm import InvalidLLMResponseError, OllamaService
from app.services.hindsight_memory import HindsightMemoryService, MemoryEvidence, MemoryUnavailableError


class FakeResponse:
    def __init__(self, text: str) -> None:
        self.text = text


@pytest.mark.asyncio
async def test_structured_llm_retries_once_on_invalid_json(monkeypatch: pytest.MonkeyPatch) -> None:
    service = OllamaService.__new__(OllamaService)
    outputs = iter(["not json", json.dumps({"answer": "Ravi prioritized deployment timing."})])

    async def generate(_: str) -> str:
        return next(outputs)

    monkeypatch.setattr(service, "_generate", generate)

    result = await service.structured("question", {"answer"})

    assert result["answer"] == "Ravi prioritized deployment timing."


@pytest.mark.asyncio
async def test_structured_llm_rejects_invalid_json_after_retry(monkeypatch: pytest.MonkeyPatch) -> None:
    service = OllamaService.__new__(OllamaService)

    async def generate(_: str) -> str:
        return "not json"

    monkeypatch.setattr(service, "_generate", generate)

    with pytest.raises(InvalidLLMResponseError):
        await service.structured("question", {"answer"})


@pytest.mark.asyncio
async def test_memory_health_exposes_unavailability(monkeypatch: pytest.MonkeyPatch) -> None:
    service = HindsightMemoryService.__new__(HindsightMemoryService)
    service._settings = type("Settings", (), {"hindsight_base_url": "http://memory", "hindsight_api_key": None})()

    class FailingClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *_: object) -> None:
            return None

        async def get(self, *_: object, **__: object):
            import httpx

            raise httpx.ConnectError("offline")

    import app.services.hindsight_memory as memory_module

    monkeypatch.setattr(memory_module.httpx, "AsyncClient", lambda **_: FailingClient())

    with pytest.raises(MemoryUnavailableError):
        await service.health()


@pytest.mark.asyncio
async def test_retain_verification_requires_evidence_from_the_interaction(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    service = HindsightMemoryService.__new__(HindsightMemoryService)

    async def recall(*_: object, **__: object) -> list[MemoryEvidence]:
        return [MemoryEvidence(text="Ravi requires a 90-day rollout.", source="interaction-current")]

    monkeypatch.setattr(service, "recall", recall)

    assert await service.verify_interaction(
        bank_id="deal-acme",
        query="What did Ravi say?",
        source_interaction_id="interaction-current",
    )
    assert not await service.verify_interaction(
        bank_id="deal-acme",
        query="What did Ravi say?",
        source_interaction_id="interaction-other",
    )
