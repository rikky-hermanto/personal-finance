# Free LLM API Tiers — Comparison (August 2026)

> Reference note, not project-specific domain material. Compiled to help pick a Gemini
> alternative for **AI service dev/testing** (`services/ai-service/evals/`) when the Gemini
> free tier gets quota-exhausted. Live-verified where noted; free tiers move fast — recheck
> before relying on a number for anything beyond local testing.

## TL;DR

For burning through **extraction eval runs** without hitting quota, the best Gemini
replacement is **Groq** (fast, real structured output, no card) backed by **Mistral's free
"Experiment" tier**, which has by far the largest token ceiling (~1B tokens/month) and is the
only free tier that still gives vision + OCR for the Bank Jago screenshot path.

Two things changed in 2026 that invalidate most "best free API" guides floating around:

- **GitHub Models was fully retired on 30 July 2026** — playground, catalog, inference API,
  BYOK all gone.
- **Cerebras killed its no-card free tier.** It's now a $5 trial that requires a verified
  payment method and expires in 30 days.

## Comparison table

| Provider | Best free model(s) | Rate limits | Token ceiling | Vision | Struct. output | Card? | Source confidence |
|---|---|---|---|---|---|---|---|
| **Groq** ⭐ | `openai/gpt-oss-120b`, `qwen/qwen3.6-27b` | 30 RPM / **1K RPD** | 8K TPM / **200K TPD** | ❌ (Llama-4-Scout deprecated 17 Jun 2026) | ✅ | No | Primary docs |
| **Groq** (volume) | `llama-3.1-8b-instant` | 30 RPM / **14.4K RPD** | 6K TPM / **500K TPD** | ❌ | ✅ | No | Primary docs |
| **Mistral** ⭐ | All models — incl. Pixtral, **Mistral OCR** | ~1–2 RPM (low) | **~1B tokens/month** | ✅ | ✅ | No | Aggregators — Mistral stopped publishing; check Admin Console → Limits |
| **Google Gemini** | `gemini-3-flash` / `2.5-flash-lite` | ~15 RPM / ~1.5K RPD (Flash-Lite); 2.5 Flash reported 250–500 RPD | 250K–1M TPM | ✅ | ✅ | No | ⚠️ Google removed numbers from official docs — AI Studio is the only authority |
| **Z.AI (GLM)** ⭐ | `GLM-4.7-Flash` — **permanently free**, 200K ctx | Not published | Not published; +20M tokens on signup (90d) | ❌ text-only | ✅ + tool calling | No | Primary docs (capabilities); limits unpublished |
| **NVIDIA NIM** | 100+ models (Nemotron, Llama, Qwen, DeepSeek) | **40 RPM** | Rate-limit governed (credit caps removed) | ✅ some models | ✅ Nemotron/GPT-OSS | No | Aggregators + NVIDIA forums |
| **OpenRouter** | 15–28 `:free` models | 20 RPM / **50 RPD** (<$10 lifetime)<br>20 RPM / **1000 RPD** ($10+ ever) | Per upstream model | ✅ ~15 models | ✅ GPT-OSS, Nemotron only | No (card unlocks 1K RPD) | Primary docs |
| **Cloudflare Workers AI** | ~40+ edge models | **10K Neurons/day**, shared pool, resets 00:00 UTC | Neuron-based; big models drain fast | ✅ some | Partial | No | Aggregators + CF blog |
| **Cerebras** | `gpt-oss-120b`, `zai-glm-4.7`, `gemma-4-31b` | 5 RPM / 30K TPM / 1M TPD | **$5 credit, expires 30 days** | ❌ | ✅ | ✅ Yes | Primary docs |
| **DeepSeek** | `deepseek-v3`/`r1`, 1M ctx | Standard | 5M tokens, **30-day expiry** | ❌ | ✅ | Signup only | Aggregators |
| **Alibaba Model Studio** | Qwen family (Singapore endpoint) | Standard | ~1M tokens / ~90 days | ✅ Qwen-VL | ✅ | Signup only | Aggregators |
| **Hugging Face** | Inference Providers routing | Low | **~$0.10/month** free credits | Varies | Varies | No | Aggregators — effectively unusable for evals |
| ~~GitHub Models~~ | — | **RETIRED 30 Jul 2026** | — | — | — | — | Primary docs |

