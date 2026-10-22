---
id: PF-148
epic: E-001
flags: [Ready]
---

# PF-148 — Low-severity audit items in one ticket

> **GitHub Issue:** _(create when scheduling)_
> **Status:** To Do
> **Started:** —
> **Epic:** E-001 (slice 6 of 8)
> **Sensitive:** security (auth route, health endpoint, container, history keys).
> **Planned from branch:** main

## Objective

Close the small, mostly mechanical findings from the 2026-10-15 audit in one pass: an unsafe latent upload route, an anonymous health endpoint that reveals internals, an AI service container that runs as root, unpinned monitoring images, and unverified demo keys in git history. The owner decided on 2026-10-22 to fix all of these in one ticket.

## Acceptance Criteria

- [ ] **`upload-preview-new`** (`TransactionsController.cs`, around line 185, with the hard-coded `userId = "default-user"` near line 223): the route is removed if nothing calls it (check `apps/frontend/src` and the e2e specs), otherwise it takes the owner from `ICurrentUser`, never from a literal, and builds the storage path from a generated name (a GUID plus a whitelisted extension), never from the client's file name. If removed, its tests and docs references are removed too.
- [ ] **`/health`** (`Program.cs`, `MapHealthChecks`): the anonymous response is only `{"status":"Healthy"}` (or `Unhealthy`) with an HTTP status. Dependency names and error text move to an authenticated endpoint or to logs. `docker compose` health checks, `npm start` readiness checks and CI still work (check scripts that parse the old JSON).
- [ ] **AI service container**: `services/ai-service/Dockerfile` creates and switches to a non-root user, and the container still starts and passes `/health`. File paths it writes to (for example caches) are writable by that user.
- [ ] **Monitoring images**: the `:latest` tags in `docker-compose.yml` for alloy, prometheus, loki, tempo and grafana are replaced with specific version tags that are currently running successfully (read them from `docker image ls`/`docker compose images`, do not guess), and the versions are noted in `docs/SETUP.md`.
- [ ] **Demo keys in history** (commits `aca5f696`, `1762c8ed`): the executor decodes the JWT header and payload of the keys found there (base64 only, no network, no verification against any service) and records in `docs/reference/accepted-risks.md` whether the issuer is `supabase-demo` (the public local-development key) or something else. If it is something else, stop and report to the owner without printing the key.
- [ ] **`transaction_embeddings` RLS**: already closed by `supabase/migrations/20261015000000_pf_s15_embeddings_owner_read.sql` (RLS enabled, `anon` revoked, owner-read policy). This ticket only confirms it with a one-line check against the local database and records "already done in PF-S15" in the plan notes. No new migration.
- [ ] `dotnet build`, `dotnet test`, `npm run lint`, `npx tsc --noEmit` and `pytest` still pass.

## Approach

Treat the six items as independent, small commits-in-waiting. Prefer deletion over hardening for `upload-preview-new` if it is unused, because dead code with a hard-coded user is the safer thing not to have. Keep the health change minimal: a status-only response writer for the anonymous endpoint, with the detailed report kept behind authentication or available only in Development. For the Dockerfile, add a user and `chown` the app directory. For image tags, read the digests and versions from the running stack rather than choosing new ones. Do not touch the PF-S15 migration.

## Affected Files

| File | Change |
|------|--------|
| `apps/api/src/PersonalFinance.Api/Controllers/TransactionsController.cs` | Edit — remove or fix `upload-preview-new` |
| `apps/api/src/PersonalFinance.Api/Program.cs` | Edit — status-only anonymous `/health` |
| `apps/api/tests/PersonalFinance.Tests/` | Edit — adjust or add tests for the health response and the route removal or fix |
| `services/ai-service/Dockerfile` | Edit — non-root user |
| `docker-compose.yml` | Edit — pin monitoring image versions |
| `docs/SETUP.md` | Edit — list the pinned versions; health response shape |
| `docs/reference/accepted-risks.md` | Edit — result of the demo key check |
| `scripts/` or CI files that read `/health` JSON | Edit only if they parse dependency names |

---

## TODO

### [ ] STEP 1 — Find who uses what
Search for callers of `upload-preview-new`, for consumers of the `/health` JSON (scripts, compose healthchecks, CI, the e2e `health.spec.ts`), and for the AI service Dockerfile's write paths.

> **Why:** Each change is only safe if nothing silently depends on the old behaviour.

### [ ] STEP 2 — Remove or fix `upload-preview-new`
If unused, delete the action and any tests or docs that mention it. If used, replace `"default-user"` with the value from `ICurrentUser` and build the storage name from a GUID plus an extension chosen from the validated content type. Add a test for the chosen route behaviour.

> **Why:** The route is blocked today only by a gate; one gate change would expose a path-traversal-prone name and a fake user.

### [ ] STEP 3 — Slim the health response
Give `/health` a response writer that returns only the overall status. Keep the detailed check available for authenticated callers or Development. Update the e2e health spec and any script to expect the smaller body.

> **Why:** Dependency names and error strings help an attacker map the stack and should not be public.

### [ ] STEP 4 — Non-root AI container
Add `RUN useradd --create-home --uid 10001 app`, `chown` the working directory, and `USER app` to the Dockerfile. Build and run it, and confirm `/health` answers. Rebuild only the `ai-service` container.

> **Why:** A compromise in the Python process should not hand over root in the container. `.claude/rules/docker.md`: rebuild only what changed, no volume removal.

### [ ] STEP 5 — Pin monitoring image versions
Read the versions from the running containers (`docker compose images`, or `docker image inspect`) and put them in `docker-compose.yml` in place of `:latest`. If a container is not running, start it first, never invent a tag.

> **Why:** `:latest` can change under you on the next pull; pinned tags make the stack reproducible and auditable.

### [ ] STEP 6 — Check the demo keys
Show the two commits with `git show <hash> -- <file>` and decode only the header and payload segments of any JWT-looking value locally (for example with a short Node snippet). Record only the issuer and role, never the key. Add the finding to `docs/reference/accepted-risks.md`. If the issuer is not `supabase-demo`, stop and report.

> **Why:** The commit message claims these are public demo keys; the audit could not verify that. Decoding costs nothing and settles it.

### [ ] STEP 7 — Confirm embeddings RLS and run the gates
```bash
psql "<local connection>" -c "select relrowsecurity from pg_class where relname='transaction_embeddings';"
```
Expect `t`. Then run the dotnet, frontend and Python gates. Do not commit.

> **Why:** Confirms finding 10 is closed without adding a duplicate migration.

---

## Notes

- Related: PF-144 adds a shared error helper; if it has landed, use it for any new error response here.
- PF-145 edits the same `docker-compose.yml`. Run this ticket after PF-145 (or rebase) to avoid conflicts.
- The Gemini and Langfuse decision is in a separate ticket (PF-149).

## Execution Notes

Model: **Opus 5.5** · Effort: **high**. Several small security changes across API, container and compose, plus one step that touches key material.
Before you start: PF-145 merged, or be ready to resolve a small compose conflict.

```
/execute plans/in-progress/PF-148-low-severity-audit-items-todo.md
```

### Stop and ask if

- The decoded key issuer is not `supabase-demo`.
- Removing `upload-preview-new` would break a caller you find in the frontend or e2e specs.
