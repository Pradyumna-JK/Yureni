"""Seed richer Indian-company demo deals for Rosy's voice-agent memory."""

import argparse
import asyncio
from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import select

from app.config import get_settings
from app.database import SessionLocal
from app.models import Company, Deal, Interaction, Stakeholder
from app.routers.deals import bank_id, format_memory_content
from app.services.hindsight_memory import HindsightMemoryService, MemoryUnavailableError


INDIAN_DEALS = [
    {
        "company": "ZyraPay India",
        "industry": "Fintech",
        "deal": "ZyraPay revenue intelligence rollout",
        "value": "18500000",
        "stage": "evaluation",
        "stakeholders": [
            ("Ananya Rao", "VP Sales", "business sponsor"),
            ("Karthik Menon", "CISO", "security approver"),
            ("Meera Iyer", "Finance Director", "economic buyer"),
        ],
        "interactions": [
            (
                "meeting",
                "Discovery with Ananya Rao",
                datetime(2026, 8, 3, 10, 30, tzinfo=UTC),
                """Ananya Rao, VP Sales: ZyraPay's sales managers are losing context between enterprise merchant conversations. We need account-level memory before the Diwali enterprise campaign starts.

Asha (DealMind): What would make the pilot successful?

Ananya: If Rosy can summarize risk across the top 30 merchant deals and remind reps what finance, compliance, and product teams cared about, I can sponsor a paid pilot. The risk is adoption; our reps will not update another CRM field unless the insight is obviously useful.""",
            ),
            (
                "email",
                "Security questions from Karthik",
                datetime(2026, 8, 12, 14, 15, tzinfo=UTC),
                """Karthik Menon, CISO: Before ZyraPay moves forward, we need clarity on data residency, audit logs, SSO, and whether meeting transcripts are retained in a way our compliance team can review.

Asha (DealMind): We can provide an architecture note and a controlled-retention workflow.

Karthik: Good. If we cannot prove that customer-sensitive notes are governed, I will block production. A sandbox pilot with masked data is acceptable for evaluation.""",
            ),
            (
                "meeting",
                "Commercial review with Meera",
                datetime(2026, 8, 26, 11, 0, tzinfo=UTC),
                """Meera Iyer, Finance Director: The business case needs to connect to conversion lift and sales-cycle reduction. INR pricing is workable if the pilot has a success gate.

Ananya Rao: I want the first pilot focused on enterprise merchants in Mumbai and Bengaluru.

Meera: Then the next step is a two-week pilot plan, masked-data security approval, and a clear ROI dashboard before procurement opens.""",
            ),
        ],
    },
    {
        "company": "BharatCloud Systems",
        "industry": "Cloud infrastructure",
        "deal": "BharatCloud strategic account pilot",
        "value": "24000000",
        "stage": "negotiation",
        "stakeholders": [
            ("Rohan Kulkarni", "Chief Revenue Officer", "executive sponsor"),
            ("Nisha Verma", "Head of RevOps", "power user"),
            ("Arvind Narang", "Procurement Lead", "procurement"),
        ],
        "interactions": [
            (
                "meeting",
                "Executive alignment with Rohan",
                datetime(2026, 7, 18, 9, 45, tzinfo=UTC),
                """Rohan Kulkarni, CRO: BharatCloud is expanding into enterprise accounts and the leadership team wants deal-risk visibility before forecast calls. Our current review is too anecdotal.

Nisha Verma, Head of RevOps: The value is if Rosy can compare this week's deal notes with last month's objections and flag what changed.

Rohan: I will sponsor this if the first dashboard is live before the September board review.""",
            ),
            (
                "email",
                "RevOps workflow concerns",
                datetime(2026, 7, 31, 12, 10, tzinfo=UTC),
                """Nisha Verma: My concern is workflow fit. Reps already use Salesforce, Slack, and call notes. If DealMind requires manual copy-paste, adoption will suffer.

Asha (DealMind): We can start with structured notes and CSV upload for the pilot, then integrate later.

Nisha: For the pilot, that is acceptable. I need evidence that the memory improves follow-up quality, not just another dashboard.""",
            ),
            (
                "meeting",
                "Procurement and competitor discussion",
                datetime(2026, 8, 20, 16, 30, tzinfo=UTC),
                """Arvind Narang, Procurement: We are comparing DealMind with InsightLoop. InsightLoop is offering a lower first-year fee.

Rohan Kulkarni: Price matters, but board-readiness matters more. If DealMind can show risk changes over time with evidence, that is differentiated.

Arvind: Send a two-year commercial option, data-processing terms, and a pilot success checklist by Friday.""",
            ),
        ],
    },
    {
        "company": "NammaKart",
        "industry": "E-commerce",
        "deal": "NammaKart marketplace sales intelligence",
        "value": "12500000",
        "stage": "discovery",
        "stakeholders": [
            ("Divya Krishnan", "Head of Marketplace", "business sponsor"),
            ("Sameer Khan", "Sales Operations Manager", "operator"),
            ("Pooja Shah", "CFO", "economic buyer"),
        ],
        "interactions": [
            (
                "meeting",
                "Marketplace discovery",
                datetime(2026, 9, 2, 13, 0, tzinfo=UTC),
                """Divya Krishnan, Head of Marketplace: NammaKart's seller onboarding team loses context when high-value sellers move between regions. We need to know which sellers are blocked by pricing, catalog setup, or logistics.

Sameer Khan: If Rosy can summarize seller objections and recommend the next action, managers can coach reps faster.

Divya: The pilot should focus on Bengaluru, Hyderabad, and Chennai seller teams.""",
            ),
            (
                "email",
                "Finance hesitation",
                datetime(2026, 9, 11, 8, 20, tzinfo=UTC),
                """Pooja Shah, CFO: I am not opposed, but we need proof that this reduces seller activation time. A generic AI assistant is not enough.

Asha (DealMind): We can measure activation-cycle reduction and follow-up quality.

Pooja: Good. I need a low-risk pilot, clear success metrics, and no commitment to a full annual rollout until the activation data is visible.""",
            ),
        ],
    },
    {
        "company": "MedAxis Hospitals",
        "industry": "Healthcare",
        "deal": "MedAxis enterprise sales memory",
        "value": "21000000",
        "stage": "evaluation",
        "stakeholders": [
            ("Dr. Kavya Raman", "Chief Digital Officer", "executive sponsor"),
            ("Suresh Patil", "IT Director", "technical approver"),
            ("Leena D'Souza", "Compliance Officer", "compliance approver"),
        ],
        "interactions": [
            (
                "meeting",
                "Healthcare executive discovery",
                datetime(2026, 8, 6, 15, 30, tzinfo=UTC),
                """Dr. Kavya Raman, Chief Digital Officer: MedAxis has multiple hospital groups evaluating digital initiatives. Our sales team needs better memory of each hospital's concerns and committee dynamics.

Asha (DealMind): What would make this valuable?

Dr. Kavya: Rosy should identify when a stakeholder concern changes. If procurement sounds positive but compliance is still worried, I want that surfaced before the next call.""",
            ),
            (
                "meeting",
                "Compliance review",
                datetime(2026, 8, 19, 10, 0, tzinfo=UTC),
                """Leena D'Souza, Compliance Officer: We cannot upload patient data or sensitive clinical notes. The pilot must use sanitized commercial conversations only.

Suresh Patil, IT Director: SSO and audit logs are mandatory. I also want admin controls for retention.

Leena: If those controls are documented, I will allow a limited pilot with anonymized deal notes.""",
            ),
            (
                "email",
                "Pilot decision criteria",
                datetime(2026, 9, 1, 17, 25, tzinfo=UTC),
                """Dr. Kavya Raman: The pilot decision will depend on three things: whether Rosy explains evidence behind recommendations, whether the compliance controls are acceptable, and whether sales leaders actually use the insights before account reviews.

Asha (DealMind): We will propose a four-week pilot with anonymized account histories.

Dr. Kavya: Please include success metrics and a governance checklist.""",
            ),
        ],
    },
]


