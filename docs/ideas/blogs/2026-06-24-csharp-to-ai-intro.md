---
title: "I'm a C# engineer becoming an AI engineer in 90 days. Here's the method."
slug: "csharp-to-ai-engineer-90-days"
tags: ["ai-engineering", "csharp", "career", "python", "backend"]
series: "Backend to AI Engineer in 90 Days"
canonical_url: "https://rikky.hashnode.dev/csharp-to-ai-engineer-90-days"
status: draft
hashnode_url: null
---

Ten years of C# and .NET. Three companies. Tech Lead in the last one. And I spent the last six months staring at job descriptions for AI engineering roles thinking: *I could do this. But I can't prove it yet.*

That gap — between "I understand LLMs at a systems level" and "I have shipped a production RAG pipeline with evals" — is the exact gap this series documents. Every post is a shipped feature, a real number, or a lesson from the wrong turn before the right one. No theory for its own sake.

## Why pivot?

Not because AI is trending. Because the line between backend engineering and AI engineering is dissolving fast, and the engineers who can straddle it — who can design a RAG pipeline *and* own its Postgres schema, who understand latency percentiles *and* token cost curves — are the ones getting hired right now. That intersection is where I want to work.

I've already shipped AI features inside backend systems: a multi-provider LLM extraction pipeline (Gemini + Claude), structured output with `tool_use`, a three-tier deduplication system on extracted transactions. That's the foundation. But building *one* LLM-powered feature inside a backend service is not the same as being able to design, evaluate, and operate an AI system from scratch. The eval harness, the retrieval tuning, the agent loops — those were gaps I couldn't hide if someone asked the right questions in an interview.

The 90 days are for closing them, in public.

## What you'll read in this series

Every post in this series covers one concept, tied to one shipped feature, with one real number that tells you whether it worked.

The application is a gamified personal finance platform I've been building for the past year — a five-tier Financial Pyramid scoring engine that answers the question most financial tools ignore: *in what order should I fix my finances?* The pyramid computes where you stand across five levels — from Foundations (spending < income, bills paid) through Defense, Growth, Freedom, and Legacy — and surfaces what to do next. Every AI concept I learn gets implemented as a real feature inside it: LLM extraction feeding the cashflow data, semantic search across transactions, an AI portfolio reviewer, a financial advisor agent. The code is on GitHub. The numbers come from production runs.

This post is the origin story — the method, the reasoning, and what you'll get from reading it.

## The method (why most pivots fail)

Most engineers learn like this: watch a course, feel productive, forget 80% of it in 48 hours, watch another course. The "learning" never compounds because it never gets anchored to anything real. The amount of watched content goes up; the depth of ownership stays flat.

The approach here is built around five principles that cognitive science actually supports.

**Project-first learning.** Open the feature before the video. Pull theory only when you hit a wall you can't get through. This reverses the standard order — you show up to the material with a specific question, not a vague intention to learn.

**Active retrieval.** After every 25-minute video block, close the tab. Write from memory what you just learned. Re-watch only the gaps. Passive re-reading feels like learning; it isn't.

**Spaced repetition.** Touch each concept on Day 1, Day 3, Day 7, Day 21. A 15-minute revisit a week later beats a 4-hour binge today. Memory consolidates between sessions, not during them.

**Interleaving.** Morning: RAG tuning. Afternoon: agents. Mixing topics feels harder and less productive in the short term — it is. But transfer to new problems (which is what interviews test) is far better than blocked practice on a single concept.

**Teach-back.** After shipping each feature, write one paragraph explaining it to a new hire. If you can't do that clearly, you don't own the concept yet — you've just seen it.

The daily loop that operationalizes this:

```
06:30 – 07:00 (30m)  RETRIEVAL WARMUP
  Open progress log. Without looking at notes, write yesterday's
  key insight and the one concept you'd struggle to explain.
  Re-read only the gaps.

07:00 – 08:30 (90m)  DEEP WORK #1
  One concept. One video segment (≤20 min). One feature shipped.
  Commit. Done.

09:00 – 10:30 (90m)  DEEP WORK #2 (interleaved — different topic)
  If morning was RAG, afternoon is agents. Forces transfer-grade
  learning.

10:30 – 11:00 (30m)  TEACH-BACK + LOG
  Write the Feynman paragraph. Append to progress log. This
  becomes blog post and interview STAR story material.
```

