import json
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import desc, select
from sqlalchemy.orm import Session, selectinload

from app.config import Settings, get_settings
from app.database import get_db
from app.models import Company, Deal, Interaction, Stakeholder
from app.schemas.deals import (
    AskRequest,
    AskResponse,
    DealCreate,
    DealListRead,
    DealRead,
    Evidence,
    IntelligenceResponse,
    InteractionCreate,
    InteractionRead,
    StakeholderRead,
    TimelineItem,
)
from app.services.llm import InvalidLLMResponseError, LLMUnavailableError, OllamaService
from app.services.answers import answer_question, as_evidence
from app.services.memory import HindsightMemoryService, MemoryEvidence, MemoryUnavailableError
from app.services.risk import health_for_score, score_risk

router = APIRouter(prefix="/api/deals", tags=["deals"])


def bank_id(deal_id: uuid.UUID) -> str:
    return f"dealmind-deal-{deal_id}"


def get_deal_or_404(db: Session, deal_id: uuid.UUID) -> Deal:
    deal = db.scalar(select(Deal).where(Deal.id == deal_id))
    if not deal:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deal not found")
    return deal


@router.get("", response_model=list[DealListRead])
def list_deals(
    stage: str | None = Query(default=None, max_length=80),
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> list[DealListRead]:
    """Return deal cards with enough context for a revenue dashboard."""
    statement = (
        select(Deal)
        .options(selectinload(Deal.company), selectinload(Deal.stakeholders), selectinload(Deal.interactions))
        .order_by(desc(Deal.updated_at))
        .offset(offset)
        .limit(limit)
    )
    if stage:
        statement = statement.where(Deal.stage == stage)
    deals = db.scalars(statement).all()
    return [
        DealListRead(
            id=deal.id,
            company_id=deal.company_id,
            name=deal.name,
            value=deal.value,
            stage=deal.stage,
            company=deal.company,
            stakeholder_count=len(deal.stakeholders),
            interaction_count=len(deal.interactions),
            last_interaction_at=max(
                (item.occurred_at for item in deal.interactions), default=None
            ),
        )
        for deal in deals
    ]


@router.post("", response_model=DealRead, status_code=status.HTTP_201_CREATED)
def create_deal(payload: DealCreate, db: Session = Depends(get_db)) -> Deal:
    company = db.scalar(select(Company).where(Company.name == payload.company.name))
    if not company:
        company = Company(name=payload.company.name, industry=payload.company.industry)
        db.add(company)
        db.flush()
    deal = Deal(company_id=company.id, name=payload.name, value=payload.value, stage=payload.stage)
    db.add(deal)
    db.commit()
    db.refresh(deal)
    return deal


@router.post("/{deal_id}/interactions", response_model=InteractionRead, status_code=status.HTTP_201_CREATED)
async def create_interaction(
    deal_id: uuid.UUID,
    payload: InteractionCreate,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> Interaction:
    deal = get_deal_or_404(db, deal_id)
    interaction = Interaction(
        deal_id=deal.id,
        interaction_type=payload.interaction_type,
        subject=payload.subject,
        content=payload.content,
        occurred_at=payload.occurred_at,
        memory_status="pending",
    )
    db.add(interaction)
    db.flush()
    interaction.memory_document_id = f"interaction-{interaction.id}"
    db.commit()
    db.refresh(interaction)

    memory_content = format_memory_content(deal, interaction)
    try:
        retained = await HindsightMemoryService(settings).retain(
            bank_id=bank_id(deal.id),
            content=memory_content,
            context=f"{payload.interaction_type} for {deal.name}",
            occurred_at=interaction.occurred_at,
            document_id=interaction.memory_document_id,
            metadata={"source_interaction_id": str(interaction.id), "deal_id": str(deal.id)},
        )
        if retained:
            retained = await HindsightMemoryService(settings).verify_interaction(
                bank_id=bank_id(deal.id),
                query=f"What facts were recorded in: {payload.subject}?",
                source_interaction_id=str(interaction.id),
            )
    except MemoryUnavailableError as error:
        interaction.memory_status = "failed"
        interaction.memory_error = str(error)
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Interaction was stored, but persistent memory is unavailable. Retry retention.",
        ) from error

    interaction.memory_status = "succeeded" if retained else "failed"
    interaction.memory_error = None if retained else "Hindsight did not confirm retention"
    db.commit()
    db.refresh(interaction)
    if not retained:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Interaction was stored, but Hindsight did not retain it.",
        )
    return interaction


@router.get("/{deal_id}/timeline", response_model=list[TimelineItem])
def deal_timeline(deal_id: uuid.UUID, db: Session = Depends(get_db)) -> list[Interaction]:
    get_deal_or_404(db, deal_id)
    return list(
        db.scalars(
            select(Interaction)
            .where(Interaction.deal_id == deal_id)
            .order_by(desc(Interaction.occurred_at))
        ).all()
    )


