# Model Serving and Inference Pipelines

> **Topic doc, not a plan.** This is the reference for one line on the AI-First job-skills list
> (source: [alexeygrigorev/ai-engineering-field-guide](https://github.com/alexeygrigorev/ai-engineering-field-guide/blob/main/role/02-skills.md)):
> *"Model serving and inference pipelines."* It covers what the topic actually contains, with the
> state of this project used as the worked example throughout — including the honest gap between
> what this project does and what the topic describes. It does not assign build steps — if a
> chapter ticket comes out of this, it lives in `.claude/plans/learning/`.

---

## What it is

**Model serving is the discipline of taking a trained model and turning it into something a
running program can call — with a bounded latency, a bounded cost, and a known failure mode —
millions of times a day. An inference pipeline is everything that has to happen around that one
call: turn raw input into the tensor the model expects, batch it with other requests if that's
cheaper, run it, and turn the raw output back into something the caller can use.**

The distinction that trips people up: **training** produces a model file — weights on disk.
**Serving** is a completely different engineering problem — it's about the request path, not the
learning algorithm. A data scientist can produce a perfect model in a notebook and have no serving
story at all; a serving engineer can keep a mediocre model running at 50ms p99 under load a
notebook would fall over on. These are different skills, which is why "model serving" is its own
line on the AI-First skills list, separate from "fine-tuned LLMs for specific domains."

Concretely, this project already has one real example of local inference — not an LLM, but the
same category of problem. [`reranker.py`](../../services/ai-service/app/services/reranker.py) loads
a cross-encoder model once, at process start:

```python
class RerankerService:
    def __init__(self, cache_dir: str = "/tmp/flashrank") -> None:
        self._ranker = Ranker(model_name="ms-marco-MiniLM-L-12-v2", cache_dir=cache_dir)

    async def rerank(self, query: str, results: list[SearchResult], top_k: int = 3):
        ...
        # FlashRank is synchronous CPU inference — run off the event loop so a
        # 50ms model call doesn't block every other request in the service.
        ranked = await asyncio.to_thread(self._ranker.rerank, request)
```

That constructor call is model serving, in miniature: the ~34MB MiniLM weights are loaded into
process memory **once**, held for the life of the FastAPI worker, and reused for every `/ask`
request instead of reloading from disk each time. The `asyncio.to_thread` line exists because the
inference call is synchronous CPU work — without it, one rerank would block every other concurrent
request in the same process. That one line is the entire topic compressed: *model lifecycle
(load once) + request path (don't block on it)*.

### What it's used for

| Job | What "serving" has to solve |
|-----|------------------------------|
| **Real-time API inference** | A user is waiting — bound p99 latency, usually under a few hundred ms |
| **Batch inference** | No one is waiting — maximize throughput, minimize $/prediction, run overnight |
| **Streaming inference (LLMs)** | Token-by-token output so a 10-second generation feels instant after the first token |
| **Edge / on-device inference** | No server round-trip at all — model has to fit the device |
| **A/B and shadow serving** | Two model versions live at once, traffic split, compared safely before a full switch |

Same underlying question every time: *given this model, this request rate, and this latency
budget, what's the cheapest way to get an answer back?*

---

## The honest mapping to this project

This is the part worth saying plainly, because glossing over it would be worse than not writing
this doc: **this project does not serve its own models for anything that matters.** Every LLM call
— extraction, categorization, RAG answering, portfolio review, journey advice — goes to a hosted
API (Gemini primary, Anthropic alternate). That is calling *someone else's* serving
infrastructure, not building one. `ProviderFactory.create(settings)` picks a provider; neither
provider is something this codebase runs, scales, or pays a GPU bill for.

That's not a gap to apologize for — it's the correct architectural call for a two-person finance
app (see `THINK-01` in [governance.md](../../.claude/rules/governance.md): route to the simplest
correct thing, and "call a frontier API" beats "run your own inference cluster" for almost every
real product at this stage). But it does mean the *interview-ready* version of this topic has to be
built from the two things this project actually does that count as real serving problems, plus a
clear answer for what's missing.

**What actually counts as serving/inference-pipeline work here, today:**

| Component | Location | What makes it "serving," not just "an API call" |
|-----------|----------|--------------------------------------------------|
| **FlashRank cross-encoder** | [`reranker.py`](../../services/ai-service/app/services/reranker.py) | Local model, loaded once, held in process memory, CPU inference offloaded from the event loop — the full lifecycle in one class |
| **Embedding pipeline** | [`embedder.py`](../../services/ai-service/app/services/embedder.py) + [`embedding_factory.py`](../../services/ai-service/app/providers/embedding_factory.py) | Not local inference (Gemini/OpenAI embedding APIs), but a real **inference pipeline**: batch texts → call → get vectors → `asyncpg` + `pgvector.register_vector` to write straight to Postgres, bypassing PostgREST because pgvector needs the raw `<=>` operator |
| **LLM calls via typed HttpClients** | `Infrastructure/External/*.cs` on the .NET side | Consuming someone else's serving layer through a stable internal contract (`TransactionDto`) — the resilience half of the topic (timeouts, retries, error mapping) without the GPU half |

**What's genuinely absent, and would be the next step if this ever changed:**

1. **No self-hosted LLM.** No vLLM, TGI, Ollama, or llama.cpp anywhere in the stack. If the
   categorizer were ever fine-tuned into something small enough to self-host (see
   `docs/mentor/prompt-engineering.md`'s note on DSPy-style optimization as one path there), *this*
   is the doc that would cover how to actually run it.
2. **No batching of concurrent requests.** FlashRank reranks one request's results at a time. A
   real serving layer under load batches multiple *different* users' requests into one GPU forward
   pass — that's the core idea behind vLLM's continuous batching, and it's the single biggest lever
   on LLM-serving throughput. Nothing in this codebase needs it yet, because nothing here is
   GPU-bound.
3. **No model registry or rollback for the local model.** `Ranker(model_name="ms-marco-MiniLM-L-12-v2")`
   is a string constant, same failure mode `prompt-engineering.md` describes for prompts — pin a
   model name in code, and there's no version on the trace, no rollback path, no A/B.
4. **No load/latency SLO measured anywhere.** There's no p50/p95 number recorded for the reranker,
   the embedding calls, or the LLM calls as a *serving* concern (Langfuse records cost and latency
   per call, which is close — but nobody has asked "what's our p99 under concurrent load" yet).

---

## How it works, one layer at a time

### 1. The model has to live somewhere between requests

The wrong version: load the model inside the request handler.

```python
# WRONG — reloads ~34MB of weights from disk on every single request
async def rerank(query, results):
    ranker = Ranker(model_name="ms-marco-MiniLM-L-12-v2")
    ...
```

The right version — this project's actual code — loads it once in `__init__`, and the object is
constructed once at app startup (via DI / a singleton) and reused for the life of the process. This
is the first and most basic serving decision: **model load is expensive, inference is comparatively
cheap, so the load has to happen outside the request path.** For an LLM this is the same idea at a
much bigger scale — a 7B-parameter model can take tens of seconds and several GB of VRAM to load,
which is exactly why a serving framework keeps it resident and answers many requests against the
same loaded weights.

### 2. Inference has to not block everything else

`asyncio.to_thread(self._ranker.rerank, request)` exists for one reason: FlashRank's `rerank()` is
a **synchronous** call, and FastAPI's event loop is single-threaded for async code. Without offloading
it, one 50ms rerank would stall every other concurrent request the process is handling — uploads,
health checks, unrelated `/categorize` calls, all of it. This is the same problem GPU-serving
frameworks solve with a request queue and a dedicated inference worker pool; `to_thread` is the
cheapest version of that idea that works for CPU-bound Python.

### 3. Batching is the lever that actually moves cost and throughput

This project's embedding pipeline already batches — `embed_and_store` takes a `list[EmbedItem]` and
sends them to the provider as one call (`self._provider.embed_documents(texts)`), not one API call
per transaction. That's *client-side request batching*: fewer round-trips, lower per-item overhead.

Server-side batching is a different, bigger idea, and it's the one interviewers actually mean when
they ask about serving throughput: a GPU forward pass costs roughly the same whether it processes 1
sequence or 32 — so a serving layer that queues several *different users'* requests for a few
milliseconds and runs them as one batched forward pass gets far higher tokens/sec per GPU than
answering each request the instant it arrives. **Continuous batching** (vLLM's core contribution) goes
further — new requests join an in-flight batch as soon as any sequence finishes, instead of waiting
for the whole batch to complete, which is what makes LLM serving throughput-competitive at all. This
project has never needed this, because it has never hosted the model doing the inference.

### 4. Latency budget dictates the whole design

A real-time endpoint and an overnight batch job are solving opposite optimization problems even
when they use the same model:

| | Real-time (this project's `/ask`, `/categorize`) | Batch (this project has none, but e.g. a nightly re-embed of all transactions) |
|---|---|---|
| **Optimize for** | p95/p99 latency | Total cost, total throughput |
| **Batching** | Small batches or none — waiting to fill a batch adds latency the user feels | Large batches — nothing is waiting |
| **Hardware** | Provisioned for peak, often idle | Can use spot/preemptible capacity, run whenever cheapest |
| **Failure mode** | User sees a spinner or an error | A retry tomorrow costs nothing but a delay |

The categorize/answer/portfolio-review endpoints in this project are all real-time-shaped by
necessity — a user is on the other end. The embedding backfill (`embed_and_store` called across many
transactions at once) is the one place this project's actual traffic pattern is closer to batch —
worth noticing, because it's the shape most naturally suited to a self-hosted model if this project
ever needed one.

### 5. Streaming changes what "latency" even means

This project ships SSE streaming for the answer endpoint (PF-AI005) — the user sees tokens as
they're generated rather than waiting for the full response. This is a serving-layer concern, not a
prompting one: it requires the provider API to support token streaming, and the FastAPI endpoint to
forward chunks as they arrive rather than buffering the whole response. The number that matters here
isn't total latency, it's **time-to-first-token** — a 10-second total generation feels instant if the
first token appears in 300ms, and feels broken if the user stares at a blank screen for 9 seconds
before anything renders.

### 6. Serving needs the same resilience contract as any other network dependency

The .NET side's typed HttpClients (`LlmExtractionClient`, `PortfolioReviewClient`,
`JourneyAdvisorClient`, …) are consuming a served model over HTTP, and they carry the resilience
half of the topic even though this project doesn't run the GPU half:

- `LlmExtractionException` distinguishes transient vs. non-transient failures — a rate limit should
  retry, a malformed schema shouldn't.
- The AI service's own error contract (`.claude/rules/ai-service.md`) maps `502` for
  `provider_unavailable` and `llm_rate_limited` — the caller has to be able to tell "the model is
  down" apart from "the model said something invalid."
- `max_tokens` truncation is treated as a hard error, not a partial success — a serving-layer
  failure mode specific to generative models that a normal REST client wouldn't need to think about.

None of this requires running the model. All of it is still "inference pipeline" work — the request
path around the call, not the call itself.

---

## The tooling landscape

You will be asked which of these you've used. Know what each one *is* even where you haven't
adopted it — this project currently uses none of the self-hosting row.

| Tool | What it's for | Verdict for this stack |
|------|----------------|-------------------------|
| **vLLM** | High-throughput LLM serving — continuous batching, PagedAttention for KV-cache memory efficiency | Not used. The answer to "how would you serve a fine-tuned categorizer cheaply at scale" |
| **Text Generation Inference (TGI)** | Hugging Face's production LLM server — similar space to vLLM | Not used. Alternative answer to the same question |
| **Ollama / llama.cpp** | Local/edge LLM inference, quantized models, laptop-friendly | Not used. Relevant if this project ever needed to run fully offline (Indonesian regulatory/data-residency angle makes this a real, not hypothetical, question — see `/compliance`) |
| **ONNX Runtime** | Cross-framework inference runtime, model format-agnostic, CPU/GPU | Not used, but is what FlashRank uses under the hood for the MiniLM cross-encoder — worth knowing this project already depends on it transitively |
| **NVIDIA Triton Inference Server** | Multi-model, multi-framework serving with dynamic batching, used at real scale | Not used. The "enterprise" answer — know the name, know it's overkill here |
| **BentoML / Ray Serve** | Python-native model serving frameworks — wrap a model in a deployable service with autoscaling | Not used. The middle ground between "raw FastAPI + `asyncio.to_thread`" (what this project does) and Triton |
| **SageMaker / Vertex AI endpoints** | Managed hosted-model serving on the big clouds | Not used. Azure equivalent (Azure ML managed endpoints) is the natural answer given this project's declared Azure hosting target |

**Build-vs-adopt guidance, same principle as the prompt-engineering doc:** the FlashRank reranker is
already the right-sized answer for a single 34MB CPU model in a low-QPS service. Reach for vLLM/TGI
only when there's an actual self-hosted LLM to serve — adopting a GPU-batching framework for a
service that calls hosted APIs for everything except one small reranker would be solving a problem
this project doesn't have.

---

## What you should be able to say in an interview

Rehearse this until it's not recited:

> *"Most of our inference is hosted-API — Gemini primary, Anthropic as an alternate provider behind
> a factory — so the serving problem for us is mostly resilience: typed clients with transient vs.
> non-transient error classification, `502` mapping for rate limits and truncation, streaming for
> time-to-first-token on the answer endpoint. We do run one model locally — a FlashRank MiniLM
> cross-encoder for reranking retrieved transactions — and that's a good small example of the core
> serving lifecycle: load the ~34MB of weights once at process start, hold it resident, and run
> inference off the event loop with `asyncio.to_thread` so a synchronous CPU call doesn't block
> concurrent requests.*
>
> *If we ever fine-tuned something small enough to self-host — say, a distilled categorizer —
> the next real decision would be a serving framework: vLLM or TGI if it needed to scale under
> concurrent load, because the throughput lever that actually matters at that point is batching —
> specifically continuous batching, since a GPU forward pass costs about the same for one sequence
> or several, so queuing concurrent requests into one batch is where the real throughput gain comes
> from. We don't need that today because nothing we run is GPU-bound."*

Two follow-ups worth having an answer for:

- *"Why not self-host a model to cut LLM API costs?"* → Because the break-even is about
  utilization, not just per-token cost — a GPU sitting mostly idle waiting for a two-person finance
  app's request volume is more expensive than the API calls it would replace. Self-hosting wins at
  volume, or when data can't leave the building (a real Indonesian data-residency question this
  project would run through `/compliance` before ever deciding to self-host).
- *"What's the difference between what you did with the reranker and what you'd do serving an
  LLM?"* → Scale and batching, not the underlying idea. The reranker is single-request CPU inference
  with no queue; an LLM server under load needs a request queue, continuous batching, and usually a
  GPU-memory-aware scheduler (PagedAttention) because the KV-cache per request is large and variable
  in size. The "load once, don't block the event loop" instinct is exactly right at both scales —
  it's the batching and memory management that get much harder.

---

## Common mistakes

1. **Loading the model inside the request handler.** Turns a one-time cost into a per-request one —
   the exact bug the reranker's `__init__` avoids by construction.
2. **Blocking the event loop with synchronous inference.** One slow CPU/GPU call stalls every other
   concurrent request in an async framework if it isn't offloaded.
3. **Confusing "we call an LLM API" with "we do model serving."** They're different skills. Calling
   a hosted API well is a resilience problem (retries, timeouts, error mapping); serving a model is
   a systems problem (batching, memory, hardware). Both matter; don't claim the one you haven't done.
4. **Optimizing for throughput on a latency-bound endpoint, or vice versa.** Batching to raise
   throughput on a real-time endpoint the user is waiting on just adds latency they feel.
5. **Treating a pinned local model name as free of the versioning problem.** `Ranker(model_name="ms-marco-MiniLM-L-12-v2")`
   has exactly the same untraceable-string-constant failure mode as an unversioned prompt — see
   `prompt-engineering.md`'s Part 3 for the fix (name + version + label, not a bare string).
6. **Reaching for Triton/vLLM before there's a self-hosted model to serve.** Solving a scale problem
   that doesn't exist yet is wasted complexity, same principle as `THINK-01`'s "don't reach for LLM
   extraction when a direct parser works."

---

## Resources

**Serving fundamentals**
- vLLM — Why continuous batching matters → https://blog.vllm.ai/2023/06/20/vllm.html — the PagedAttention paper's own writeup, the clearest explanation of why batching is the throughput lever
- Hugging Face — Text Generation Inference docs → https://huggingface.co/docs/text-generation-inference — the TGI alternative, read for the vocabulary (continuous batching, quantization, tensor parallelism)
- Chip Huyen — *Designing Machine Learning Systems*, ch. 7 (Model Deployment and Prediction Service) → https://huyenchip.com/ml-interviews-book/ — batch vs. online prediction, the framing this doc's section 4 table borrows from
- NVIDIA Triton — Architecture overview → https://docs.nvidia.com/deeplearning/triton-inference-server/user-guide/docs/index.html — read for the concept of dynamic batching across models, not to adopt it here

**Project-local**
- [`reranker.py`](../../services/ai-service/app/services/reranker.py) — the one real local-inference example in this codebase, worth reading end to end
- [`embedder.py`](../../services/ai-service/app/services/embedder.py) + [`embedding_factory.py`](../../services/ai-service/app/providers/embedding_factory.py) — the batched inference pipeline pattern, API-backed
- [.claude/rules/ai-service.md](../../.claude/rules/ai-service.md) — the error-handling contract that stands in for a serving SLA when the "serving" is a hosted API
- [`prompt-engineering.md`](prompt-engineering.md) — Part 3 (versioning) applies unchanged to a pinned local model name, not just a prompt string

---

## Self-check

If you can answer these without looking, the topic has landed.

1. Why does `RerankerService.__init__` load the model, instead of `rerank()` loading it on each call?
2. What specifically does `asyncio.to_thread` protect against in the reranker, and what would break
   without it?
3. What's the difference between this project's embedding "batching" (`embed_documents(texts)`) and
   the continuous batching vLLM does? Why does the difference matter for throughput?
4. Name one endpoint in this project that's latency-bound and one workload that's closer to
   batch-shaped. What would change about how you'd serve each?
5. This project calls Gemini and Anthropic for every LLM task. Is that "model serving"? What's the
   actual skill being exercised there, if not that?
6. If the categorizer were fine-tuned into a small model, what would change about how it's served —
   and what wouldn't?
