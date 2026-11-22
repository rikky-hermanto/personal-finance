# PF-156 — Deploy Bundle A (Vercel + Cloud Run + Supabase Cloud) with auto deploy on merge

> **GitHub Issue:** (to create: `[PF-156] Deploy Bundle A with auto deploy on merge to main`)
> **Status:** To Do
> **Started:** 2026-11-22
> **Planned from branch:** main
> **Sensitive:** security (first public exposure of the API and AI service, secrets, Supabase Auth settings), schema (migrations auto-applied to the cloud database)
> **Replaces:** PF-122 (Cloudflare + Koyeb + Render, deleted)
> **Board objective:** Put the app on the internet for interview demos at no monthly cost, and redeploy it automatically every time a change lands on main.

## Objective

The app only runs on a laptop today, so it cannot be shown in an interview without screen-sharing a local stack. This task deploys Bundle A from [deployment-hosting-comparison.md](../../docs/ideas/deployment-hosting-comparison.md): the frontend on Vercel Hobby, the .NET API and the Python AI service on Google Cloud Run in Singapore, and the database, Auth and Storage on Supabase Cloud Free in Singapore. After the first deploy, every green CI run on `main` applies pending migrations and redeploys whatever changed, in a fixed order.

The step-by-step commands live in [deployment-bundle-a-runbook.md](../../docs/ideas/deployment-bundle-a-runbook.md). This plan sequences them, adds the code changes with tests, and defines when the work is done.

## Acceptance Criteria

- [ ] `https://<app>.vercel.app` loads, the demo account signs in, and Journey, Cashflow, Assets and Investment pages show synthetic data.
- [ ] A CSV import (`bca-sample.csv`), a PDF upload and one AI chat question all work end to end in the cloud.
- [ ] `GET <api>/health/live` returns 200, and `GET <api>/health` reports Database and AI Service as Healthy, with no Grafana entry.
- [ ] `GET <ai>/mcp/` returns 404 from the public internet.
- [ ] Public signup on the Supabase Cloud project is rejected.
- [ ] Both Cloud Run services run with `max-instances=1`, and a GCP budget alert exists.
- [ ] No secret appears in the repo, the image layers (`appsettings.Development.json`, `.env`), or the workflow logs.
- [ ] Merging a PR that touches only `apps/frontend/` redeploys only the frontend. The `plan` job summary shows `ai-service=false, api=false`.
- [ ] Merging a PR that touches `apps/api/` builds and deploys a new `pf-api` revision tagged with the merge commit SHA, after CI is green.
- [ ] A red CI run on `main` triggers no deploy.
- [ ] Measured cold start and AI service peak RAM are written into the comparison doc in place of the ⚠ guesses.
- [ ] Local `npm start` and `docker compose up` behave exactly as before (Grafana check, OTel export, MCP available when enabled).

## Approach

Ship it in three phases. Phase 1 is one PR of small code changes that make the services safe and honest outside a laptop: a dependency-free liveness endpoint, a Grafana health check that only exists locally, an OTel on/off switch, a closed `/mcp` route, the flashrank model baked into the image, and no dev files in images. Each change keeps the local default unchanged. Phase 2 is owner-run cloud setup and the first manual deploy, because it needs a credit card, dashboards and real secrets. Phase 3 switches on the GitHub Actions workflow that is already written ([deploy.yml](../../.github/workflows/deploy.yml)).

The workflow only swaps container images. Env vars and secrets stay in Cloud Run, set once by hand in Phase 2. Out of scope: Grafana Cloud, Langfuse, Cloud Run IAM invoker between API and AI service, custom domain, and agents (runbook Langkah 16).

## Affected Files

| File | Change |
|------|--------|
| `apps/api/src/PersonalFinance.Api/Program.cs` | Edit — `/health/live`; Grafana check only when configured or in Development; `OTEL_ENABLED` switch |
| `apps/api/tests/PersonalFinance.Tests/Infrastructure/HealthEndpointTests.cs` | Create — liveness and OTel-off startup tests |
| `apps/api/.dockerignore` | Edit — exclude `appsettings.Development.json` |
| `services/ai-service/app/config.py` | Edit — `otel_enabled`, `mcp_enabled`, `flashrank_cache_dir` |
| `services/ai-service/app/main.py` | Edit — gate `/mcp`; wrap OTel setup; pass the flashrank cache dir |
| `services/ai-service/tests/test_pilot_gate.py` | Edit — `/mcp` gate tests |
| `services/ai-service/Dockerfile` | Edit — bake the flashrank model into the image |
| `services/ai-service/.dockerignore` | Create — exclude `.env`, caches, tests, evals |
| `services/ai-service/.env.example` | Edit — document `MCP_ENABLED`, `OTEL_ENABLED` |
| `apps/frontend/vercel.json` | Create — SPA rewrite; Phase 3 adds the `git.deploymentEnabled` block |
| `.github/workflows/deploy.yml` | Already written — auto deploy after green CI on `main` |
| `docs/ideas/deployment-bundle-a-runbook.md` | Already written — commands for every phase |
| `docs/ideas/deployment-hosting-comparison.md` | Edit — measured RAM and cold start (Phase 2) |
| `docs/SETUP.md` | Edit — new flags and the cloud deployment pointer |

