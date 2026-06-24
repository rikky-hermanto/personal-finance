# PF-131 — Mentor Auto-Blogging: Draft → Hashnode Pipeline

> **Status:** In Progress (publishing blocked — see STEP 1)
> **Started:** 2026-06-24
> **Planned from branch:** main

## Objective

Extend the `/mentor` skill with two new argument modes — `blog` and `blog post` — that automate the editorial pipeline defined in [docs/ideas/blogs/blogging-plan.md](../../../docs/ideas/blogs/blogging-plan.md). The `blog` mode drafts a publish-ready blog post from the activity logs and learning plans; the `blog post` mode pushes the draft to Hashnode via GraphQL API and logs the live URL back to `docs/mentor/progress.md`. This closes Chapter 10 ("Public Presence") of the 90-day AI Engineering pivot.

## Acceptance Criteria

- [x] `/mentor blog` generates a complete, scrubbed draft saved to `docs/ideas/blogs/YYYY-MM-DD-{slug}.md` with YAML frontmatter (title, slug, tags, status: draft)
  > Verification note: mode implemented in SKILL.md (Mode: blog). Post #0 draft generated at `docs/ideas/blogs/2026-06-24-eval-harness.md` (1155w, `status: draft`, exactly 2 `---` delimiters). Privacy scrub passed.
- [ ] `/mentor blog post` reads the most recent draft and publishes it to `https://rikky.hashnode.dev/` via the Hashnode GraphQL API
  > Not met: Hashnode API requires Pro plan as of May 2026; `gql.hashnode.com` redirects non-Pro accounts to the announcement page. Mode is implemented in SKILL.md but cannot be tested until Pro is active and PUBLICATION_ID is set.
- [ ] Published URL is logged back to [docs/mentor/progress.md](../../../docs/mentor/progress.md) and the editorial calendar in [docs/ideas/blogs/README.md](../../../docs/ideas/blogs/README.md)
  > Not met: depends on publishing step above.
- [x] [docs/ideas/blogs/README.md](../../../docs/ideas/blogs/README.md) exists with the 8-post editorial calendar from the blogging plan
  > Verification note: file exists and confirmed readable; contains Backlog/Drafting/Published status board, 8+ posts, weekly workflow, privacy scrub checklist, and positioning bio — richer than plan spec.
- [x] [docs/ideas/blogs/_template.md](../../../docs/ideas/blogs/_template.md) exists with all 3 archetype skeletons
  > Verification note: file exists with Build Log/Deep-Dive, Concept Ladder, and Short Take archetypes, each with full section structure and C# equivalent instructions.
- [x] Privacy scrub checklist passes before any draft is marked ready to post
  > Verification note: Post #0 (`2026-06-24-eval-harness.md`) verified — no company names, no real personal financial data, no API keys in code snippets, no private plan details verbatim.

## Approach

Extend [.agents/skills/mentor/SKILL.md](../../../.agents/skills/mentor/SKILL.md) with two new modes following the existing Mode Routing pattern. The `blog` mode reads [docs/mentor/progress.md](../../../docs/mentor/progress.md) and the relevant PF-AI learning plan, fills the matching archetype template (Build Log / Concept Ladder / Short Take), applies the privacy scrub, and saves a draft. The `blog post` mode reads the draft's YAML frontmatter, uses Python inline for safe JSON escaping, calls the Hashnode GraphQL API via `curl`, and logs the result. Hashnode is the canonical publisher; dev.to cross-posting is deferred (no canonical_url back-link possible until Hashnode is live). `HASHNODE_PAT` and `HASHNODE_PUBLICATION_ID` are environment variables — never hardcoded in the skill.

## Affected Files

| File | Change |
|------|--------|
| [.agents/skills/mentor/SKILL.md](../../../.agents/skills/mentor/SKILL.md) | Edit — add `blog` and `blog post` to Mode Routing + two mode definitions |
| [docs/ideas/blogs/README.md](../../../docs/ideas/blogs/README.md) | Create — editorial calendar with 8-post schedule + status board |
| [docs/ideas/blogs/_template.md](../../../docs/ideas/blogs/_template.md) | Create — 3 archetype skeletons with frontmatter |
| [.claude/plans/BOARD.md](../BOARD.md) | Edit — add PF-131 row to Ready column |

---

## TODO

