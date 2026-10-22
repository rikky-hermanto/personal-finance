---
id: E-001
title: Close the gaps from the October security audit
status: planned
priority-hint: high
created: 2026-10-15T10:09:27Z
created-label: 2026-10-15 18:09 Asia/Makassar
tickets: [PF-143, PF-144, PF-145, PF-146, PF-147, PF-148, PF-149, PF-150]
---

# Close the gaps from the October security audit

## What I Want (owner, business language)
The app holds my real bank statements, balances and investments, and the repository is public. I want every problem found in the 2026-10-15 security audit either fixed or consciously accepted, so that:

- nothing personal about me or other people can be read from the public repository;
- no signed-in user can ever see another user's money data, including once AI chat comes back;
- the app, its upload path and its supporting services don't leak internals or sit open on my network;
- the libraries we ship have no known high-severity vulnerabilities, or each remaining one has a written reason.

## Why Now
- The repository is **public**. One committed file names two private people next to loan and payment categories.
- Sign-in and owner-only data (PF-S08) just went live on 2026-10-14. This is the moment to close the remaining gaps before the move to Supabase Cloud and before AI chat reopens (PF-S15, in backlog).
- AI chat as currently built reads the database as a superuser and would expose every user's transactions if it were reopened as-is.

## Done Looks Like (optional, owner)
- The category-rules export no longer contains real names, and I have decided whether to scrub git history (a destructive force-push) or accept the exposure.
- PF-S15 cannot ship until the AI service reads data as the signed-in user, under row-level security, through the .NET API.
- Upload errors return a generic message plus a correlation ID and are logged (ERR-01). Uploads check the real file type and time-box PDF parsing (SEC-02).
- Local services (Grafana, Loki, Tempo, Postgres, AI service) listen only on `127.0.0.1`, and Grafana is not anonymous-admin.
- Password policy and MFA are settled before the Supabase Cloud deployment.
- `dotnet list package --vulnerable`, `npm audit --omit=dev` and `pip-audit` are clean, or each remaining item is accepted in writing.
- A re-run of the audit finds nothing new at medium or above.

## Audit Evidence (2026-10-15)
Findings from the audit in the terminal session on 2026-10-15, ranked by severity. Items marked **latent** are blocked today by the PF-S08 route gate or by missing grants, but they become live if that gate changes.

### High
1. **Real third-party names in a public repo.** `docs/data/category-rules-2026-05-07.csv` contains two real people's names tied to "Loan Given", "Loan Repayment" and a bill. The names have been in history since `c77208a7`. Fixing the file is easy; removing the names from history needs a history rewrite and a force-push. *(Do not copy the names into tickets: this repo is public.)*
2. **The AI service bypasses row-level security (latent).** `services/ai-service/app/config.py` defaults `DATABASE_URL` to the `postgres` superuser. The `/search`, `/ask`, `/ask/stream`, `/embed-transactions` and aggregation routes, plus the startup category and rule loaders, query `transactions` and `category_rules` with no owner filter. The browser calls the AI service directly with no auth header (`apps/frontend/src/api/chatApi.ts:48`). Today the pilot gate returns 404 for these routes.
3. **Vulnerable dependencies.**
   - **.NET:** `Microsoft.OpenApi` 2.0.0 is pulled in transitively and has a high-severity advisory (GHSA-v5pm-xwqc-g5wc). It is mapped in Development only.
   - **npm:** 20 advisories (17 high). The one that ships to the browser is `react-router-dom` (through `@remix-run/router`). The rest (`postcss`, `tailwindcss`, `micromatch`, `braces` and others) run only at build time.
   - **Python:** 13 advisories in `langgraph` 0.6.11, `langgraph-checkpoint` 3.0.1, `langgraph-sdk` 0.2.15, `langchain-core` 0.3.86 and `langchain-anthropic` 0.3.22. Each fix is a major version upgrade.

### Medium
4. **Upload endpoints leak exception text.** `TransactionsController.cs` lines 149–162 and 236–245 return `ex.Message` to the client, which breaks ERR-01. The catch-all at line 160 also never logs.
5. **Upload checks are incomplete (SEC-02).**
   - **.NET:** it trusts the content type the client sends, with no magic-byte check and no timeout around PDF parsing.
   - **AI service:** `/parse-pdf` has no size cap and no timeout around PyMuPDF, and it returns `str(e)` in the error detail.
6. **Compose services are exposed on every network interface.** `docker-compose.yml` exposes:
   - Grafana on 3000, with anonymous Admin access and the login form disabled;
   - Loki on 3100 and Tempo on 3200 and 4319, which hold logs and traces;
   - Postgres on 5432, with the default password `postgres_password_here`;
   - the AI service on 8000;
   - Alloy on 12345.