async def seed(*, retain: bool = True, force: bool = False) -> None:
    memory = HindsightMemoryService(get_settings()) if retain else None
    session = SessionLocal()
    try:
        seeded_deals = 0
        retained_interactions = 0
        for item in INDIAN_DEALS:
            company = session.scalar(select(Company).where(Company.name == item["company"]))
            if not company:
                company = Company(name=item["company"], industry=item["industry"])
                session.add(company)
                session.flush()
            deal = session.scalar(select(Deal).where(Deal.company_id == company.id, Deal.name == item["deal"]))
            if not deal:
                deal = Deal(
                    company_id=company.id,
                    name=item["deal"],
                    value=Decimal(item["value"]),
                    stage=item["stage"],
                )
                session.add(deal)
                session.flush()
                for name, title, role in item["stakeholders"]:
                    session.add(Stakeholder(deal_id=deal.id, name=name, title=title, role=role))
                session.commit()
                seeded_deals += 1

            for interaction_type, subject, occurred_at, content in item["interactions"]:
                interaction = session.scalar(
                    select(Interaction).where(Interaction.deal_id == deal.id, Interaction.subject == subject)
                )
                if interaction and interaction.memory_status == "succeeded" and not force:
                    continue
                if not interaction:
                    interaction = Interaction(
                        deal_id=deal.id,
                        interaction_type=interaction_type,
                        subject=subject,
                        content=content,
                        occurred_at=occurred_at,
                        memory_status="pending",
                    )
                    session.add(interaction)
                    session.flush()
                    interaction.memory_document_id = f"interaction-{interaction.id}"
                else:
                    interaction.memory_status = "pending"
                    interaction.memory_error = None
                session.commit()

                if not retain:
                    continue
                try:
                    retained = await memory.retain(
                        bank_id=bank_id(deal.id),
                        content=format_memory_content(deal, interaction),
                        context=f"{interaction.interaction_type} for {deal.name}",
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
                    retained_interactions += int(bool(retained))
                except MemoryUnavailableError as error:
                    interaction.memory_status = "failed"
                    interaction.memory_error = str(error)
                    session.commit()
                    raise
                session.commit()
        print(
            f"Seeded Indian demo deals: companies={len(INDIAN_DEALS)} "
            f"new_deals={seeded_deals} retained_interactions={retained_interactions}"
        )
    finally:
        session.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Seed Indian company demo deals for Rosy.")
    parser.add_argument("--no-retain", action="store_true", help="Only seed PostgreSQL records")
    parser.add_argument("--force", action="store_true", help="Reprocess existing interactions in Hindsight")
    args = parser.parse_args()
    asyncio.run(seed(retain=not args.no_retain, force=args.force))