⭐ = recommended for this project's use case

## Recommendation for this repo's AI service

The extraction pipeline splits cleanly, and the split matters because **only the screenshot
path needs vision**:

**PDF path** (PyMuPDF strips text first → text-only LLM is fine):
Use **Groq `openai/gpt-oss-120b`**. Real JSON-schema structured output, 30 RPM, fastest
inference available. Binding constraint is **200K TPD**, not the 1K RPD — at ~5–15K tokens
per statement that's roughly 13–40 statement extractions/day. A 20-fixture eval run
(`services/ai-service/evals/`) fits in one day, not twice.

For repeated eval runs, use **Mistral** instead — 1B tokens/month makes token budget a
non-issue. The ~2 RPM is irrelevant for a batch eval; 20 fixtures takes ~10 minutes
unattended.

**Screenshot path** (Bank Jago — no text layer):
**Mistral** is the standout — Pixtral for vision extraction, and Mistral OCR is purpose-built
for document-to-structured-data. Groq has no vision model on free tier anymore, so it can't
cover this leg at all.

**Failover backstop:**
**Z.AI GLM-4.7-Flash** — the only genuinely *permanent*, non-expiring free model in the
table, 200K context, tool calling + structured output. Text-only, so it slots behind Groq on
the PDF path.

The AI service already has `ProviderFactory` + the `LlmProvider` interface
(`services/ai-service/app/providers/`), so adding Groq and Mistral is two provider classes —
Groq is OpenAI-compatible, so it's close to a base-URL swap. Stacking Groq + Mistral + Z.AI
gives three independent quota pools.

## Caveats

- Verified directly against primary provider docs: **Groq, OpenRouter, Cerebras**, and the
  **GitHub Models retirement**.
- Gemini, Mistral, NVIDIA, Cloudflare, DeepSeek, Qwen, and Hugging Face rows come from
  secondary aggregators — not confirmed at the source.
- **Google no longer publishes free-tier rate limits in its docs.** The page redirects to AI
  Studio. Sources disagree badly (250 vs 500 vs 1,500 RPD for Flash); Google revises limits
  without notice and varies them by region and account verification status. Check your own
  AI Studio rate-limit page for the real number.
- Mistral has likewise stopped publishing exact free-tier numbers; Admin Console → Limits is
  authoritative for your account.
- Free tiers move fast. Cerebras went from "generous, no card" to "$5 trial, card required"
  and Groq deprecated its only free vision model — both within 2026.

## Sources

- [Groq rate limits (docs)](https://console.groq.com/docs/rate-limits)
- [OpenRouter limits (docs)](https://openrouter.ai/docs/api-reference/limits)
- [Cerebras rate limits (docs)](https://inference-docs.cerebras.ai/support/rate-limits)
- [GitHub Models retirement (docs)](https://docs.github.com/en/github-models/use-github-models/prototyping-with-ai-models)
- [Z.AI GLM-4.7 (docs)](https://docs.z.ai/guides/llm/glm-4.7)
- [Gemini API rate limits](https://ai.google.dev/gemini-api/docs/rate-limits)
- [Free LLM API tiers 2026](https://wetheflywheel.com/en/ai-model-access/free-llm-api-tiers-2026/)
- [Free LLM APIs compared](https://klymentiev.com/blog/free-llm-api)
- [Mistral free tier](https://agentdeals.dev/vendor/mistral-ai)
- [NVIDIA Build free tier](https://yangmao.ai/en/providers/nvidia-build/free-tier/)
- [Cloudflare Workers AI free tier](https://costbench.com/software/llm-api-providers/cloudflare-workers-ai/free-plan/)
- [Chinese LLM API free tiers](https://china-llm.com/blog/chinese-llm-api-free-tiers)
- [Hugging Face pricing](https://klymentiev.com/blog/huggingface-inference-api)
- [Groq Llama 4 Scout deprecation](https://console.groq.com/docs/deprecations)