3.5 focused hours beats 8 hours of passive watching, every time. The science on deliberate practice is unambiguous on this.

## The C# lens (why this series is different)

Every Python snippet in this series gets a C# equivalent. Not because the AI service will ever be rewritten in .NET — it won't. But because I'm a 10-year C# engineer, and the fastest path to fluency in a new paradigm is mapping it onto patterns you already own.

`asyncpg` connects to Postgres directly, the same way `Npgsql` does. `pytest` fixtures are test setup, same as `IClassFixture` in xUnit. A Python `dataclass` with field validators is a C# `record` with computed properties. These mappings aren't novel — they're the conceptual skeleton that makes new syntax stick instead of slide off.

```python
# Python — EmbeddingService stores a vector alongside the transaction
@dataclass
class EmbeddingService:
    client: AsyncOpenAI
    db: asyncpg.Connection

    async def embed_and_store(self, transaction_id: int, text: str) -> None:
        response = await self.client.embeddings.create(
            model="text-embedding-3-small",
            input=text
        )
        vector = response.data[0].embedding
        await self.db.execute(
            "UPDATE transaction_embeddings SET embedding = $1 WHERE id = $2",
            vector, transaction_id
        )
```

**C# equivalent** (Python `dataclass` with injected dependencies → C# class with constructor DI; `asyncpg` direct connection → `NpgsqlDataSource`; `await` maps 1:1):

```csharp
// C# — same service if this were a .NET component
public class EmbeddingService
{
    private readonly OpenAIClient _client;
    private readonly NpgsqlDataSource _db;

    public EmbeddingService(OpenAIClient client, NpgsqlDataSource db)
    {
        _client = client;
        _db = db;
    }

    public async Task EmbedAndStoreAsync(int transactionId, string text)
    {
        var response = await _client.GetEmbeddingsAsync(
            new EmbeddingsOptions("text-embedding-3-small", [text]));
        var vector = response.Value.Data[0].Embedding.ToArray();

        await using var conn = await _db.OpenConnectionAsync();
        await conn.ExecuteAsync(
            "UPDATE transaction_embeddings SET embedding = $1 WHERE id = $2",
            new { vector, transactionId });
    }
}
```

If you're a backend engineer who's been watching AI engineering from the sideline, the C# translation is there specifically for you.

## What's in the 90 days

The series maps to four capability layers, each closing a specific gap:

| Phase | Chapters | What I'm closing |
|-------|----------|-----------------|
| **Phase 1** (Days 1–30) | AI Observability, LLM Eval, RAG (embeddings + retrieval) | Can I measure and evaluate an LLM system? |
| **Phase 2** (Days 31–60) | Streaming, Advanced RAG, Agents (smolagents + LangGraph) | Can I build agentic systems? |
| **Phase 3** (Days 61–90) | MCP, Certification, Interview prep, Applications | Can I prove this in a real hiring process? |

Each post covers one shipped feature. Every claim comes with a number.

Already drafted:
- **Post #0** — *The bug my unit tests couldn't catch — so I built an LLM eval harness* (how I discovered that 100% unit-test pass rate is meaningless for LLM output quality, and what I built instead)

Coming soon:
- *What "monitor your LLM in production" actually means* (real Langfuse dashboards, real cost-per-doc numbers)
- *My RAG eval read 0.00 and I almost blamed the wrong thing* (the ground truth bug saga)

## The metric that keeps me honest

Every Sunday I ask one question:

> *"What's something I can say in an interview today that I couldn't say last Sunday?"*

If the answer is concrete — "I shipped a sentence-window retriever and measured a 14% MRR lift" — the week worked. If the answer is fuzzy — "I learned about embeddings" — the week was noise.

The difference between those two answers is the difference between this method and watching courses. One leaves you with evidence. The other leaves you with a longer watch history.

## What this series proves

That a senior backend engineer with no prior AI-engineering titles can build a production-grade AI system, measure it with real evals, and document the entire arc publicly — in 90 days, without quitting their job.

<!-- TODO: pin GitHub repo URL when ready to publish -->
Every commit referenced in this series is real.

*Part of my series: Backend → AI Engineer in 90 Days — published on Hashnode.*
