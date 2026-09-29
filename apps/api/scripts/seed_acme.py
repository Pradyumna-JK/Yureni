"""Seed the first DealMind memory demonstration with synthetic Acme Corp history."""

import asyncio
import argparse
from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import select

from app.database import SessionLocal
from app.models import Company, Deal, Interaction, Stakeholder
from app.routers.deals import bank_id, format_memory_content
from app.services.memory import HindsightMemoryService, MemoryUnavailableError
from app.config import get_settings


INTERACTIONS = [
    {
        "interaction_type": "meeting",
        "subject": "Technical discovery with Ravi Patel",
        "occurred_at": datetime(2026, 7, 10, 15, 0, tzinfo=UTC),
        "content": """Asha (DealMind): Ravi, what would make this rollout successful for Acme?

Ravi Patel, CTO: The capability is compelling, but deployment timing is my gating concern. We need the first business unit live before our November renewal window. Our security team will also need evidence that the platform can operate with our SSO, audit logging, and data-residency requirements. If implementation becomes a six-month integration project, I cannot sponsor it.

Asha: We can scope a phased launch. Would a security workshop next week help?

Ravi: Yes. Bring an implementation lead and a concrete plan for a 90-day path to production.""",
    },
    {
        "interaction_type": "email",
        "subject": "Business case and pricing follow-up with Sarah",
        "occurred_at": datetime(2026, 7, 24, 16, 30, tzinfo=UTC),
        "content": """Sarah Chen, CFO: I reviewed the initial proposal. I need a clearer ROI model before I can support this in the August planning cycle. The annual price is above the placeholder we used in the budget, and I need to understand which implementation services are included versus additional.

Asha (DealMind): We can share a model based on pipeline-conversion and rep-productivity assumptions, plus a phased commercial option.

Sarah: Please do. I am not rejecting the project, but pricing needs to be tied to a defensible payback period. Ravi's deployment timeline is relevant because a delayed launch delays any value realization.""",
    },
    {
        "interaction_type": "meeting",
        "subject": "Procurement preparation with Mike",
        "occurred_at": datetime(2026, 8, 7, 17, 0, tzinfo=UTC),
        "content": """Mike Torres, Procurement: Acme can begin procurement once Finance signs off on the commercial case and Security closes its review. Please expect our standard data-processing addendum, a limitation-of-liability discussion, and a request for a two-year price-protection clause.

Asha (DealMind): Is there a target date for a purchasing decision?

Mike: If the open security questions and pricing assumptions are resolved by the end of August, we can target a September decision. One note: the sales leadership team is also evaluating NimbusIQ. Their team is positioning a lower first-year price, so Acme will compare implementation risk as well as cost.

Asha: We will send the security package, a 90-day implementation plan, and revised ROI options this week.""",
    },
]


async def seed(*, force: bool = False) -> None:
    session = SessionLocal()
    try:
        company = session.scalar(select(Company).where(Company.name == "Acme Corp"))
        if not company:
            company = Company(name="Acme Corp", industry="Enterprise software")
            session.add(company)
            session.flush()
        deal = session.scalar(select(Deal).where(Deal.company_id == company.id, Deal.name == "Acme Enterprise"))
        if not deal:
            deal = Deal(
                company_id=company.id,
                name="Acme Enterprise",
                value=Decimal("420000"),
                stage="evaluation",
            )
            session.add(deal)
            session.flush()
            session.add_all(
                [
                    Stakeholder(deal_id=deal.id, name="Ravi Patel", title="CTO", role="technical sponsor"),
                    Stakeholder(deal_id=deal.id, name="Sarah Chen", title="CFO", role="economic buyer"),
                    Stakeholder(deal_id=deal.id, name="Mike Torres", title="Procurement Director", role="procurement"),
                ]
            )
            session.commit()

        memory = HindsightMemoryService(get_settings())
        for item in INTERACTIONS:
            interaction = session.scalar(
                select(Interaction).where(Interaction.deal_id == deal.id, Interaction.subject == item["subject"])
            )
            if interaction and interaction.memory_status == "succeeded" and not force:
                continue
            if not interaction:
                interaction = Interaction(deal_id=deal.id, memory_status="pending", **item)
                session.add(interaction)
                session.flush()
                interaction.memory_document_id = f"interaction-{interaction.id}"
            else:
                interaction.memory_status = "pending"
                interaction.memory_error = None
            session.commit()
            try:
                retained = await memory.retain(
                    bank_id=bank_id(deal.id),
                    content=format_memory_content(deal, interaction),
                    context=f"{interaction.interaction_type} for Acme Enterprise",
                    occurred_at=interaction.occurred_at,
                    document_id=interaction.memory_document_id,
                    metadata={"source_interaction_id": str(interaction.id), "deal_id": str(deal.id)},
                )
                if retained:
                    retained = await memory.verify_interaction(
                        bank_id=bank_id(deal.id),
                        query=f"What facts were recorded in: {interaction.subject}?",
                        source_interaction_id=str(interaction.id),
                    )
                interaction.memory_status = "succeeded" if retained else "failed"
                interaction.memory_error = None if retained else "Hindsight did not confirm retention"
            except MemoryUnavailableError as error:
                interaction.memory_status = "failed"
                interaction.memory_error = str(error)
                session.commit()
                raise
            session.commit()
        print(f"Seeded Acme Enterprise: deal_id={deal.id}")
    finally:
        session.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Seed synthetic Acme memory history.")
    parser.add_argument(
        "--force",
        action="store_true",
        help="Reprocess existing interactions with their stable Hindsight document IDs.",
    )
    args = parser.parse_args()
    asyncio.run(seed(force=args.force))