@router.get("/{deal_id}/stakeholders", response_model=list[StakeholderRead])
def deal_stakeholders(deal_id: uuid.UUID, db: Session = Depends(get_db)) -> list[Stakeholder]:
    get_deal_or_404(db, deal_id)
    return list(
        db.scalars(
            select(Stakeholder)
            .where(Stakeholder.deal_id == deal_id)
            .order_by(Stakeholder.name)
        ).all()
    )


@router.post("/{deal_id}/ask", response_model=AskResponse, response_model_exclude_none=True)
async def ask_deal(
    deal_id: uuid.UUID,
    payload: AskRequest,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> AskResponse:
    get_deal_or_404(db, deal_id)
    memory = HindsightMemoryService(settings)
    try:
        recalled = await memory.recall(bank_id=bank_id(deal_id), query=payload.question)
    except MemoryUnavailableError as error:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(error)) from error
    if not recalled:
        return AskResponse(
            answer="There is insufficient historical context to answer this question.",
            evidence=[],
            memory_used=False,
        )
    try:
        answer = await answer_question(OllamaService(settings), payload.question, recalled)
    except (LLMUnavailableError, InvalidLLMResponseError) as error:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(error)) from error
    return answer


@router.post("/{deal_id}/intelligence", response_model=IntelligenceResponse)
async def deal_intelligence(
    deal_id: uuid.UUID,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> IntelligenceResponse:
    get_deal_or_404(db, deal_id)
    memory = HindsightMemoryService(settings)
    query = "What is the current deal risk and the most useful next action?"
    try:
        recalled = await memory.recall(bank_id=bank_id(deal_id), query=query)
    except MemoryUnavailableError as error:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(error)) from error
    if not recalled:
        return IntelligenceResponse(
            deal_health="unknown",
            primary_risk="Insufficient historical context.",
            summary="No retained deal evidence is available yet.",
            evidence=[],
            recommended_action="Ingest a meeting, email, or note before assessing risk.",
            confidence="low",
            risk_score=0,
            risk_factors=[],
        )
    risk_score, risk_factors = score_risk(recalled)
    try:
        try:
            reflection = await memory.reflect(bank_id=bank_id(deal_id), query=query)
        except MemoryUnavailableError:
            # Recall is still authoritative and available. Keep the intelligence
            # response useful while making the reflect limitation visible to the
            # answer model instead of pretending reflect succeeded.
            reflection = (
                "Hindsight reflect was unavailable for this request. Use only the recalled "
                "Hindsight memories below and keep the assessment conservative."
            )
        result = await OllamaService(settings).structured(
            intelligence_prompt(reflection, recalled, risk_score, risk_factors),
            {"deal_health", "primary_risk", "summary", "recommended_action", "confidence"},
        )
    except MemoryUnavailableError as error:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(error)) from error
    except (LLMUnavailableError, InvalidLLMResponseError) as error:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(error)) from error
    # Hindsight recall remains the complete reasoning context; expose only the
    # highest-ranked five memories as user-facing evidence.
    # The model supplies narrative; deterministic signals keep the health label
    # stable and explainable across model/provider changes.
    result["deal_health"] = health_for_score(risk_score)
    return IntelligenceResponse(
        evidence=to_evidence(recalled[:5]),
        risk_score=risk_score,
        risk_factors=risk_factors,
        **result,
    )


def format_memory_content(deal: Deal, interaction: Interaction) -> str:
    subject = f"Subject: {interaction.subject}\n" if interaction.subject else ""
    return (
        f"Account: {deal.name}\n"
        f"Interaction type: {interaction.interaction_type}\n"
        f"Occurred at: {interaction.occurred_at.isoformat()}\n"
        f"{subject}"
        f"Content:\n{interaction.content}"
    )


def to_evidence(recalled: list[MemoryEvidence]) -> list[Evidence]:
    return [as_evidence(item) for item in recalled]


def intelligence_prompt(
    reflection: str,
    recalled: list[MemoryEvidence],
    risk_score: int | None = None,
    risk_factors: list[str] | None = None,
) -> str:
    evidence = json.dumps([{"source": item.source, "text": item.text} for item in recalled])
    return (
        "Create a conservative JSON deal assessment using only the Hindsight reflection and recalled "
        "memories. Required keys: deal_health (high|medium|low|unknown), primary_risk, summary, "
        "recommended_action, confidence (low|medium|high). Do not invent facts.\n"
        f"Reflection: {reflection}\n"
        f"Deterministic risk score: {risk_score if risk_score is not None else 'unknown'}/100. "
        f"Detected risk factors: {json.dumps(risk_factors or [])}.\nMemories: {evidence}"
    )
