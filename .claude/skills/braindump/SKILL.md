---
name: braindump
description: Use when the user shares a rough idea, shower thought, or unstructured thinking they want saved for later — triggers like "kepikiran...", "ada ide...", "braindump", "catat dulu", "park this", or describing an idea casually mid-task without wanting to act on it now.
---

# Braindump — Capture Rough Ideas

## Overview

Converts unstructured user brain dumps into a clean, lightweight idea file in `docs/ideas/`. This is a **capture tool, not an analysis tool** — preserve the idea before it's lost. Speed and fidelity beat polish.

**Core principle: capture first, never block.** No clarifying questions before saving. If something is vague, save it with your interpretation stated explicitly — the user can correct the file later.

## When to Use

- User says "kepikiran...", "ada ide...", "braindump", "shower thought", "catat dulu", "compile jadi file"
- User describes an idea casually and wants it saved for later
- User is mid-task and wants to park an idea without losing flow

**NOT for:** Full PM analysis → `/pm-brainstorm analyze`. Planning → `/plan`. Building → `/execute`.

> Note: `docs/ideas/` also holds `/pm-brainstorm` outputs (they have Fit Scores and Verdicts). Never edit those into braindump format — and never produce that format from this skill.

---

## Steps

1. **Extract the core idea** in one sentence. If vague, state your interpretation explicitly in the file — do NOT ask the user first.
2. **Derive a slug** — short kebab-case from the idea title (e.g. `money-tracing`, `smart-notifications`).
3. **Check for collisions and relations** — `Glob docs/ideas/*.md`:
   - **Slug exists?** Append a dated `## Update {YYYY-MM-DD}` section with the new dump to the existing file. Never overwrite a prior capture.
   - **Related idea files?** Link them in "Related Ideas" (filename + one phrase on the connection). Only obvious connections — don't research.
4. **Write** `docs/ideas/{slug}.md` using the template below. Date comes from the environment context (`currentDate`), never guessed. If the user shared an image/screenshot, save or reference it next to the file and link it from Rough Notes.
5. **Confirm in one line** — "Saved to [docs/ideas/{slug}.md](docs/ideas/{slug}.md)." If captured mid-task, return to the task immediately.

---

## Output Template

Omit any optional section that would be empty — no placeholder headings.

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

{Bullets of pain points, observations, user context. Keep the user's own words where possible. No editorializing.}

---

## Rough Notes

{Freeform — edge cases, questions, half-formed thoughts, alternative angles. Preserve it all, no cleanup.}

---

## Related Ideas / Features        <!-- optional -->

{Links to existing docs/ideas/ files or features — only if obvious.}

---

## Next Step (when ready)

Run `/pm-brainstorm analyze {slug}` for full PM analysis, or `/plan` when ready to build.
```

---

## Rules

- **Preserve the user's voice** — if they said "biar ga ribet", write "biar ga ribet". Mixed Indonesian/English stays as-is. Don't sanitize.
- **Don't analyze** — no Fit Scores, no Verdict, no Competitive Scan, no recommendations. That's `/pm-brainstorm`.
- **Don't expand scope** — capture only what was said, not what you infer they meant.
- **Don't split unless asked** — multiple ideas in one dump stay in one file unless the user says otherwise.
- **Status is always "Braindump"** — never promote to "Planned" from a braindump session.

## Red Flags — STOP, you're drifting out of capture mode

- "Let me ask a quick clarifying question first" → No. Save with stated interpretation.
- "I'll add a quick feasibility note / effort estimate" → That's analysis. Cut it.
- "While I'm here, I'll suggest a ticket / next sprint slot" → Scope expansion. Cut it.
- "Let me clean up their phrasing" → Voice loss. Keep their words.
- "This relates to X, let me read X's code to confirm" → Too deep. Filename-level links only.

**All of these mean: write the file as dumped, confirm, move on.**
