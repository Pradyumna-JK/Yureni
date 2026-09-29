# DealMind frontend handoff

This document is the current implementation handoff for the frontend engineer.
The backend is a local-first FastAPI service. PostgreSQL stores application
records, Hindsight stores persistent memory, and Ollama runs local model calls.
The frontend should consume the API and display its evidence; it should not
reimplement retrieval or infer facts from raw text.

## Current implementation status

The first backend vertical slice is working and has been verified against the
local services:

- PostgreSQL 16, Hindsight, and the FastAPI API run through Docker Compose.
- Ollama runs on the host. `gpt-oss:20b` is the answer model; Hindsight fact
  extraction uses the independently configurable `gemma3:4b` fallback.
- Deals and interactions persist in PostgreSQL.
- Interactions are synchronously retained in Hindsight and read-after-write
  verified before being marked successful.
- Ask uses Hindsight recall for broad reasoning context, then returns only the
  strongest model-selected citations, maximum five.
- Evidence preserves Hindsight memory ID, document ID, source interaction ID,
  and source date when Hindsight returns those fields.
- Temporal answers can include a `temporal_insight` object. The backend validates
  that previous and current citations come from distinct dated interactions in
  chronological order.
- The frontend is still a package placeholder. No dashboard or frontend routes
  have been implemented yet.

The backend now exposes dashboard data for the next UI phase:

```http
GET /api/deals?limit=50&offset=0&stage=evaluation
GET /api/deals/{deal_id}/timeline
GET /api/deals/{deal_id}/stakeholders
```

The deal list includes company details, stakeholder and interaction counts, and
the latest interaction timestamp. Timeline items are returned newest first.
Intelligence responses include a deterministic `risk_score` from 0–100 and
explainable `risk_factors`; render these alongside the model-generated summary.

The current local test suite has 16 passing tests in the API container. The real
before/after cross-time demo script is present, but must be run against a clean
V1 Acme bank after the current API rebuild to record the final demo transcript.

## Run the stack

From the repository root:

```bash
cp -n .env.example .env
docker compose up -d --build
curl --fail http://localhost:8888/health
curl --fail http://localhost:8000/health
curl --fail http://localhost:8000/api/health/db
curl --fail http://localhost:8000/api/health/memory
```

The services are exposed at:

| Service | URL |
| --- | --- |
| FastAPI | `http://localhost:8000` |
| FastAPI OpenAPI | `http://localhost:8000/docs` |
| Hindsight API | `http://localhost:8888` |
| Hindsight UI | `http://localhost:9999` |

The seeded Acme deal currently used for demos is:

```text
deal_id = 53df2f8b-70a7-4eeb-90e6-f4d8cb135cfc
company = Acme Corp
deal = Acme Enterprise
```

To seed or reprocess the synthetic history:

```bash
docker compose exec api python scripts/seed_acme.py
docker compose exec api python scripts/seed_acme.py --force
```

`--force` reuses stable Hindsight document IDs. Use it when the Hindsight model
configuration changes; it is not a normal frontend workflow.

## API contract

All request bodies are JSON. UUIDs and timestamps are strings. Validation errors
are returned by FastAPI as HTTP 422. A model or memory dependency failure is
retryable and returns HTTP 503.

### Health

```http
GET /health
GET /api/health/db
GET /api/health/memory
```

The frontend can show a service banner when any dependency check fails. Do not
show a memory-backed result when `/api/health/memory` is unavailable.

### Create a deal

```http
POST /api/deals
Content-Type: application/json
```

```json
{
  "company": { "name": "Acme Corp", "industry": "Enterprise software" },
  "name": "Acme Enterprise",
  "value": 420000,
  "stage": "evaluation"
}
```

Response: `201 DealRead`

```json
{
  "id": "uuid",
  "company_id": "uuid",
  "name": "Acme Enterprise",
  "value": "420000",
  "stage": "evaluation"
}
```

### Ingest an interaction

```http
POST /api/deals/{deal_id}/interactions
Content-Type: application/json
```

```json
{
  "interaction_type": "meeting",
  "subject": "Technical discovery with Ravi Patel",
  "occurred_at": "2026-07-10T15:00:00Z",
  "content": "Transcript or note text, at least 20 characters."
}
```

The endpoint stores the interaction first, then retains it in Hindsight. A
successful `201` has `memory_status: "succeeded"`. The response also includes
the interaction ID and stable `memory_document_id`.

Possible error behavior:

- `404`: deal does not exist.
- `502`: Hindsight accepted processing but no recallable evidence was verified.
- `503`: Hindsight is unavailable. The interaction remains stored with a failed
  memory status and can be retried later.

