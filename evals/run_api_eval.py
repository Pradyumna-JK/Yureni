"""Run the DealMind gold questions against a live API without mutating memory."""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


def request_json(url: str, payload: dict) -> tuple[int, dict]:
    request = Request(
        url,
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    for attempt in range(2):
        try:
            with urlopen(request, timeout=240) as response:
                return response.status, json.loads(response.read())
        except HTTPError as error:
            body = error.read().decode(errors="replace")
            try:
                result = json.loads(body)
            except json.JSONDecodeError:
                result = {"detail": body}
            if error.code >= 500 and attempt == 0:
                time.sleep(1)
                continue
            return error.code, result
        except URLError as error:
            if attempt == 0:
                time.sleep(1)
                continue
            return 0, {"detail": str(error.reason)}
    return 0, {"detail": "request failed after retry"}


def evaluate(case: dict, result: dict, status: int) -> list[str]:
    failures: list[str] = []
    if status != 200:
        return [f"HTTP {status}: {result.get('detail', 'unknown error')}"]
    answer = str(result.get("answer", result.get("summary", ""))).lower()
    haystack = json.dumps(result, ensure_ascii=False).lower()
    if case.get("must_contain_all") and not all(term.lower() in haystack for term in case["must_contain_all"]):
        failures.append("missing required terms: " + ", ".join(case["must_contain_all"]))
    if case.get("must_contain_any") and not any(term.lower() in haystack for term in case["must_contain_any"]):
        failures.append("missing any expected term: " + ", ".join(case["must_contain_any"]))
    if case.get("must_not_contain") and any(term.lower() in answer for term in case["must_not_contain"]):
        failures.append("answer contains a forbidden phrase")
    evidence = result.get("evidence", [])
    if len(evidence) > case.get("max_evidence", 5):
        failures.append(f"evidence count {len(evidence)} exceeds maximum")
    if case.get("require_memory") and result.get("memory_used") is not True:
        failures.append("memory_used was not true")
    if case.get("require_evidence") and not evidence:
        failures.append("no evidence returned")
    if case.get("require_temporal_insight") and not result.get("temporal_insight"):
        failures.append("temporal_insight was not returned")
    if case.get("require_traceable_evidence"):
        for item in evidence:
            if not item.get("memory_id") or not item.get("document_id") or not item.get("mentioned_at"):
                failures.append("an evidence item lacks Hindsight traceability")
                break
    return failures


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--deal-id", required=True)
    parser.add_argument("--base-url", default="http://localhost:8000")
    parser.add_argument("--dataset", default=str(Path(__file__).with_name("dataset.json")))
    parser.add_argument("--only", action="append", help="Run only this case ID; repeatable")
    args = parser.parse_args()
    dataset = json.loads(Path(args.dataset).read_text())
    cases = [case for case in dataset["cases"] if not args.only or case["id"] in args.only]
    report = {"dataset_version": dataset["version"], "deal_id": args.deal_id, "results": []}
    for case in cases:
        path = "intelligence" if case["endpoint"] == "intelligence" else "ask"
        payload = {} if path == "intelligence" else {"question": case["question"]}
        status, result = request_json(f"{args.base_url}/api/deals/{args.deal_id}/{path}", payload)
        failures = evaluate(case, result, status)
        report["results"].append({"id": case["id"], "passed": not failures, "failures": failures, "response": result})
    passed = sum(item["passed"] for item in report["results"])
    report["summary"] = {"passed": passed, "failed": len(report["results"]) - passed, "total": len(report["results"])}
    print(json.dumps(report, indent=2, ensure_ascii=False))
    return 0 if report["summary"]["failed"] == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