---

## TODO

### [x] STEP 0 — Runbook and deploy workflow written

[deployment-bundle-a-runbook.md](../../docs/ideas/deployment-bundle-a-runbook.md) and [deploy.yml](../../.github/workflows/deploy.yml) exist, uncommitted. The workflow is inert until the repository variable `DEPLOY_ENABLED` is `true`.

> **Why:** Recorded so the executor does not rewrite them. Commit them with the Phase 1 PR.
> **Check:** `git status` lists both files.

---

## Phase 1 — Code changes (one PR)

### [ ] STEP 1 — API: liveness endpoint and a Grafana check that only exists locally

In `Program.cs`, replace the health-check registration (currently lines 106–113):

```csharp
var healthChecks = builder.Services.AddHealthChecks()
    .AddNpgSql(connectionString, name: "Database")
    .AddUrlGroup(new Uri($"{builder.Configuration["AiService:BaseUrl"] ?? "http://localhost:8000"}/health"), name: "AI Service");

// Grafana only exists in the local monitoring stack; in the cloud the check would always fail.
var grafanaHealthUrl = builder.Configuration["Monitoring:GrafanaHealthUrl"]
    ?? (builder.Environment.IsDevelopment() ? "http://localhost:3000/api/health" : null);
if (!string.IsNullOrWhiteSpace(grafanaHealthUrl))
    healthChecks.AddUrlGroup(new Uri(grafanaHealthUrl), name: "Grafana Monitoring");
```

Next to the existing `/health` mapping, add:

```csharp
// Liveness for platforms and smoke tests: runs no checks, so it never depends on the DB or AI service.
app.MapHealthChecks("/health/live", new HealthCheckOptions { Predicate = _ => false }).AllowAnonymous();
```

> **Why:** In Production the Grafana check made `/health` permanently Unhealthy. FIN-04 applies in spirit: a red status that is always red tells the owner nothing. `/health/live` is what `deploy.yml` smoke-tests. `/health/live` is outside `/api`, so the pilot middleware already lets it through.
> **Check:** `dotnet run` locally and `curl http://localhost:7208/health` still lists Grafana Monitoring. `curl http://localhost:7208/health/live` returns `Healthy`.

---

### [ ] STEP 2 — API: OTel on/off switch

Wrap the whole OpenTelemetry block (`AddOpenTelemetry()` and `builder.Logging.AddOpenTelemetry(...)`) in:

```csharp
// Source: OTel spec env var OTEL_SDK_DISABLED has the same intent; a named flag keeps the local default on.
if (builder.Configuration.GetValue("OTEL_ENABLED", true))
{
    // ...existing OpenTelemetry tracing, metrics and logging setup, unchanged...
}
```

> **Why:** Cloud Run has no collector at `localhost:4317`, so the exporters would retry and spam error logs. The default stays `true`, so `npm start` and compose need no change. Grafana Cloud export (OTLP over HTTP with TLS) is Langkah 16, out of scope.
> **Check:** `OTEL_ENABLED=false dotnet run` starts with no OTLP export errors in the console.

---

### [ ] STEP 3 — API: tests for STEP 1 and STEP 2

Create `apps/api/tests/PersonalFinance.Tests/Infrastructure/HealthEndpointTests.cs`. Reuse the `WebApplicationFactory<PersonalFinance.Api.Program>` configuration pattern from `Authentication/CashflowPilotBoundaryTests.cs`, with `OTEL_ENABLED=false` in the in-memory config.

```csharp
[Fact]
public async Task HealthLive_NoToken_ReturnsOk()
// GET /health/live without a bearer token returns 200 and body "Healthy".

[Fact]
public async Task Startup_OtelDisabled_ServesRequests()
// With OTEL_ENABLED=false the host builds and /health/live answers 200.
```

