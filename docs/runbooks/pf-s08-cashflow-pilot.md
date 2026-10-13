# PF-S08 Cashflow pilot rollout

The pilot is gated by `CashflowPilot:Enabled` and
`CashflowPilot:CheckedMutationsEnabled`, both defaulting to `false`. Keep both
off while mapping owners and applying migrations. This runbook does not grant
permission to migrate a populated or remote database.

## Disposable fresh database

Run these commands from the repository worktree in PowerShell. The harness
creator uses a separate Supabase project ID and ports 55420–55429. Only one
PF-S08 harness can run at a time. It copies historical migrations through
`20261009080000_pf_s08_owner_expand.sql`; the enforce stage is absent until
mapping succeeds. `supabase/config.toml` has `[db.seed].enabled = false` and
public Auth signup disabled.

```powershell
$harness = & .\scripts\pf-s08-create-local-harness.ps1
npx --no-install supabase start --workdir $harness
$dbContainer = 'supabase_db_personal-finance-pf-s08-harness'
Get-Content -Raw supabase/scripts/pf-s08-map-disposable-fixture.sql |
  docker exec -i $dbContainer psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres -f -
Get-Content -Raw supabase/scripts/pf-s08-ownership-preflight.sql |
  docker exec -i $dbContainer psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres -f -
Get-Content -Raw supabase/scripts/pf-s08-ownership-gate.sql |
  docker exec -i $dbContainer psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres -f -
```

Inspect the preflight counts and relationships before continuing. The
disposable fixture mapper rejects a populated target and creates a blocked,
random Auth identity for historical Desk rows; it never assigns those rows to
a pilot user. Copy only the remaining migrations into this already staged
harness, then apply them through the local CLI migration ledger:

```powershell
Get-ChildItem supabase/migrations -File -Filter '*.sql' |
  Where-Object { $_.Name -ge '20261009090000_pf_s08_owner_enforce.sql' } |
  ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $harness 'supabase/migrations')
  }
npx --no-install supabase migration up --local --workdir $harness
Get-Content -Raw supabase/tests/pf-s08-rls-smoke.sql |
  docker exec -i $dbContainer psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres -f -
Get-Content -Raw supabase/tests/pf-s08-exposed-grants.sql |
  docker exec -i $dbContainer psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres -f -
Get-Content -Raw supabase/tests/pf-s08-import-faults.sql |
  docker exec -i $dbContainer psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres -f -
Get-Content -Raw supabase/tests/pf-s08-reset-derived.sql |
  docker exec -i $dbContainer psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres -f -
rtk proxy python scripts/pf_s08_local_http_smoke.py $harness
```

The RLS and fault SQL tests roll back their fixtures. The HTTP smoke
provisions and removes disposable Auth users, rows, and a private Storage
object. The smoke starts a local .NET API and browser test; it uses no paid AI
provider. Inspect its final `PASS` line and exit code. Repeat the shared
preset seed only after checking that it writes no personal rules; the
repository's `seed.sql` is designed to be idempotent.

## Populated target: required inputs and sequence

Record the target Supabase project and database version, applied migration
ledger, Auth JWT signing mode/issuer/audience, browser origin, and the intended
Auth UUID for every legacy owner group. Record table counts and monetary/date
checksums without putting personal records or credentials in this repository.
Take and verify a restorable backup. Enter maintenance: stop imports,
background writers, old clients, and pilot traffic. Do not run `db reset`,
replay historical seeds, or apply the disposable fixture mapper.

1. Apply only pending migrations through owner-expand using a staged migration
   directory and the target's approved migration mechanism. Confirm its ledger
   lists `20261009080000` and no later PF-S08 version.
2. Provision or verify intended Auth users. Apply a target-specific, reviewed
   row/group-to-UUID mapping. Include transactions without accounts, file
   hashes, rules, aliases, accounts, institutions, Bucket preferences, and
   dependent deferred-module rows. Ambiguous ownership blocks enforcement.
3. Run `supabase/scripts/pf-s08-ownership-preflight.sql` and retain its
   aggregate report. Compare row counts, monetary/date checksums, and parent
   links with the pre-mapping baseline. Review normalized duplicate groups;
   never merge/delete historical transactions automatically. Run
   `supabase/scripts/pf-s08-ownership-gate.sql`; any exception blocks the next
   stage.
4. Deploy the gated API/frontend/FastAPI code while access remains denied.
   Apply the remaining PF-S08 migrations in order. Verify migration ledger,
   owner FK/policy/grant/sequence state, and the exposed-schema grant audit in
   the actual target. Keep historical Storage objects private.
5. Provision two pilot test users, run owner A/B read, direct REST/GraphQL/
   Storage denial, checked import/replay/reset, and browser session tests.
   Verify count and value invariants again. Enable only the provisioned
   Cashflow pilot once all gates pass; keep deferred module routes denied.

If a gate fails, leave the pilot disabled and retain owner columns/mapping
for diagnosis. Reverting to permissive RLS policies or serving old unscoped
application code is unsafe. A restore or remote migration requires its own
approved maintenance procedure and target-specific recovery decision.

## Current evidence

The disposable local harness passed the A/B HTTP/browser smoke, exposed grant
audit, injected import-fault rollback tests, reset/embedding isolation,
rollback-only RLS test, and
shared seed replay on 2026-10-10. A populated target, its owner mapping,
backup/restore rehearsal, signing configuration, and rollout have not been
verified. See the [shared PF-S08 plan](../../plans/in-progress/PF-S08-auth-foundation-cashflow-ownership-todo.md)
for the acceptance checklist and remaining cases.
