from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

from app.database import get_db
from app.main import app
from app.routers import deals
from app.services.memory import HindsightMemoryService, MemoryUnavailableError


@pytest.mark.asyncio
async def test_recall_preserves_both_dates_and_result_level_metadata(monkeypatch):
    # Actual SDK shape: chunk contains text; metadata belongs to the recall result.
    results = [SimpleNamespace(
        id=f"memory-{day}", text=f"State on day {day}", document_id=f"doc-{day}",
        metadata={"source_interaction_id": f"interaction-{day}"}, chunk_id=f"chunk-{day}",
        mentioned_at=datetime(2026, 9, day, tzinfo=UTC),
    ) for day in (10, 1)]
    client = SimpleNamespace(
        arecall=AsyncMock(return_value=SimpleNamespace(results=results, chunks={
            f"chunk-{day}": SimpleNamespace(text=f"Original transcript {day}") for day in (10, 1)
        })), aclose=AsyncMock(),
    )
    service = HindsightMemoryService.__new__(HindsightMemoryService)
    monkeypatch.setattr(service, "_client", lambda: client)
    recalled = await service.recall(bank_id="bank", query="How did priorities change?")
    assert [item.source for item in recalled] == ["interaction-10", "interaction-1"]
    assert recalled[0].mentioned_at > recalled[1].mentioned_at
    assert recalled[1].memory_id == "memory-1"
    assert recalled[1].source_text == "Original transcript 1"
    client.aclose.assert_awaited_once()


def test_ask_memory_failure_returns_retryable_error_without_model(monkeypatch):
    app.dependency_overrides[get_db] = lambda: None
    monkeypatch.setattr(deals, "get_deal_or_404", lambda *args: object())
    monkeypatch.setattr(HindsightMemoryService, "recall", AsyncMock(
        side_effect=MemoryUnavailableError("Hindsight could not recall deal memory"),
    ))
    answer = AsyncMock()
    monkeypatch.setattr(deals, "answer_question", answer)
    try:
        response = TestClient(app).post(
            "/api/deals/53df2f8b-70a7-4eeb-90e6-f4d8cb135cfc/ask",
            json={"question": "What changed?"},
        )
        assert response.status_code == 503
        assert "Hindsight" in response.json()["detail"]
        answer.assert_not_awaited()
    finally:
        app.dependency_overrides.clear()
