# PF-AI012 — Deployment & LLMOps (Public URL, CI/CD Ship Stage, Caching, Cost Story)

> **Learning Phase:** Phase 3 · Chapter 9.75 (after PF-AI011, before Ch10 Positioning) · Day ~80+ of 90
> **Status:** To Do
> **Started:** —
> **Planned from branch:** main
> **Depends on:** PF-AI011 merged (never expose an unguarded `/ask` publicly with a paid LLM key)
> **Pivot goal:** "Actually ship" is the final hiring criterion — a model on localhost is a notebook with extra steps. This chapter puts the AI service on a public URL behind real cost controls, adds the CD half that CI has always been missing, and ships a response cache that attacks the exact quota wall (Gemini 20 req/day) that has blocked three chapters' evals. The deliverable: a live URL, a deploy pipeline, and a one-page cost story.

# 📑 Table of Contents

- [📖 Introduction](#-introduction)
  - [High level — what is this?](#high-level--what-is-this)
  - [From localhost to a URL](#from-localhost-to-a-url)
  - [CI that tests vs CD that ships](#ci-that-tests-vs-cd-that-ships)
  - [Caching — the cheapest LLM call is the one you don't make](#caching--the-cheapest-llm-call-is-the-one-you-dont-make)
  - [Guarding a public endpoint with a paid key behind it](#guarding-a-public-endpoint-with-a-paid-key-behind-it)
  - [📚 Resources / Theory to Learn](#-resources--theory-to-learn)
  - [🧠 Learning Strategy](#-learning-strategy)
- [🔧 Implementation](#-implementation)
  - [🎯 Objective](#-objective)
  - [✅ Acceptance Criteria](#-acceptance-criteria)
  - [🧭 Approach](#-approach)
  - [📂 Affected Files](#-affected-files)
  - [📋 TODO](#-todo)
    - [STEP 0 — Theory gate: Container Apps + caching concepts (1h)](#--step-0--theory-gate-container-apps--caching-concepts-1h)
    - [STEP 1 — Harden the AI service Dockerfile for production](#--step-1--harden-the-ai-service-dockerfile-for-production)
    - [STEP 2 — API-key middleware + rate limiting](#--step-2--api-key-middleware--rate-limiting)
    - [STEP 3 — Response cache: `response_cache.py`](#--step-3--response-cache-response_cachepy)
    - [STEP 4 — Provider fallback drill: prove Gemini→Anthropic failover](#--step-4--provider-fallback-drill-prove-geminianthropic-failover)
    - [STEP 5 — Supabase Cloud project with anonymized fixture data](#--step-5--supabase-cloud-project-with-anonymized-fixture-data)
    - [STEP 6 — Provision Azure: ACR + Container Apps (scale-to-zero)](#--step-6--provision-azure-acr--container-apps-scale-to-zero)
    - [STEP 7 — CD workflow: `deploy-ai-service.yml`](#--step-7--cd-workflow-deploy-ai-serviceyml)
    - [STEP 8 — Public smoke test: latency, cold start, cache hit](#--step-8--public-smoke-test-latency-cold-start-cache-hit)
    - [STEP 9 — The cost story: budget alert + `cost-story.md`](#--step-9--the-cost-story-budget-alert--cost-storymd)
    - [STEP 10 — README: live URL + deploy badge](#--step-10--readme-live-url--deploy-badge)
    - [STEP 11 — Commit + log progress](#--step-11--commit--log-progress)
  - [📌 Notes](#-notes)
  - [📝 Knowledge Check](#-knowledge-check)

# 📖 Introduction

> Read this before the implementation steps. The goal is to *understand* the concept by watching
> it evolve from the dumbest version to the one you'll ship — not to memorize jargon up front.

## High level — what is this?

Everything built in Chapters 1–9 runs on `localhost`. This chapter moves one service — the Python
AI service — onto the public internet the way a production team would: a hardened container image,
pushed to a registry by CI, deployed by a pipeline (not by hand), talking to a cloud Postgres with
*anonymized* data, gated by an API key and a rate limit, with a cache in front of the paid LLM
calls and a monthly budget alarm behind them. The output is the one thing the portfolio is missing:
a URL another human can visit.

```
git push main ──▶ CI gates (build/test/lint/gitleaks) ──▶ build image ──▶ ACR
                                                                          │
                                              az containerapp update ◀────┘
                                                        │
   curl https://pf-ai.<region>.azurecontainerapps.io ───▶ [API key + rate limit]
                                                        │
                                          [response cache] ── hit ──▶ answer (0 LLM cost)
                                                        │ miss
                                          Supabase Cloud (pgvector, anonymized fixtures)
                                                        │
                                          Gemini ──(429/error)──▶ Anthropic fallback
```

## From localhost to a URL

**`uvicorn` on your machine.** The AI service runs fine locally, and `docker compose` even gives
it a production-shaped container. Everything works — for an audience of exactly one.

For a hiring pipeline that's a dead end: "deployed" is the filter, and a laptop can't answer a
recruiter's click at 2 AM. The tempting shortcut is a tunnel (ngrok, cloudflared) — a public URL
in thirty seconds. But the URL dies with your laptop lid, there's no deploy pipeline behind it,
and everyone interviewing you knows it. A tunnel is a demo, not a deployment.

**A VM you SSH into.** Rent a box, `git pull`, restart the process. Real URL, survives your
laptop. Now you own OS patching, a reverse proxy, TLS renewal — and every deploy is you SSHing in
and hoping you remember the steps. Deployment knowledge that transfers to interviews is about
*systems*, not about your ability to babysit one Ubuntu box.

**Container platform with scale-to-zero.** Hand the platform your image and it owns TLS, ingress,
restarts, and replicas. **Azure Container Apps** is the fit here: it runs any Docker image,
scales to zero when idle (an AI demo app is idle ~99% of the time — you pay cents, not a
monthly VM fee), and it's Azure — the project's stated cloud target and your existing depth,
which turns this chapter into portfolio evidence for Azure-stack roles too. The cost of
scale-to-zero is a **cold start**: the first request after idle waits for a container to spin up.
For a demo endpoint that's a fine trade — and STEP 8 *measures* it instead of hand-waving it.
*This is what ships.*

▶ **Read for this concept:** [Azure Container Apps overview](https://learn.microsoft.com/en-us/azure/container-apps/overview) + [scale rules](https://learn.microsoft.com/en-us/azure/container-apps/scale-app)

## CI that tests vs CD that ships

**CI gates on every PR.** GitHub Actions already runs the six CI-01 gates — build, test, lint,
`tsc`, gitleaks. Nothing broken merges. But notice what happens after the merge: nothing. The
pipeline proves the code *could* ship and then ships nothing; deployment would be a manual step,
which means drift — the deployed thing slowly stops matching `main` because a human forgot a step.

**A deploy job that runs on merge.** Extend the same Actions setup with a `deploy` workflow: on
push to `main`, after the gates pass, build the image, push it to **Azure Container Registry**,
and point the Container App at the new tag. The deployed service now provably *is* `main` — the
image tag is the commit SHA, so every running container traces back to an exact commit. Auth from
GitHub to Azure uses **OIDC federation** (GitHub mints a short-lived token Azure trusts) instead
of a long-lived service-principal secret sitting in repo settings — the same "no durable secrets"
habit PF-AI011 just installed, applied to CI. *This is what ships.*

▶ **Read for this concept:** [Deploy to Azure Container Apps from GitHub Actions](https://learn.microsoft.com/en-us/azure/container-apps/github-actions) + [GitHub OIDC to Azure](https://learn.microsoft.com/en-us/azure/developer/github/connect-from-azure-openid-connect)

## Caching — the cheapest LLM call is the one you don't make

**Every request hits the LLM.** Ask "berapa total pengeluaran makan bulan Maret?" twice and you
pay Gemini twice for byte-identical work. Locally that always felt free — until it wasn't: the
free tier's 20 requests/day quota has now blocked PF-AI005-PART2's numeric eval, Chapter 7's
smoke test (Day 71 *and* Day 74), and stalled sessions for days at a time. On a public URL the
same waste compounds: every visitor demo burns quota, and repeated queries are the *norm* for a
demo (everyone tries the example prompts).

**Exact-match response cache.** Before calling the LLM, hash the normalized request (query +
filters + provider + prompt version) and look it up in an in-memory TTL cache. Hit → return the
stored answer in ~1ms at zero LLM cost, tagged `cache.hit` in Langfuse so the hit rate is a
dashboard number. Miss → generate, store, return. A ~1h TTL keeps answers fresh enough for a
demo dataset that only changes when you reseed it. In-memory (not Redis, not Postgres) is the
deliberate scope: one replica, demo traffic — a cache *table* is infrastructure this chapter
doesn't need.

The honest limitation: exact-match only. "total makan Maret" and "berapa sih makan bulan Maret"
miss each other despite meaning the same thing.

> **Teaser, not taught here:** semantic caching (embed the query, serve a cached answer above a
> similarity threshold) fixes paraphrase misses, and provider-side **prompt caching** (Anthropic
> caches your static system prompt server-side and discounts those tokens) attacks the input-token
> bill instead of the whole call. Both are month-4 material; the exact-match cache is the 80/20.

▶ **Read for this concept:** [cachetools docs](https://cachetools.readthedocs.io/) (TTLCache) + [Anthropic prompt caching](https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching) (read to understand the teaser, not to build it)

## Guarding a public endpoint with a paid key behind it

**Just make it public.** The URL works, anyone can try the demo. Anyone includes scripts: a
public endpoint that spends your Gemini/Anthropic budget on every request is a wallet with an
open API. This isn't hypothetical abuse-hardening — it's the LLMOps twin of PF-AI011's security
work: there, the attacker wanted your data; here, they want your invoice.

**Three cheap layers.** An **API-key check** (a single demo key in an env var, checked by
middleware — `/health` stays open so the platform probe and the status page work) keeps drive-by
scripts out. A **rate limit** (per-IP, via `slowapi`) caps what any one caller can burn. An
**Azure budget alert** (email at 50%/90% of a small monthly cap) is the backstop for everything
the first two miss. None of these is auth — PF-S08 stays the real auth story; this is cost
control for a demo surface, and the threat model says so. *This is what ships.*

▶ **Read for this concept:** [slowapi docs](https://slowapi.readthedocs.io/) + [Azure budgets & alerts](https://learn.microsoft.com/en-us/azure/cost-management-billing/costs/tutorial-acm-create-budgets)

## 📚 Resources / Theory to Learn

Read in full before `# 🔧 Implementation`:

| Resource | What it teaches | Time |
|----------|----------------|------|
| [Azure Container Apps overview + quickstart](https://learn.microsoft.com/en-us/azure/container-apps/overview) | The platform model: environments, revisions, ingress, scale-to-zero | 1h |
| [Deploy to Container Apps from GitHub Actions](https://learn.microsoft.com/en-us/azure/container-apps/github-actions) | The CD wiring STEP 7 implements | 30m |
| [GitHub OIDC → Azure](https://learn.microsoft.com/en-us/azure/developer/github/connect-from-azure-openid-connect) | Secretless CI auth (federated credentials) | 30m |
| [cachetools — TTLCache](https://cachetools.readthedocs.io/) | The 30-line cache STEP 3 wraps | 15m |
| [slowapi](https://slowapi.readthedocs.io/) | Per-IP rate limiting for FastAPI | 15m |
| [Docker — non-root containers](https://docs.docker.com/develop/develop-images/instructions/#user) | Why STEP 1 adds a `USER` line | 15m |
| [Anthropic prompt caching](https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching) | The provider-side caching teaser — know it exists and what it discounts | 20m |

## 🧠 Learning Strategy

- **Deploy something ugly on day one.** Get *any* revision live in STEP 6 before polishing —
  a running `/health` on a real URL changes your relationship to every later step (each becomes
  "improve the live thing," which is the actual job).
- **Numbers, as always:** cold-start seconds, warm p50/p95, cache hit rate, cost/request,
  projected monthly bill. STEP 8–9 exist to harvest them; the cost story is a table, not prose.
- **Same-day rule holds.** Each step lands as a commit; the deploy workflow means commits become
  deployments — feel that loop, it's the point of the chapter.
- **Anti-pattern to avoid:** cloud sprawl. One resource group, one container app, one registry,
  scale-to-zero, budget alarm. If the monthly projection exceeds a few dollars idle, something
  is misconfigured — find it, don't shrug.
- **Anti-pattern to avoid:** deploying real financial data. The cloud DB gets the *anonymized
  eval fixtures only* — the same PF-126/127 discipline, applied forward.

# 🔧 Implementation

## 🎯 Objective

Put the AI service on a public URL via Azure Container Apps with scale-to-zero, deployed by a
GitHub Actions CD workflow (OIDC, image tag = commit SHA), backed by a Supabase Cloud project
seeded with anonymized fixtures, protected by API-key + rate-limit + budget-alert cost controls,
and fronted by an exact-match response cache with a measured hit rate. Write the cost story.

## ✅ Acceptance Criteria

- [ ] `https://<app>.azurecontainerapps.io/health` returns 200 from the public internet
- [ ] `/ask` works end-to-end against Supabase Cloud fixture data with a valid `X-API-Key`; returns 401 without it; `/health` needs no key
- [ ] Rate limit: >30 req/min from one IP → 429
- [ ] Response cache: repeated identical `/ask` returns in <100ms with a `cache.hit` Langfuse tag; hit rate visible in Langfuse
- [ ] Provider fallback proven: with the Gemini key invalidated, `/ask` still answers via Anthropic (or degrades with the documented 502, if no funded key)
- [ ] Push to `main` → CI gates → image in ACR tagged with commit SHA → new Container Apps revision, no manual step
- [ ] No long-lived cloud secret in GitHub: OIDC federated credential only
- [ ] Azure budget alert configured (small monthly cap, alert at 50%/90%)
- [ ] Cold start, warm p50/p95, cache hit rate, and cost/request recorded in [cost-story.md](../../../docs/deployment/cost-story.md)
- [ ] README carries the live URL + deploy badge

## 🧭 Approach

Azure Container Apps + CI ship stage (winning approach). Order: local hardening first (STEPs
1–4 all testable without a cloud account), then cloud provisioning (STEPs 5–6), then automation
(STEP 7), then measurement (STEPs 8–9). The .NET API and frontend deliberately stay local —
one service is enough to prove the skill, and the API has no auth until PF-S08. Data in the
cloud is anonymized fixtures only.

## 📂 Affected Files

| File | Change |
|------|--------|
| [Dockerfile](../../../services/ai-service/Dockerfile) | Edit — non-root user, healthcheck, slim final stage |
| [auth.py](../../../services/ai-service/app/middleware/auth.py) | Create — API-key middleware (env `DEMO_API_KEY`; `/health` exempt) |
| [response_cache.py](../../../services/ai-service/app/services/response_cache.py) | Create — TTLCache wrapper keyed on normalized request hash |
| [main.py](../../../services/ai-service/app/main.py) | Edit — register middleware, rate limiter, cache in `/ask`; `cache.hit` tag |
| [config.py](../../../services/ai-service/app/config.py) | Edit — `DEMO_API_KEY`, `RATE_LIMIT`, `CACHE_TTL_SECONDS`, `CACHE_MAXSIZE` |
| [test_auth.py](../../../services/ai-service/tests/test_auth.py) | Create — key required / exempt paths / bad key |
| [test_response_cache.py](../../../services/ai-service/tests/test_response_cache.py) | Create — hit, miss, TTL expiry, key normalization |
| [deploy-ai-service.yml](../../../.github/workflows/deploy-ai-service.yml) | Create — build → ACR → `az containerapp update`, OIDC |
| [cost-story.md](../../../docs/deployment/cost-story.md) | Create — the measured cost narrative |
| [README.md](../../../README.md) | Edit — live URL + deploy badge |

## 📋 TODO

### [ ] STEP 0 — Theory gate: Container Apps + caching concepts (1h)

Read the Resources table. Then answer from recall in the progress log:

1. What do you trade for scale-to-zero, and how will you measure it?
2. Why is OIDC federation preferred over a service-principal secret in repo settings?
3. Why does the response cache key include the prompt version, not just the query?

> **Why:** Question 3 is the subtle one — a cache that survives a prompt change serves answers
> the *old* prompt generated, which is a silent-staleness bug indistinguishable from a model
> regression. Feel it now, not in production.

### [ ] STEP 1 — Harden the AI service Dockerfile for production

Edit [Dockerfile](../../../services/ai-service/Dockerfile):

```dockerfile
FROM python:3.12-slim AS runtime
WORKDIR /app
COPY pyproject.toml .
RUN pip install --no-cache-dir .
COPY app/ app/

# Run as non-root: a container compromise shouldn't hand out root in the container.
RUN useradd --create-home --uid 1001 appuser
USER appuser

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')"
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

Verify locally: `docker build -t pf-ai-service services/ai-service && docker run -p 8000:8000 --env-file services/ai-service/.env pf-ai-service` → `/health` 200, `whoami` inside the container prints `appuser`.

> **Why:** Container Apps will run whatever you give it — the hardening (non-root, healthcheck,
> no build tools in the final layer) is your job, not the platform's. The healthcheck doubles as
> the liveness signal the platform uses to restart a wedged replica.

### [ ] STEP 2 — API-key middleware + rate limiting

```bash
cd services/ai-service && pip install slowapi && # add to pyproject.toml
```

Create [auth.py](../../../services/ai-service/app/middleware/auth.py):

```python
"""Demo API-key gate. NOT auth (PF-S08 owns real auth) — cost control for a public surface."""
from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

EXEMPT_PATHS = {"/health", "/docs", "/openapi.json"}

class ApiKeyMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, api_key: str):
        super().__init__(app)
        self._api_key = api_key

    async def dispatch(self, request: Request, call_next):
        if request.url.path in EXEMPT_PATHS or not self._api_key:
            return await call_next(request)  # empty key = local dev, gate off
        if request.headers.get("X-API-Key") != self._api_key:
            return JSONResponse(status_code=401, content={"detail": "invalid_api_key"})
        return await call_next(request)
```

Wire in [main.py](../../../services/ai-service/app/main.py): register the middleware with
`settings.demo_api_key`, and add `slowapi`'s `Limiter` with a `30/minute` default on `/ask`
and `/ask/stream`.

**C# equivalent** (Starlette `BaseHTTPMiddleware` → ASP.NET Core middleware with `RequestDelegate`; the constructor-injected key → options pattern):

```csharp
public class ApiKeyMiddleware(RequestDelegate next, IOptions<DemoAuthOptions> options)
{
    private static readonly HashSet<string> ExemptPaths = ["/health", "/docs"];

    public async Task InvokeAsync(HttpContext context)
    {
        var key = options.Value.ApiKey;
        if (ExemptPaths.Contains(context.Request.Path.Value ?? "") || string.IsNullOrEmpty(key))
        {
            await next(context);
            return;
        }
        if (context.Request.Headers["X-API-Key"] != key)
        {
            context.Response.StatusCode = StatusCodes.Status401Unauthorized;
            await context.Response.WriteAsJsonAsync(new { detail = "invalid_api_key" });
            return;
        }
        await next(context);
    }
}
```

> **Why:** The empty-key-disables-gate behavior keeps local dev and the existing test suite
> untouched — the gate only exists where `DEMO_API_KEY` is set (the cloud). Naming it a *cost
> control, not auth* in the docstring keeps PF-S08's scope honest.

### [ ] STEP 3 — Response cache: `response_cache.py`

```bash
pip install cachetools  # add to pyproject.toml
```

Create [response_cache.py](../../../services/ai-service/app/services/response_cache.py):

```python
"""Exact-match TTL response cache for /ask. In-memory by design: one replica, demo traffic."""
import hashlib
import json
from cachetools import TTLCache

PROMPT_VERSION = "ask-v3"  # bump whenever the answer prompt changes — invalidates the cache

class ResponseCache:
    def __init__(self, maxsize: int = 256, ttl_seconds: int = 3600):
        self._cache: TTLCache[str, dict] = TTLCache(maxsize=maxsize, ttl=ttl_seconds)

    @staticmethod
    def make_key(query: str, category: str | None, provider: str) -> str:
        payload = json.dumps(
            {"q": query.strip().lower(), "cat": category, "p": provider, "v": PROMPT_VERSION},
            sort_keys=True,
        )
        return hashlib.sha256(payload.encode()).hexdigest()

    def get(self, key: str) -> dict | None:
        return self._cache.get(key)

    def put(self, key: str, response: dict) -> None:
        self._cache[key] = response
```

Wire into `/ask` in [main.py](../../../services/ai-service/app/main.py): check before the
pipeline, store after; on a hit, tag the Langfuse trace `cache.hit` (miss → `cache.miss`) so hit
rate is queryable. `/ask/stream` stays uncached this chapter (streaming a stored answer is a
different pattern — note it as a teaser).

**C# equivalent** (cachetools `TTLCache` → `Microsoft.Extensions.Caching.Memory.MemoryCache` with `AbsoluteExpirationRelativeToNow`; `hashlib.sha256` → `SHA256.HashData`):

```csharp
public class ResponseCache(IMemoryCache cache)
{
    private const string PromptVersion = "ask-v3";
    private static readonly TimeSpan Ttl = TimeSpan.FromHours(1);

    public static string MakeKey(string query, string? category, string provider)
    {
        var payload = JsonSerializer.Serialize(
            new { q = query.Trim().ToLowerInvariant(), cat = category, p = provider, v = PromptVersion });
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(payload)));
    }

    public AskResponse? Get(string key) => cache.TryGetValue(key, out AskResponse? value) ? value : null;

    public void Put(string key, AskResponse response) =>
        cache.Set(key, response, Ttl);
}
```

> **Why:** `PROMPT_VERSION` in the key is the load-bearing line — see STEP 0 Q3. Normalizing the
> query (`strip().lower()`) is deliberately the *only* normalization: anything smarter is
> semantic caching, which is out of scope and named as such. This cache is also your quota
> armor — the Gemini 20-req/day wall that blocked Days 71–74 gets hit far less when demo
> repeats are free.

### [ ] STEP 4 — Provider fallback drill: prove Gemini→Anthropic failover

Locally: set an invalid `GEMINI_API_KEY`, keep `AI_PROVIDER=gemini`, call `/ask`. Trace what
actually happens through [factory.py](../../../services/ai-service/app/providers/factory.py)
and the provider error paths:

- If the service already falls back to Anthropic → write the observed behavior down, add a test
  pinning it.
- If it returns 502 `provider_unavailable` with no fallback → implement a single-retry fallback
  in the `/ask` path: on a non-retriable provider error from the primary, retry once with the
  alternate provider (if its key is configured), tagging the Langfuse trace `fallback.used`.
  If no funded Anthropic key exists, the documented 502 *is* the answer — graceful degradation
  means the failure is clean and observable, not that failure is impossible.

> **Why:** "Model routing and fallbacks" is a roadmap Stage-7 bullet, and you may already have
> most of it via the provider factory — this step converts "I think it falls back" into either a
> pinned test or a small shipped improvement. Interviewers probe exactly this: *what happens when
> your primary provider 429s?* After this step you answer from a trace, not a guess.

### [ ] STEP 5 — Supabase Cloud project with anonymized fixture data

```bash
# 1. Create a free project at https://supabase.com/dashboard (region: Southeast Asia)
# 2. Link and push the existing migrations
supabase link --project-ref <project-ref>
supabase db push
# 3. Seed ONLY anonymized data: load the 20 eval fixtures via the existing ingestion path,
#    then embed them (POST /embed-transactions against a locally-running service pointed
#    at the cloud DB connection string)
```

> **Why:** The public `/ask` needs pgvector somewhere public, and the eval fixtures are already
> anonymized by construction (PF-AI002) — reusing them means the cloud DB contains nothing
> PF-126/127 would object to. Never point this at your real transaction data; the demo doesn't
> need it and the threat model just got clean.

### [ ] STEP 6 — Provision Azure: ACR + Container Apps (scale-to-zero)

```bash
az group create -n pf-ai-demo -l southeastasia
az acr create -n pfaidemoacr -g pf-ai-demo --sku Basic
az containerapp env create -n pf-ai-env -g pf-ai-demo -l southeastasia

# First deploy by hand (STEP 7 automates this):
az acr build -r pfaidemoacr -t pf-ai-service:manual-1 services/ai-service
az containerapp create -n pf-ai-service -g pf-ai-demo --environment pf-ai-env \
  --image pfaidemoacr.azurecr.io/pf-ai-service:manual-1 \
  --registry-server pfaidemoacr.azurecr.io \
  --target-port 8000 --ingress external \
  --min-replicas 0 --max-replicas 1 \
  --secrets gemini-key=<key> demo-api-key=<key> db-url=<supabase-conn-string> \
  --env-vars GEMINI_API_KEY=secretref:gemini-key DEMO_API_KEY=secretref:demo-api-key DATABASE_URL=secretref:db-url

az containerapp show -n pf-ai-service -g pf-ai-demo --query properties.configuration.ingress.fqdn
curl https://<fqdn>/health   # the moment the chapter exists
```

> **Why:** `--min-replicas 0` is the cost story's foundation — idle costs ~nothing. Secrets go in
> as Container Apps secrets referenced by env vars (`secretref:`), never as plain `--env-vars`
> values: the SEC-01 habit, cloud edition. Deploy by hand once *before* automating so the
> workflow in STEP 7 automates something you've seen work.

### [ ] STEP 7 — CD workflow: `deploy-ai-service.yml`

Set up OIDC federation once (app registration + federated credential for
`repo:rikky-hermanto/personal-finance:ref:refs/heads/main`), then create
[deploy-ai-service.yml](../../../.github/workflows/deploy-ai-service.yml):

```yaml
name: deploy-ai-service
on:
  push:
    branches: [main]
    paths: ["services/ai-service/**"]

permissions:
  id-token: write   # OIDC token for Azure login — no stored cloud secret
  contents: read

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: azure/login@v2
        with:
          client-id: ${{ vars.AZURE_CLIENT_ID }}
          tenant-id: ${{ vars.AZURE_TENANT_ID }}
          subscription-id: ${{ vars.AZURE_SUBSCRIPTION_ID }}
      - name: Build and push image (tag = commit SHA)
        run: az acr build -r pfaidemoacr -t pf-ai-service:${{ github.sha }} services/ai-service
      - name: Deploy new revision
        run: |
          az containerapp update -n pf-ai-service -g pf-ai-demo \
            --image pfaidemoacr.azurecr.io/pf-ai-service:${{ github.sha }}
```

Verify: make a trivial change under `services/ai-service/`, push to `main`, watch the run, then
`curl /health` and confirm the new revision is live.

> **Why:** `paths:` scoping keeps frontend/.NET commits from redeploying the AI service. Tagging
> with `github.sha` makes every running container traceable to an exact commit — that's the
> definition of "the deployed thing is `main`". The three `vars.*` are IDs, not secrets — with
> OIDC there is no credential to leak, which is the interview-ready sentence this step buys.

### [ ] STEP 8 — Public smoke test: latency, cold start, cache hit

```bash
FQDN=<your-fqdn>; KEY=<demo-key>
# Cold start: wait ~10 min for scale-to-zero, then time the wake-up call
time curl -s https://$FQDN/health
# Warm latency: 10 sequential /ask calls, note p50/p95 from Langfuse
for i in $(seq 10); do
  curl -s -X POST https://$FQDN/ask -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
    -d '{"query": "berapa total pengeluaran makan bulan Maret?"}' -o /dev/null -w "%{time_total}s\n"
done
# Cache: call 2-10 should be <100ms — check Langfuse for 1× cache.miss + 9× cache.hit
# Gate checks: no key → 401; >30/min → 429
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://$FQDN/ask -d '{"query":"x"}'
```

Record: cold-start seconds, warm p50/p95 (miss vs hit), and the 401/429 confirmations.

> **Why:** These are the chapter's quotable numbers. The cold start figure especially — knowing
> it's (say) 8s and *saying so unprompted* signals you understand the scale-to-zero trade instead
> of having stumbled into it.

### [ ] STEP 9 — The cost story: budget alert + `cost-story.md`

```bash
az consumption budget create -g pf-ai-demo --budget-name pf-ai-cap \
  --amount 5 --category Cost --time-grain Monthly \
  # + notification thresholds at 50% and 90% to your email (portal is fine for this bit)
```

Create [cost-story.md](../../../docs/deployment/cost-story.md):

```markdown
# AI Service — Cost Story (PF-AI012)

## Per-request
| Path | LLM cost | Latency | Source |
| /ask cache miss | $0.000X | Xs p50 | Langfuse, N=… |
| /ask cache hit | $0 | <100ms | Langfuse |

## Monthly projection
| Component | Idle | Demo load (est. X req/day) |
| Container Apps (scale-to-zero) | ~$0 | $X |
| ACR Basic | $X | $X |
| Supabase free tier | $0 | $0 |
| LLM spend (hit rate Y%) | $0 | $X |

## Controls
API key · 30/min rate limit · TTL cache (hit rate Y%) · $5 budget alert (50/90%) · scale-to-zero
```

> **Why:** "A sane cost story" is the Stage-7 proof criterion verbatim, and it's the LLMOps
> answer interviewers rarely get: most candidates can deploy; few can tell you what it costs per
> request and what stops it costing more. Every number in the table must come from Langfuse or
> the Azure bill — no estimates presented as measurements (honest-reporting rule).

### [ ] STEP 10 — README: live URL + deploy badge

Edit [README.md](../../../README.md): add the live demo URL, the deploy-workflow badge, a
one-line "demo dataset is anonymized fixtures" note, and the example `curl` with the header
shape (not the key). Keep all existing emojis in headings.

> **Why:** The URL nobody can find might as well not exist — the README is where a recruiter
> actually looks. The anonymized-data note preempts the only awkward question a finance-data
> demo invites.

### [ ] STEP 11 — Commit + log progress

```bash
cd services/ai-service && pytest && cd ../..
cd apps/frontend && npm run lint && cd ../..
# commit via /commit — no AI attribution trailer
/mentor log shipped PF-AI012: AI service live at <fqdn> on Azure Container Apps (scale-to-zero, cold start Xs, warm pY), CD via GitHub Actions OIDC (image tag = SHA), response cache hit rate Z%, API key + 30/min limit + $5 budget alert, cost story documented
```

> **Why:** This log entry is the "actually ship" proof point in one sentence — it goes almost
> verbatim into the CV bullet and the Chapter 10 blog post.

## 📌 Notes

- **Hard dependency:** PF-AI011 merged first. The public URL exposes `/ask`; it must be the
  guarded version.
- **Free-tier quota reality:** the deployed demo shares the same Gemini free-tier key unless
  upgraded — the cache and rate limit *reduce* burn but don't remove the 20 req/day wall. If the
  demo needs to survive a burst of recruiter traffic, that's the moment to fund a paid tier;
  the cost story table makes the decision a number.
- **`/ask/stream` on Container Apps:** SSE needs response buffering off; Container Apps ingress
  supports streaming, but verify with a real streamed call in STEP 8 — if it buffers, the
  PF-AI005 no-buffer check has a cloud twin to debug.
- **Langfuse remains the LLM cost dashboard** (PF-AI001); Azure Cost Management covers infra.
  Don't build a third dashboard — the cost story doc just cites both.
- **Rollback story** (know it, don't build it): Container Apps keeps prior revisions;
  `az containerapp revision activate` on the previous SHA-tagged revision is the manual rollback.
  One sentence in cost-story.md's Controls section is enough.
- **docker.md drift:** [.claude/rules/docker.md](../../rules/docker.md) still describes the old
  postgres-container topology — out of scope to fix here, but don't let it confuse the Dockerfile
  step; [CLAUDE.md](../../../CLAUDE.md) is current.

## 📝 Knowledge Check

> Original practice questions modeled on the published exam domains of official AI Engineering
> certifications (Databricks Generative AI Engineer Associate, Azure AI Engineer AI-102, AWS
> Certified ML Engineer – Associate, Google Cloud Professional ML Engineer). They match the
> style and topic areas of those exams — not verbatim exam items. Each question is tagged to the
> certification domain(s) it maps to. Answers are hidden — recall first, then reveal.

### 1. Scale-to-zero trade-off (AI-102 · Deployment)

*Scenario:* Your demo AI service runs on Azure Container Apps with `--min-replicas 0` and gets a few requests per day.

*Question:* What is the primary trade-off you accepted, and how should it be handled?

- **A.** Higher per-request LLM cost; handled by switching providers
- **B.** Cold-start latency on the first request after idle; handled by measuring it and stating it in the cost story (or paying for min-replicas 1 if it mattered)
- **C.** Loss of TLS termination; handled by adding a reverse proxy
- **D.** No trade-off — scale-to-zero is strictly better for all workloads

<details>
<summary>Show answer</summary>

**B** — scale-to-zero trades idle cost for wake-up latency. For a demo, measure and disclose; for latency-sensitive production, you'd pay for a warm replica. C is false (the platform owns TLS either way); A is unrelated.
*Maps to: Azure AI-102 · Deploy AI solutions · Google Cloud PMLE · Serving*
</details>

### 2. Cache-key design (Databricks · LLMOps)

*Scenario:* Your response cache keys on `hash(query + filters + provider + PROMPT_VERSION)`. A teammate proposes dropping `PROMPT_VERSION` "since the query is what determines the answer."

*Question:* What bug does their version introduce?

- **A.** Hash collisions between different queries
- **B.** The cache stops working across service restarts
- **C.** After a prompt change, cached answers generated by the *old* prompt keep being served — a silent staleness bug that looks like a model regression
- **D.** Cache keys become too long for the TTLCache

<details>
<summary>Show answer</summary>

**C** — the prompt is part of the function that produced the answer; changing it must invalidate the cache. A is unaffected (SHA-256 either way); B is true of the in-memory cache regardless; D is false.
*Maps to: Databricks GenAI Engineer · Application Development / LLMOps*
</details>

### 3. OIDC vs stored secrets (AWS ML Engineer · Security)

*Scenario:* The deploy workflow authenticates to Azure via OIDC federated credentials; the workflow file references `client-id`, `tenant-id`, `subscription-id` as repo *variables*.

*Question:* Why is this safe when storing a service-principal password in repo secrets is discouraged?

- **A.** Repo variables are encrypted more strongly than repo secrets
- **B.** Those three values are identifiers, not credentials — auth happens via a short-lived token GitHub mints per run, so there is no long-lived secret to leak or rotate
- **C.** OIDC restricts the workflow to read-only Azure operations
- **D.** It is not safe; the IDs must be moved to secrets

<details>
<summary>Show answer</summary>

**B** — federation replaces the durable credential with per-run tokens scoped to the repo/branch claim. A is backwards; C confuses authentication with authorization (RBAC still applies separately).
*Maps to: AWS ML Engineer Associate · Secure ML / CI-CD*
</details>

### 4. Cost controls on a public LLM endpoint (Databricks · LLMOps)

*Scenario:* `/ask` is public, calls a paid LLM API, and has an API key, a 30/min per-IP rate limit, and a $5 monthly budget alert.

*Question:* What role does the budget alert play that the first two controls cannot?

- **A.** It blocks requests once the cap is reached
- **B.** It replaces the need for the rate limit
- **C.** It is the detection backstop for spend the preventive controls miss (leaked key, distributed IPs, a bug in your own retry loop) — alerting a human before the bill compounds
- **D.** It reduces per-token pricing via Azure commitment discounts

<details>
<summary>Show answer</summary>

**C** — key + rate limit are *preventive*; the budget alert is *detective*. Defense in depth means assuming the preventive layers can fail. A is false (a consumption budget alerts, it doesn't block); D misdescribes budgets.
*Maps to: Databricks GenAI Engineer · LLMOps / Monitoring*
</details>

### 5. Deployment traceability (Google Cloud PMLE · MLOps)

*Scenario:* Production is misbehaving. Your image tags are commit SHAs and deploys happen only via the `main`-branch workflow.

*Question:* What does this discipline give you in the incident?

- **A.** Automatic rollback without human action
- **B.** The running container maps to an exact commit, so "what code is live" is answerable in seconds and rollback is activating the previous SHA's revision
- **C.** Proof that the bug is in the LLM provider, not your code
- **D.** Nothing — tags are cosmetic

<details>
<summary>Show answer</summary>

**B** — tag-by-SHA plus deploy-only-from-main makes deployed state a pure function of git history. A overstates (rollback is easy but not automatic here); C doesn't follow.
*Maps to: Google Cloud PMLE · MLOps & pipeline automation*
</details>

### 6. Graceful degradation (AI-102 · Reliability)

*Scenario:* Gemini (primary) starts returning 429s. Your service retries once against Anthropic if a key is configured; otherwise it returns the documented 502 `provider_unavailable`.

*Question:* In the no-Anthropic-key case, why does the documented 502 still count as graceful degradation?

- **A.** It doesn't — graceful degradation requires a successful fallback response
- **B.** Because 502 responses are excluded from SLO calculations
- **C.** Because the UI can retry 502s automatically until Gemini recovers
- **D.** The failure is clean, fast, observable (typed error, Langfuse trace), and honest — the client gets a defined contract instead of a hang, a garbage answer, or a fabricated one

<details>
<summary>Show answer</summary>

**D** — degradation quality is about failure *shape*, not failure avoidance: fail fast, fail typed, fail visibly. A is too strict (fallbacks need funded keys); B is false; C would amplify the outage.
*Maps to: Azure AI-102 · Solution reliability · Databricks · LLMOps*
</details>
