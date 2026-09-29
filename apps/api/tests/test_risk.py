from app.services.memory import MemoryEvidence
from app.services.risk import health_for_score, score_risk


def test_risk_score_is_evidence_derived_and_capped() -> None:
    score, factors = score_risk([
        MemoryEvidence(
            text="Security review, pricing approval, procurement and NimbusIQ remain open.",
            source="interaction-1",
        )
    ])

    assert score == 70
    assert len(factors) == 4
    assert health_for_score(score) == "low"


def test_low_signal_deal_is_high_health() -> None:
    assert score_risk([MemoryEvidence(text="The champion approved the rollout.", source="interaction-1")]) == (0, [])
    assert health_for_score(0) == "high"
