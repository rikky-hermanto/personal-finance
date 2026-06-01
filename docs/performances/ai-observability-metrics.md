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