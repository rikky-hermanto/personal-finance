# PF-105 Deployment Strategy — Senior Architect Verdict

## Context

You want to sandbox a multi-service stack (React + .NET 10 + Python FastAPI + Supabase + LGTM observability) on free tier from "zero users to first real users." Two developers proposed deployment strategies. You're asking which is better, and whether a better option exists.

Per CLAUDE.md, the long-term cloud target is **Supabase Cloud + Azure (API + AI hosting)**. Staging should not contradict that path.

---

## Verdict: DevA wins on architectural thinking. DevB wins on one specific tactical insight. Neither is fully optimal — I'm recommending a synthesized **Option A'** below.

### Side-by-side scoring

| Dimension | DevA | DevB | Winner |
|---|---|---|---|
| Breadth of options (decision framing) | 4 options with explicit trade-offs | 1 path with sub-choice for API host | **DevA** |
| Aligns with stated prod target (Azure, per CLAUDE.md) | Yes — Option C maps directly | Not mentioned | **DevA** |
| Identifies the real money risk (LLM API cost cliff) | Yes — explicit warning + suggests provider-side spend caps | Missed entirely | **DevA** |
| Secrets management called out | Yes — Fly/Vercel/Key Vault | Missed | **DevA** |
| Webhook flow (PF-S11) considered | Yes — Supabase Cloud webhooks can hit hosted Python directly | Missed | **DevA** |
| Memory sizing realism for .NET | Honest — flags Fly's 256MB is too tight, ~$2/mo bump needed | **Sharper** — points to Koyeb's 512MB Eco instance with no spin-down | **DevB** |
| Cold-start awareness on critical path | General mention | Specific: 50s on Render free | **DevB** |
| Actionability (step-by-step) | Lower — discussion-style | Higher — concrete deploy steps | **DevB** |
| Risk identification overall | Strong | Weak | **DevA** |

### Where DevA is materially stronger
- **LLM cost cliff warning.** This is the single biggest financial risk in this stack. One bad prompt loop or recursive webhook can ring up real money on Gemini/Anthropic in hours. DevB does not mention it. As a sandbox owner, you need provider-side spend caps configured **before** the first deploy.
- **Maps staging → eventual production.** Option C (Azure Container Apps consumption) is what your CLAUDE.md says you're targeting. Even if you don't pick it now, mentioning it signals architectural literacy: don't build staging muscle memory that you'll throw away.
- **Multi-option framing.** "Here are 4 paths with trade-offs" is what senior work looks like. DevB jumped straight to a recommendation without exposing the decision space.

### Where DevB is materially stronger
- **Koyeb's free Eco instance (512MB, no spin-down) is the right answer for the always-on .NET API.** DevA picked Fly.io, but Fly's 256MB default is too small for .NET and the free credit model is a clock that eventually runs out. Koyeb Eco genuinely stays at $0 and stays warm. DevA missed this.
- **Correctly identifies Render's 50s cold start.** That's not "usually acceptable" for an API that backs a UI — it's brutal for a user clicking around your dashboard. DevB at least quantifies it.

### Where both fall short
- Neither mentions **Cloudflare Pages over Vercel.** For an indie/sandbox project handling potentially sensitive personal finance data, Cloudflare's terms and bandwidth allowances are more forgiving than Vercel's "fair use" policy, which has bitten projects that suddenly get traction.
- Neither mentions **Supabase Cloud's 7-day idle pause behavior in operational terms.** It's fine for a personal sandbox, but if you onboard any external user even informally, you'll get a "site is down" complaint on day 8. Worth a calendar reminder or a cron-warmer.
- Neither addresses **egress / network cost between hosts.** Splitting .NET (Koyeb) from Python AI (Render) means inter-service calls cross the public internet. For LLM-extraction workloads (large PDF text payloads), latency and any future egress metering matter.
- Neither sketches a **migration off staging.** "How do I move from this to production on Azure" should be a one-paragraph note, not a separate project.

---

## Recommended approach — Option A' (synthesis)

This is what I'd ship if it were my project.