### Ask DealMind

```http
POST /api/deals/{deal_id}/ask
Content-Type: application/json
```

```json
{ "question": "What did Ravi care about?" }
```

Successful memory-backed response:

```json
{
  "answer": "Ravi's main concern was deployment timing...",
  "evidence": [
    {
      "source": "interaction-uuid",
      "reason": "Ravi Patel's gating concern: Deployment timing...",
      "memory_id": "hindsight-memory-uuid",
      "document_id": "interaction-uuid",
      "mentioned_at": "2026-07-10T15:00:00Z"
    }
  ],
  "memory_used": true,
  "temporal_insight": {
    "previous_state": "Deployment timing was the gating concern.",
    "current_state": "Execution capacity and implementation ownership are now the concern.",
    "change": "The reviewed 90-day plan made timing acceptable, shifting the concern to staffing."
  }
}
```

`temporal_insight` is omitted for ordinary questions. It is present only when
the model selected distinct dated memories and the backend validated their
chronology. Evidence contains at most five items. Render each evidence item as
a citation or expandable source card; use `document_id` and `memory_id` as
stable keys.

Empty-memory response:

```json
{
  "answer": "There is insufficient historical context to answer this question.",
  "evidence": [],
  "memory_used": false
}
```

When `memory_used` is false, display an explicit empty-state explanation rather
than a confident answer or fabricated evidence.

### Deal intelligence

```http
POST /api/deals/{deal_id}/intelligence
```

Response shape:

```json
{
  "deal_health": "high | medium | low | unknown",
  "primary_risk": "...",
  "summary": "...",
  "evidence": [],
  "recommended_action": "...",
  "confidence": "low | medium | high"
}
```

This endpoint exists for the Deal Detail view. The full risk engine and richer
deal list endpoints are not complete yet, so build the UI around loading,
success, insufficient-history, and retryable-error states.

## Frontend scope

Build the enterprise revenue-intelligence shell first:

1. Dashboard shell with service status, deal health summary, recent activity,
   and a clear entry point to Acme Enterprise.
2. Deals view with a deal list. Until a list endpoint exists, use the seeded
   Acme deal as the initial detail route and keep the data client isolated so a
   future `GET /api/deals` can replace it cleanly.
3. Deal Detail with company, value, stage, stakeholders/timeline placeholders,
   Ask panel, risk card, next-action card, and evidence drawer.
4. Ask DealMind interaction that displays the answer, memory-used state,
   temporal insight when present, and no more than five evidence cards.
5. Memory Explorer drawer/page showing memory ID, source interaction/document,
   date, and fact text. It should link back to the interaction when the source
   ID is available.

Keep API calls in a typed client module. Use React Query or a small equivalent
for loading/error/cache state, Axios for HTTP, and the existing TypeScript/Vite
stack. Do not make the frontend call Hindsight or Ollama directly.

## Important product rules

- Evidence is part of the product surface, not debug output.
- Keep broader retrieved context hidden from the user unless it was selected as
  supporting evidence.
- A future deadline mentioned in a memory is not the same as the date of the
  interaction; display `mentioned_at` as the source date.
- Do not imply that a concern was resolved when the response does not include
  temporal evidence.
- If memory is unavailable, say that memory is unavailable and offer retry.
- If history is insufficient, say so explicitly.
- Do not add stakeholder-specific filters or duplicate Hindsight retrieval in
  the browser.

## Backend files to know

| File | Purpose |
| --- | --- |
| `apps/api/app/routers/deals.py` | Deal, interaction, ask, and intelligence routes |
| `apps/api/app/schemas/deals.py` | Public request/response schemas |
| `apps/api/app/services/memory.py` | Hindsight provider boundary and evidence mapping |
| `apps/api/app/services/answers.py` | Citation selection and temporal validation |
| `apps/api/app/services/llm.py` | Ollama provider boundary and JSON repair |
| `apps/api/scripts/seed_acme.py` | Synthetic initial Acme history |
| `apps/api/scripts/cross_time_demo.py` | Real before/after memory proof |
| `docker-compose.yml` | Local PostgreSQL, Hindsight, and API services |

## Verification commands

```bash
docker compose exec api python -m pytest -q
docker compose exec -T api python scripts/cross_time_demo.py \
  --deal-id 53df2f8b-70a7-4eeb-90e6-f4d8cb135cfc
```

The cross-time script is intentionally single-use per deal. It captures the
baseline, retains a later Ravi interaction through the public endpoint, checks
for a temporal insight, and verifies an older memory remains retrievable. Run it
only against a deal bank that has not already received the September interaction.
