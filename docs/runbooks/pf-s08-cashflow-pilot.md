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
Get-Content -Raw supabase/tests/pf-s08-deferred-modules-rls.sql |
  docker exec -i $dbContainer psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres -f -
rtk proxy python scripts/pf_s08_local_http_smoke.py $harness
rtk proxy python scripts/pf_s08_module_isolation.py $harness
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
   When the operator has decided that all legacy data belongs to one person,
   use `supabase/scripts/pf-s08-map-single-owner.sql` with both the UUID and
   the email; it aborts unless the target is at owner-expand, the Auth user is
   confirmed and active with that email, and no row already belongs to another
   real owner:

   ```powershell
   Get-Content -Raw supabase/scripts/pf-s08-map-single-owner.sql |
     docker exec -i $dbContainer psql -X -U postgres -d postgres `
       -v owner_id=<uuid> -v owner_email=<email> -f -
   ```
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
shared seed replay on 2026-10-10. On 2026-10-14 the populated path was
rehearsed on a hash-verified restore of the local main database: expand,
single-owner mapping, preflight, gate, enforce and every later migration, then
the SQL suites, the full HTTP/browser smoke, `scripts/pf_s08_dedup_parity.py`,
`scripts/pf_s08_reset_race.py` and `scripts/pf_s08_session_expiry.py` (the last
needs the harness `jwt_expiry` set to 20 and restored afterwards). Owner data
and running balances stayed identical to the source. Later on 2026-10-14 the
same sequence ran on the real local main database, and the pilot has been live
there since (the plan's STEP 8 rollout record has the details). The owner
accepted PF-S08 on 2026-10-16. See the [shared PF-S08 plan](../../plans/done/PF-S08-auth-foundation-cashflow-ownership-todo.md)
for the acceptance checklist and the open follow-ups.

## PF-S15: AI chat with owner-scoped data

AI chat, search and import embedding come back behind three flags, all `false`
by default. Each user's chat only reads that user's transactions: the browser
calls `/api/chat/*` on the API, the API signs a 60-second owner token, and the
AI service runs every query as the `authenticated` role with that user's claims,
so the PF-S08 RLS policies apply. See the
[PF-S15 plan](../../plans/done/PF-S15-resume-ai-chat-owner-scoped-todo.md).
Chat, search and the agents are on in the local main stack's config files, and
the owner accepted PF-S15 on 2026-10-16. Its open follow-ups are listed in the
plan.

| Where | Setting | Notes |
|---|---|---|
| AI service `.env` | `AI_CHAT_ENABLED=true`, `OWNER_SIGNING_SECRET=<secret>` | Requires `CASHFLOW_PILOT_ENABLED=true` and `INTERNAL_API_KEY`. |
| API config | `AiChat:Enabled=true`, `AiChat:OwnerSigningSecret=<same secret>` | The API refuses to start with chat on and no secret. |
| Frontend `.env` | `VITE_AI_CHAT_ENABLED=true` | Build-time boolean, never a secret. Rebuild or restart Vite after changing it. |

The signing secret is a separate value from the internal API key, so someone who
holds the key alone can't choose which user to act as. Generate one with
`python -c "import secrets; print(secrets.token_hex(32))"` and keep it out of
the repository.

**Enable order:** AI service, then API, then frontend. That way the API never
calls a route that still returns 404, and users only see chat once both
backends are ready. **Roll back in reverse:** frontend, then API, then AI
service. With all three off, `/chat` shows "AI chat is paused" and the AI
service returns 404 for `/ask`, `/ask/stream`, `/ask/followups`, `/search` and
`/embed-transactions`.

Migration `20261015000000_pf_s15_embeddings_owner_read.sql` must be applied
first. It lets `authenticated` read only embeddings of its own transactions and
grants no writes.

### Phase 2: advisor and categorizer agent

`/advisor` and `/categorize-agent` reopen behind their own pair of flags, also
`false` by default. Enable them after chat, in the same order: AI service, then
API. There is no frontend flag, because no UI calls either route yet.

| Where | Setting | Notes |
|---|---|---|
| AI service `.env` | `AI_AGENTS_ENABLED=true` | Both routes need the internal key and a signed owner token. `/advisor` also needs `X-Pf-User-Token`, the caller's own Supabase token, and its `sub` must match the owner token. |
| API config | `AiChat:AgentsEnabled=true` | Opens `POST /api/chat/advisor`. It returns 404 unless `AiChat:Enabled` is also on. |

The advisor's tools call the API back with the caller's own bearer token, so
the normal owner scoping applies to every number it reads. Its conversation
memory is keyed by user plus session id, so another user's session id starts an
empty conversation. `/categorize-agent` is internal only: each request binds the
caller's private rules plus the shared presets, the caller's categories, and an
owner-scoped similarity search, and each run gets a fresh agent so two callers
never share agent memory. **Roll back** with `AiChat:AgentsEnabled=false`, then
`AI_AGENTS_ENABLED=false`; both routes then return 404 again.

**Live check:** `python scripts/pf_s15_ai_isolation.py <harness-workdir>` runs
against the disposable harness. It provisions two users, imports distinct rows
for each, and asserts isolation for chat lookups, totals, follow-ups, `/search`
in all three modes, a forged embedding write, the advisor (its tools, its
memory and a mismatched user token) and the categorizer agent. It makes about
twenty short LLM calls. If the configured Gemini model's free daily quota is used up, set
`AI_MODEL` for that run only (for example `gemini-3.5-flash-lite`); add
`--pace 12` to stay under per-minute limits and clear of uvicorn's 5-second
keep-alive (at `--pace 5` the API can reuse a connection uvicorn is closing,
which surfaces as a 500 on a chat call).

Gemini 3 models can't finish an advisor tool round trip with the installed
`langchain-google-genai` (2.1.12): the second call fails with "Function call is
missing a thought_signature", and the advisor returns its fallback reply. The
live check then prints a `warn` line and checks only that the answer leaks
nothing; the advisor's tool path itself is still checked directly against the
API without the LLM. `gemini-2.5-flash` works but has a small free daily quota.

**Evidence (2026-10-15, local):**

- The spike on the main database showed that the connection role can switch to `authenticated`. As the owner it saw all 24 of their transactions and 24 embeddings; a stranger UUID saw 0 of each. `INSERT` into `transaction_embeddings` as `authenticated` and any read as `anon` were denied. pgvector is 0.8.0, so iterative index scans are enabled.
- `pf_s15_ai_isolation.py` passed on the harness with `gemini-3.5-flash-lite`.
- The compliance gate returned "ship with changes" (the chat disclosure line and the advice and arithmetic limits in the prompts); those changes are applied.

**Evidence, Phase 2 (2026-10-16, local):** `pf_s15_ai_isolation.py --pace 12`
passed on the harness with `gemini-3.5-flash-lite`. Every Phase 1 check passed
again. The advisor's tools, run against the live API with each user's token, saw
only that user's categories. B could not resume A's advisor session (A's code
word never appeared), A could, and `/advisor` refused A's owner token paired with
B's user token (401). The categorizer agent answered B's merchant with B's
private rule category and did not use it for A. Both advisor end-to-end answers
were the fallback reply because of the thought-signature limit above, so for
those two answers only the no-leak check ran.

### Troubleshooting

- **Chat says "no relevant transactions":** first check that the question's
  period has data. On 2026-10-16 the owner's transactions ran from 2026-05-01 to
  2026-08-03, so questions about April 2025 or the current month correctly found
  nothing. Owner and embedding coverage can be checked in one query: count
  `transactions` per `user_id`, and count those without a row in
  `transaction_embeddings`. Re-embedding is only needed when the embedding model
  changes.
- **Every page fails to reach the API, including System Health:** check that
  `VITE_API_URL` in `apps/frontend/.env` is `http://localhost:7208`. `npm start`
  runs the API's plain HTTP profile, so nothing listens on `https://localhost:7209`.
- **One "JWT issued at future" (PGRST303) error right after sign-in:** the new
  token's issue time was a moment ahead of PostgREST's clock. Refresh the page.
  If it repeats, compare `date -u` on the host with
  `docker exec supabase_db_personal-finance date -u`, and restart Docker Desktop
  if they differ.
