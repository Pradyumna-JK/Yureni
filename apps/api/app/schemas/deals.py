import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class CompanyCreate(BaseModel):
    name: str = Field(min_length=2, max_length=255)
    industry: str | None = Field(default=None, max_length=120)


class DealCreate(BaseModel):
    company: CompanyCreate
    name: str = Field(min_length=2, max_length=255)
    value: Decimal | None = Field(default=None, ge=0)
    stage: str = Field(default="discovery", max_length=80)


class DealRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    company_id: uuid.UUID
    name: str
    value: Decimal | None
    stage: str


class CompanySummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    industry: str | None = None


class DealListRead(DealRead):
    company: CompanySummary
    stakeholder_count: int
    interaction_count: int
    last_interaction_at: datetime | None = None


class StakeholderRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    deal_id: uuid.UUID
    name: str
    title: str | None
    role: str | None


class InteractionCreate(BaseModel):
    interaction_type: str = Field(min_length=2, max_length=80)
    subject: str | None = Field(default=None, max_length=500)
    content: str = Field(min_length=20, max_length=100_000)
    occurred_at: datetime


class InteractionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    deal_id: uuid.UUID
    interaction_type: str
    subject: str | None
    content: str
    occurred_at: datetime
    memory_status: str
    memory_document_id: str | None


TimelineItem = InteractionRead


class Evidence(BaseModel):
    source: str
    reason: str
    memory_id: str | None = None
    document_id: str | None = None
    mentioned_at: datetime | None = None


class TemporalInsight(BaseModel):
    previous_state: str = Field(min_length=1)
    current_state: str = Field(min_length=1)
    change: str = Field(min_length=1)


class AskRequest(BaseModel):
    question: str = Field(min_length=3, max_length=2_000)


class AskResponse(BaseModel):
    answer: str
    evidence: list[Evidence]
    memory_used: bool
    temporal_insight: TemporalInsight | None = None


class IntelligenceResponse(BaseModel):
    deal_health: str
    primary_risk: str
    summary: str
    evidence: list[Evidence]
    recommended_action: str
    confidence: str
    risk_score: int = Field(ge=0, le=100)
    risk_factors: list[str] = Field(default_factory=list)


class VoiceAgentRequest(BaseModel):
    message: str = Field(min_length=2, max_length=2_000)
    conversation: list[str] = Field(default_factory=list, max_length=24)
    customer_profile: dict[str, str] = Field(default_factory=dict)


class VoiceAgentResponse(BaseModel):
    agent: str
    mode: str
    reply: str
    suggested_next_question: str
    grounded_in: list[str] = Field(default_factory=list)
