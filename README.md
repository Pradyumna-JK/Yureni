# DealMind

DealMind is a local-first deal intelligence agent that gets more useful as it accumulates evidence from sales interactions. PostgreSQL holds structured product data; Hindsight holds persistent agent memory; Ollama supplies configurable local reasoning.

## Current status

The backend vertical slice and cross-time memory proof are complete and verified
end-to-end. The repository now also contains dashboard-ready deal, timeline,
stakeholder, and deterministic risk endpoints. A working React frontend now
connects the deal overview, searchable deal list, questions, assessments,
stakeholders, source timeline, and evidence inspection to the live API.

The interface includes a recording focus mode, three Intro Studio title frames,
and a reusable SVG brand mark. See [the recording guide](docs/RECORDING.md).
Frontend verification: `npm --workspace @dealmind/web test` (19 tests) and
`npm run build:web` (TypeScript plus production build).

Current limitations: the Memory view combines source interactions with topic groups
from the current answer/assessment evidence, not an exhaustive Hindsight memory
bank or a knowledge-graph export. Actual recalled facts and identifiers are inspectable.
Risk scoring still uses keyword signals, can count resolved concerns, and is not
a calibrated loss probability. Cross-deal retrieval is not implemented.

### Rosy's memory-led frontend

DealMind is the product; **Rosy** is its AI deal-memory agent. The redesign keeps
the existing API and backend architecture unchanged:

- Command Center is a separate operating dashboard: portfolio metrics, live
  portfolio pressure, memory coverage, accounts-to-inspect queue, stage/value
  lanes, a Rosy focus card, demo workflow actions, and recent portfolio movement.
  It does not repeat the Deal Detail cards. Selecting a lane or queue account
  opens the focused account workspace.
- Ask Rosy: real answers, previous/current/change fields when returned, and
  Hindsight supporting memories with expandable source identifiers.
- Memory constellation: keyword topic grouping of returned evidence only. Topics
  can overlap; their counts are not additive. This is a frontend visualization,
  not Hindsight's internal retrieval graph. It starts empty until evidence arrives.
- Dedicated Deals, Timeline, Stakeholders, and Insights views. Stakeholder context
  asks about that person's changing concerns instead of inventing concern fields.
- Rosy's Insight and next move use the real assessment response, with the
  heuristic-risk disclaimer preserved.
- Capture the moment uses the existing interaction form. A memory-captured
  confirmation appears only when the API reports `memory_status: succeeded`.
- The connection panel checks Hindsight and the API's database health endpoint.
  Ollama is explicitly unverified because no separate model health endpoint exists.

The exact user-supplied Rosy portrait is preserved in `apps/web/public/rosy.png`
and reused through `apps/web/src/components/Rosy.tsx`. No replacement image was
generated. Responsive styles are in `apps/web/src/redesign.css`; reduced-motion
preferences, keyboard controls, native dialogs, focus mode, and Intro Studio remain.
Answer/assessment UI state is session-local; refreshing the page clears that view,
not the persistent memory stored by Hindsight.

Local preview: `npm --workspace @dealmind/web run dev -- --host 127.0.0.1 --port 5174`.
Keep the API and memory/model services running for real questions. Automated
regressions cover the distinct Command Center, temporal fields, evidence nodes,
source navigation, Rosy's asset, stakeholder questions, risk disclaimers, health
checks, and retention confirmation, in addition to the original workflows. Tests
mock API responses only inside tests; the application does not use mock data.

Redesign verification (2026-10-10): TypeScript, 19 frontend tests, production
build, whitespace checks, and browser checks passed. Browser checks against the
local API covered the live Command Center dashboard, memory health, deal data,
a typed Ravi question, a temporal question with three returned memories, source
identifiers, topic evidence dialogs, assessments, health, and all navigation views.
Mobile (390px) and tablet (768px) had no horizontal overflow; desktop was checked
at 1440px. Interaction capture was regression-tested with mocked responses rather
than adding another test interaction to the live account. The live assessment
still demonstrated the existing resolved-concern risk limitation described above.

### Completed

- Created the monorepo with a FastAPI service in `apps/api` and a reserved
  React/Vite application in `apps/web`.
- Added environment templates, Git ignore rules, Compose configuration, and
  architecture documentation.
- Started PostgreSQL 16 with a persistent Docker volume and a health check.
- Started self-hosted Hindsight with its own persistent storage volume.
- Installed and validated Ollama locally with `gpt-oss:20b`; `gemma3:4b` is the
  smaller configurable fallback model.
- Built the FastAPI container, SQLAlchemy models, Alembic initial migration, and
  health endpoints for the API, PostgreSQL, and Hindsight.
- Added Deal, Company, Stakeholder, and Interaction persistence.
- Added Hindsight retain, recall, and reflect behind `HindsightMemoryService`.
- Added a configurable Ollama provider behind `OllamaService`, including a single
  JSON repair retry for invalid structured responses.