### [!] STEP 1 — Get Hashnode credentials and publication ID (one-time setup)
> **Failure:** HASHNODE_PAT confirmed in .env; PUBLICATION_ID placeholder added with API query command and Pro plan upgrade note. Auto-fetch of PUBLICATION_ID failed because `gql.hashnode.com` redirects all requests to the announcement page for accounts without a Pro plan (as of May 2026). Manual steps to complete: (a) upgrade publication to Pro at `hashnode.com/[username]/dashboard/billing`; (b) run the API query command in the .env comment to get PUBLICATION_ID; (c) fill in `HASHNODE_PUBLICATION_ID` in root `.env`.

**1a — Create your Hashnode account (skip if you already have one)**

1. Go to [hashnode.com](https://hashnode.com) and click **Sign up**
2. Sign in with GitHub (recommended — keeps your dev identity consistent)
3. Choose a username: `rikky` maps to `https://rikky.hashnode.dev/`
4. Create a publication when prompted — or later via dashboard → **Blogs** → **Create a blog**. Title it "Backend to AI Engineer in 90 Days" or similar.

**1b — Get your Personal Access Token (PAT)**

1. Log in at hashnode.com
2. Click your avatar (top-right) → **Settings**
3. In the left sidebar, click **Developer** (direct URL: `hashnode.com/settings/developer`)
4. Under **Personal Access Tokens**, click **Generate New Token**
5. Name it `personal-finance-claude` so you know which app uses it
6. Copy the token immediately — **it is shown only once**. If you lose it, revoke and regenerate.

**1c — Fetch your Publication ID and store both credentials**

Set your PAT, then run the query below to get the publication ID:

```bash
export HASHNODE_PAT="your-pat-here"

curl -s -X POST https://gql.hashnode.com \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $HASHNODE_PAT" \
  -d '{"query": "{ me { publications(first: 1) { edges { node { id title } } } } }"}' \
  | python3 -m json.tool
```

Copy the `id` value from the response — this is your `HASHNODE_PUBLICATION_ID`. Add both to your shell profile or `.env`:

```bash
export HASHNODE_PAT="xxxx"
export HASHNODE_PUBLICATION_ID="xxxx"
```

> **Why:** The Hashnode v2 GraphQL API identifies your blog by a stable opaque `publicationId`, not the subdomain. Fetching it once avoids an extra API round-trip on every publish, and storing it as an env var keeps the credential outside the skill file (SEC-01).

---

### [x] STEP 2 — Create docs/ideas/blogs/README.md (editorial calendar)

Create [docs/ideas/blogs/README.md](../../../docs/ideas/blogs/README.md) with the 8-post plan from [docs/ideas/blogs/blogging-plan.md](../../../docs/ideas/blogs/blogging-plan.md):

```markdown
# Blog — "Backend → AI Engineer in 90 Days"

> Canonical: https://rikky.hashnode.dev/ · Cross-post: dev.to (`canonical_url` → Hashnode)
> Series: *Backend → AI Engineer in 90 Days*

## Status Board

| # | Slug | Archetype | Source | Status | URL |
|---|------|-----------|--------|--------|-----|
| 0 | eval-harness | Build Log | PF-AI002 | Backlog | — |
| 1 | c-sharp-to-ai-pivot | Short Take | ai-engineer-learning-tips.md | Backlog | — |
| 2 | llm-observability | Build Log | PF-AI001 | Backlog | — |
| 3 | rag-eval-zero | Build Log | PF-AI003 | Backlog | — |
| 4 | embeddings-for-dba | Concept Ladder | PF-AI003 | Backlog | — |
| 5 | reranking-when-wrong | Concept Ladder | PF-AI004 | Backlog | — |
| 6 | citation-guards | Build Log | PF-AI004 | Backlog | — |
| 7 | gate-not-loop | Short Take | closed-loop-ai-engineering.md | Backlog | — |

## Editorial Calendar

| # | Working title | Archetype | Source plan |
|---|---------------|-----------|-------------|
| **0 — Flagship** | *The bug my unit tests couldn't catch — so I built an LLM eval harness* | Build Log | [PF-AI002](../../../.claude/plans/learning/PF-AI002-llm-evaluation-framework.md) |
| 1 | *I'm a C# engineer becoming an AI engineer in 90 days. Here's the method.* | Short Take | [ai-engineer-learning-tips.md](../../mentor/ai-engineer-learning-tips.md) |
| 2 | *What "monitor your LLM in production" actually means* | Build Log | [PF-AI001](../../../.claude/plans/learning/PF-AI001-ai-observability.md) |
| 3 | *My RAG eval read 0.00 and I almost blamed the wrong thing* | Build Log | [PF-AI003](../../../.claude/plans/learning/PF-AI003-rag-embeddings-retrieval.md) |
| 4 | *Embeddings for people who own the database* | Concept Ladder | [PF-AI003](../../../.claude/plans/learning/PF-AI003-rag-embeddings-retrieval.md) |
| 5 | *Re-ranking: when your retriever is confidently wrong* | Concept Ladder | [PF-AI004](../../../.claude/plans/learning/PF-AI004-rag-reranking-generation.md) |
| 6 | *Citation guards: stopping the LLM from citing rows it never saw* | Build Log | [PF-AI004](../../../.claude/plans/learning/PF-AI004-rag-reranking-generation.md) |
| **7 — Flagship #2** | *The gate, not the loop, is the design* | Short Take | [closed-loop-ai-engineering.md](../../architecture/closed-loop-ai-engineering.md) |

## Weekly workflow

1. **Source** — pick next Backlog row from the Status Board above
2. **Draft** — run `/mentor blog` (or `/mentor blog N` for a specific post)
3. **Scrub** — privacy gate: no company names, no real financial data, no secrets
4. **Polish** — one self-edit pass (`/tech-write` for structure/voice)
5. **Publish** — run `/mentor blog post` → Hashnode (canonical) → cross-post dev.to
6. **Close** — paste URL back via `/mentor log "Published: {url}"` · tick Chapter 10
```

> **Why:** This README is the durable state that `blog` and `blog post` modes read across sessions to find the next post and record published URLs. Without it, every session starts blind.

---

### [x] STEP 3 — Create docs/ideas/blogs/_template.md (3 archetype skeletons)

Create [docs/ideas/blogs/_template.md](../../../docs/ideas/blogs/_template.md):

````markdown
# Blog Post Template — 3 Archetypes

> Pick one archetype. Fill every slot — especially the diagram and the transitions.
> Privacy gate before publish: no company names, no real financial data, no secrets.
> Output must read like a polished engineering post on Dan Luu / Julia Evans / Cindy Sridharan —
> not a tutorial dump. Prose flows; sections connect; the diagram earns its place.

---

## Archetype 1: Build Log / Deep-Dive (1200–1800w)

*Shape: Concrete hook → what I built → the wall I hit → the fix → the metric*

```yaml
---
title: ""
slug: ""
tags: ["ai-engineering", "python", "csharp", "backend"]
series: "Backend to AI Engineer in 90 Days"
canonical_url: "https://rikky.hashnode.dev/{slug}"
status: draft
hashnode_url: null
---
```

### Intro hook (2–3 sentences)
[Lead with the outcome or the surprise — a real number, a real failure, a real fix. No preamble,
no "In this post I will". The reader decides to stay or leave in the first two sentences.]

[Transition out: one sentence that widens the lens — why this problem is not just mine.]

### High-level diagram — what the system looks like
[Mermaid or ASCII box diagram showing the pipeline or architecture the post is about.
REQUIRED. Position it here, before any deep-dive, so the reader has a mental map before the
story starts. For a RAG post: show query path + retrieval. For an eval post: show the eval loop.
Keep it high-level — 5–7 boxes max, arrows showing data flow. Label with real component names.]

Example format (replace with the actual diagram):
```
┌──────────────┐     ┌───────────────┐     ┌──────────────────┐
│ Bank PDF     │────▶│ PyMuPDF text  │────▶│ LLM (Gemini)     │
│ (raw input)  │     │ extractor     │     │ structured output │
└──────────────┘     └───────────────┘     └─────────┬────────┘
                                                     │
                                           ┌─────────▼────────┐
                                           │ Validation        │
                                           │ pipeline (5-step) │
                                           └─────────┬────────┘
                                                     │
                                           ┌─────────▼────────┐
                                           │ PostgreSQL        │
                                           │ (de-duped rows)   │
                                           └──────────────────┘
```

### The setup (150–250w)
[Context: what I was trying to ship, the technical constraint, what I expected. Short paragraphs
(3–4 sentences max). No jargon without a one-line gloss on first use. The setup exists to make
the wall hurt more — don't over-explain it.]

[Transition out: a sentence that signals the turn — "That assumption was wrong."]

### The wall (200–300w)
[What actually happened. The specific error, number, or symptom. First-person, present tense:
"I run the eval. Row F1 comes back 0.00." A reader who has hit something similar should wince.
Include the diagnostic step that revealed the root cause — not just "it broke" but "here's
exactly how I found out why it broke."]

[Transition out: "Here's what I changed."]

### The fix (300–500w)
[What worked. Write the reasoning, not just the code — one paragraph explaining the mental model
before the code block. Python snippet immediately followed by C# equivalent (mandatory).]

[Prose bridge between code blocks: "The C# version swaps X for Y because…" — don't just drop
two code blocks with no connective tissue.]

[Transition out: "So did it work?"]

### The metric (100–150w)
[Before and after in a tight comparison — a small table or bolded numbers. This is the
proof-of-skill paragraph. Never invent numbers; use only what's in progress.md.]

### What this proves (50–100w)
["This demonstrates [specific AI engineering skill] in a production context."
GitHub repo link. Series intro line: "Part of my *Backend → AI Engineer in 90 Days* series."]

---

## Archetype 2: Concept Ladder (1000–1500w)

*Shape: Naive version → wall → fix → next wall → fix → what ships*

```yaml
---
title: ""
slug: ""
tags: ["ai-engineering", "python", "csharp", "tutorial"]
series: "Backend to AI Engineer in 90 Days"
canonical_url: "https://rikky.hashnode.dev/{slug}"
status: draft
hashnode_url: null
---
```

### Intro (100–150w)
[Who this is for. The concept in one sentence. Why someone in a backend role should care.
End with a "payoff promise" — what the reader will understand by the end that they don't now.]

### High-level diagram — the concept in one picture
[A ladder or progression diagram that shows where this concept sits in the bigger pipeline.
REQUIRED. Draw it before Stage 0 so the reader knows where they're climbing to.
For an embeddings post: naive keyword match → vector space → cosine similarity → index.
For a re-ranking post: bi-encoder retrieval → cross-encoder re-score → final ranked list.
ASCII or Mermaid. 5 boxes or stages max.]

### Stage 0 — [The naive version that works]
[2–3 sentences: the simplest approach. What it gets right. Then:
> **The wall:** [One concrete failure from this project — a real query, a real wrong result.
> Make the reader feel the problem before naming the fix.]]

[Transition: "That's when I reached for [concept name]."]

### Stage 1 — [The fix: concept name in bold]
[Name the new concept **in bold** + one-line plain-language gloss. Then 2–3 sentences
explaining the mechanism, not the API. Python + C# equivalent. Then:
> **The wall:** [The next limitation this stage reveals.]]

[Continue until Stage N…]

### Stage N — [What this chapter ships] ← mark this clearly
[The production version. "This is what I shipped." Short paragraph, then the final code.]

[Transition to key takeaway: "After climbing this ladder, the thing that surprised me most was…"]

### Key takeaway (50w)
[The one sentence a C# engineer can take away and reuse. Specific, not generic.
"When your retriever is fast but confidently wrong, the fix isn't a better retriever — it's a
cross-encoder re-scoring the top-k before the user sees anything."]

### What this proves (50–100w)
[Same pattern as Build Log. GitHub link. Series line.]

---

## Archetype 3: Short Take (500–800w)

*Shape: Claim → evidence → implication → so what*

```yaml
---
title: ""
slug: ""
tags: ["ai-engineering", "opinion", "backend"]
series: "Backend to AI Engineer in 90 Days"
canonical_url: "https://rikky.hashnode.dev/{slug}"
status: draft
hashnode_url: null
---
```

### The claim (1 bold sentence)
[Your ownable idea. Not "AI is changing things." Something a hiring manager quotes back in
an interview. "The gate, not the loop, is the design." "Your eval is only as good as its
ground truth." Specific. Falsifiable. Surprising to someone who hasn't built this.]

### High-level diagram — the mental model
[A simple diagram that makes the claim visual. REQUIRED. A before/after, a contrast, a
decision tree, or a flow. Even a Short Take earns a diagram if the insight has structure.
Max 5 boxes. If the insight is purely about a single decision: a 2-column comparison table
works. Only skip the diagram if the claim is genuinely purely verbal and adding a diagram
would dilute it — note "diagram omitted: claim is verbal" in a comment.]

### The evidence (200–300w)
[2–3 concrete examples from the Personal Finance project. Real numbers. The evidence exists
to make the claim feel discovered, not asserted. Paragraphs, not bullets — this is a take,
not a checklist.]

[Transition: "The implication is broader than this project."]

### The implication (150–200w)
[What changes if the reader accepts the claim. One architectural or workflow consequence.
Write it as a recommendation: "If you're building X, this means Y."]

### What this proves (50–100w)
[Same pattern. GitHub link. Series line.]
````

> **Why:** Slots without quality constraints produce slot-shaped content. The diagram requirement forces a mental model before the prose; the transition lines force narrative flow between sections; the prose quality benchmarks (Dan Luu / Julia Evans register) give the mode a calibration target. These rules are what separate an editorial post from a structured dump.

---

### [x] STEP 4 — Add `blog` and `blog post` to Mode Routing in SKILL.md

In [.agents/skills/mentor/SKILL.md](../../../.agents/skills/mentor/SKILL.md), add two rows to the Mode Routing table. **Put `blog post` above `blog`** so the longer pattern matches first:

```markdown
| `blog post` | **blog-post** — Publish the most recent draft to Hashnode |
| `blog` or `blog <#>` | **blog** — Draft the next (or numbered) post from activity logs |
```

> **Why:** String matching is sequential — `blog post` must appear before `blog` in the routing table, otherwise `blog post` matches the shorter `blog` rule and the post number gets treated as the draft target.

---

### [x] STEP 5 — Add `## Mode: blog` to SKILL.md

After the `## Mode: gap` section in [.agents/skills/mentor/SKILL.md](../../../.agents/skills/mentor/SKILL.md), add:

```markdown
---

## Mode: blog

Draft a publish-ready blog post from the activity logs and learning plans.

Default: drafts the next `Backlog` post in `docs/ideas/blogs/README.md`.
Optional: `/mentor blog 3` drafts post #3 specifically.

**Steps:**
1. Read [docs/ideas/blogs/README.md](docs/ideas/blogs/README.md) — find the next Backlog row (or the numbered row if specified). Note the archetype and source plan.
2. Read [docs/mentor/progress.md](docs/mentor/progress.md) — extract session entries for the source plan's dates.
3. Read the source learning plan (e.g. `.claude/plans/learning/PF-AI002-llm-evaluation-framework.md`) — extract: the narrative arc, real metrics (accuracy %, cost, latency), code snippets, the key insight.
4. Read [docs/ideas/blogs/_template.md](docs/ideas/blogs/_template.md) — pick the archetype skeleton matching the post's planned archetype.
5. Fill the skeleton with content from steps 2–3. Extract only the selected archetype block — strip all `---` inter-archetype separator lines that appear in `_template.md` between archetype sections (they are template structural dividers, not content). The saved draft must contain exactly two `---` lines: the opening and closing frontmatter delimiters. Verify: `grep -c '^---$' docs/ideas/blogs/{draft-file}.md` must return `2`. Apply all editorial quality rules below before saving.
6. Apply the privacy scrub — **blocking gate, do not skip**:
   - [ ] No target-company names or role IDs (progress.md names live pipeline companies — strip them)
   - [ ] No real personal financial data — use anonymized fixture references only
   - [ ] No API keys or secrets in any code snippet
   - [ ] No private plan details quoted verbatim
7. Save the draft to `docs/ideas/blogs/YYYY-MM-DD-{slug}.md` (today's date).
8. Update `docs/ideas/blogs/README.md` — change the post's Status from `Backlog` to `Drafting`.
9. Output: ...
```

> **Why:** Slots without quality constraints produce slot-shaped content. The diagram requirement forces a mental model before prose; the transition rules force narrative continuity; the voice calibration target (Dan Luu / Julia Evans) gives the mode a concrete register to aim for rather than "write well." These are the gaps between a structured dump and a post someone bookmarks.

---

### [x] STEP 6 — Add `## Mode: blog-post` to SKILL.md

Immediately after `## Mode: blog` in [.agents/skills/mentor/SKILL.md](../../../.agents/skills/mentor/SKILL.md), add the full `blog-post` mode with the Python+bash publish script, idempotency guard, and update logic.

> **Why:** The `blog post` mode is the last-mile automation — removing the friction of copying markdown into the Hashnode editor is where most weekly workflows die. Using Python inline for JSON escaping (rather than raw bash substitution) prevents content with quotes or newlines from breaking the GraphQL payload silently.

---

### [!] STEP 7 — Test the pipeline end-to-end with Post #0
> **Skipped:** Draft generated successfully; publishing blocked by STEP 1 failure (Hashnode Pro plan required). Draft file at `docs/ideas/blogs/2026-06-24-eval-harness.md` (Build Log archetype, ~1155w, privacy scrub passed). Run `/mentor blog post` once HASHNODE_PAT and HASHNODE_PUBLICATION_ID are both set and Pro plan is active.

Run the full workflow once with the flagship (Post #0 — the eval harness story):

```bash
# 1. Draft Post #0
/mentor blog 0

# 2. Review docs/ideas/blogs/YYYY-MM-DD-eval-harness.md
#    Self-edit pass — or invoke /tech-write for voice and structure

# 3. Set credentials (if not already in shell profile)
export HASHNODE_PAT="your-pat"
export HASHNODE_PUBLICATION_ID="your-pub-id"

# 4. Publish
/mentor blog post
```

Verify:
- [ ] `https://rikky.hashnode.dev/eval-harness` returns the post live
- [ ] `docs/ideas/blogs/README.md` row #0 shows `Published` + the URL
- [ ] `docs/mentor/progress.md` has the URL logged under today's date
- [ ] Chapter 10 checklist in progress.md gets a partial tick ("Write technical blog post ✅")

> **Why:** Post #0 is the flagship — it converts cold readers to the series, so it gets a manual review pass before going live. This step proves the full pipeline works before the cadence begins.

---

## Notes

- Hashnode API endpoint is `https://gql.hashnode.com` (v2 — not the older `api.hashnode.com/v2`). The `publishPost` mutation replaced the old `createPublicationStory`.
- **Hashnode Pro required (as of May 2026):** Free GraphQL API access was retired May 13 2026. All operations (reads AND writes) require a Pro plan. Without Pro, `gql.hashnode.com` returns a 301 redirect to the announcement page. Upgrade at `hashnode.com/[username]/dashboard/billing`.
- The `HASHNODE_PUBLICATION_ID` is stable for the lifetime of the blog. Fetch once in STEP 1, store in shell profile.
- Dev.to cross-posting is deliberately deferred — the canonical post must be on Hashnode first so `canonical_url` on dev.to points to the correct URL. Cross-posting without it splits SEO.
- The privacy scrub gate is the most critical quality gate. `docs/mentor/progress.md` names specific target companies from the live job pipeline — these must never appear in any published post.
- The `blog post` Bash snippet assumes frontmatter is between the first and second `---` delimiters. Avoid using `---` inside draft content. Before publishing, verify: `grep -c '^---$' docs/ideas/blogs/{your-draft}.md` must return exactly `2`. If it returns more, find and remove the extra `---` lines — they are inter-archetype separators that leaked from the template.
- The `tags` array in the `PublishPostInput` accepts Hashnode tag objects (`{slug: "..."}`) in the v2 API. For simplicity the mode passes an empty array — add tags manually via the Hashnode editor after publishing. Note: the `tags` field in your frontmatter YAML is for local reference only; the `blog-post` mode does not read it.
- **Windows users:** All bash blocks in `blog-post` mode require **Git Bash**, not PowerShell. From VS Code terminal, switch to Git Bash via the dropdown, or type `bash` at the PowerShell prompt to open a bash subshell.
- **Series association:** The `series` field in frontmatter is for human reference only — the `blog-post` mode does not pass it to the Hashnode API. After publishing, associate the post with your series manually: Hashnode editor → Post Settings → Series.
- **Duplicate-slug guard:** If `blog-post` is run twice on the same file before the idempotency guard triggers (e.g. `hashnode_url` was never written back due to a crash), Hashnode returns a slug-conflict error. Check your Hashnode dashboard for the existing post URL and manually add `hashnode_url: {url}` and `status: published` to the frontmatter.
