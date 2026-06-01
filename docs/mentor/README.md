# /mentor — AI Engineering Pivot Coach

Your daily structured guide for transitioning from Backend Engineering to AI Engineering within 90 days.

**Started:** 2026-05-27 · **Target:** ~2026-08-25

---

## Quick Start

Open any chat in this project (or `personal-finance`) and type:

```
/mentor
```

That's it. It reads your progress, figures out where you are in the 90-day plan, and tells you what to do today.

---

## Commands

| Command | When to use |
|---|---|
| `/mentor` | Every morning — get today's focus |
| `/mentor today` | Same as above |
| `/mentor log <what you did>` | Every time you finish something — keep the log alive |
| `/mentor status` | When you want the full picture — all phases, all tasks |
| `/mentor weekly` | Sunday night or Monday morning — review + plan the week |
| `/mentor plan` | When you want to see the full 30/60/90 roadmap |
| `/mentor cert <name>` | Before buying any course or certification |
| `/mentor gap` | Re-assess how your skills stack up against AI Eng JDs |

---

## The 90-Day Plan (overview)

### Phase 1 — Close Critical Gaps (Days 1–30)
| Week | Theme | Goal |
|---|---|---|
| 1 | AI Observability + Real Metrics | Add Langfuse; quote cost-per-doc and p95 latency |
| 2 | LLM Evaluation Framework | Build eval harness; benchmark Gemini vs Claude |
| 3 | Agentic Frameworks Entry | DeepLearning.AI courses + first LangGraph agent |
| 4 | Demo + Documentation | 2-min Loom + one-pager case study + updated CV |

### Phase 2 — Agentic + RAG Proof (Days 31–60)
| Week | Theme | Goal |
|---|---|---|
| 5–6 | Full RAG Pipeline | "Ask your finances" chat with pgvector + reranker |
| 7 | Streaming + Advanced Patterns | SSE streaming end-to-end (FastAPI → React) |
| 8 | LangGraph Multi-Agent | Financial Health Advisor agent with tool use |

### Phase 3 — Positioning + Active Hunt (Days 61–90)
| Week | Theme | Goal |
|---|---|---|
| 9–10 | Public Presence + Certification | Blog post live + Databricks or Azure AI-102 cert passed |
| 11 | Interview Prep | 5 STAR stories + 3 deep-dives rehearsed |
| 12 | Active Applications | 5+ high-fit applications sent |

Full detail: [`.agents/skills/mentor/learning-path.md`](../.agents/skills/mentor/learning-path.md)

---

## Files

```
docs/mentor/
  README.md       ← you are here
  progress.md     ← your live log (the skill reads and writes this)
  ai-engineer-learning-path.md
  ai-engineer-learning-tips.md
  ai-engineering-usecase-map.md

.agents/skills/mentor/
  SKILL.md        ← skill brain (modes, rules, prompts)
  learning-path.md← full 30/60/90 day curriculum with resources

.claude/skills/mentor/
  SKILL.md        ← redirect (makes /mentor work in Claude Code)
```

**Also installed in:** `C:\workspaces\career-ops\` — progress tracked in `docs/mentor/progress.md` there too.

---

## The Progress Log

`docs/mentor/progress.md` is your source of truth. The skill reads it every time you run `/mentor` to figure out where you are and what's next.

**Keep it alive by logging regularly:**

```
/mentor log finished Langfuse integration — cost tracking live, p95 latency 1.2s
/mentor log completed eval harness: 92% accuracy on Gemini, 89% on Claude, Gemini 38% cheaper
/mentor log recorded Loom demo and published to YouTube (unlisted)
```

The more you log, the smarter the daily focus gets. If you go silent for a few days, `/mentor today` will notice and recalibrate.

---

## Why This Skill Exists

After scanning JDs at target companies (Grafana, Supabase, GitLab, PostHog, WorkOS, 1Password), C#/.NET backend roles are nearly absent. These companies run Python, Go, and Rust. Waiting for a C# role at an async-first company is not a viable strategy.

The pivot is: **Backend Engineer (C#/.NET) → AI Engineering / Backend AI Engineering** — using the Personal Finance Platform as the primary proof point and closing specific gaps (agentic frameworks, RAG, LLM eval, AI observability) in a deliberate 90-day sequence.

The skill was built to give daily structure so the pivot doesn't get lost in day-to-day work.

---

## Keeping Both Projects in Sync

The skill is installed in both `career-ops` and `personal-finance`. Progress is tracked in `mentor/progress.md` in each project root.

**Recommended workflow:**
- Run `/mentor` and `/mentor log` from `personal-finance` (that's where the actual AI work happens)
- Periodically copy `personal-finance/mentor/progress.md` → `career-ops/mentor/progress.md` to keep them aligned

Or just pick one project and use it consistently.

---

## Certification Guide (summary)

**Free first — always:**
- DeepLearning.AI short courses (LangChain, LangGraph, RAG) — Week 3–5, ~10h total

**Pick one paid cert (Week 9–10):**
- **Databricks GenAI Engineer Associate** (~$200) — highest signal for AI Eng roles
- **Azure AI Engineer Associate AI-102** (~$165) — good if targeting Azure-stack companies; builds on your existing Azure background

**Skip:**
- AWS ML Specialty, generic cloud certs, long ML specializations — wrong signal for this pivot

Full cert evaluation: `/mentor cert <name>` for any specific cert you're considering.
