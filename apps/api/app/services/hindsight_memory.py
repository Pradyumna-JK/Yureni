import logging
from dataclasses import dataclass
from datetime import datetime
from typing import Any

import httpx
from hindsight_client import Hindsight

from app.config import Settings

logger = logging.getLogger(__name__)


class MemoryUnavailableError(RuntimeError):
    pass


@dataclass(frozen=True)
class MemoryEvidence:
    text: str
    source: str
    memory_id: str | None = None
    document_id: str | None = None
    mentioned_at: datetime | None = None
    source_text: str | None = None


class HindsightMemoryService:
    """Single boundary for DealMind's persistent-memory provider."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    def _client(self) -> Hindsight:
        return Hindsight(
            base_url=self._settings.hindsight_base_url,
            api_key=self._settings.hindsight_api_key,
            timeout=self._settings.hindsight_timeout_seconds,
        )

    async def health(self) -> bool:
        headers = self._headers()
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get(f"{self._settings.hindsight_base_url}/health", headers=headers)
                response.raise_for_status()
        except httpx.HTTPError as error:
            raise MemoryUnavailableError("Hindsight is unavailable") from error
        return True

    async def retain(
        self,
        *,
        bank_id: str,
        content: str,
        context: str,
        occurred_at: datetime,
        document_id: str,
        metadata: dict[str, str],
    ) -> bool:
        client = self._client()
        try:
            result = await client.aretain(
                bank_id=bank_id,
                content=content,
                context=context,
                timestamp=occurred_at,
                document_id=document_id,
                metadata=metadata,
                retain_async=False,
            )
            success = bool(getattr(result, "success", False))
            logger.info("Hindsight retain completed bank=%s document=%s success=%s", bank_id, document_id, success)
            return success
        except Exception as error:
            logger.warning("Hindsight retain failed bank=%s document=%s", bank_id, document_id)
            raise MemoryUnavailableError("Hindsight could not retain this interaction") from error
        finally:
            await client.aclose()

    async def recall(self, *, bank_id: str, query: str) -> list[MemoryEvidence]:
        client = self._client()
        try:
            response = await client.arecall(bank_id=bank_id, query=query, budget="mid", include_chunks=True)
            chunks: dict[str, Any] = getattr(response, "chunks", {}) or {}
            evidence: list[MemoryEvidence] = []
            for result in getattr(response, "results", []):
                chunk = chunks.get(getattr(result, "chunk_id", None))
                metadata = getattr(result, "metadata", None) or {}
                document_id = getattr(result, "document_id", None) or metadata.get("document_id")
                memory_id = getattr(result, "id", None)
                source_interaction_id = metadata.get("source_interaction_id")
                source = str(source_interaction_id or document_id or memory_id or "Hindsight memory")
                if not document_id and (source_interaction_id or source != "Hindsight memory"):
                    document_id = f"interaction-{source_interaction_id or source}"
                evidence.append(MemoryEvidence(
                    text=str(getattr(result, "text", "")), source=source,
                    memory_id=memory_id, document_id=document_id,
                    mentioned_at=getattr(result, "mentioned_at", None),
                    source_text=getattr(chunk, "text", None),
                ))
            logger.info("Hindsight recall completed bank=%s results=%d", bank_id, len(evidence))
            return [item for item in evidence if item.text]
        except Exception as error:
            logger.warning("Hindsight recall failed bank=%s", bank_id)
            raise MemoryUnavailableError("Hindsight could not recall deal memory") from error
        finally:
            await client.aclose()

    async def verify_interaction(
        self,
        *,
        bank_id: str,
        query: str,
        source_interaction_id: str,
    ) -> bool:
        """Confirm a synchronous retain produced at least one recallable memory.

        A successful retain response only confirms that Hindsight processed the input;
        it does not guarantee its LLM extracted a fact. DealMind must not report
        persistent memory as available until it can read an attributed memory back.
        """
        evidence = await self.recall(bank_id=bank_id, query=query)
        verified = any(item.source == source_interaction_id for item in evidence)
        logger.info(
            "Hindsight retain verification completed bank=%s source=%s verified=%s",
            bank_id,
            source_interaction_id,
            verified,
        )
        return verified

    async def reflect(self, *, bank_id: str, query: str) -> str:
        client = self._client()
        try:
            response = await client.areflect(bank_id=bank_id, query=query, budget="mid")
            text = str(getattr(response, "text", ""))
            logger.info("Hindsight reflect completed bank=%s", bank_id)
            return text
        except Exception as error:
            logger.warning("Hindsight reflect failed bank=%s", bank_id)
            raise MemoryUnavailableError("Hindsight could not reflect on deal memory") from error
        finally:
            await client.aclose()

    def _headers(self) -> dict[str, str]:
        if not self._settings.hindsight_api_key:
            return {}
        return {"Authorization": f"Bearer {self._settings.hindsight_api_key}"}