7. **Sign-in settings are weak for a finance app.** In `supabase/config.toml` the minimum password length is 6, `password_requirements` is empty, there is no MFA, and `secure_password_change` is false.
8. **Data leaves for third parties.** Statement text goes to Gemini, and Langfuse cloud stores full prompts. We need to confirm the Gemini key is on a paid tier (free-tier data may be used by Google) and decide whether to mask prompts in Langfuse.

### Low
9. **Supabase keys in git history** (`aca5f696`, `1762c8ed`). The commit message says these are the well-known local demo keys, but this was not verified. Confirm the token issuer is `supabase-demo`.
10. **`transaction_embeddings` has no row-level security (latent).** No role has a grant to it today, but Supabase's default privileges grant new tables to `anon` and `authenticated`, so one future migration could expose it.
11. **`upload-preview-new` is unsafe (latent).** It puts the uploaded file name into a storage path unsanitized and hardcodes the user as `"default-user"`. The route gate blocks it today.
12. **Minor exposures.**
    - The anonymous `/health` endpoint shows dependency names and error text.
    - The AI service container runs as root.
    - The monitoring images use `:latest` tags.

### Already solid (keep it that way)
- **Token checks:** JWT validation checks issuer, audience, expiry and an algorithm allowlist, with zero clock skew. Every route requires sign-in by default.
- **Database isolation:**
  - Each request reaches PostgREST with the caller's own token.
  - The owner policies also check parent ownership on writes.
  - The privileged write functions run as a role that cannot bypass RLS (`NOBYPASSRLS`), with a pinned `search_path` and an `auth.uid()` check.
  - All direct access by `anon` was revoked.
- **Closed by default:** public signup is off, and the API and the AI service both fail closed. The AI service compares its internal key in constant time.
- **Secrets and data hygiene:** the storage bucket is private, CORS uses an allowlist, CI runs gitleaks, no real `.env` files are tracked, the real assets seed was never committed, and the test fixtures are synthetic.

### Not checked
- The live database state, because Docker was not running.
- A local gitleaks scan of history (gitleaks is not installed; CI runs it).
- Decoding the historical keys (the tool blocked it).

<!-- Everything below is written by loop-grill. Do not edit while status is grilling. -->
## Clarified Understanding
Close the audit findings that still matter, in small independent pieces, and write down the ones that are consciously accepted. Finding 2 (the AI service reading as a superuser) was already closed by PF-S15, accepted 2026-10-16, so it needs no work here, only a note in the final re-audit. Everything else stays open: the names in the public file, upload error leaks and weak upload checks, services open on the network, weak sign-in rules, vulnerable libraries in shipped code, and the low-severity items.

## Decisions (from G1)
- Q: Names in git history? A: Scrub the current file only. History is not rewritten; the old exposure is accepted and recorded in writing.
- Q: Sign-in strictness? A: Strong password rules only (longer minimum, password requirements, secure password change on). No MFA.
- Q: Local services? A: Bind Grafana, Loki, Tempo, Postgres, the AI service and Alloy to 127.0.0.1, and turn off anonymous admin in Grafana.
- Q: Dependencies? A: Fix what ships (.NET OpenApi, react-router-dom, Python AI libraries with tests). Build-time-only npm advisories are accepted in writing, one reason each.
- Q: Third parties? A: Owner confirms the Gemini key is on a paid tier. No Langfuse masking; the exposure is accepted in writing.
- Q: Low items? A: Fix all in one slice.

## Out of Scope
- Rewriting git history or force-pushing.
- MFA.
- Masking prompts in Langfuse.
- Clearing build-time-only npm advisories.
- Finding 2 (AI service bypassing RLS): already done in PF-S15.

## Open Items
- Owner must confirm the Gemini key tier (owner action, not code).
- Python library upgrades may break the chat agents; the slice needs a fallback of accepting the advisory if tests cannot be made green.
- Whether the demo keys in history really are Supabase demo keys is unverified; the low-items slice checks this.

## Proposed Slices
1. Scrub real names from `docs/data/category-rules-2026-05-07.csv` and record the accepted history exposure.
2. Upload hardening: no exception text in responses with correlation ID and logging (ERR-01), magic-byte file check, PDF timeout and size cap in .NET and the AI service (SEC-02).
3. Local network: 127.0.0.1 binding and Grafana login in `docker-compose.yml`.
4. Sign-in password rules in `supabase/config.toml`, applied before the Supabase Cloud move.
5. Dependency fixes for shipped code, plus a written list of accepted build-time advisories.
6. Low-severity items in one ticket (upload-preview-new, `transaction_embeddings` RLS, `/health`, non-root container, pinned image tags, demo key check).
7. Third-party data note: record the Gemini tier confirmation and the accepted Langfuse exposure.
8. Final re-audit; passes when nothing new appears at medium or above.