> **Why:** TEST-01 and TEST-02. The liveness route is what the deploy pipeline relies on, so a regression there would break every deploy silently.
> **Check:** `dotnet test PersonalFinance.slnx --filter HealthEndpointTests` passes.

---

### [ ] STEP 4 — AI service: close `/mcp` unless explicitly enabled

In `config.py`, add:

```python
# PF-156: the MCP SSE sub-app reads owner transactions. Off unless explicitly enabled,
# and when on it still requires the internal API key.
mcp_enabled: bool = False
otel_enabled: bool = True
flashrank_cache_dir: str = "/tmp/flashrank"
```

In `main.py`, change the first branch of `pilot_access_gate`:

```python
if request.url.path == "/health":
    return await call_next(request)
if request.url.path == "/mcp" or request.url.path.startswith("/mcp/"):
    if not settings.mcp_enabled:
        return JSONResponse({"detail": "Not found"}, status_code=404)
    supplied = request.headers.get("x-internal-api-key", "")
    if not settings.internal_api_key or not secrets.compare_digest(supplied, settings.internal_api_key):
        return JSONResponse({"detail": "Internal authentication required"}, status_code=401)
    return await call_next(request)
```

Keep `app.mount("/mcp", _mcp_app)` and its lifespan wiring as they are, because the gate runs before the mount.

> **Why:** Today `/mcp` bypasses all authentication, and its tools query the owner's transactions. On a public Cloud Run URL that is a data leak. This is the one change in the plan that must not slip.
> **Check:** STEP 5 tests pass.

---

### [ ] STEP 5 — AI service: `/mcp` gate tests

Add to `tests/test_pilot_gate.py`:

```python
@pytest.mark.asyncio
async def test_mcp_closed_by_default(monkeypatch):
    monkeypatch.setattr(settings, "mcp_enabled", False)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        assert (await client.get("/mcp/")).status_code == 404
        assert (await client.get("/mcp")).status_code == 404


@pytest.mark.asyncio
async def test_mcp_enabled_requires_internal_key(monkeypatch):
    monkeypatch.setattr(settings, "mcp_enabled", True)
    monkeypatch.setattr(settings, "internal_api_key", "test-internal-key")
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        assert (await client.get("/mcp/")).status_code == 401
        assert (await client.get("/mcp/", headers={"X-Internal-Api-Key": "wrong"})).status_code == 401
```

> **Why:** Proves the closed default and the key requirement without opening an SSE stream. The authenticated happy path is checked by hand in STEP 9, because it starts a long-lived stream.
> **Check:** `python -m pytest -q tests/test_pilot_gate.py` passes.

---

### [ ] STEP 6 — AI service: OTel switch and flashrank cache dir

In `main.py`, wrap the tracing and metrics setup (the `TracerProvider` through `metrics.set_meter_provider(...)` lines) in `if settings.otel_enabled:`. Leave `LoggingInstrumentor` and `FastAPIInstrumentor` as they are, because without a provider they use the no-op tracer.

Change the reranker construction in `lifespan`:

```python
app.state.reranker = RerankerService(cache_dir=settings.flashrank_cache_dir)
```

> **Why:** Same reason as STEP 2. The cache dir is the seam the Dockerfile uses in STEP 7.
> **Check:** `python -m pytest -q` passes in full. `OTEL_ENABLED=false uvicorn app.main:app` starts without OTLP export errors.

---

### [ ] STEP 7 — Images: bake the model and keep dev files out

In `services/ai-service/Dockerfile`, after `RUN pip install --no-cache-dir .`:

```dockerfile
# PF-156: Cloud Run's /tmp lives in RAM and is wiped on every cold start; ship the model in the image.
ENV FLASHRANK_CACHE_DIR=/opt/flashrank
RUN python -c "from flashrank import Ranker; Ranker(model_name='ms-marco-MiniLM-L-12-v2', cache_dir='/opt/flashrank')"
```

Create `services/ai-service/.dockerignore`:

```text
.env
.venv/
**/__pycache__/
tests/
evals/
```

Append to `apps/api/.dockerignore`:

```text
**/appsettings.Development.json
```

> **Why:** The model download cost RAM and seconds on every cold start. `COPY . .` in the API Dockerfile copied `appsettings.Development.json`, and `dotnet publish` then shipped it in the image (SEC-01).
> **Check:** `docker build -t pf-ai services/ai-service` succeeds and `docker run --rm pf-ai ls /opt/flashrank` lists the model folder. `docker build -t pf-api apps/api` succeeds and `docker run --rm --entrypoint ls pf-api /app` shows no `appsettings.Development.json`.

---