- Added endpoints to create deals, ingest interactions, ask memory-backed
  questions, and produce a conservative deal-intelligence response with evidence.
- Added three realistic synthetic Acme interactions covering Ravi's technical
  concerns, Sarah's ROI/pricing concerns, and Mike's procurement/competitor
  context.
- Added focused service tests and passed static Python compilation and whitespace
  validation.
- Added a versioned `evals/` gold set and API runner for factual answers,
  abstention, evidence budgets, traceability, temporal change, and deal
  intelligence.
- Added an idempotent six-deal historical dataset for future cross-deal learning
  experiments (`apps/api/scripts/seed_historical_deals.py`).
- Added `GET /api/deals` with pagination/filtering and dashboard summary fields,
  plus `/timeline` and `/stakeholders` endpoints for Deal Detail views.
- Added deterministic, evidence-derived risk scoring and explainable risk
  factors to the intelligence response; the LLM still writes the narrative.
- Added a Vite production build, TypeScript typecheck, and Vitest frontend
  regression tests for display/risk helpers.

### Verified locally

The following checks have been run successfully on the development machine:

```text
GET /health                 -> {"status":"ok"}
GET /api/health/db          -> {"status":"ok","database":"connected"}
GET /api/health/memory      -> {"status":"ok","memory":"connected"}
GET http://localhost:8888/health -> Hindsight healthy, database connected
```

The Acme memory demonstration was also verified after moving Hindsight fact
extraction to `gemma3:4b`. Asking “What did Ravi care about?” returned a
memory-backed answer identifying his November deployment deadline, concern about
an unsponsorable six-month integration, and the value-realization impact of a
delay. Hindsight returned supporting facts for the 90-day production plan,
security requirements, pricing/ROI, procurement dependencies, and NimbusIQ.

PostgreSQL, Hindsight, and the API are running in Docker. Hindsight is reachable
on port 8888, its UI is on port 9999, PostgreSQL is on port 5432, and the API is
on port 8000.

### Resolved issue: Hindsight fact extraction

The first Acme seed request reached Hindsight successfully, but Hindsight
extracted **zero facts** from all three interactions. Its logs showed repeated
`Output too long for chunk` messages followed by `Successfully extracted 0 facts`.
As a result, recall correctly returned no evidence and DealMind answered:

```text
There is insufficient historical context to answer this question.
```

The logs confirmed an extraction/output-length failure, rather than failed
database connectivity. Excessive model reasoning was suspected; the exact token
cause was not measured. Switching the extraction model restored recall. The
integration was changed so that:

- DealMind keeps `gpt-oss:20b` as its answer-generation model.
- Hindsight defaults to `gemma3:4b` through the independent
  `HINDSIGHT_LLM_MODEL` setting.
- Each synchronous retain is verified by recalling attributed evidence from the
  newly ingested interaction. A successful HTTP response alone is no longer
  reported as successful persistent memory.
- The Acme seed script accepts `--force`, allowing the existing stable document
  IDs to be reprocessed after a model/configuration change.

This fix has been validated. Run the sequence below when rebuilding the local
environment or deliberately reprocessing the demo history:

```bash
/opt/homebrew/bin/ollama list
docker compose up -d --build --force-recreate hindsight api
until curl --fail --silent http://localhost:8888/health >/dev/null; do sleep 3; done
docker compose exec api python scripts/seed_acme.py --force
```

Then test recall:

```bash
curl -sS -X POST \
  http://localhost:8000/api/deals/53df2f8b-70a7-4eeb-90e6-f4d8cb135cfc/ask \
  -H 'Content-Type: application/json' \
  -d '{"question":"What did Ravi care about?"}'
```

Expected evidence covers deployment before the November renewal window,
SSO/audit-log/data-residency security requirements, and a concrete 90-day path
to production. If fact extraction ever produces zero facts again, ingestion is
marked failed rather than pretending memory was retained. The Ask adapter now
reads source metadata from Hindsight's result objects (not its text chunks),
preserving memory IDs, document IDs, interaction IDs, and source dates.

### Cross-time memory milestone

Ask now separates memories retrieved for reasoning from citations shown to the
user. The LLM selects up to five directly supporting Hindsight memory IDs;
the API validates those IDs and returns their original stored text. No custom
retriever or stakeholder-specific filtering is used.

For supported questions about change, `temporal_insight` contains
`previous_state`, `current_state`, and `change`. It is omitted otherwise.
Temporal synthesis requires selected evidence from distinct dated source
interactions, with current evidence later than previous evidence. Source dates
are distinguished from future deadlines mentioned inside memories. Semantic
support is still a model judgment; citation and chronological validation do not
prove every generated statement is correct.

Run the real demo once against an Acme deal that has only the original history:

```bash
docker compose exec -T api python scripts/cross_time_demo.py \
  --deal-id 53df2f8b-70a7-4eeb-90e6-f4d8cb135cfc
```

The script captures the baseline, ingests a synthetic September 10 Ravi update
through the interaction endpoint, asks about changed priorities, then checks
that July evidence remains accessible. It refuses a repeat against an already
updated deal to avoid presenting updated history as an original baseline.

Ollama's answer context is configurable through `OLLAMA_NUM_CTX` (default
16384). Transcripts are included once per source document. Compose sets
`OLLAMA_REASONING_EFFORT=low` for GPT-OSS; leave this setting empty when using a
model without thinking-level support.

### Challenges encountered and resolutions

| Challenge | Resolution |
| --- | --- |
| The API Docker build detected multiple top-level Python packages (`app` and `alembic`). | Configured setuptools package discovery to include only `app*`. |
| API startup failed while locating a local `.env` in the container. | Replaced fixed parent-directory indexing with a safe upward `.env` search. Containers receive Compose environment values directly. |
| The first seed timed out while Hindsight processed local LLM requests. | Increased the application Hindsight client timeout and Hindsight LLM timeout to 600 seconds. |
| Restarting Hindsight and seeding immediately caused a connection-refused error. | Added the documented health-readiness wait before seed operations. |
| Hindsight completed retains but extracted zero facts with GPT-OSS. | Separated Hindsight's extraction model from DealMind's answer model, configured Gemma as the extraction fallback, and added read-after-write attribution checks. This is now verified working. |
| `rg` was unavailable in the local shell. | Use the portable `grep -Ei` alternative when inspecting Docker logs. |

## Delivery plan

1. **Foundation (complete):** monorepo, environment contract, and provider boundaries.
2. **Local infrastructure (complete):** Docker Compose for PostgreSQL/Hindsight and Ollama on the host.
3. **First vertical slice (complete):** retain, recall, and evidence-backed answers.
4. **Cross-time proof (complete):** later interactions change the supported answer.
5. **Backend expansion (complete):** historical demo data, deal/timeline/stakeholder APIs, deterministic risk signals, and evaluation coverage.
6. **Frontend (implemented):** account overview, questions with evidence, source
   explorer, deal list, interaction forms, and recording controls.
7. **Next:** validate the demo narrative and improve risk semantics and cross-deal retrieval.

The evaluation suite lives in [`evals/`](evals/README.md). Run it against a
live seeded API from a host with Docker access:

```bash
python3.11 evals/run_api_eval.py \
  --deal-id 53df2f8b-70a7-4eeb-90e6-f4d8cb135cfc
```

## Repository layout

```text
apps/
  api/            FastAPI service
  web/            React frontend, interaction tests, and recording assets
docs/             Architecture and operational notes
docker-compose.yml
```

## Prerequisites

- Python 3.11+
- Node.js 20+
- Docker Compose
- Ollama (for local model inference)

Copy `.env.example` to `.env` and replace local-only placeholders before starting infrastructure. No secrets belong in the repository.

## Start local infrastructure

```bash
cp -n .env.example .env
docker compose up -d --build
docker compose ps
```

The first Hindsight startup downloads its embedded PostgreSQL and local retrieval models, which can take several minutes. Check readiness from the host with:

```bash
curl --fail http://localhost:8888/health
```

Start the frontend through Vite (do not open `apps/web/index.html` directly as
`file://`; browser module loading will be blank in that mode):

```bash
npm --prefix apps/web install
npm --prefix apps/web run dev -- --host 127.0.0.1
```

Then open the localhost URL printed by Vite, usually `http://127.0.0.1:5173`.

PostgreSQL data persists in the `dealmind_postgres_data` volume. Hindsight owns its own persistent embedded PostgreSQL volume, `hindsight_data`, as recommended by its self-hosted distribution. Ollama remains a host service at `http://localhost:11434` and is exposed to Hindsight through Docker Desktop's `host.docker.internal` bridge.

Verify the API's dependency checks after startup:

```bash
curl --fail http://localhost:8000/health
curl --fail http://localhost:8000/api/health/db
curl --fail http://localhost:8000/api/health/memory
```

Seed the synthetic Acme Corp memory demo after all three checks succeed:

```bash
docker compose exec api python scripts/seed_acme.py

# Optional historical deals for cross-deal experiments
docker compose exec api python scripts/seed_historical_deals.py
```

Use `--force` only when deliberately reprocessing the existing Acme interactions
after a Hindsight configuration change:

```bash
docker compose exec api python scripts/seed_acme.py --force
```

## Guiding constraints

- Hindsight and Ollama are accessed only through service/provider interfaces.
- Responses must expose evidence and must not fabricate memory.
- If memory or the model is unavailable, the API reports that state explicitly and retryably.
- The first milestone proves the memory loop before UI polish.