| Layer | Host | Why this not the alternative |
|---|---|---|
| Frontend (Vite static) | **Cloudflare Pages** | Better free terms than Vercel for indie projects; faster global edge; integrates cleanly with CF Workers later if you need an edge BFF |
| Database / Auth / Storage / Realtime / Webhooks | **Supabase Cloud (free)** | Both proposals agree; this is non-controversial. Set a calendar reminder for day 6 to ping the DB and avoid the 7-day pause |
| .NET 10 API | **Koyeb Eco free (512MB, no spin-down)** | DevB's insight. Stays warm, fits .NET's working set, $0 forever. Don't put this on Render (cold starts kill UX) or Fly.io (credit clock + 256MB squeeze) |
| Python AI service | **Render free** | Acceptable here — the AI service is invoked async via webhook for PDF/image extraction. A 30–50s cold start on the first extraction of the day is fine; subsequent calls are warm. Don't waste your one Koyeb Eco slot on this |
| Observability | **Grafana Cloud free** | Both proposals agree. Point existing OTLP exporters at their endpoint. Drop the local LGTM Docker stack from staging entirely |
| Secrets | **Per-platform secret stores** (Koyeb env, Render env, CF Pages env, Supabase Vault) | Never reuse `appsettings.Development.json` — it has local Supabase keys baked in |
| LLM provider spend caps | **Set Gemini + Anthropic dashboard limits to $5/mo before first deploy** | This is the only thing in the stack that can actually cost real money |

### Operational guardrails I'd add before going live
1. **Provider-side LLM spend caps.** $5/mo Gemini, $5/mo Anthropic. Non-negotiable. A parser bug in a loop will burn $50/hr if uncapped.
2. **Wake-up cron on Supabase.** A free GitHub Actions cron hitting a cheap query every 5 days prevents the 7-day idle pause from biting your first real user.
3. **Wake-up cron on Render (Python AI).** Optional — only if you can't tolerate the cold start on the first daily extraction.
4. **CORS lockdown.** Your CORS_ORIGINS env var should be set to your Cloudflare Pages domain only, not `*`. Easy to miss in a free-tier rush.
5. **Auth before public link sharing.** PF-S08 (Supabase Auth) is still TODO. Until it lands, don't share the deployed URL outside trusted users — the API is wide open by CLAUDE.md's own admission.

### Migration path to production (one paragraph)
When you outgrow the free tier (likely trigger: Supabase 500MB DB limit or you want SLAs), lift-and-shift: Supabase stays where it is (upgrade to Pro, ~$25/mo). Move .NET API and Python AI from Koyeb/Render to **Azure Container Apps consumption tier** — your existing Dockerfiles port over directly. Frontend stays on Cloudflare Pages or moves to Azure Static Web Apps. Observability stays on Grafana Cloud unless compliance forces Azure Monitor. This is exactly DevA's Option C, deferred to when it matters.

---

## Critical files for execution (not editing in this plan)
- `apps/api/Dockerfile` — works as-is on Koyeb
- `services/ai-service/Dockerfile` — works as-is on Render
- `apps/frontend/vite.config.ts` — `VITE_API_URL` becomes the Koyeb URL at build time
- `apps/api/src/PersonalFinance.Api/Program.cs` — verify CORS reads from env, not hardcoded
- `apps/api/src/PersonalFinance.Api/appsettings.json` — Supabase URL/keys move to platform env vars
- `services/ai-service/app/config.py` — same; provider API keys to platform env vars

## Verification (post-deploy)
1. Health checks return 200: Koyeb-hosted `/health`, Render-hosted `/health`, Supabase project ping.
2. Frontend on Cloudflare Pages loads, can fetch transactions through the Koyeb API.
3. Upload a sample BCA CSV end-to-end → row appears in Supabase Cloud DB → frontend reflects it.
4. Upload a sample PDF → Koyeb routes to Render Python AI → results return → row appears.
5. Grafana Cloud dashboard shows traces for both .NET API and Python AI.
6. Confirm Gemini + Anthropic spend caps are set in their respective consoles.

---

## Final answer to your question

**DevA is the better proposal** — it thinks like an architect (options, trade-offs, risks, migration path). **DevB is a better tactician on one point** (Koyeb's Eco instance for the .NET API). The optimal answer is neither verbatim — it's the synthesis above: **Cloudflare Pages + Supabase Cloud + Koyeb (API) + Render (AI) + Grafana Cloud**, with explicit LLM spend caps and a documented migration path to Azure Container Apps when you're ready.
