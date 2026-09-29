import json
from datetime import UTC, datetime

import pytest

from app.services.answers import answer_question, as_evidence
from app.services.llm import InvalidLLMResponseError, OllamaService
from app.services.hindsight_memory import MemoryEvidence


def memory(key: str, day: int, text: str = "A requirement") -> MemoryEvidence:
    return MemoryEvidence(text, f"source-{key}", key, f"doc-{key}", datetime(2026, 9, day, tzinfo=UTC))


def test_evidence_derives_document_from_attributed_source() -> None:
    item = MemoryEvidence("fact", "interaction-source", "memory-id", None, datetime(2026, 9, 1, tzinfo=UTC))
    assert as_evidence(item).document_id == "interaction-interaction-source"


def model(monkeypatch, payload):
    service = OllamaService.__new__(OllamaService)

    async def generate(prompt):
        return json.dumps(payload)

    monkeypatch.setattr(service, "_generate", generate)
    return service


@pytest.mark.asyncio
async def test_only_selected_evidence_is_exposed_with_original_identity(monkeypatch):
    memories = [memory("a", 1, "Sponsor requires a short rollout"), memory("b", 2, "Unrelated competitor")]
    result = await answer_question(model(monkeypatch, {
        "answer": "The sponsor requires a short rollout.", "evidence_ids": ["a"],
    }), "What does the sponsor require?", memories)
    assert len(result.evidence) == 1
    assert result.evidence[0].memory_id == "a"
    assert result.evidence[0].reason == memories[0].text
    assert result.evidence[0].document_id == "doc-a"
    assert result.temporal_insight is None


@pytest.mark.asyncio
@pytest.mark.parametrize("ids", [["unknown"], ["a", "a"], list("abcdef")])
async def test_invalid_or_excessive_citations_rejected_after_one_repair(monkeypatch, ids):
    with pytest.raises(InvalidLLMResponseError):
        await answer_question(model(monkeypatch, {"answer": "Claim", "evidence_ids": ids}),
                              "Question", [memory(key, 1) for key in "abcdef"])


def changed():
    return {"answer": "Timing was the issue; capacity is now the issue.", "evidence_ids": ["old", "new"],
            "temporal_insight": {"previous_state": "Timing", "current_state": "Capacity",
                                 "change": "Plan approved; capacity is the remaining concern.",
                                 "previous_evidence_ids": ["old"], "current_evidence_ids": ["new"]}}


@pytest.mark.asyncio
async def test_temporal_synthesis_preserves_old_and_new_citations(monkeypatch):
    result = await answer_question(model(monkeypatch, changed()), "How has the concern changed?",
                                  [memory("new", 10), memory("old", 1)])
    assert result.temporal_insight.previous_state == "Timing"
    assert result.temporal_insight.current_state == "Capacity"
    assert [item.memory_id for item in result.evidence] == ["old", "new"]


@pytest.mark.asyncio
async def test_reversed_chronology_is_rejected(monkeypatch):
    with pytest.raises(InvalidLLMResponseError):
        await answer_question(model(monkeypatch, changed()), "How has it changed?",
                              [memory("old", 10), memory("new", 1)])


@pytest.mark.asyncio
async def test_single_source_cannot_fabricate_a_change(monkeypatch):
    old = memory("old", 1)
    new = MemoryEvidence("Another fact", "source-old", "new", old.document_id, old.mentioned_at)
    with pytest.raises(InvalidLLMResponseError):
        await answer_question(model(monkeypatch, changed()), "How has it changed?", [old, new])


@pytest.mark.asyncio
async def test_empty_history_skips_model(monkeypatch):
    result = await answer_question(None, "What changed?", [])
    assert result.memory_used is False
    assert not result.evidence
    assert result.temporal_insight is None


@pytest.mark.asyncio
async def test_insufficient_temporal_history_has_no_change(monkeypatch):
    result = await answer_question(model(monkeypatch, {
        "answer": "Timing was the concern; insufficient history to establish a change.",
        "evidence_ids": ["old"],
    }), "What changed?", [memory("old", 1)])
    assert result.temporal_insight is None
