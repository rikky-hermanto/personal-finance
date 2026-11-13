# Field Guide Gap Analysis (2026-11-09)

> **Source:** the AI Engineering Field Guide ([fork](https://github.com/rikky-hermanto/ai-engineering-field-guide), local copy at `C:\workspaces\ai-engineering-field-guide`), Alexey Grigorev's data-driven guide built from builtin.com job postings, interview reports, 100+ take-home repos and practitioner stories.
> **Compared against:** [ai-engineer-learning-path.md](ai-engineer-learning-path.md) as of 2026-11-09, the plans it links, and the code in this repo.
> **Target lens:** Applied AI Engineer first, Agentic AI Engineer as the second fit.
> **Status:** analysis only. Nothing in the curriculum has changed yet; the proposed changes are at the end.

## Bottom line

The path is already built on the thing the field guide calls the main differentiator: evaluation first, then RAG, then agents, all measured in one real product. Most of the remaining work is not new topics. It is closing the loops that are open (agent eval never ran, nothing is deployed, nothing is published) and adding the parts of the job that only show up in production and in interviews.

Seven things are missing from the path entirely. Three of them matter most for an Applied AI role:

1. **A feedback loop from real use back into the eval set.** The upload preview already marks AI-suggested categories and lets you change them, but nothing records what the model suggested versus what you kept.
2. **Cost and latency engineering as a skill you can show**, not just a cache and a cost page: time to first token, model routing, a fallback when a provider hits its quota, and a back-of-envelope estimate at scale.
3. **Interview formats the path never practices:** the AI system design round, a timed greenfield take-home, and Python live coding without AI tools.

For Agentic roles, two items already on the path move up: agent evaluation (topic 9) and multi-agent orchestration (topic 11, still a stretch).

## What the market asks for: Applied vs Agentic

The field guide's published numbers cover 6,964 postings from February to August 2026. I re-ran the structured data, including the September 23 scrape, to look at the two target titles. That gives 8,051 unique postings, of which 5,652 are AI-first (the role works on AI systems directly). "Applied AI" means the title contains "applied" (Forward Deployed titles excluded, n=420). "Agentic" means the title contains "agent" (n=500). Shares are the percentage of postings that list the skill or mention it in responsibilities.

| Skill or responsibility | All AI-first | Applied AI | Agentic |
|---|---:|---:|---:|
| Agents (any) | 73% | 81% | 97% |
| RAG | 55% | 55% | 55% |
| Prompt engineering | 47% | 46% | 47% |
| Evaluation listed as a skill | 45% | **60%** | 48% |
| Evaluation in responsibilities | 51% | **63%** | 54% |
| Function calling / tool use | 20% | 31% | 33% |
| Structured output | 6% | 13% | 10% |
| Context engineering | 6% | 10% | 7% |
| LangGraph | 20% | 16% | **34%** |
| MCP | 19% | 16% | **27%** |
| CrewAI / AutoGen | 11% | 7% | 23% |
| Guardrails / safety | 27% | 25% | 34% |
| Observability / monitoring | 39% | 39% | 43% |
| Vector DB / vector search | 38% | 21% | 46% |
| Fine-tuning | 25% | 24% | 20% |
| PyTorch | 19% | 12% | 14% |
| Python | 76% | 72% | 81% |
| TypeScript | 21% | 29% | 23% |
| Java / Go | 17% / 12% | 7% / 7% | 25% / 23% |
| C# / .NET | 8% | 2% | **13%** |
| AWS / Azure | 42% / 36% | 25% / 21% | 51% / 43% |
| Docker / Kubernetes / CI/CD | 25% / 23% / 36% | 14% / 15% / 19% | 28% / 24% / 34% |
| Prototypes or POCs in responsibilities | 20% | **33%** | 16% |
| Customer or client work in responsibilities | 26% | 40% | 30% |
| Mentoring or leading in responsibilities | 36% | 26% | 42% |

How to read the two profiles:

- **Applied AI Engineer** is the eval-heavy, product-facing version. It has the highest evaluation share of any title group, twice the market rate for structured output and context engineering, and a lot of prototyping. It asks for less infrastructure than average.
- **Agentic AI Engineer** is the backend-heavy version. It leans on frameworks (LangGraph, MCP, CrewAI), guardrails, vector search and cloud, and it is the only group where Java, Go and C#/.NET show up often. It also expects more leadership.
- Both share the same core: agents plus RAG, prompt and context work, and evaluation. They overlap more than they differ.

Market-wide trends from the guide that support the current path:

- The integrator stack (RAG, agents, APIs) rose from 80% to 88% of AI-first roles; the trainer stack (PyTorch, fine-tuning, CUDA) fell from 37.5% to 30.4%.
- 84.6% of AI-first roles have no fine-tuning in their responsibilities.
- MCP roughly doubled (9.9% to 17.6%) and LangGraph more than doubled (7.4% to 17.2%).
- LLM-native eval tooling (LangSmith, Langfuse, guardrails) is rising while classic MLOps tools decline.
- Staff+ postings fell from 18.5% to 11.0% of the market, and junior roles stay at about 1%. Senior is the bulk of hiring.

Two numbers worth knowing for positioning:

- About **21% of AI-first postings** (1,201 of 5,652) come from companies whose focus mentions banking, finance, fintech, payments, wealth, investing, insurance, lending or credit. This is a keyword match, so treat it as approximate. Capital One, Citi, Wells Fargo, JPMorgan and BlackRock are among the top 20 hirers. A finance-domain portfolio project is on-target, not a niche.
- **Forward Deployed Engineer** titles are 89% customer-facing in this data. That conflicts with the async-first remote target, so they are not worth chasing. "Applied" titles are mostly not customer-facing (31% flagged).

## How interviews test it

The guide's interview section is the part the path covers least. The patterns that matter for a senior candidate:

- **Rounds:** 3 to 6 rounds over 2 to 6 weeks. Recruiter screen, technical or coding, an AI deep dive, a take-home, system design, behavioral.
- **Take-homes** appear in 17 of the 51 companies that disclose their process. In 100+ public submissions, 40%+ are RAG with citations and an "I don't have that information" path, 30%+ are agents, 15% document extraction and 10%+ LLM-as-judge. YC startups call it a red flag when a candidate doesn't start with evals. The defence round afterward often matters more than the code.
- **AI system design** is now its own round at some companies (Doctolib, Anthropic) and mostly a senior-level round. It is judged on trade-offs, failure modes, cost, evaluation and safety, not on naming tools.
- **Project deep dive:** "Is there an actual eval framework here, or is it vibes-based?" and "What would you do differently?"
- **Coding:** about 70% of senior interviews in three practitioners' reports (130+ rounds) had no LeetCode. Implementation rounds (build a KV store, a crawler, a rate limiter in levels) are more common. Some live rounds ban AI tools; others watch how you direct them.
- **Theory:** LLM fundamentals (tokenization, attention, KV cache, temperature, context window), when *not* to use RAG or agents, fine-tune vs RAG vs prompting, agent termination and tool-failure handling, prompt injection, cost estimates such as "1M queries a day, what does it cost?"

## Where the path already matches

These are strengths to claim, not gaps:

- **Eval before build.** Chapters 1–2 come before RAG, every chapter produces a number, and there are harnesses for extraction, categorization, retrieval (MRR), faithfulness, numeric accuracy and prompt injection in [evals/](../../services/ai-service/evals/). This is exactly what the guide says separates candidates.
- **The full integrator stack in one real product:** RAG with re-ranking and citations, streaming, a smolagents agent, a LangGraph advisor, an MCP server, guardrails with PII masking, Langfuse tracing.
- **A measured negative result.** Hybrid search lost to pure vector search (MRR@5 0.750 vs 0.771). The guide's advice to "talk like a builder" is this kind of story.
- **Directing AI coding tools.** The loop engine, skills and rules are a harness-engineering story. Interviews increasingly test how you use Claude Code or Cursor, and AI coding tools appear in 27% of AI Product Engineer postings.
- **Full stack.** React and TypeScript, .NET, Python FastAPI and Postgres. Applied roles ask for TypeScript in 29% of postings.
- **Finance domain** (see above).

## Gaps the path does not cover

Each gap lists what the guide says, what this repo has today, and the smallest version that closes it.

### G1. Feedback loop from real use into the eval set

**What the guide says.** Alexey's list of what professional AI engineering needs beyond calling the API includes sampling production data, adding problem cases to the eval set, and capturing explicit (thumbs up or down) and implicit (the user corrects the output) feedback. Eugene Yan's patterns call this the data flywheel, and DoorDash's evaluation flywheel is a cited case study. A listed interview question: "How do you convert implicit user behavior (edits, acceptance, rejection) into training signals?"

**What we have.** [TransactionPreview.tsx](../../apps/frontend/src/components/TransactionPreview.tsx) asks the AI for categories, highlights the suggested rows ("review highlighted rows before submitting"), and lets you change each one. After submit, the difference between what the model suggested and what you kept is lost. There is no user feedback on `/ask` answers either. Every eval set in the repo was written by hand.

**Smallest version.** On submit, record each AI-suggested row as (description, suggested category, final category, model, prompt version). A small script turns disagreements into new rows for [categorize_cases.json](../../services/ai-service/evals/categorize_cases.json) and re-runs the categorization eval. Add a thumbs up or down on `/ask` answers that writes a Langfuse score. With one user, A/B tests are not realistic; a shadow run of a candidate prompt against logged inputs is the honest substitute.

**Why it matters for Applied roles.** It turns "I built evals" into "my evals grow from production." It also pairs with topic 16: the human-in-the-loop approval on the categorizer *is* the feedback event, so both can ship together. About 2 days.

### G2. Cost and latency engineering

**What the guide says.** Cost awareness is called "a superpower": one candidate's before-and-after cost breakdown (70% lower spend) got an offer the next day. Interviews ask about time to first token, benchmarking each call in a multi-step pipeline, model tiering, semantic caching, provider fallback under rate limits, and budget estimates at enterprise scale.

**What we have.** Langfuse records cost and latency per call. [PF-AI012](../../plans/backlog/learning/PF-AI012-deployment-llmops-todo.md) plans a TTL response cache and a one-page cost breakdown. There is no time-to-first-token measurement on the streaming endpoint, and the chat path has no runtime fallback: [chat_model_factory.py](../../services/ai-service/app/agents/chat_model_factory.py) stops immediately on a quota error with no alternate provider. Rule 7 of the curriculum records that the free-tier cap blocked three evals at once in October, which is the exact failure a fallback addresses.

**Smallest version.** Fold into Chapter 9.75. Measure time to first token and per-step latency for `/ask/stream` and the advisor. Route categorization to the cheapest model that passes its eval, and keep the stronger model for advice. Add a fallback to the second provider on a quota error. Write a cost-per-query table and a "1M queries a day" estimate. About 1.5 days.

### G3. Model upgrades gated by evals

**What the guide says.** "New model from provider? Run eval set to check for regressions."

**What we have.** The harnesses exist and evals-in-CI is planned (topic 14). The PF-S15 follow-ups already list moving the advisor to a newer Gemini model.

**Smallest version.** Run the extraction and categorization evals on the newer model, compare accuracy, cost and latency, and decide by the numbers. This is a short story with a real decision in it. Half a day plus quota, inside topic 14.

### G4. AI system design practice

**What the guide says.** A distinct round, mostly at senior level, with a five-step structure: frame the problem, sketch the architecture, deep dive (RAG, tools, memory, evaluation, safety), trade-offs and failure modes, then a summary with risks. Common mistakes: no eval or monitoring plan, ignoring cost, putting control flow in prompts, choosing agents because they are exciting.

**What we have.** Chapter 11 has STAR stories and three architectural deep dives of this project. There is no practice on unfamiliar design questions.

**Smallest version.** Six timed designs, 45 minutes each, out loud and recorded: a document Q&A system at 10M documents, a chat assistant at 1M daily users (cost), a multi-step agent workflow (email or scheduling), a pipeline that processes 10K uploaded payslips and IDs a month (close to this project), cross-conversation memory, and policy-violation detection. Read Chip Huyen's *Building a Generative AI Platform* and two of the guide's case studies (Doctolib's agent graph, Uber's GenAI Gateway) first.

### G5. A timed greenfield take-home

**What the guide says.** Take-homes are 2–4 hours of work, built from scratch. The best submissions start with an eval harness, document decisions and trade-offs, test edge cases, and come with a short video. The defence round follows.

**What we have.** Every chapter was built inside a large repo over several days, with detailed plans and an agent loop doing much of the typing. That is good engineering, but it never tested whether you can ship a small eval-first RAG or agent in four hours. The repo is public, but a reviewer will not find the AI work quickly inside a five-module product.

**Smallest version.** Two mock take-homes from the guide's list of official company challenges, four hours each: one agentic (for example the Go Fig inbox-triage agent with human-in-the-loop) and one applied (a policy-document RAG with mandatory citations, a refusal path, and a 7-question eval across answerable, partly answerable and unanswerable). Each ends with a README of decisions and a 5-minute video. They also become two small public repos a reviewer can read in five minutes.

### G6. Python live coding without AI tools

**What the guide says.** Python is in 72–81% of the target postings. Interviewers probe Python depth (the GIL, async, concurrency vs parallelism), and several live rounds ban AI tools.

**What we have.** Python is the AI service language, but most of it was written with Claude or Codex in the loop, and the learning plans teach through C# ports. Unaided Python fluency is unproven.

**Smallest version.** Two 45-minute sessions a week, starting now because this is the slowest gap to close: implementation-style problems in levels (KV store with TTL, rate limiter, LRU cache, simple crawler) plus a short list of asyncio and GIL questions. No AI tools during the session. Coordinate with any DSA practice already running for other interviews.

### G7. LLM fundamentals and the fine-tuning answer

**What the guide says.** "Failing one fundamental can tank a strong interview." Expected at conversation depth: tokenization, attention and the transformer at a high level, the KV cache, temperature and top-p, context-window limits, and when you would fine-tune instead of prompting or using RAG.

**What we have.** The Foundations layer skims API mechanics only. Fine-tuning is deferred, which is right for the market (85% of roles have none), but the path has no concept-level answer to the fine-tuning question.

**Smallest version.** Two evenings: one on how LLMs work (a Karpathy introduction or Chip Huyen's *AI Engineering* chapter on foundation models), and one page answering "when would you fine-tune?" using this project. Indonesian bank-description categorization is the natural candidate to discuss, with the reasons it has not been needed so far. No fine-tuning project.

## Gaps already on the path that the guide moves up

- **P1. Agent evaluation (topic 9).** For Agentic titles this is the question: "How do you evaluate agent performance? Tool selection quality, task success." The five [advisor scenarios](../../services/ai-service/evals/advisor_scenarios.json) have been written but never run since PF-AI008 closed on 2026-09-15, and the [PF-AI007](../../plans/in-progress/learning/PF-AI007-tool-calling-agents-smolagents-todo.md) smoke test is still at 2 of 5. Still the first thing to close.
- **P2. Multi-agent orchestration (topic 11).** Multi-agent systems appear in 26% of Agentic postings and CrewAI or AutoGen in 23%. The guide also warns against using multiple agents without a reason. So the useful version is a measured comparison: the same scenarios run single-agent and orchestrator-worker, compared on quality, tokens and latency. That gives a "when not to use multi-agent" answer with numbers. Promote it from stretch only if you target Agentic titles specifically.
- **P3. Agent reliability.** The theory list asks about infinite loops, termination conditions, tool retries and idempotency, and sandboxing. Stop conditions (topic 7) and human-in-the-loop (topic 16) cover most of it. Add one item to topic 16: make the categorizer's write safe to retry.
- **P4. Public proof.** Nothing is published, and two blog drafts have waited since June. The guide's portfolio advice: a project page with problem, user, input, output, demo, architecture, tests, evaluation and limitations, plus a 60-second pitch. Add an "AI engineering in this repo" case-study page with the numbers table and links to the eval results, and publish the eval-harness post.
- **P5. The guardrail hold-out number.** [PF-AI011](../../plans/done/learning/PF-AI011-ai-security-governance-todo.md) blocked 0 of 4 held-out attacks. Don't present the guardrails as a success. Present them honestly: the pattern scanner did not generalize, here is why pattern guards fail on unseen attacks, and here is what you would add next. That is a stronger interview answer than a clean number.

## What to keep skipping

- **Fine-tuning projects, PyTorch and training-side MLOps.** Falling across the market and low in both target groups. The concept-level answer in G7 is enough.
- **More frameworks.** Frameworks appear together in postings rather than competing. LangGraph, smolagents and MCP cover the vocabulary. Be able to say why you would pick one over another.
- **AWS and Kubernetes depth.** Agentic postings are cloud-heavy, but Azure appears in 43% of them and is already your strength. Deploying on Azure in PF-AI012 is enough.
- **Voice and realtime.** 3–5% of target postings.
- **Forward Deployed roles.** Mostly customer-facing, which conflicts with the remote, async-first target.

## Applied or Agentic?

You don't have to pick yet. The two titles share agents, RAG and evaluation, and the plain "AI Engineer" title (the most common, 92% AI-first) covers both. The cleanest positioning is "an Applied AI Engineer who builds agentic systems":

- The Applied side is carried by the eval harnesses, G1 (feedback loop) and the product framing of the pyramid.
- The Agentic side is carried by the LangGraph advisor, MCP, guardrails, P1 and P2, and a backend background that matches what Agentic postings ask for (distributed systems, cloud, leadership).
- C#/.NET appears in 13% of Agentic postings but only 2% of Applied ones. Enterprise teams building agents on Microsoft's stack are a slice where ten years of C# is rare and valuable. That is also an argument for Azure AI-102 over Databricks if a certification happens.

## Proposed changes to the curriculum

Not applied yet. The curriculum file has uncommitted edits (the new Plan column), so these wait for your decision.

| Change | Chapter | Size |
|---|---|---|
| New topic 18: feedback loop (suggested vs kept categories into the eval set, thumbs on `/ask`), shipped with topic 16 | Ch9 | ~2 days |
| New topic 19: cost and latency engineering (TTFT, per-step latency, model routing, quota fallback, cost per query, 1M-user estimate) | Ch9.75, inside PF-AI012 | ~1.5 days |
| New topic 20: model upgrade gated by evals | Ch9.75, with topic 14 | ~0.5 day + quota |
| New topic 21: six timed AI system design practices | Ch11 | 6 × 1 hour |
| New topic 22: two timed take-homes with README and video | Ch11 | 2 × 5 hours |
| New topic 23: Python live coding without AI, twice a week | Ch11, starting now | 2 × 45 min a week |
| New topic 24: LLM fundamentals and the fine-tuning answer | Skim, before Ch11 | 2 evenings |
| Topic 11 (multi-agent) from stretch to required, as a measured single vs multi comparison | Ch9 | ~1.5 days, Agentic only |
| Topic 16 gains "make the categorizer write safe to retry" | Ch9 | small |
| Chapter 10 gains an AI case-study page in the repo | Ch10 | ~half a day |

Suggested order: close P1 (agent eval) → topics 16 and 18 together → PF-AI012 with 19 and 20 → case-study page and the first published post → topics 21, 22 and 24. Topic 23 runs in the background from now on.

## Method

- Field guide files read: README, `role/01–07`, `learning-paths/README` and `from-backend-engineer`, `interview/01`, `03`, `05`, `questions/01–04` and `06`, `portfolio/05–06`, `job-market/README`.
- Title buckets were computed with a small script over `job-market/data_structured/*/*.yaml`, deduplicated by job ID, AI-first only. Skills were matched with case-insensitive patterns on the extracted skill lists, and responsibilities with keyword patterns. The patterns are mine, not the guide's canonical taxonomy, so the shares can differ by a few points from the guide's own tables. Treat them as floors: a skill the posting doesn't spell out is not counted.
- Repo facts were checked in code: [TransactionPreview.tsx](../../apps/frontend/src/components/TransactionPreview.tsx) (AI suggestions with manual override, no logging), [chat_model_factory.py](../../services/ai-service/app/agents/chat_model_factory.py) (no alternate provider), no TTFT measurement found in the AI service, and the repo is public on GitHub.
