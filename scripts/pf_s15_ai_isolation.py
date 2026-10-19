"""Disposable local PF-S15 harness only: A/B isolation for AI chat, search, embeddings and agents.

Starts the AI service and the API with AI chat and agents enabled against the disposable PF-S08
harness, provisions two users, imports a different small set of transactions for each
(B gets a unique merchant and category), then proves through real calls that:

  - chat lookups, chat totals and follow-ups through /api/chat only use the caller's rows;
  - each chat total equals a direct sum of the caller's own rows (Decimal, FIN-01);
  - /search (FastAPI, internal key + signed owner token) returns only the caller's rows,
    and still returns the full top_k for A once both users' vectors share the index;
  - embedding B's transaction id with A's owner token stores nothing;
  - the advisor (/api/chat/advisor) reads data as the caller, and a session id
    from another user starts empty instead of resuming their memory;
  - /categorize-agent sees only the caller's private rules, categories and history.

Uses the configured LLM and embedding providers (a handful of short calls).

    python scripts/pf_s15_ai_isolation.py <harness-workdir> [--logs DIR] [--pace SECONDS]
"""

import argparse
import hashlib
import hmac
import json
import os
import secrets
import socket
import subprocess
import sys
import time
import uuid
from datetime import date, timedelta
from decimal import Decimal
from pathlib import Path
from urllib.request import Request, urlopen

from pf_s08_local_http_smoke import OWNED_TABLES, request, require

REPO = Path(__file__).resolve().parents[1]
AI_DIR = REPO / "services" / "ai-service"
INTERNAL_KEY = "local-test-internal-key-only"

# Distinct merchants, categories and amounts per user so any leak is unambiguous.
A_ROWS = [("PF15A KOPI KENANGAN SENOPATI", "Kopi A15", Decimal("25000")),
          ("PF15A KOPI KENANGAN BLOK M", "Kopi A15", Decimal("31000")),
          ("PF15A KOPI KENANGAN KEMANG", "Kopi A15", Decimal("47000")),
          ("PF15A GRAB RIDE KANTOR", "Transport A15", Decimal("52500"))]
B_ROWS = [("PF15B ZEBRA MART SUPERSTORE", "Zebra B15", Decimal("777777")),
          ("PF15B ZEBRA MART EXPRESS", "Zebra B15", Decimal("888888")),
          ("PF15B ZEBRA MART ONLINE", "Zebra B15", Decimal("999999"))]


def free_port() -> int:
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        return probe.getsockname()[1]


def sign_owner(secret: str, owner: str) -> str:
    prefix = f"{owner}.{int(time.time())}"
    return f"{prefix}.{hmac.new(secret.encode(), prefix.encode(), hashlib.sha256).hexdigest()}"


def post_json(url: str, payload: dict, headers: dict) -> tuple[int, dict]:
    req = Request(url, data=json.dumps(payload).encode(), method="POST",
                  headers={"Content-Type": "application/json", **headers})
    try:
        with urlopen(req, timeout=120) as response:
            return response.status, json.loads(response.read(), parse_float=Decimal)
    except Exception as error:  # urllib HTTPError carries the status
        return getattr(error, "code", 0), {}


PACE_SECONDS = 0.0


def ask_stream(api: str, token: str, query: str) -> dict:
    """POST /api/chat/ask/stream and collect the SSE events (numbers parsed as Decimal)."""
    time.sleep(PACE_SECONDS)  # free-tier LLM quotas are per minute; each ask is ~2 calls
    req = Request(f"{api}/api/chat/ask/stream", data=json.dumps({"query": query}).encode(),
                  method="POST", headers={"Content-Type": "application/json",
                                          "Authorization": f"Bearer {token}"})
    events: dict = {"tokens": [], "token_arrivals": []}
    current = None
    with urlopen(req, timeout=180) as response:
        require(response.status == 200, f"ask/stream HTTP {response.status}")
        require(response.headers.get_content_type() == "text/event-stream", "ask/stream is not SSE")
        for raw in response:
            line = raw.decode("utf-8").rstrip("\r\n")
            if line.startswith("event:"):
                current = line.split(":", 1)[1].strip()
            elif line.startswith("data:"):
                data = line.split(":", 1)[1].strip()
                if current == "token":
                    events["tokens"].append(data)
                    events["token_arrivals"].append(time.monotonic())
                elif current in ("metadata", "done", "error"):
                    events[current] = json.loads(data, parse_float=Decimal)
    require("error" not in events, f"ask/stream returned an error event: {events.get('error')}")
    return events


