"""Real HTTP before/after proof. Outputs JSON; ingestion always uses the public API.

Run once per deal: python scripts/cross_time_demo.py --deal-id UUID
The database preflight prevents accidentally labeling an already updated bank as V1.
"""

import argparse
import json
import uuid

import httpx
from sqlalchemy import select

from app.database import SessionLocal
from app.models import Interaction

SUBJECT = "Ravi rollout review and implementation ownership"
LATER_INTERACTION = {
    "interaction_type": "meeting",
    "subject": SUBJECT,
    "occurred_at": "2026-09-10T15:00:00Z",
    "content": (
        "Synthetic Acme demo meeting, September 10, 2026.\n"
        "Ravi Patel, CTO: I have reviewed the proposed 90-day rollout plan and security "
        "architecture. The deployment timeline is now acceptable for our first business unit "
        "to go live before the November renewal. The plan addresses my earlier concern about "
        "a six-month integration; I no longer see deployment duration as the gating issue.\n"
        "Ravi: My remaining concern is execution capacity. Our internal platform team has "
        "limited capacity during October because of an existing infrastructure migration. "
        "I need DealMind to provide hands-on migration support and name an implementation "
        "owner accountable for the rollout. I cannot commit our team until these resources "
        "and responsibilities are agreed in writing.\n"
        "Asha: We will propose a named implementation lead, migration support allocation, "
        "and a written responsibility matrix.\n"
        "Ravi: Please send that proposal. This is a request, not confirmation that staffing "
        "has been assigned."
    ),
}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--deal-id", type=uuid.UUID, required=True)
    parser.add_argument("--base-url", default="http://localhost:8000")
    args = parser.parse_args()
    with SessionLocal() as session:
        existing = session.scalar(select(Interaction).where(
            Interaction.deal_id == args.deal_id, Interaction.subject == SUBJECT,
        ))
        if existing:
            raise SystemExit("Later interaction already exists; do not overwrite the original before/after proof.")
    url = f"{args.base_url}/api/deals/{args.deal_id}"

    def emit(label: str, payload: object) -> None:
        print(json.dumps({"step": label, "data": payload}), flush=True)

    with httpx.Client(timeout=900) as client:
        def post(path: str, payload: dict) -> dict:
            response = client.post(url + path, json=payload)
            response.raise_for_status()
            return response.json()

        before = post("/ask", {"question": "What did Ravi care about?"})
        emit("before", before)
        assert before["memory_used"] and 1 <= len(before["evidence"]) <= 5
        assert all(item.get("memory_id") for item in before["evidence"])
        emit("new_interaction_input", LATER_INTERACTION)
        retained = post("/interactions", LATER_INTERACTION)
        emit("retained", retained)
        assert retained["memory_status"] == "succeeded"
        after = post("/ask", {"question": "What does Ravi care about now, and how has his position changed over time?"})
        emit("after", after)
        assert after["memory_used"] and 1 <= len(after["evidence"]) <= 5
        assert after.get("temporal_insight")
        assert any(item["source"] == retained["id"] for item in after["evidence"])
        historical = post("/ask", {"question": "What did Ravi require in the July 10 technical discovery meeting, before the September review?"})
        emit("historical_after", historical)
        old_documents = {item["document_id"] for item in before["evidence"]}
        assert any(item["document_id"] in old_documents for item in historical["evidence"])
        emit("checks", {"older_memories_accessible": True, "temporal_insight_present": True,
                        "new_interaction_cited": True, "max_evidence_count": 5})


if __name__ == "__main__":
    main()