### [ ] STEP 8 — Frontend SPA fallback and docs

Create `apps/frontend/vercel.json`:

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

In `services/ai-service/.env.example`, add `MCP_ENABLED=false` and `OTEL_ENABLED=true`, each with a one-line comment. In [docs/SETUP.md](../../docs/SETUP.md), add the three new flags (`OTEL_ENABLED`, `MCP_ENABLED`, `Monitoring:GrafanaHealthUrl`) and a pointer to the runbook.

> **Why:** Deep links such as `/cashflow` 404 on refresh without the rewrite. The `git.deploymentEnabled` block is not added yet, because Phase 2's first Vercel import needs git deploys on.
> **Check:** `npm run build` in `apps/frontend` still passes.

---

### [ ] STEP 9 — Phase 1 gate

```bash
# from repo root; ci-check skill runs all CI gates
/ci-check
```

Then run the stack locally with `npm start` and confirm that nothing changed: `/health` lists Grafana, traces still reach local Grafana, and with `MCP_ENABLED=true` plus the header, an MCP client can connect to `http://localhost:8000/mcp/`. Open the PR with STEP 0 to STEP 8, merge it after review, then measure RAM (runbook Langkah 2) on the merged image.

> **Why:** CI-01. Every Phase 1 change is meant to be invisible locally, and this is where that gets proven.
> **Check:** All gates are green, the local smoke passes, and the RAM idle and peak numbers are recorded.

---

## Phase 2 — Cloud setup and first manual deploy (owner-run)

These steps need the owner's accounts, card and dashboards. An agent can run the `gcloud` and `supabase` commands once the owner has logged in, but cannot click through dashboards or enter the card.

### [ ] STEP 10 — Supabase Cloud project, schema and Auth

Follow runbook Langkah 3: create the project in Singapore, run `supabase link` and `supabase db push`, turn off signup and anonymous sign-ins, set the password policy, and record the URL, keys, JWT key type and session pooler string.

> **Why:** Auth settings in `config.toml` do not travel with `db push`. With signup left on, anyone can create an account and spend the LLM quota.
> **Check:** The dashboard shows the app tables, the `bank-statements` bucket and the `vector` extension. `POST /auth/v1/signup` with the anon key is rejected.

---

### [ ] STEP 11 — GCP project, budget, registry and secrets

Follow runbook Langkah 4 and 5: billing link, enabled APIs, the $2 budget alert, the Artifact Registry repo with its cleanup policy, the `pf-run` service account, and the six Secret Manager secrets. Use fresh random values for the internal key and the signing secret.

> **Why:** The budget alert and registry cleanup go in before any resource runs. Secrets never sit in the repo or in shell history.
> **Check:** `gcloud secrets list` shows six secrets, and `gcloud billing budgets list` shows the budget.

---

### [ ] STEP 12 — First manual deploy of the AI service and API

Follow runbook Langkah 6 to 8, using the full commit SHA as the image tag. Set `OTEL_ENABLED: "false"` in both env files, with `--memory` for `pf-ai` from the STEP 9 measurement. Deploy `pf-ai` first, then `pf-api`.

> **Why:** `deploy.yml` only swaps images and fails when a service does not exist yet. The full-SHA tag is what its `plan` job diffs against.
> **Check:** `curl <ai>/health` returns 200 and `curl <ai>/mcp/` returns 404. `curl <api>/health/live` returns 200, and `curl <api>/health` shows Database and AI Service Healthy.

---

### [ ] STEP 13 — Vercel, CORS and Auth URLs

Follow runbook Langkah 9 and 10: import the repo with Root Directory `apps/frontend` and the `VITE_*` env vars, then set `Cors__AllowedOrigins__0` on `pf-api` and the Supabase Site URL and Redirect URLs to the production domain.

> **Why:** The Vercel domain is only known after import, so CORS and Auth URLs close the loop last.
> **Check:** The sign-in page loads on the Vercel domain, and the browser console shows no CORS error after sign-in.

---

### [ ] STEP 14 — Demo account, synthetic data and smoke test

Follow runbook Langkah 11 and 12. Create the demo user, load category rules, import synthetic CSVs, and add assets, liabilities and investments until L1 to L3 and at least one quest show. Then run the smoke table and record cold start and RAM in the comparison doc.

> **Why:** Real bank statements never go to this deployment (Gemini free tier may train on inputs, PF-149). The measured numbers replace the ⚠ guesses that drove the bundle choice.
> **Check:** Every row in the runbook's smoke table passes, and the comparison doc has real numbers.

---

## Phase 3 — Auto deploy on merge to `main`

