# Learning Tips — Fastest Path to Mastery

**Companion to:** [`ai-enginer-learning-path.md`](./ai-enginer-learning-path.md)
**Horizon:** 12 weeks. Goal: interview-ready, not exam-ready.
**Strategy:** Collapse "learn → build → prove" into a single daily loop.

---

## The 5 Principles (what the research actually says)

| Principle | What it means for you | Why it works |
|---|---|---|
| **Active retrieval > passive review** | After every 25-min video block, close the tab and *write from memory* what you just learned. Re-watch only the gaps. | Roediger & Karpicke 2006 — testing produces 50%+ better long-term retention than re-reading. |
| **Project-first, theory-on-demand** | Open the Personal Finance feature you're about to ship. Pull theory only when you hit the wall. Don't watch a full course before touching code. | Cognitive load theory — schemas form faster when bound to a concrete problem. Generic theory has no anchor and decays. |
| **Spaced repetition over cramming** | Touch each concept on Day 1, Day 3, Day 7, Day 21. A 15-min revisit beats a 4-hour binge. | Ebbinghaus forgetting curve — 80% of new info gone in 48h without retrieval. |
| **Interleaving > blocked practice** | Don't spend 2 weeks pure-RAG then 2 weeks pure-Agents. Mix: morning RAG retrieval tuning, afternoon LangGraph node. | Rohrer 2012 — interleaving worse for short-term feel, dramatically better for transfer (which is what interviews test). |
| **Feynman / teach-back** | After shipping each feature, write a 1-paragraph explanation as if onboarding a new hire. If you can't, you don't own it. | Forces compression. Compression forces understanding. Also: free CV/blog material. |

---

## The Daily Loop (≤ 4 focused hours)

Optimized for retention, not hours-logged. **Quality of attention > quantity of time.**

```
06:30–07:00 (30m) — RETRIEVAL WARMUP
  Open progress.md. Without looking at notes, write what you shipped
  yesterday + the one concept you'd struggle to explain. Re-read only
  the gaps. This is your spaced-repetition layer.

07:00–08:30 (90m) — DEEP WORK BLOCK #1  (Phase 2 or 3 — the critical path)
  Pick ONE concept (e.g., "sentence-window retrieval"). Watch only the
  specific 10–20 min segment of the course that covers it. Stop. Open
  Personal Finance. Implement it. Commit. Done.

  Rule: if the video is longer than 20 min, you picked the wrong scope.
  Break it smaller.

09:00–10:30 (90m) — DEEP WORK BLOCK #2  (interleaved — different phase)
  If morning was RAG, afternoon is Agents/MCP. If morning was eval
  harness, afternoon is streaming. Forces transfer-grade learning.

10:30–11:00 (30m) — TEACH-BACK + LOG
  Write the Feynman paragraph for the morning's work. Append to
  progress.md. This is the artifact you'll mine for blog posts and
  STAR stories in Weeks 11–12.

Total: 3.5h focused. No 8-hour grinds. Diminishing returns hit hard
after 4h of cognitively demanding work (Ericsson, deliberate practice).
```

**Weekends:** one 2-hour consolidation block on Sunday — review the week's commits, write a 5-bullet "what I learned" note. Rest the rest.

---

## The Anti-Patterns to Avoid

1. **Watching courses end-to-end.** You'll feel productive and learn nothing transferable. Cherry-pick segments tied to the feature you're shipping today.
2. **Note-taking during videos.** Verbatim notes = passive copying. Take notes *after* the video, from memory.
3. **Reading documentation linearly.** Read docs the way you'd use Stack Overflow — query-driven, in response to a specific blocker.
4. **Building parallel toy projects.** Every line of code goes into Personal Finance. A second repo splits attention and kills the portfolio compound effect.
5. **Perfectionism on any single feature.** Ship "good enough to demo + measure" in v1. You can refine in v2 next week. The eval harness will tell you what actually needs improving.
6. **Certification before shipping.** Certs are signal *boosters*, not signal *creators*. Defer all of them to Weeks 9–10 minimum.

---

## Per-Phase Speed Hacks

### Phase 2 — RAG + Evals + Observability (Weeks 1–6)

- Skip Phase 1 entirely except a 1-evening Anthropic prompt-caching skim.
- **Langfuse first (Week 1)** — once you're tracing, every other experiment generates data automatically. Compound returns.
- Use your existing PostgreSQL + pgvector. Do not learn Chroma/FAISS — irrelevant detour for your stack.
- Eval harness: 20 fixtures is plenty. Don't gold-plate to 200.

### Phase 3 — Agents + MCP (Weeks 7–10)

- Start with **smolagents** (smallest API surface) before LangGraph. You'll grok the *concept* of tool loops in 1 day, then learn LangGraph as "industrial smolagents."
- **MCP:** build a server before you read the spec. Anthropic's quickstart gets you running in 30 min. The spec makes sense only after you've shipped one.

### Phase 4 — Production AI

**Don't.** Not now. Revisit only if a specific JD demands fine-tuning.

---

## The Single Metric That Matters

Every Sunday, ask one question:

> **"What's something I can say in an interview today that I couldn't say last Sunday?"**

If the answer is concrete ("I shipped a sentence-window retriever and measured a 14% MRR lift on my fixtures"), the week worked. If the answer is fuzzy ("I learned about embeddings"), the week was a waste — switch to project-first immediately.

---

## Bottom Line

The science is unambiguous: **retrieval + spaced + interleaved + project-anchored beats hours-logged by a factor of 3–5×.** You don't need more hours — you need a tighter loop. 3.5h/day on this protocol will beat 8h/day of course-binging, and leave you the energy to actually interview when calls start coming in.
