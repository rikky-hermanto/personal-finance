# Post Archetype Templates

Copy the matching skeleton for each post. Fill in the `[brackets]`. Delete instructions in *italics*.

---

## Archetype 1 — Build Log / Deep-Dive

*Use when: you shipped a milestone and want to tell the story of building it. Target: 1200–1800 words.*
*Source: a `progress.md` session + its PF-AI plan.*

```
---
title: [The concrete problem you solved — not "I learned X"]
tags: #ai #python #[topic] #career
canonical_url: https://[your-hashnode-slug].hashnode.dev/[post-slug]
series: Backend → AI Engineer in 90 Days
---

## The Problem

*One paragraph. Name the concrete risk or failure mode you were trying to prevent. 
Make the reader feel why this matters before you name the solution.*

[e.g. "Every time I refactored the LLM parser, I had no way to know if extraction 
quality got worse. Manual spot-checks on 3–4 statements felt like guessing."]

## What I Built

*Two sentences max. The deliverable + the headline metric.*

[e.g. "A 20-fixture eval harness measuring row-level F1 and field-level accuracy. 
Running it today: Gemini 2.5 Flash scores 100% row F1 on BCA CSV; 94% on PDF formats."]

## The Wall I Hit

*The concrete problem or wrong turn, told honestly. Quote your actual error/log output 
if you have it. This is what makes the post feel real, not a tutorial.*

[e.g. "My first scoring approach was positional list comparison. It silently reported 
garbage — a shifted row showed as 5 wrong fields instead of 1 wrong row."]

## The Fix

*Walk through the solution step by step. Show code — real code from the project.*

### [Step 1 heading]

```python
# The key change
[actual code snippet]
```

> **C# equivalent:**
> ```csharp
> // Same concept, C# idiom
> [C# code]
> ```

### [Step 2 heading]

[explanation + code]

> **C# equivalent:**
> ```csharp
> [C# code]
> ```

## The Metric

*Show the actual output / benchmark result. Screenshot or code block.*

```
[actual CLI output or benchmark result]
```

*Explain what the number means and what question it answers.*

## What I'd Do Differently

*One honest retro point. What surprised you? What was harder/easier than expected?*

## What This Shows I Can Do

*1–2 sentences written for the hiring manager who skimmed to the bottom.*

[e.g. "I can build LLM evaluation infrastructure that catches real data-quality bugs 
before they reach production — including bugs that mocked unit tests will never surface."]

---

*This is part of my series: **[Backend → AI Engineer in 90 Days](SERIES_URL)***
*The full code is in the [Personal Finance Platform repo](GITHUB_URL).*
```

---

## Archetype 2 — Concept Ladder

*Use when: you want to teach one concept "earn the jargon" style. Target: 1000–1500 words.*
*Source: a mini-ladder from a `.claude/plans/learning/` plan.*
*Rule: never introduce a term before the reader feels the problem it solves.*

```
---
title: [The concept, framed as a problem — e.g. "Embeddings for people who own the database"]
tags: #ai #python #[concept] #machinelearning
canonical_url: https://[your-hashnode-slug].hashnode.dev/[post-slug]
series: Backend → AI Engineer in 90 Days
---

## Start here: the naive version that works

*Show the simplest possible solution — one that actually works but has a concrete limit.*

[e.g. "You can search transactions with ILIKE '%groceries%'. It works. Until your bank 
writes 'ALFMRT JKT 12A' and the query returns nothing."]

```python
# Naive: works until it doesn't
[simple code]
```

> **C# equivalent:**
> ```csharp
> [C# code]
> ```

## The Wall

*One concrete failure case. Make the reader feel the gap before naming the fix.*

[e.g. "'ALFMRT JKT 12A' is Alfamart — a supermarket. ILIKE on 'groceries' returns zero 
rows. The data is there; the signal isn't in the text."]

## Stage 2: [name the first improvement]

*Introduce the first real concept as the response to the wall. Name it after you've shown 
the problem.*

```python
# Better: [what changed and why]
[code]
```

> **C# equivalent:**
> ```csharp
> [C# code]
> ```

## The Next Wall

*The new failure case — where stage 2 breaks.*

## Stage 3: [the real solution with its real name]

*Now introduce the "jargon" term — the reader has earned it.*

> **What [term] actually is:** [one-sentence definition in plain language]

```python
# [The proper implementation]
[code]
```

> **C# equivalent:**
> ```csharp
> [C# code]
> ```

## The Real-World Result

*What did this actually change in the project? Show the before/after metric or the 
specific case that now works.*

```
[before / after output or benchmark]
```

## The One Thing to Remember

*One sentence. The insight you'd give a colleague in 30 seconds.*

[e.g. "Embeddings don't read minds — you have to give them something to embed. 
Terse bank codes are noise; enriched descriptions are signal."]

## What This Shows I Can Do

*1–2 sentences for the hiring manager.*

---

*This is part of my series: **[Backend → AI Engineer in 90 Days](SERIES_URL)***
*The full code is in the [Personal Finance Platform repo](GITHUB_URL).*
```

---

## Archetype 3 — Short Take

*Use when: one sharp insight worth capturing, doesn't need a full tutorial. Target: 500–800 words.*
*Source: a retro note, "interview-ready answer" block, or a single design decision.*

```
---
title: [The insight as a declarative claim — e.g. "The gate, not the loop, is the design"]
tags: #ai #systemdesign #[topic] #career
canonical_url: https://[your-hashnode-slug].hashnode.dev/[post-slug]
series: Backend → AI Engineer in 90 Days
---

## The Claim

*State the thesis in one bold sentence. Don't bury it.*

**[The claim.]**

## Why Most People Get It Wrong

*Two to three paragraphs. The common pattern, and the concrete failure mode it leads to.*

## The Concrete Example

*One real example from the project. Code or numbers — not abstract.*

```python
[relevant code]
```

> **C# equivalent:**
> ```csharp
> [C# code]
> ```

## The Takeaway

*Restate the thesis with one additional nuance earned by the example above.*

## What This Shows I Can Do

*1–2 sentences for the hiring manager.*

---

*This is part of my series: **[Backend → AI Engineer in 90 Days](SERIES_URL)***
*The full code is in the [Personal Finance Platform repo](GITHUB_URL).*
```

---

## Recurring elements (add to every post)

**Opening hook options:**
- Open with the failure mode, not the solution: *"My extraction pipeline could silently corrupt data and I wouldn't know until a customer complained."*
- Open with the number that makes you credible: *"MRR@5 = 0.476. That's the honest retrieval baseline for my RAG pipeline — before re-ranking."*
- Open with the question a hiring manager will ask: *"'How do you know your LLM extraction is working?' For months, my answer was 'we check manually.'"*

**Closing template:**
```
---

**What this shows I can do:** [1–2 sentences.]

**This is part of [Backend → AI Engineer in 90 Days](SERIES_URL)** — documenting a 10-year 
C#/.NET engineer shipping AI into production, chapter by chapter. 

Code: [Personal Finance Platform on GitHub](GITHUB_URL) | 
Next: [next post title](NEXT_POST_URL)
```

**Tags by topic:**

| Topic | Tags |
|-------|------|
| LLM eval / evals | `#ai #llm #evaluation #python #career` |
| RAG / embeddings | `#ai #rag #python #vectordatabase #machinelearning` |
| AI observability | `#ai #observability #python #devops` |
| Agents | `#ai #agents #python #llm` |
| C# → Python angle | `#dotnet #csharp #python #ai #career` |
| Career / meta | `#career #ai #machinelearning #programming` |