### [ ] STEP 15 — Workload Identity Federation and GitHub settings

Follow runbook Langkah 15b and 15d: the `pf-deployer` service account with `run.developer`, `artifactregistry.writer` and `serviceAccountUser` on `pf-run`; the OIDC pool restricted to this repo and `refs/heads/main`; the `production` environment with no required reviewers; and its variables and secrets. Set `DEPLOY_ENABLED=true` last.

> **Why:** No JSON key exists to leak. The attribute condition keeps branches and forks from deploying.
> **Check:** `gh variable list --env production` shows six variables and `gh secret list --env production` shows two secrets.

---

### [ ] STEP 16 — Hand frontend deploys to the workflow

Add the `git` block to `apps/frontend/vercel.json` (runbook Langkah 15c) in a small PR:

```json
{
  "git": { "deploymentEnabled": { "main": false } },
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

> **Why:** Otherwise Vercel ships the frontend on push, before CI passes and before a new API is live. PR previews stay on.
> **Check:** After the merge, the Vercel dashboard shows a deployment made by the CLI from Actions, and none from the git integration for that commit.

---

### [ ] STEP 17 — Prove the pipeline

1. Run Actions > Deploy > Run workflow with `force` ticked. Every job must go green.
2. Merge a frontend-only PR. The `plan` summary must show `ai-service=false, api=false, frontend=true`.
3. Merge a trivial `apps/api/` change. A new `pf-api` revision must be tagged with the merge SHA.
4. Push a deliberately failing test on a branch, confirm CI fails on the PR, and close the PR without merging. Then confirm in the Actions history that no Deploy run started after any red CI run on `main`.

Fix anything in `deploy.yml` that fails on first contact. Two things are unverified: whether `vercel build` from the repo root honors the Root Directory setting, and whether `supabase db push --yes` works on the installed CLI version.

> **Why:** The acceptance criteria about auto deploy can only be proven by real merges.
> **Check:** All four outcomes are observed. Move this plan to `plans/done/` and tick the acceptance criteria.

---

## Notes

- **Migrations run before code.** Every migration must work with the code that is still running. Split destructive changes (drop or rename) into an expand PR and a later contract PR. Rollback of a migration is a new migration, never a manual edit.
- **Paused Supabase.** The Free project pauses after 7 idle days, and `migrate` then fails. Resume the project and re-run. The runbook's pre-interview ritual (Langkah 14) covers demo days.
- **Config is not in git.** Env vars live in Cloud Run and change through `gcloud run services update`. The values used are recorded in the runbook's env files. Moving config into the workflow is a possible follow-up, not part of this plan.
- **Possible small costs ⚠.** Artifact Registry storage above 0.5 GB (the AI image is probably over 1 GB), more than six active secrets, and Cloud Build minutes. Check billing after the first week.
- **The local MCP client now needs the header** when `INTERNAL_API_KEY` is set locally (`x-internal-api-key`). MCP Inspector supports custom headers.
- **Gemini key** comes from an AI Studio project without billing, so overuse hits rate limits, not a bill. FIN-05 and FIN-06 are unchanged by this plan: no new financial output and no new rates reach users.

## Execution Notes

### Phase 1 — Code changes

Model: **Opus 5.5** · Effort: **high**. STEP 4 closes a data leak on a public URL. A wrong guess there is silent.
Before you start: branch off `main`, because STEP 0 files are uncommitted on `main`.

```
/execute plans/in-progress/PF-156-deploy-bundle-a-auto-deploy-todo.md phase 1
```

### Phase 2 — Cloud setup and first manual deploy

Model: **Sonnet 5.5** · Effort: **medium**. Mostly running commands from the runbook. The owner does the dashboard and card steps.
Before you start: the Phase 1 PR is merged, and the owner is logged in with `gcloud auth login` and `supabase login`.

```
/execute plans/in-progress/PF-156-deploy-bundle-a-auto-deploy-todo.md phase 2
```

### Phase 3 — Auto deploy

Model: **Sonnet 5.5** · Effort: **high**. Workflow debugging on first contact, plus IAM bindings.
Before you start: STEP 14 smoke test passes.

```
/execute plans/in-progress/PF-156-deploy-bundle-a-auto-deploy-todo.md phase 3
```

### Stop and ask if

- The AI service peak RAM exceeds 2 GiB, which changes the Cloud Run sizing and possibly the bundle choice.
- `supabase db push` against the cloud project wants to apply a migration that drops or rewrites data.
- Any step would put a real bank statement or a real credential into the cloud deployment.
