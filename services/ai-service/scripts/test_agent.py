"""Smoke test: run the categorizer agent on 5 hand-picked transactions.

Usage:
    cd services/ai-service && PYTHONPATH=. python scripts/test_agent.py

Requires the AI service running on port 8000.
Prints: description | category | confidence | reasoning (truncated) | tool count
"""
import asyncio
import time

import httpx

# Each fixture carries the category you expect. "Non-null category" is not a
# quality bar — five "Other"s would pass it. `expected` values below were
# checked against `SELECT DISTINCT category FROM transactions` on the local
# dev DB (only 5 categories exist there: Bill, Emergency Fund, Food & Drinks,
# Loan, Salary) — not the larger vocabulary the plan's fallback list assumes.
TEST_TRANSACTIONS = [
    {"description": "Monthly salary payment", "wallet": "BCA",
     "amount_idr": 8000000, "expected": "Salary"},
    {"description": "Electricity bill payment", "wallet": "BCA",
     "amount_idr": 300000, "expected": "Bill"},
    {"description": "Food and drinks purchase", "wallet": "BCA",
     "amount_idr": 500000, "expected": "Food & Drinks"},
    {"description": "KTA installment payment", "wallet": "BCA",
     "amount_idr": 1150000, "expected": "Loan"},
    {"description": "Emergency fund transfer", "wallet": "BCA",
     "amount_idr": 700000, "expected": "Emergency Fund"},
]

URL = "http://localhost:8000/categorize-agent"

# gemini-2.5-flash free tier = 5 requests/minute. Each agent run burns ~3-4
# completions (one per ReAct step + final answer) in a matter of seconds, so
# back-to-back transactions trip the RPM cap even though each run alone is
# under it. Space transactions out so each run's own burst has the rolling
# window mostly to itself. Not a production concern — /categorize-agent
# serves one request at a time by design (debug/demo path, not the fast path).
INTER_TRANSACTION_DELAY_S = 65.0

# Deliberately SHORT relative to how long a rate-limited request can actually
# take: smolagents retries a rate-limited call internally (3 attempts,
# exponential backoff — 60s/120s/240s-ish with jitter) before ever raising, so
# a real 429 can take several minutes to surface as the endpoint's 502. This
# timeout exists purely as a fast-fail circuit breaker for the SCRIPT — a
# healthy run finishes in ~5-15s, so 30s comfortably covers a normal call and
# still fails fast on an unhealthy one instead of hanging for minutes per
# transaction. The real error detail is on the server side either way; see
# app/agents/tools & app/agents/categorizer_agent.py for how it's classified.
REQUEST_TIMEOUT_S = 30.0


async def main() -> None:
    passed = 0
    async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT_S) as client:
        for i, tx in enumerate(TEST_TRANSACTIONS):
            if i > 0:
                print(f"\n(waiting {INTER_TRANSACTION_DELAY_S:.0f}s to stay under the Gemini free-tier RPM cap...)")
                await asyncio.sleep(INTER_TRANSACTION_DELAY_S)
            payload = {k: v for k, v in tx.items() if k != "expected"}
            t0 = time.perf_counter()

            try:
                resp = await client.post(URL, json=payload)
                resp.raise_for_status()
            except httpx.TimeoutException:
                elapsed = time.perf_counter() - t0
                print(f"\n{'-' * 70}")
                print(f"  Description : {tx['description']}")
                print(f"  TIMED OUT after {elapsed:.0f}s (client cutoff={REQUEST_TIMEOUT_S:.0f}s).")
                print(f"  This is NOT a bug in the endpoint or the script — a healthy run finishes")
                print(f"  in ~5-15s. A timeout this early means the AI service is still retrying")
                print(f"  against a rate-limited/unreachable LLM provider in the background")
                print(f"  (smolagents retries up to 3x with growing backoff before giving up).")
                print(f"  Check the AI service's own terminal for 'RateLimitError' / '429' / 'RESOURCE_EXHAUSTED'.")
                print(f"\nStopping — remaining transactions would hit the same wall.")
                break
            except httpx.HTTPStatusError as exc:
                elapsed = time.perf_counter() - t0
                detail = exc.response.text
                print(f"\n{'-' * 70}")
                print(f"  Description : {tx['description']}")
                print(f"  HTTP {exc.response.status_code} after {elapsed:.1f}s: {detail}")
                if "llm_rate_limited" in detail:
                    print(f"  -> Provider rate limit exhausted (see server log). Not a code bug.")
                    print(f"\nStopping — remaining transactions would hit the same wall.")
                    break
                print(f"  -> Unexpected server error — worth investigating (not a rate limit).")
                continue

            elapsed = time.perf_counter() - t0
            r = resp.json()

            ok = r["category"] == tx["expected"]
            passed += ok
            print(f"\n{'-' * 70}")
            print(f"  Description : {tx['description']}")
            print(f"  Expected    : {tx['expected']}")
            print(f"  Got         : {r['category']}  {'OK' if ok else 'MISMATCH'}"
                  f"  (confidence={r['confidence']:.2f})")
            print(f"  Reasoning   : {r['reasoning'][:120]}...")
            print(f"  Tool calls  : {r['tool_calls_count']}    Latency: {elapsed:.2f}s")

    print(f"\n{'=' * 70}\n  {passed}/{len(TEST_TRANSACTIONS)} correct")


if __name__ == "__main__":
    asyncio.run(main())
