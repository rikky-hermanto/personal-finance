# AI Observability Metrics — Personal Finance Platform

**Captured:** 2026-05-31  
**Tool:** Langfuse Cloud (https://cloud.langfuse.com)  
**Provider:** Gemini 2.5 Flash (primary) / Claude Sonnet 4.6 (alternate)

## Extraction Pipeline Metrics

| Metric | Value | Notes |
|--------|-------|-------|
| Average cost per document | $0.00 | Full PDF statement, ~Xk tokens input |
| p50 latency | 19.02ms | Median extraction time |
| p95 latency | 32.65ms | Tail latency (slow statements) |
| Error rate | 0% | Captured in Langfuse error level |

## Provider Comparison (preliminary)

| Provider | Cost/doc | p50 Latency | p95 Latency |
|----------|----------|-------------|-------------|
| Gemini 2.5 Flash | $X.XXX | 19.02ms | 32.65ms |
| Claude Sonnet 4.6 | $X.XXX | Xms | Xms |

## Interview-ready numbers

1. "Extraction costs **$X.XXX per document** on Gemini 2.5 Flash"
2. "p95 extraction latency is **Xms** — measured via Langfuse tracing on real bank statements"
3. "Gemini is **X% cheaper** than Anthropic on our structured extraction workload"

_Numbers will be refined in Week 2 eval harness benchmarks._

## Embedding Pipeline Metrics (PF-AI003 — Week 3)

| Metric | Value | Notes |
|--------|-------|-------|
| Embedding model | `text-embedding-3-small` | OpenAI, 1536 dimensions |
| Cost per document | ~$0.000002 | ~100 tokens/doc × $0.02/1M tokens |
| Full corpus cost (5,000 docs) | ~$0.01 | One-time backfill cost |
| p50 embed latency (batch 50) | — | To be measured after backfill |
| p95 embed latency (batch 50) | — | To be measured after backfill |
| Search p50 latency | — | To be measured via eval_retrieval.py |
| Search p95 latency | — | To be measured via eval_retrieval.py |
| MRR@5 baseline | — | Run `evals/eval_retrieval.py` after backfill |

_Run `PYTHONPATH=. python evals/eval_retrieval.py` after backfilling to populate the latency and MRR numbers._

## Retrieval Architecture (PF-AI003)

- **Table:** `transaction_embeddings` (pgvector 1536-dim, ivfflat index, cosine distance)
- **Embed text:** `description | remarks | category | wallet` — category adds semantic signal for terse bank codes
- **Index:** ivfflat (lists=100); switch to hnsw at ~100k+ rows
- **Endpoint:** `POST /embed-transactions` (batch upsert), `POST /search` (cosine similarity top-K)
- **Interview number:** "Embedding costs ~$0.000002/doc on text-embedding-3-small; 5,000 transactions = $0.01 total"