def is_fallback(answer: str) -> bool:
    """The advisor's own graceful-failure reply (app/agents/financial_advisor.py)."""
    return answer.startswith("Maaf, saya tidak dapat mengambil data keuangan Anda")


def advisor_tool_view(api: str, tokens: dict[str, str]) -> dict[str, dict]:
    """Run the advisor's real LangGraph tools in-process against the live API, once per caller."""
    os.environ["NET_API_BASE_URL"] = api   # read once, when advisor_tools is imported
    sys.path.insert(0, str(AI_DIR))
    import asyncio
    from app.agents.advisor_tools import caller_token, get_spending_by_category

    async def view() -> dict[str, dict]:
        out = {}
        for label, token in tokens.items():
            with caller_token(token):
                out[label] = await get_spending_by_category.ainvoke({})
        return out
    return asyncio.run(view())


def wait_until(predicate, what: str, timeout: float = 90.0) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if predicate():
            return
        time.sleep(1)
    raise AssertionError(f"Timed out waiting for {what}")


def main(args):
    harness = Path(args.harness)
    config = (harness / "supabase" / "config.toml").read_text(encoding="utf-8")
    require('project_id = "personal-finance-pf-s08-harness"' in config, "Not the disposable harness")
    status_env = subprocess.run(
        ["npx", "--no-install", "supabase", "status", "--workdir", str(harness), "-o", "env"],
        cwd=REPO, capture_output=True, text=True, check=True, shell=os.name == "nt").stdout
    values = {k: v.strip().strip('"') for k, v in
              (line.split("=", 1) for line in status_env.splitlines() if "=" in line)}
    base, anon, admin = values["API_URL"].rstrip("/"), values["ANON_KEY"], values["SERVICE_ROLE_KEY"]
    db_url = values["DB_URL"]
    require(base.endswith(":55421") and ":55422/" in db_url, "Status points outside the disposable harness")

    signing_secret = secrets.token_hex(32)
    log_dir = Path(args.logs) if args.logs else None
    if log_dir:
        log_dir.mkdir(parents=True, exist_ok=True)

    def output(name: str):
        return open(log_dir / f"{name}.log", "w", encoding="utf-8") if log_dir else subprocess.DEVNULL
    users, processes = [], []
    try:
        for label in ("a", "b"):
            email = f"pf-s15-ai-{label}-{uuid.uuid4().hex}@example.invalid"
            password = uuid.uuid4().hex + "Aa1!"
            status, created = request(base, "/auth/v1/admin/users", admin, admin, "POST",
                                      {"email": email, "password": password, "email_confirm": True})
            require(status in (200, 201) and created and created.get("id"), "Admin provisioning failed")
            status, session = request(base, "/auth/v1/token?grant_type=password", anon, anon, "POST",
                                      {"email": email, "password": password})
            require(status == 200 and session.get("access_token"), "Sign-in failed")
            users.append((created["id"], session["access_token"]))
        (a_id, a), (b_id, b) = users

        # ── AI service and API, both with chat and agents on ─────────────────
        ai = f"http://127.0.0.1:{free_port()}"
        api = f"http://127.0.0.1:{free_port()}"
        ai_env = os.environ.copy()
        ai_env.update({
            "DATABASE_URL": db_url, "CASHFLOW_PILOT_ENABLED": "true", "AI_CHAT_ENABLED": "true",
            "AI_AGENTS_ENABLED": "true", "NET_API_BASE_URL": api,
            # smolagents prints tool observations (row text) to stdout; keep it UTF-8 on Windows.
            "PYTHONIOENCODING": "utf-8",
            "INTERNAL_API_KEY": INTERNAL_KEY, "OWNER_SIGNING_SECRET": signing_secret,
        })
        python = AI_DIR / ".venv" / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
        processes.append(subprocess.Popen(
            [str(python), "-m", "uvicorn", "app.main:app", "--port", ai.rsplit(":", 1)[1]],
            cwd=AI_DIR, env=ai_env, stdout=output("ai-service"), stderr=subprocess.STDOUT))

        api_env = os.environ.copy()
        api_env.update({
            "ASPNETCORE_URLS": api, "ASPNETCORE_ENVIRONMENT": "Development",
            "Supabase__Url": base, "Supabase__AnonKey": anon, "Supabase__ServiceRoleKey": admin,
            "Supabase__JwtValidationMode": "Jwks", "Supabase__JwtIssuer": base + "/auth/v1",
            "Supabase__JwtAudience": "authenticated",
            "CashflowPilot__Enabled": "true", "CashflowPilot__CheckedMutationsEnabled": "true",
            "AiService__BaseUrl": ai, "AiService__InternalApiKey": INTERNAL_KEY,
            "AiChat__Enabled": "true", "AiChat__AgentsEnabled": "true",
            "AiChat__OwnerSigningSecret": signing_secret,
        })
        processes.append(subprocess.Popen(
            ["dotnet", "run", "--no-build", "--no-launch-profile", "--project",
             str(REPO / "apps/api/src/PersonalFinance.Api/PersonalFinance.Api.csproj")],
            cwd=REPO, env=api_env, stdout=output("api"), stderr=subprocess.STDOUT))

        def ready() -> bool:
            require(all(p.poll() is None for p in processes), "A service exited before readiness")
            return (request(ai, "/health", anon, anon)[0] == 200 and
                    request(api, "/api/journey/state", anon, anon)[0] == 401)
        wait_until(ready, "the AI service and API", timeout=120)

        # ── each user imports their own rows through the API ─────────────────
        own_ids: dict[str, set[int]] = {}
        for (user_id, token), rows, label in ((users[0], A_ROWS, "A"), (users[1], B_ROWS, "B")):
            status, institution = request(api, "/api/accounts/institutions", anon, token, "POST", {
                "name": f"PF-S15 {label} Bank", "type": "bank", "country": "ID"})
            require(status == 200 and institution.get("id"), f"{label} institution create failed ({status})")
            status, account = request(api, "/api/accounts", anon, token, "POST", {
                "institutionId": institution["id"], "name": f"PF-S15 {label} Account",
                "accountType": "checking", "currency": "IDR",
                "openingBalance": 0, "openingDate": date.today().isoformat()})
            require(status == 200 and account.get("id"), f"{label} account create failed ({status})")
            transactions = [{
                "date": (date.today() - timedelta(days=i + 1)).isoformat(), "description": desc,
                "remarks": "", "flow": "DB", "type": "Expense", "category": category,
                "amountIdr": str(amount), "currency": "IDR", "accountId": account["id"],
                "accountName": f"PF-S15 {label} Account",
            } for i, (desc, category, amount) in enumerate(rows)]
            status, result = request(api, "/api/transactions/submit", anon, token, "POST", {
                "requestId": str(uuid.uuid4()), "transactions": transactions,
                "fileHash": hashlib.sha256(f"pf-s15-{label}-{uuid.uuid4()}".encode()).hexdigest(),
                "fileName": f"pf-s15-{label}.csv"})
            require(status == 200 and result.get("insertedCount") == len(rows),
                    f"{label} import failed (HTTP {status}, {result})")
            own_ids[label] = set(result["insertedIds"])
        a_ids, b_ids = own_ids["A"], own_ids["B"]
        print("ok  A and B each imported their own rows through /api/transactions/submit")

        # Background embedding runs for the importing user only.
        def embedded(ids: set[int]) -> set[int]:
            id_list = ",".join(str(i) for i in ids)
            _, rows = request(base, f"/rest/v1/transaction_embeddings?select=transaction_id"
                                    f"&transaction_id=in.({id_list})", admin, admin)
            return {r["transaction_id"] for r in rows or []}
        wait_until(lambda: embedded(a_ids | b_ids) == a_ids | b_ids, "background embeddings")
        print("ok  importing re-enabled background embedding for both users' new rows")

        def owner_sum(user_id: str) -> tuple[Decimal, int]:
            _, rows = request(base, f"/rest/v1/transactions?select=amount_idr&user_id=eq.{user_id}",
                              admin, admin)
            return sum((Decimal(str(r["amount_idr"])) for r in rows), Decimal(0)), len(rows)

        # ── chat lookups never return the other user's rows ──────────────────
        for token, mine, theirs, label, query in (
                (a, a_ids, b_ids, "A", "Show my ZEBRA MART transactions"),
                (a, a_ids, b_ids, "A", "Kapan saya beli kopi kenangan?"),
                (b, b_ids, a_ids, "B", "Kapan saya beli kopi kenangan?")):
            events = ask_stream(api, token, query)
            contexts = {c["transaction_id"] for c in events.get("metadata", {}).get("contexts", [])}
            require(not contexts & theirs, f"{label}'s lookup '{query}' returned the other user's rows")
            require(contexts <= mine, f"{label}'s lookup returned rows it does not own: {contexts - mine}")
            # Prose may echo the question ("no ZEBRA MART found"), so only tokens that exist
            # solely in the other user's rows count as a leak.
            answer = "".join(events["tokens"]).upper()
            other_only = (("B15", "SUPERSTORE", "EXPRESS", "777", "888", "999") if label == "A"
                          else ("A15", "SENOPATI", "BLOK M", "KEMANG"))
            leaked = [n for n in other_only if n in answer]
            require(not leaked, f"{label}'s answer names the other user's data: {leaked}")
        recall = ask_stream(api, a, "Kapan saya beli kopi kenangan?")
        recall_ids = {c["transaction_id"] for c in recall.get("metadata", {}).get("contexts", [])}
        require(recall_ids & a_ids, "A's own coffee purchase was not found (recall loss)")
        require(len(recall["token_arrivals"]) > 1, "Stream delivered the answer in one chunk")
        print("ok  chat lookups use only the caller's rows; A still finds its own (recall), "
              f"streamed in {len(recall['token_arrivals'])} chunks")

        # ── chat totals equal the caller's own sum ────────────────────────────
        for user_id, token, label in ((a_id, a, "A"), (b_id, b, "B")):
            events = ask_stream(api, token, "Berapa total semua pengeluaran saya?")
            meta, done = events.get("metadata", {}), events.get("done", {})
            require(done.get("intent") == "aggregate", f"{label}'s total was not routed to SQL: {done}")
            expected_total, expected_count = owner_sum(user_id)
            total = Decimal(str(done.get("total_idr")))
            require(total == expected_total and meta.get("count") == expected_count,
                    f"{label}'s chat total {total} ({meta.get('count')} rows) != own sum "
                    f"{expected_total} ({expected_count} rows)")
            ids = {c["transaction_id"] for c in meta.get("contexts", [])}
            require(ids <= (a_ids if label == "A" else b_ids), f"{label}'s total cites foreign rows")
        print("ok  each chat total equals a direct Decimal sum of the caller's own rows")

        # ── follow-ups never name the other user's merchant or category ──────
        time.sleep(PACE_SECONDS)
        status, follow = post_json(f"{api}/api/chat/followups",
                                   {"question": "Berapa total pengeluaran saya?", "answer": "Rp 155.500"},
                                   {"Authorization": f"Bearer {a}"})
        require(status == 200, f"A follow-ups HTTP {status}")
        text = " ".join(follow.get("questions", [])).upper()
        require("ZEBRA" not in text and "B15" not in text, "A's follow-ups name B's data")
        print(f"ok  A's {len(follow.get('questions', []))} follow-ups never name B's merchant or category")

        # ── /search (server-side path) and the embedding forgery ─────────────
        def ai_headers(owner: str) -> dict:
            return {"X-Internal-Api-Key": INTERNAL_KEY, "X-Pf-Owner-Token": sign_owner(signing_secret, owner)}
        for owner, mine, theirs, label in ((a_id, a_ids, b_ids, "A"), (b_id, b_ids, a_ids, "B")):
            for mode in ("vector", "bm25", "hybrid"):
                status, found = post_json(f"{ai}/search", {"query": "ZEBRA MART kopi kenangan",
                                                           "top_k": 10, "search_mode": mode}, ai_headers(owner))
                require(status == 200, f"{label} /search {mode} HTTP {status}")
                ids = {r["transaction_id"] for r in found["results"]}
                require(not ids & theirs and ids <= mine, f"{label} /search {mode} crossed owners: {ids}")
        status, found = post_json(f"{ai}/search", {"query": "kopi kenangan", "top_k": 3}, ai_headers(a_id))
        require(status == 200 and len(found["results"]) == 3, "A /search returned fewer than top_k (recall)")
        status, _ = post_json(f"{ai}/search", {"query": "kopi"}, {"X-Internal-Api-Key": INTERNAL_KEY})
        require(status == 401, f"/search without an owner token returned HTTP {status}")
        print("ok  /search returns only the caller's rows in all modes, the full top_k, and 401 without an owner")

        victim = min(b_ids)
        _, before = request(base, f"/rest/v1/transaction_embeddings?select=search_text"
                                  f"&transaction_id=eq.{victim}", admin, admin)
        status, forged = post_json(f"{ai}/embed-transactions", {"items": [
            {"transaction_id": victim, "description": "PLANTED BY A"}]}, ai_headers(a_id))
        require(status == 200 and forged.get("embedded") == 0 and forged.get("skipped") == 1,
                f"Embedding B's row with A's owner was not refused: {forged}")
        _, after = request(base, f"/rest/v1/transaction_embeddings?select=search_text"
                                 f"&transaction_id=eq.{victim}", admin, admin)
        require(before == after, "B's stored embedding changed")
        print("ok  embedding B's transaction id as A stores nothing (embedded=0, skipped=1)")

        # ── advisor: tools read through the API as the caller ────────────────
        def advisor(token: str, query: str, session_id: str | None = None) -> dict:
            time.sleep(PACE_SECONDS)
            payload = {"query": query, **({"session_id": session_id} if session_id else {})}
            status, reply = post_json(f"{api}/api/chat/advisor", payload, {"Authorization": f"Bearer {token}"})
            require(status == 200 and reply.get("answer"), f"advisor HTTP {status}")
            return reply

        # The advisor's real tool code, run against the live API with each user's real
        # token: deterministic, no LLM. This is the path every advisor tool call takes.
        tool_view = advisor_tool_view(api, {"A": a, "B": b})
        for label, own, other in (("A", "A15", "B15"), ("B", "B15", "A15")):
            seen = json.dumps(tool_view[label]).upper()
            require(own in seen and other not in seen,
                    f"{label}'s advisor tools did not read only {label}'s data: {tool_view[label]}")
        print("ok  advisor tools call the API with the caller's own token and see only that caller's data")

        spending = "Use your tools: list my spending categories this month with their amounts."
        for token, own, other_only, label in (
                (a, "A15", ("B15", "ZEBRA"), "A"), (b, "B15", ("A15", "KOPI", "KENANGAN"), "B")):
            answer = advisor(token, spending)["answer"]
            leaked = [n for n in other_only if n in answer.upper()]
            require(not leaked, f"{label}'s advisor answer names the other user's data: {leaked}")
            if is_fallback(answer):
                print(f"warn {label}'s advisor returned its fallback reply; the provider could not finish "
                      "a tool round trip, so only the no-leak half of this check ran")
            else:
                require(own in answer.upper(), f"{label}'s advisor did not report its own categories")
                print(f"ok  {label}'s advisor answer reports its own categories and never the other user's")

        status, _ = post_json(f"{ai}/advisor", {"query": "q"},
                              {**ai_headers(a_id), "X-Pf-User-Token": b})
        require(status == 401, f"/advisor with A's owner but B's user token returned HTTP {status}")

        first = advisor(a, "Remember this code word for later: MARMOT-PF15. Just confirm briefly.")
        recall_q = "What code word did I ask you to remember earlier in this conversation?"
        b_reply = advisor(b, recall_q, first["session_id"])
        require("MARMOT" not in b_reply["answer"].upper(), "B resumed A's advisor memory with A's session id")
        a_reply = advisor(a, recall_q, first["session_id"])
        if is_fallback(first["answer"]) or is_fallback(a_reply["answer"]):
            print("warn the provider returned the advisor fallback, so A's own recall was not checked live")
        else:
            require("MARMOT" in a_reply["answer"].upper(), "A could not resume its own advisor session")
        print("ok  advisor memory is per user: B can't resume A's session id; "
              "a mismatched user token is refused (401)")

        # ── categorizer agent: only the caller's rules, categories and history ─
        status, _ = request(api, "/api/categoryrules", anon, b, "POST", {
            "keyword": "PF15B ZEBRA", "type": "Expense", "category": "Zebra B15", "flow": "DB"})
        require(status == 200, f"B private rule create failed ({status})")
        results = {}
        for owner, label in ((a_id, "A"), (b_id, "B")):
            time.sleep(PACE_SECONDS)
            status, results[label] = post_json(f"{ai}/categorize-agent", {
                "description": "PF15B ZEBRA MART SUPERSTORE", "wallet": "BCA", "amount_idr": 777777},
                ai_headers(owner))
            require(status == 200, f"{label} /categorize-agent HTTP {status}")
        require(results["A"]["category"] != "Zebra B15" and "B15" not in results["A"]["reasoning"].upper(),
                f"A's agent used B's rule, category or history: {results['A']}")
        require(results["B"]["category"] == "Zebra B15",
                f"B's agent did not use B's own rule or history: {results['B']}")
        status, _ = post_json(f"{ai}/categorize-agent", {"description": "x"}, {"X-Internal-Api-Key": INTERNAL_KEY})
        require(status == 401, f"/categorize-agent without an owner token returned HTTP {status}")
        print(f"ok  the categorizer agent sees only the caller's rules and history "
              f"(A: {results['A']['category']!r}, B: {results['B']['category']!r}); 401 without an owner")

        print("PASS: AI chat, search, embeddings, the advisor and the categorizer agent are owner-isolated")
    finally:
        for process in processes:
            process.terminate()
        for user_id, _ in users:
            for table in OWNED_TABLES:
                request(base, f"/rest/v1/{table}?user_id=eq.{user_id}", admin, admin, "DELETE")
            request(base, f"/auth/v1/admin/users/{user_id}", admin, admin, "DELETE")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("harness")
    parser.add_argument("--logs", help="write AI service and API output here (may include row text)")
    parser.add_argument("--pace", type=float, default=0.0,
                        help="seconds to wait before each LLM-backed call (e.g. 25 for a 5 RPM free tier)")
    try:
        parsed = parser.parse_args()
        PACE_SECONDS = parsed.pace
        main(parsed)
    except AssertionError as failure:
        print(f"FAIL: {failure}")
        sys.exit(1)
