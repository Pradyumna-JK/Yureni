# DealMind architecture

DealMind separates durable structured application data from durable agent memory.

| Concern | Initial implementation |
| --- | --- |
| Structured deals, interactions, and outcomes | PostgreSQL via SQLAlchemy and Alembic |
| Persistent memory | Hindsight behind a `MemoryProvider` interface |
| Local reasoning | Ollama behind an `LLMProvider` interface |
| HTTP application surface | FastAPI |
| Revenue-intelligence UI | React, TypeScript, Vite, Tailwind, shadcn/ui, and Recharts |

The first vertical slice intentionally has one path:

`interaction -> retain in Hindsight -> recall/reflect -> structured answer with evidence`

The API must distinguish unavailable memory from empty memory, and must never claim memory or evidence that was not returned by a provider.
