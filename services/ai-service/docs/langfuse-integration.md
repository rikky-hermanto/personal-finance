# Langfuse Observability Integration — PF-AI001

Format: Plain text / ASCII art  
Render: any Markdown viewer, GitHub, VS Code Preview — no plugin required  

Diagram type: Architecture overview — shows the FULL STACK from request
to Langfuse dashboard. Combines what the sequence and class diagrams show
separately, at a higher altitude.

---

## Architecture Overview

```
┌────────────────────────────────────────────────────────────────────────────┐
│  PERSONAL FINANCE — AI OBSERVABILITY LAYER (PF-AI001)                      │
└────────────────────────────────────────────────────────────────────────────┘

  ┌──────────────┐    POST /parse-pdf     ┌──────────────────────────────────┐
  │  .NET API    │ ─────────────────────► │  FastAPI  (main.py)              │
  │  (port 7208) │ ◄───────────────────── │  POST /parse, /parse-pdf,        │
  └──────────────┘    200 JSON            │       /parse-image, /categorize  │
                                          └───────────────┬──────────────────┘
                                                          │
                                                          ▼
                                          ┌──────────────────────────────────┐
                                          │  LlmParser  (llm_parser.py)      │
                                          │  • builds system_prompt          │
                                          │  • delegates to provider         │
                                          └───────────────┬──────────────────┘
                                                          │ extract_structured()
                              ┌───────────────────────────┴──────────────────┐
                              │                                               │
                              ▼                                               ▼
               ┌──────────────────────────┐              ┌───────────────────────────────┐
               │  GeminiProvider          │              │  AnthropicProvider            │
               │  providers/gemini.py     │              │  providers/anthropic.py       │
               │                          │              │                               │
               │  1. start_generation()   │              │  1. start_generation()        │
               │  2. aio.generate_content │              │  2. messages.create()         │
               │  3. generation.end()     │              │  3. generation.end()          │
               │     ↳ tokens, cost_usd   │              │     ↳ tokens, cost_usd        │
               └────────────┬─────────────┘              └───────────────┬───────────────┘
                            │                                             │
                            │  uses                                       │  uses
                            └──────────────────┬──────────────────────────┘
                                               ▼
                         ┌──────────────────────────────────────────────┐
                         │  observability.py          «new PF-AI001»    │
                         │                                              │
                         │  langfuse = Langfuse(                        │
                         │    public_key  = settings.langfuse_public_key│
                         │    secret_key  = settings.langfuse_secret_key│
                         │    host        = settings.langfuse_host      │
                         │    enabled     = bool(keys are set)          │
                         │  )                                           │
                         │                                              │
                         │  GEMINI_COST   = { gemini-2.5-flash: ... }   │
                         │  ANTHROPIC_COST= { claude-sonnet-4-6: ... }  │
                         │                                              │
                         │  estimate_cost_usd(model, in, out) → float   │
                         └─────────────────┬────────────────────────────┘
                                           │
                          buffered traces, flushed every 15s
                          or on app shutdown (langfuse.flush())
                                           │
                                           ▼
                         ┌─────────────────────────────────────────────┐
                         │  Langfuse Cloud                              │
                         │  https://cloud.langfuse.com                  │
                         │                                              │
                         │  Traces ──────────────────────────────────── │
                         │  ┌──────────────────────────────────────┐   │
                         │  │ gemini-extract-structured             │   │
                         │  │  model:   gemini-2.5-flash            │   │
                         │  │  input:   847 tokens                  │   │
                         │  │  output:  312 tokens                  │   │
                         │  │  latency: 2,340 ms                    │   │
                         │  │  cost:    $0.000157                   │   │
                         │  │  status:  ✓ success                   │   │
                         │  └──────────────────────────────────────┘   │
                         │                                              │
                         │  Dashboard ──────────────────────────────── │
                         │  • Cost / day       (line chart)            │
                         │  • Calls / day      (bar chart)             │
                         │  • Latency p50/p95  (histogram)             │
                         │  • Error rate       (line chart)            │
                         └─────────────────────────────────────────────┘
```

---

## Tracing Lifecycle (per LLM call)

```
Provider.extract_structured() called
        │
        ├─► langfuse.start_generation(name, model, input[:500])
        │        └── returns: StatefulGenerationClient (handle)
        │
        ├─► LLM API called  (Gemini / Anthropic)
        │
        ├─── success ──────────────────────────────────────────────┐
        │                                                           │
        │    handle.end(                                            │
        │      output   = response_text[:500],                      │
        │      usage    = { input: N, output: M, unit: TOKENS },    │
        │      metadata = { cost_usd: 0.000157 }                    │
        │    )                                                       │
        │                                                           │
        └─── error (max_tokens / exception) ──────────────────────┐│
                                                                   ││
             handle.end(                                           ││
               level          = "ERROR",                           ││
               status_message = "max_tokens truncation"           ││
             )                                                     ││
             raise RuntimeError(...)                               ││
                                                                   ▼▼
                                              langfuse internal buffer
                                              (flushed async every 15s)
                                                        │
                                              on app shutdown:
                                              langfuse.flush()  ← blocks
                                              until all traces sent
```

---

## Config Fields Added (app/config.py)

```
Settings (pydantic BaseSettings)
├── ai_provider                 "gemini" | "anthropic"
├── gemini_api_key              GEMINI_API_KEY
├── anthropic_api_key           ANTHROPIC_API_KEY
├── ai_model                    AI_MODEL
├── ...existing fields...
│
└── «new PF-AI001»
    ├── langfuse_public_key     LANGFUSE_PUBLIC_KEY   (default: "")
    ├── langfuse_secret_key     LANGFUSE_SECRET_KEY   (default: "")
    └── langfuse_host           LANGFUSE_HOST         (default: https://cloud.langfuse.com)
```

---

## Files Changed (PF-AI001)

```
services/ai-service/
├── pyproject.toml                     + langfuse>=3.0
├── .env.example                       + 3 Langfuse env vars
├── app/
│   ├── config.py                      + 3 Settings fields
│   ├── observability.py               NEW — singleton, cost table, estimate_cost_usd()
│   ├── main.py                        + langfuse.flush() on shutdown
│   └── providers/
│       ├── gemini.py                  + start_generation / generation.end() in 2 methods
│       └── anthropic.py               + start_generation / generation.end() in 2 methods
└── docs/
    ├── langfuse-integration.md        this file
    ├── langfuse-integration.mmd       Mermaid sequence diagram
    └── langfuse-integration.puml      PlantUML class diagram
```

---

## Why Langfuse (not just OTel + Grafana)

```
                OTel → Grafana                    Langfuse
                ──────────────────                ──────────────────────
  What it sees  HTTP spans                        LLM generations
  Latency       ✓ request-level                  ✓ generation-level
  Token counts  ✗                                ✓ input + output
  Cost          ✗                                ✓ auto or manual
  Prompt text   ✗                                ✓ stored + searchable
  Error traces  ✓ HTTP 500                       ✓ LLM-level (max_tokens, etc.)
  Dashboards    ✓ Grafana (infra)                ✓ Langfuse UI (AI-specific)
  Use for       infra health monitoring          AI pipeline debugging + cost
```

Both are active simultaneously. They are complementary, not alternatives.
```
Request path:
  [HTTP] ──► OTel span (latency, status) ──► Alloy ──► Prometheus ──► Grafana
  [LLM]  ──► Langfuse generation (tokens, cost) ──► Langfuse Cloud
```
