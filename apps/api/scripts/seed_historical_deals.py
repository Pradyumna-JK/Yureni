"""Seed a small cross-deal learning set for demos and regression testing."""

import argparse
import asyncio
from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import select

from app.config import get_settings
from app.database import SessionLocal
from app.models import Company, Deal, Interaction, Stakeholder
from app.routers.deals import bank_id, format_memory_content
from app.services.memory import HindsightMemoryService


HISTORICAL_DEALS = [
    ("Northstar Health", "Healthcare", "Northstar analytics", "closed_won", "180000", "Security approved SSO after a short pilot; the security champion joined the final call.", "Maya Singh", "VP Security"),
    ("Bluebird Retail", "Retail", "Bluebird forecasting", "closed_lost", "135000", "Bluebird selected NimbusIQ after procurement required a lower first-year price and a fixed implementation fee.", "Owen Brooks", "Procurement Lead"),
    ("Vertex Logistics", "Logistics", "Vertex operations intelligence", "negotiation", "260000", "The COO supports the business case, but the technical team needs a 90-day rollout plan and a named implementation owner.", "Priya Nair", "COO"),
    ("Pioneer Bank", "Financial services", "Pioneer risk workspace", "evaluation", "310000", "The risk team requires data residency and audit logging before the CFO will approve the commercial case.", "Daniel Kim", "CISO"),
    ("Cedar Energy", "Energy", "Cedar field analytics", "closed_won", "225000", "A phased launch tied to measurable field productivity created a clear payback case for Finance.", "Elena Rossi", "CFO"),
    ("Harbor Media", "Media", "Harbor revenue intelligence", "discovery", "95000", "The VP Sales wants executive dashboards, while the operations team is concerned about change management and adoption.", "Jordan Lee", "VP Sales"),
]


async def seed(*, retain: bool = True) -> None:
    memory = HindsightMemoryService(get_settings()) if retain else None
    session = SessionLocal()
    try:
        for index, (company_name, industry, deal_name, stage, value, content, person, title) in enumerate(HISTORICAL_DEALS, start=1):
            company = session.scalar(select(Company).where(Company.name == company_name))
            if not company:
                company = Company(name=company_name, industry=industry)
                session.add(company)
                session.flush()
            deal = session.scalar(select(Deal).where(Deal.company_id == company.id, Deal.name == deal_name))
            if not deal:
                deal = Deal(company_id=company.id, name=deal_name, value=Decimal(value), stage=stage)
                session.add(deal)
                session.flush()
                session.add(Stakeholder(deal_id=deal.id, name=person, title=title, role="decision maker"))
                session.commit()
            subject = f"Historical outcome review {index}"
            interaction = session.scalar(select(Interaction).where(Interaction.deal_id == deal.id, Interaction.subject == subject))
            if not interaction:
                interaction = Interaction(
                    deal_id=deal.id,
                    interaction_type="meeting",
                    subject=subject,
                    content=content,
                    occurred_at=datetime(2026, 5, index, 14, 0, tzinfo=UTC),
                    memory_status="pending",
                )
                session.add(interaction)
                session.flush()
                interaction.memory_document_id = f"interaction-{interaction.id}"
                session.commit()
            if not retain or interaction.memory_status == "succeeded":
                continue
            retained = await memory.retain(
                bank_id=bank_id(deal.id),
                content=format_memory_content(deal, interaction),
                context=f"Historical {interaction.interaction_type} for {deal.name}",
                occurred_at=interaction.occurred_at,
                document_id=interaction.memory_document_id,
                metadata={"source_interaction_id": str(interaction.id), "deal_id": str(deal.id)},
            )
            interaction.memory_status = "succeeded" if retained else "failed"
            interaction.memory_error = None if retained else "Hindsight did not confirm retention"
            session.commit()
        print(f"Seeded {len(HISTORICAL_DEALS)} historical deals")
    finally:
        session.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--no-retain", action="store_true", help="Only seed PostgreSQL records")
    args = parser.parse_args()
    asyncio.run(seed(retain=not args.no_retain))
