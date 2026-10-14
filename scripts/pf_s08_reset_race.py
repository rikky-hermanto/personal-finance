"""Disposable local PF-S08 harness only: prove checked submit and reset serialize.

Runs real concurrent database sessions as `authenticated` with a per-test
owner. Each scenario holds the owner lock in one session while the other
waits, then checks rows, hashes and receipts together. Fixtures are committed
(two sessions cannot share an open transaction) and are always removed.

    python scripts/pf_s08_reset_race.py [db-container]
"""

import json
import subprocess
import sys
import threading
import time
import uuid

CONTAINER = sys.argv[1] if len(sys.argv) > 1 else "supabase_db_personal-finance-pf-s08-harness"
HOLD_SECONDS = 2.0      # holder keeps the owner lock this long (< 3s lock_timeout)
TIMEOUT_HOLD = 4.5      # exceeds the RPC's 3s lock_timeout
WAITER_DELAY = 0.5


def psql(sql, check=True):
    result = subprocess.run(
        ["docker", "exec", "-i", CONTAINER, "psql", "-X", "-q", "-A", "-t",
         "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres", "-f", "-"],
        input=sql, capture_output=True, text=True, encoding="utf-8")
    if check and result.returncode != 0:
        raise RuntimeError(result.stderr.strip())
    return result


def as_owner(owner, body, sleep_after=0.0):
    sleep = f"SELECT pg_sleep({sleep_after});" if sleep_after else ""
    return f"""BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '{owner}', true),
       set_config('request.jwt.claim.role', 'authenticated', true);
{body}
{sleep}
COMMIT;
"""


def submit_sql(file_hash, description):
    rows = json.dumps([{
        "date": "2026-10-01T00:00:00.000000Z", "description": description,
        "remarks": "", "flow": "CR", "type": "Income", "category": "Test",
        "currency": "IDR", "amount_idr": 10, "account_id": None,
        "account_name": None, "category_rule": None}])
    return (f"SELECT public.submit_cashflow_import('{uuid.uuid4()}', "
            f"'{rows}'::jsonb, '{file_hash}', 'race.csv');")


def state(owner):
    out = psql(f"""SELECT
  (SELECT count(*) FROM public.transactions WHERE user_id = '{owner}'),
  (SELECT count(*) FROM public.uploaded_files WHERE user_id = '{owner}'),
  (SELECT count(*) FROM public.cashflow_import_receipts WHERE user_id = '{owner}');""").stdout
    return tuple(int(x) for x in out.strip().split("|"))


def race(holder_sql, waiter_sql):
    """Start holder, then waiter after a delay; return (waiter result, wait seconds)."""
    holder = threading.Thread(target=lambda: psql(holder_sql))
    holder.start()
    time.sleep(WAITER_DELAY)
    started = time.monotonic()
    waiter = psql(waiter_sql, check=False)
    waited = time.monotonic() - started
    holder.join()
    return waiter, waited


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def main():
    owner = str(uuid.uuid4())
    psql(f"""INSERT INTO auth.users (id, instance_id, aud, role, created_at, updated_at)
VALUES ('{owner}', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', now(), now());""")
    try:
        # 1. Submit holds the lock; reset waits, then removes the committed import.
        waiter, waited = race(
            as_owner(owner, submit_sql("1" * 64, "race submit first"), HOLD_SECONDS),
            as_owner(owner, "SELECT public.reset_cashflow();"))
        require(waiter.returncode == 0, f"Reset after submit failed: {waiter.stderr.strip()}")
        require(waited >= HOLD_SECONDS - WAITER_DELAY - 0.3,
                f"Reset did not wait for the submit lock ({waited:.2f}s)")
        require(state(owner) == (0, 0, 0), f"Reset after submit left {state(owner)}")
        print(f"ok  submit-then-reset: reset waited {waited:.2f}s, nothing left")

        # 2. Reset holds the lock; submit waits, then commits one complete import.
        psql(as_owner(owner, submit_sql("2" * 64, "race prior row")))
        require(state(owner) == (1, 1, 1), "Seed import for scenario 2 failed")
        waiter, waited = race(
            as_owner(owner, "SELECT public.reset_cashflow();", HOLD_SECONDS),
            as_owner(owner, submit_sql("3" * 64, "race submit second")))
        require(waiter.returncode == 0, f"Submit after reset failed: {waiter.stderr.strip()}")
        require(waited >= HOLD_SECONDS - WAITER_DELAY - 0.3,
                f"Submit did not wait for the reset lock ({waited:.2f}s)")
        require(state(owner) == (1, 1, 1), f"Submit after reset left {state(owner)}")
        print(f"ok  reset-then-submit: submit waited {waited:.2f}s, exactly one import kept")

        # 3. Holder exceeds lock_timeout; the waiter fails cleanly with no effect.
        psql(as_owner(owner, "SELECT public.reset_cashflow();"))
        waiter, waited = race(
            as_owner(owner, submit_sql("4" * 64, "race long holder"), TIMEOUT_HOLD),
            as_owner(owner, submit_sql("5" * 64, "race timed out")))
        require(waiter.returncode != 0 and "lock timeout" in waiter.stderr,
                f"Waiter did not hit lock_timeout: {waiter.stderr.strip()}")
        require(state(owner) == (1, 1, 1), f"Timed-out submit changed state: {state(owner)}")
        print(f"ok  lock-timeout: waiter failed after {waited:.2f}s, only the holder's import exists")
        print("PASS: checked submit/reset serialize per owner; lock timeout leaves no effect")
    finally:
        psql(f"""DELETE FROM public.transactions WHERE user_id = '{owner}';
DELETE FROM public.uploaded_files WHERE user_id = '{owner}';
DELETE FROM public.cashflow_import_receipts WHERE user_id = '{owner}';
DELETE FROM auth.users WHERE id = '{owner}';""", check=False)


if __name__ == "__main__":
    main()
