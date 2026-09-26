---
name: ux-review
description: "Review a Personal Finance component, page, or user flow for task clarity, Zen consistency, accessibility, interaction feedback, and state coverage; give SHIP IT, REFINE, or RETHINK."
---

# ux-review

Read [shared Codex workflow conventions](../../WORKFLOWS.md) before using this skill.

Read frontend instructions and Zen skill, then the target, parent route, connected
components, API/types, and spec. State the user's job, current context, and desired
outcome. A quick pass focuses on acceptance criteria; a flow review follows the
end-to-end interaction. Use available browser preview for visual claims and state
when analysis is source-only.

Inspect hierarchy/attention, cognitive load and choice grouping, proximity, affordances,
feedback/disabled/loading behavior, error recovery, reversible/destructive actions,
typography/density, financial units, navigation, keyboard/touch/focus/labels, mobile
layout, and light/dark consistency. Apply psychological principles as explanatory
lenses, not unsupported numerical claims about every user's memory.

Minimalism preserves meaning. Keep temporal anchors such as Last Month/Yesterday when
abbreviations force decoding. Don't render inert elements as buttons or silently hide
errors. Include empty/loading/error/partial and unevaluated financial data states.

Report SHIP IT / REFINE / RETHINK, the decisive changes, concrete findings with
trigger/user impact/file:line, state coverage, and verified versus unverified behavior.
Preserve useful existing choices; don't fill a praise or problem quota.
No implementation from a review-only request. Save requested reviews under
docs/codex/reviews/; use current components for proposed fixes.
