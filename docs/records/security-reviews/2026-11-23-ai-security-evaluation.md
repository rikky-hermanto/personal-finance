# AI security evaluation — 2026-11-23

> **Fixed in PF-157 on 2026-11-23** — see [the plan](../../../plans/backlog/PF-157-fix-ai-security-evaluation-gaps-todo.md). Closed there: findings 2, 3, 4, 5 (the zod and lockfile part; the `<1.0` pins stay accepted), 7, 8, 9 (workflow pins; compose images and the root container are PF-148) and 10. Owned elsewhere: finding 1 (PF-156, PR #130) and finding 6 (PF-149).

> Scope: the AI service (`services/ai-service`), the .NET proxy that fronts it, the chat UI, the database policies the AI path relies on, and the CI/deploy workflows. Framed on five areas: prompt injection, tool sandboxing, data privacy, bias and toxicity, and red-team testing.
> Method: static review of the code on `main` (commit `b03c742b`), plus checks that were run, not assumed. A live LLM red-team was not run (it needs provider quota), and the deployed Cloud Run service was not tested because deploy is not enabled yet.

## Verdict

The user-facing chat path is well built for a single-owner app. Ownership is enforced server-side twice (a signed owner token, then row-level security), numbers come from SQL rather than the model, and the agents have no way to write or execute anything. The serious problems sit around that path: an unauthenticated MCP endpoint, no spend limits, an advisor prompt that contradicts the product's own scoring rubric, and a test setup that does not guard the controls it measured once.

## Checks that were run

| Check | Result |
|-------|--------|
| `pytest` on guardrails, PII masker, pilot gate, owner scope, agent owner scope, MCP tools | 99 passed |
| `evals/eval_injection.py` (offline scanner) | Reproduces the 2026-10-19 numbers: 7/8 direct, **0/4 hold-out**, 0/20 false positives |
| Probe: unauthenticated requests through the real ASGI app, all flags off | `/ask` and `/parse` blocked by the gate (404). `/mcp` **passed the gate** and was answered by the MCP sub-app |
| `dotnet list package --vulnerable --include-transitive` | No vulnerable packages |
| `npm audit --omit=dev` (frontend) | 3 findings: `zod` high, `react-router` and `react-router-dom` moderate |
| `pip-audit` (local venv, includes eval-only packages) | 26 packages with known vulnerabilities (see finding 5) |
| Secret scan of tracked files | Nothing real. One placeholder (`sk-ant-api03-your-actual-key-here`) in a done plan |
| Row-level security, `SECURITY DEFINER` functions | Owner policies present on every table checked. Every migration that defines a `SECURITY DEFINER` function sets `search_path` (a first pass flagged one file, but it only mentions the term in a comment) |

## Findings, most serious first

### 1. HIGH — `/mcp` is open with no authentication and ignores every kill switch

`pilot_access_gate` returns early for any path starting with `/mcp` ([main.py:200-203](../../../services/ai-service/app/main.py#L200-L203)). The MCP tools then read the `transactions` table through a pool built from `DATABASE_URL`, with **no owner filter** and a role that bypasses row-level security ([mcp_server.py:96-131](../../../services/ai-service/app/mcp_server.py#L96-L131)). The probe confirmed it: with the pilot off, chat off and no key, `/ask` and `/parse` are refused while `/mcp` is not.

Today the exposure is loopback only (`npm start` runs uvicorn without `--host`, so it binds 127.0.0.1, and compose publishes 8000 on 127.0.0.1). It becomes a public leak of every user's transactions the moment the AI service gets a Cloud Run URL, which the runbook sets up with `--allow-unauthenticated`.

PF-156 STEP 4 fixes this (`MCP_ENABLED`, default off, key required when on), and the plan marks it done, but it lives in PR #130, which is **still open**. `main` has no `mcp_enabled`, and `deploy.yml` is already on `main`. I saw no repository variables, so deploy looks disabled, but that is worth confirming.

- Do not set `DEPLOY_ENABLED=true` before PR #130 merges.
- Even with the fix, the tools stay unscoped to an owner (fine for local single-owner use). `get_pyramid_scores` sends no token and will fail against the authenticated API.
- The deploy smoke test for `/mcp/` has no `--max-time`. If `/mcp` is open, `curl` waits on the SSE stream until the 30-minute job timeout, and the check runs after the revision is already live. Add `--max-time 10`.

### 2. MEDIUM — No rate limit or spend cap on chat and advisor routes

> **Status:** Fixed in PF-157: a per-user limiter (20 a minute, 500 a day, 3 concurrent) on `/api/chat/*` and the portfolio review, returning 429 with `Retry-After`; the chat shows a plain Indonesian message.

The .NET API has no rate limiter anywhere; the only limits are two upload endpoints. Each chat turn costs three model calls (planner, answer, follow-ups) plus an embedding and a rerank. Input is capped at 500 characters (1000 for the advisor), and the advisor stops at 4 model calls, which is good. But nothing limits how often a valid token can call. Sign-up is off, so the realistic risks are a leaked token or a front-end retry loop. The Cloud Run `--max-instances=1` and an email-only budget alert are the only backstops.

### 3. MEDIUM — The advisor prompt contradicts the product's scoring rubric

> **Status:** Fixed in PF-157: the prompt states no threshold of its own and uses the rubric's cleared (70) and mastered (100) wording, with a `/cio` verdict (it also stops the advisor reading a tier average as cleared). A test pins it.

[financial_advisor.py:31-37](../../../services/ai-service/app/agents/financial_advisor.py#L31-L37) states L1 as "spending < income", L2 as "3-month emergency fund, debt-to-income < 20%", and L3 as "investing ≥15% income". The rubric's cleared thresholds are 89% spending, 2.1 months and 29.6% debt-to-income, and 9% savings; the figures in the prompt are the mastered ones, and L1 matches neither. The advisor can tell a user a tier is unmet while the Journey screen shows it cleared. These constants have no source citation (FIN-02). Route the numbers through `/cio`, and prefer reading thresholds from the scoring service over hard-coding them in a prompt.

### 4. MEDIUM — Portfolio review makes recommendations with no disclosure

> **Status:** Fixed in PF-157: the `/compliance`-cleared disclosure shows on the review landing tab, the run button and the result page; the persona is an educational analyst; provider and model now come from the AI service, not the browser. A legal opinion on the licensed-advice boundary is still needed before any second user (see the plan's Notes).

`/portfolio-review` is prompted as a "senior portfolio strategist" and returns HOLD/ADD/REDUCE/REPLACE/SELL with conviction levels, scenario probabilities and an `IMMEDIATE` rebalance urgency ([portfolio_reviewer.py:9-22](../../../services/ai-service/app/services/portfolio_reviewer.py#L9-L22)). I found no advice disclosure on the investment pages. The chat has one ("Bukan saran keuangan") and so do the desk, macro lab and goals pages. FIN-05 requires the disclosure and a `/compliance` pass for anything that ranks or recommends. Separately, the browser can send `provider` and `model`, the AI service ignores them, but the API stores them as the snapshot's provenance ([RunPortfolioReviewCommandHandler.cs:71-72](../../../apps/api/src/PersonalFinance.Application/Commands/Investments/RunPortfolioReviewCommandHandler.cs#L71-L72)), so a snapshot can claim a model that never ran.

### 5. MEDIUM — Python dependencies are unpinned, and the pins block the fixes

> **Status:** Fixed in PF-157 except what is accepted: `requirements.txt` is a hashed lock, the image and CI install from it, `pip-audit` on it reports only the PF-147 advisories (`pip-audit-ignore.txt`), `zod` is on 4.6.7, and a weekly `security-audit` workflow runs all three audits.

`pip-audit` flagged 26 packages in the local venv, including `python-multipart` (the upload parser behind `/parse-pdf` and `/parse-image`), `langchain-core`, `langgraph-checkpoint`, `litellm`, `aiohttp`, `urllib3` and `cryptography`. Caveats: the venv includes eval-only packages (`ragas`, `datasets`), runs Python 3.11 while the Dockerfile uses 3.12, and I did not triage exploitability. The structural problem is that there is no lockfile and every dependency is `>=`, so each image build resolves whatever is newest and builds are not reproducible. The `langchain` and `langgraph` upper bounds (`<1.0`) sit below the fixed versions that `pip-audit` lists, but that is a recorded owner decision, not an oversight: PF-147 accepted those advisories on 2026-10-22 because moving to 1.x means rewriting the agent model factory (see `docs/references/accepted-risks.md`). What changed since then is the reasoning behind it ("runs locally for the single owner"), which stops being true when PF-156 deploys; production keeps agents off (`AI_AGENTS_ENABLED=false`), which limits the exposure. The `react-router` advisory is likewise accepted in PF-147. `zod` is the only npm finding not yet covered there. On the frontend, `zod` (memory exhaustion on oversized collections, client-side) and `react-router` (open redirect) both need a major version bump.

### 6. MEDIUM — Third-party data decision is accepted but not recorded

Statement text goes to Gemini for extraction and full prompts go to Langfuse cloud. The owner accepted the Langfuse exposure on 2026-10-22, but PF-149, which records it, confirms the Gemini billing tier (free-tier prompts may be used by Google to improve products) and adds a tracing kill switch, is still in the backlog. Until the tier is confirmed, this is the largest open privacy question.

### 7. LOW, LATENT — Injection paths that are not covered yet

> **Status:** Fixed in PF-157 for the categorizer agent and `/advisor`. Extraction (`/parse*`) stays as described.

- **Categorizer agent.** `find_similar_transactions` returns past descriptions to the model unmasked and not spotlighted ([similarity.py:54-58](../../../services/ai-service/app/agents/tools/similarity.py#L54-L58)), and `_parse_result` accepts any category string the model returns without checking it against the owner's vocabulary. It has no caller today, so nothing is exposed yet.
- **`/advisor`** skips the input scanner. Its tools return aggregates only, so the risk is small.
- **Extraction (`/parse*`)** passes raw statement text to the model with no delimiting. The upload preview and the explicit submit step are the mitigation, and they are what bounds it.

### 8. LOW — Advisor memory grows without bound

> **Status:** Fixed in PF-157: at most 200 sessions are kept.

`MemorySaver` keeps every session in process memory forever, and a client can mint a new `session_id` per call. With one instance this is an out-of-memory risk, not a data risk (threads are keyed by owner).

### 9. LOW — Supply chain and hardening nits

> **Status:** Partly fixed in PF-157: third-party actions are pinned to commit SHAs and `vercel` and the Supabase CLI to versions. Compose `:latest` images and the root container remain with PF-148.

- Floating versions in workflows: `anthropics/claude-code-action@v1`, `vercel@latest`, `supabase/setup-cli` with `latest`, and `:latest` images in compose.
- The compose `api` service runs with `ASPNETCORE_ENVIRONMENT=Development` on all interfaces. Fine locally; never reuse that file for hosting.

### 10. INFO — The red-team harness is not a safety net yet

> **Status:** Partly fixed in PF-157: the offline eval is now a `pytest` gate and the live run takes `--samples`. A live multi-sample run on the default model is still to do.

`ci.yml` runs `pytest` but not `eval_injection.py`. The measured scanner is a keyword filter with a 0/4 hold-out rate, the live run was one sample per case on `gemini-3.5-flash-lite` rather than the default `gemini-2.5-flash`, and role-play attacks landed 2/16 at baseline with no control that closes them. The doc is honest about all of this. Nothing exercises the advisor, the categorizer agent or extraction.

## What is working

- **Owner isolation.** The .NET API verifies the Supabase JWT, signs a 60-second HMAC owner token per call, and the AI service reads as that user under row-level security with an explicit `user_id` filter first. Owner-scope tests for chat and agents pass.
- **The model cannot do arithmetic on money.** Aggregate answers use a SQL total returned in the payload; the model only narrates it. Citations are validated against the rows actually sent.
- **Tool sandboxing is tight.** Advisor tools are four fixed read-only GETs with no model-chosen arguments, use the caller's own token, and fail closed without one. The categorizer is a `ToolCallingAgent` (JSON tool calls, no code execution) with three read-only tools, three steps and a fresh agent per run. There are no write, file, network or shell tools anywhere.
- **Layered prompt defense.** Input scanner, spotlighting with forged-marker stripping, closed category vocabulary, scaffold-leak output guard, and `security.*` Langfuse tags that record rule names but never text.
- **No injection sinks in the UI.** No `dangerouslySetInnerHTML` or markdown renderer in the chat; the one hit is the shadcn chart component.
- **Error handling.** Fixed error codes, no exception text returned, `input_flagged` mapped to 400.
- **.NET dependencies are clean**, and no real secrets are tracked.

## Recommended order

1. Merge PR #130 and hold `DEPLOY_ENABLED` until it is in; add `--max-time` to the `/mcp/` smoke test.
2. Add a per-user rate limit and daily cap on `/api/chat/*` in the .NET API.
3. Fix the advisor prompt thresholds (`/cio`), then add disclosure to portfolio review (`/compliance`).
4. Add a lockfile with hashes, bump `python-multipart` and the other flagged packages that are not blocked by pins, and schedule the `zod` and `react-router` bumps.
5. Do PF-149: confirm the Gemini tier and add the tracing kill switch.
6. Run `eval_injection.py` offline in CI as a regression gate, add cases for the advisor, categorizer and extraction, and repeat the live run on the default model with several samples per case.
7. Before the categorizer agent gets a caller: spotlight and mask its tool output and validate the returned category.

## Not covered

A live red-team run, the deployed Cloud Run service, Supabase Auth dashboard settings, and a full read of every migration.
