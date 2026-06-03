---
name: braindump
description: Use when the user wants to capture a rough idea, shower thought, or unstructured brain dump — compiles it into a lightweight idea file in docs/ideas/ without over-formalizing or analyzing.
---

# Braindump — Capture Rough Ideas

## Overview

Converts unstructured user brain dumps into a clean, lightweight idea file saved to `docs/ideas/`. This is a **capture tool, not an analysis tool** — preserve the idea before it's lost, no evaluation or planning.

## When to Use

- User says "kepikiran...", "ada ide...", "braindump", "shower thought", "compile jadi file"
- User describes an idea casually and wants it saved for later
- User is mid-task and wants to park an idea without losing flow

**NOT for:** Full PM analysis → use `/pm-brainstorm analyze`. Planning → use `/plan`. Building → use `/execute`.

---

## Steps

1. **Extract the core idea** in one sentence. If vague, restate your interpretation explicitly before saving.
2. **Derive a slug** — short kebab-case from the idea title (e.g. `money-tracing`, `smart-notifications`).
3. **Write** `docs/ideas/{slug}.md` using the template below.
4. **Confirm** — "Saved to `docs/ideas/{slug}.md`."

---

## Output Template

```markdown
# Idea: {Title}

> **Status:** Braindump — not yet planned
> **Captured:** {YYYY-MM-DD}
> **Source:** {brief context — e.g., "mid-session while discussing QRIS usage"}

---

## The Core Idea

{One sentence. If user was vague, state your interpretation explicitly.}

---

## Context & Pain (from the dump)

{Bullet list of pain points, observations, user context from the braindump. Keep the user's own words where possible. No editorializing.}

---

## Rough Notes

{Freeform — edge cases, questions, half-formed thoughts, alternative angles. Preserve it all, no cleanup.}

---

## Related Ideas / Features

{Optional — connections to existing features or other ideas only if obvious.}

---

## Next Step (when ready)

Run `/pm-brainstorm analyze {slug}` for full PM analysis, or `/plan` when ready to build.
```

---

## Rules

- **Preserve the user's voice** — if they said "biar ga ribet", write "biar ga ribet". Don't sanitize.
- **Don't analyze** — no Fit Scores, no Verdict, no Competitive Scan. That's `/pm-brainstorm`.
- **Don't expand scope** — capture only what was said, not what you infer they meant.
- **Don't split unless asked** — if multiple ideas in one dump, keep in one file unless user says otherwise.
- **Always date it** — use today's date from memory/context.
- **Status is always "Braindump"** — never promote to "Planned" from a braindump session.
