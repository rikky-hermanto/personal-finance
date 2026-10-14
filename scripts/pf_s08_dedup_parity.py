"""Disposable local PF-S08 harness only: SQL half of the duplicate parity matrix.

Runs every case in supabase/tests/fixtures/pf-s08-dedup-parity.json through
the real submit_cashflow_import RPC as an `authenticated` owner. Existing rows
are inserted directly (so already-duplicated history can be represented);
incoming rows carry a per-row marker in `remarks`, which is not part of the
duplicate key, to read back which rows the RPC inserted. The C# half is
DedupParityTests. Each case uses a fresh owner that is always removed.

    python scripts/pf_s08_dedup_parity.py [db-container]
"""

import json
import subprocess
import sys
import uuid
from pathlib import Path

CONTAINER = sys.argv[1] if len(sys.argv) > 1 else "supabase_db_personal-finance-pf-s08-harness"
FIXTURE = Path(__file__).resolve().parents[1] / "supabase/tests/fixtures/pf-s08-dedup-parity.json"


def psql(sql):
    result = subprocess.run(
        ["docker", "exec", "-i", CONTAINER, "psql", "-X", "-q", "-A", "-t",
         "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres", "-f", "-"],
        input=sql, capture_output=True, text=True, encoding="utf-8")
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip())
    return result.stdout


def literal(value):
    return "NULL" if value is None else "'" + str(value).replace("'", "''") + "'"


def run_case(case):
    owner, account = str(uuid.uuid4()), str(uuid.uuid4())
    resolve = lambda row: account if "account" in row else None
    existing = "\n".join(
        f"""INSERT INTO public.transactions (user_id, date, description, remarks, flow, type,
  category, account_id, amount_idr, currency, statement_balance)
VALUES ('{owner}', {literal(r['date'])}::timestamptz, {literal(r['description'])}, '',
  {literal(r.get('flow', 'CR'))}, 'Income', 'Test', {literal(resolve(r))}::uuid,
  {literal(r['amount'])}::numeric, 'IDR', {literal(r.get('balance'))}::numeric);"""
        for r in case["existing"])
    rows = [{
        "date": r["date"], "description": r["description"], "remarks": f"parity-{i}",
        "flow": r.get("flow", "CR"), "type": "Income", "category": "Test",
        "currency": "IDR", "amount_idr": r["amount"], "statement_balance": r.get("balance"),
        "account_id": resolve(r), "account_name": None, "category_rule": None,
    } for i, r in enumerate(case["incoming"])]
    try:
        psql(f"""INSERT INTO auth.users (id, instance_id, aud, role, created_at, updated_at)
VALUES ('{owner}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', now(), now());
INSERT INTO public.accounts (id, user_id, name, account_type, currency, opening_date)
VALUES ('{account}', '{owner}', 'PF-S08 parity account', 'checking', 'IDR', current_date);
{existing}
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '{owner}', true),
       set_config('request.jwt.claim.role', 'authenticated', true);
SELECT public.submit_cashflow_import('{uuid.uuid4()}', {literal(json.dumps(rows))}::jsonb, NULL, NULL);
COMMIT;""")
        inserted = set(psql(f"""SELECT remarks FROM public.transactions
WHERE user_id = '{owner}' AND remarks LIKE 'parity-%';""").split())
        return [f"parity-{i}" not in inserted for i in range(len(rows))]
    finally:
        psql(f"""DELETE FROM public.transactions WHERE user_id = '{owner}';
DELETE FROM public.cashflow_import_receipts WHERE user_id = '{owner}';
DELETE FROM public.accounts WHERE user_id = '{owner}';
DELETE FROM auth.users WHERE id = '{owner}';""")


def main():
    cases = json.loads(FIXTURE.read_text(encoding="utf-8"))["cases"]
    failures = 0
    for case in cases:
        actual = run_case(case)
        ok = actual == case["expected"]
        failures += not ok
        print(f"{'ok ' if ok else 'FAIL'} {case['name']}" + ("" if ok else f": expected {case['expected']}, got {actual}"))
    if failures:
        sys.exit(f"{failures} of {len(cases)} SQL parity cases failed")
    print(f"PASS: {len(cases)} SQL submit parity cases match the shared fixture")


if __name__ == "__main__":
    main()
