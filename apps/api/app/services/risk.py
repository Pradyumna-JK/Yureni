"""Deterministic risk signals used to keep deal health explainable."""

from app.services.hindsight_memory import MemoryEvidence


RISK_RULES: tuple[tuple[str, int, str], ...] = (
    ("security", 20, "Security or compliance review is unresolved."),
    ("pricing", 18, "Pricing, budget, or ROI approval remains unresolved."),
    ("budget", 18, "Pricing, budget, or ROI approval remains unresolved."),
    ("roi", 18, "Pricing, budget, or ROI approval remains unresolved."),
    ("competitor", 18, "A competitor is active in the evaluation."),
    ("nimbusiq", 18, "A competitor is active in the evaluation."),
    ("procurement", 14, "Procurement or legal gates remain open."),
    ("cannot sponsor", 22, "A key stakeholder may not sponsor the rollout."),
    ("delayed", 16, "A delayed launch threatens value realization."),
    ("six-month", 16, "Implementation duration is viewed as a risk."),
    ("renewal", 12, "The deal has a time-sensitive renewal deadline."),
)


def score_risk(memories: list[MemoryEvidence]) -> tuple[int, list[str]]:
    """Return a capped 0-100 score and unique human-readable factors."""
    combined = " ".join(f"{item.text} {item.source_text or ''}" for item in memories).lower()
    score = 0
    factors: list[str] = []
    seen: set[str] = set()
    for term, points, factor in RISK_RULES:
        if term in combined:
            score += points
            if factor not in seen:
                factors.append(factor)
                seen.add(factor)
    return min(score, 100), factors


def health_for_score(score: int) -> str:
    if score >= 60:
        return "low"
    if score >= 30:
        return "medium"
    return "high"
