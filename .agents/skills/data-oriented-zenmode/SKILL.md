---
name: data-oriented-zenmode
description: >
  Apply Personal Finance's core Zen UX guidance when creating, editing, or reviewing
  frontend pages, dashboards, components, and interactions. Also use for explicitly
  requested Zen or focus-mode web artifacts. Covers warm canvas, focused layouts,
  recessed navigation, financial tables, and progressive disclosure. Skip non-visual
  backend work and user-requested alternative visual styles.
---

# Data-oriented Zen UX

This is the independent Codex adaptation of the project's Zen design guidance.
It includes the required base-theme principles; no Claude skill or configuration
is required at runtime. Do not synchronize changes back to `.claude/`.

## Apply in context

Read `apps/frontend/AGENTS.md` for application work. Inspect the affected view,
nearby components, `src/index.css`, and theme configuration before editing.
Reuse existing Tailwind tokens and shadcn components; preserve light/dark behavior.
The light palette below describes the Zen design, not permission to replace dark
mode or rewrite the application shell during a component task.

Use this as the default UX guidance for this project's frontend. An explicit user
request for another style takes precedence. For standalone artifacts, scope styles
to the artifact and use the palette directly when no existing theme is available.

## Core principles

- One primary task per view: stage the input, table, chart, editor, or detail that
  the user came to work on. Secondary content must not compete for attention.
- Keep required navigation and back controls visible but visually recessed.
  Do not make essential menus hover-only. A command palette can supplement them.
  Use a chrome-free shell only for an explicitly requested focus experience with
  a discoverable way back.
- Reveal advanced controls and bulk actions contextually. Preserve keyboard and
  touch access, visible focus, accessible labels, and readable contrast. Muted does
  not mean illegible. Dismiss menus with Escape/outside click and restore focus.
- Use a warm canvas, generous spacing, and restrained surfaces. Avoid decorative
  gradients, bright chrome, colored card borders, and nested panels.
- One warm primary CTA at most per view. Other actions use dark or ghost styles.
  Keep destructive actions clearly identifiable and contextual.

## Layout and visual system

| Content | Staging |
|---|---|
| Short input/form below 60vh | Center horizontally and vertically |
| Longer form/detail | Center container, top-align; roughly `max(8vh, 48px)` top space |
| Scrollable workspace | Top-align; roughly `max(6vh, 40px)` top space |
| Text/forms | Usually 800–1024px maximum width |
| Tables | Usually 1280–1440px maximum width |
| Dashboards | Responsive 80–95% viewport, up to about 1728px where useful |

These are staging guides; account for the existing shell and avoid overflow or
excessive empty space. Use an 8px spacing rhythm with 4px half-steps.

- Light canvas `#F5F3EE`; surface `#FFFFFF`; elevated surface `#FAF9F7`.
- Warm borders `#E8E5DF` / `#D4D0C8`; text hierarchy `#37352F`, `#6B6B6B`,
  `#9B9B9B` (adjust tertiary text when needed for readable contrast).
- Optional barely visible 80px grid at about 0.018 opacity. Preserve the existing
  canvas treatment; omit the grid below 480px.
- Editorial serif titles using `--font-title`; sans-serif body; monospace/tabular
  numerals and right-aligned numeric columns. Section labels use sentence case.
- Warm CTA reference: `#E8C5A8` background, `#5C3D1E` text, `#DEBB9A` hover.
  Use established application tokens and semantic income/expense/warning colors.
- Cards group discrete items, with warm thin borders, about 12px radius, 16–20px
  padding, no shadow or left state bar. Convey state with text/icon/dot cues.
- Inputs use generous padding, warm borders, 12px radius, and a clear focus state.
  A whisper shadow is allowed for focused inputs and floating contextual controls.

## Financial tables and interactions

- No zebra stripes or heavy header fill. Use a quiet header divider, faint row
  separators, and a subtle theme-aware hover state.
- Prefer `font-mono text-xs` for compact transaction data, with numeric alignment;
  keep descriptions readable and preserve semantic table markup.
- Follow existing locale-aware financial formatting. Parenthesized negatives fit
  this style. Omit repeated currency symbols only when the currency/unit is clearly
  stated in the header or surrounding context; never obscure mixed currencies.
- Income/expense color supplements signs and labels. Missing data stays distinct
  from zero, and unevaluated checks never appear to pass.
- A bottom contextual pill can hold up to three actions with overflow when editing
  or selecting. Render it only when relevant; reserve space so it does not cover
  content, errors, focus targets, or mobile safe areas.
- Reveal/dismiss transitions generally take 200–400ms with gentle easing. Respect
  reduced-motion preferences; animation must not delay access to the task.

## Responsive behavior and review

Use about 24px side gutters on tablets and 16px on small screens. Let the bottom
action bar fit the viewport, hide texture below 480px, and adapt table overflow
without cutting off actions. Preserve meaningful dashboard groupings instead of
forcing all desktop data into a narrow single column.

For UI changes, verify the primary task, navigation, loading/empty/error states,
keyboard focus, small-screen layout, and light/dark themes using available preview
or browser tools. Report if visual verification is unavailable.

## Supporting references

- Read [CSS and token guidance](references/zen-css-template.md) when implementing
  canvas, spacing, motion, or standalone artifact styles.
- Read [component patterns](references/zen-component-examples.md) when choosing
  page structure, table treatment, or contextual actions. Examples are patterns to
  integrate, not replacements for existing application primitives.
