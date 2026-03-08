---
name: data-oriented-theme
description: >
  Default UI/web theme system for all web apps, dashboards, components, and HTML artifacts.
  Apply this skill AUTOMATICALLY whenever the user asks to build any web app, UI component,
  dashboard, tool, artifact, or front-end interface — UNLESS the user explicitly requests a
  different style (e.g., "landing page", "marketing site", "creative/artistic design").
  Enforces: neutral palette, functional color-coding, proportional grid layouts,
  divider-based structure, monospace data typography, contextual cards, and
  progressive disclosure (page function is the hero — everything secondary recedes
  until needed). Inspired by Notion, Linear, Datadog, Robinhood, Bloomberg Terminal.
---

# Data-Oriented Theme Skill

## Purpose

This skill is a **constraint system**, not a style suggestion.
It defines the default visual language for all UI builds. Follow it unless the user overrides.

**Inspired by:**
- **Notion** — neutral canvas, readable density, clean hierarchy
- **Linear** — proportional columns, surgical borders, zero chrome waste
- **Datadog** — generous row padding, scan-optimized, performance-first clarity
- **Robinhood** — sharp typographic contrast, comfortable whitespace within structure
- **Bloomberg Terminal** — maximum information density, zero decoration
- **StockMap** — stat strips, dense tables, dividers as structure
- **Claude.ai** — restrained accent use, monospace data, clean sidebar

---

## Core Design Principles

### 1. Page Function is the Hero
**The most important principle.** Every page has one primary job.
That job must be immediately obvious — visually dominant, front and center.
Everything else — navigation, filters, secondary actions, settings, metadata — is
**secondary and should visually recede** until the user needs it.

Ask before building: *"What is this page for? What will the user do most?"*
Then make that thing take up the most visual weight, the most accessible position,
the clearest typography. Everything else gets smaller, muted, or hidden.

### 2. Progressive Disclosure — Hide Until Needed
Secondary UI must not compete with primary UI. Apply this tier strictly:

| Tier | What | Treatment |
|------|------|-----------|
| **Primary** | The page's core function (table, board, form, chart) | Full visual weight, immediate |
| **Secondary** | Filters, sort, view toggle, search | Visible but muted — `color: var(--tx-2)`, smaller |
| **Tertiary** | Settings, export, help, advanced options | Hidden by default — hover, `•••` menu, or collapsed panel |
| **Ghost** | Rarely-used or destructive actions | Icon-only or plain text link, no button chrome |

**Concrete rules:**
- Topbar: logo + breadcrumb + `flex: 1` spacer + **one** labeled CTA. All other actions → icon buttons, no label text.
- Sidebar: active section prominent. Inactive sections muted (`opacity: 0.55`) or collapsed.
- Filters / search: single icon button. Expand inline on click, collapse when cleared.
- Bulk actions: invisible until rows are selected — appear as a contextual floating bar.
- Destructive actions: never in the default visible state. Require hover or explicit open.
- Empty secondary sections: don't render the container — remove it until there is content.

### 3. Data First, Decoration Never
- Every visual element must earn its place by carrying information
- No decorative gradients, blobs, hero images, or illustration unless data-relevant
- Whitespace is structural spacing, not aesthetic padding

### 4. Color = Function Only
Color signals **state**, not style. See `references/color-psychology.md` for the science.

| Use Case | Light | Dark |
|---|---|---|
| Background (base) | `#F7F8FA` | `#0F1117` |
| Surface / card | `#FFFFFF` | `#1A1D27` |
| Elevated surface | `#F0F2F5` | `#22263A` |
| Border / divider | `#E4E6EB` | `#2A2D3A` |
| Border strong | `#D1D5DB` | `#3D4155` |
| Text primary | `#111318` | `#E8EAF0` |
| Text secondary | `#6B7280` | `#9CA3AF` |
| Text tertiary | `#9CA3AF` | `#6B7280` |
| Accent / interactive | `#2563EB` | `#2563EB` |
| Success / positive delta | `#16A34A` | `#16A34A` |
| Warning / caution | `#D97706` | `#D97706` |
| Danger / negative | `#DC2626` | `#DC2626` |

**Rules:**
- Max 2 accent colors visible at once
- Blue = interactive/action. Green/Red = state/delta. Never swap these roles.
- CTA may use near-black (`#111318`) in minimalist contexts — cleaner than blue when the page is already data-dense.

### 5. Typography Hierarchy
```
Display / Stat:   2rem–3rem, weight 600–700, letter-spacing -0.02em, mono
Heading H1:       1.25rem, 600
Heading H2:       1rem, 600
Section Label:    0.6875rem, 600, UPPERCASE, letter-spacing 0.07em, color tx-tertiary
Body:             0.875rem, 400, line-height 1.5
Caption / Meta:   0.6875–0.75rem, 400, color tx-secondary
Data / Number:    mono, right-aligned, weight 500
```
Font stack:
```css
--font-sans: 'Inter', system-ui, sans-serif;
--font-mono: 'JetBrains Mono', 'Fira Code', monospace;
```

### 6. Spacing — Breathing Room (Datadog / Robinhood Standard)
8px base grid. Rows must feel **individually scannable**, not compressed.

```
--space-1: 4px    --space-2: 8px    --space-3: 12px
--space-4: 16px   --space-5: 20px   --space-6: 24px
--space-8: 32px   --space-10: 40px  --space-12: 48px
```

Minimum targets:
- Interactive row / task: `14px 20px` padding
- Card interior: `14px 16px`
- KPI cell: `20px 24px`
- Topbar height: `52px`
- Column / section header: `44px`
- Gap between cards: `8px`
- Gap between meta tags: `5–6px`
- Title line-height: `1.5` minimum

Density rule: if rows feel "touching", add `4px` vertical padding until each item scans as distinct.

---

## Component Patterns

### Cards — Contextual, Not Structural
Cards are **permitted** when grouping a discrete repeatable unit (task, result, notification, feed item).
Cards are **banned** as structural layout containers (dashboard panes, stat sections, nav groups).

Card spec:
- `border: 1px solid var(--border)` — no shadows ever
- `border-radius: 8–10px`
- Left state bar: `border-left: 3px solid <color>`, left radii flattened to `4px`
- Hover: `border-color: var(--border-strong)`, bg `#FAFBFC`
- Gap between cards in list: `8px`

### KPI Strip
```
┌─────────────┬─────────────┬─────────────┬─────────────┐
│ LABEL       │ LABEL       │ LABEL       │ LABEL       │
│ 2,305       │ 5,270       │ 57.3%       │ 42.7%       │
│ ▲ 12%       │             │             │             │
└─────────────┴─────────────┴─────────────┴─────────────┘
```
- `display: grid; grid-template-columns: repeat(N, 1fr)`
- Each cell: `padding: 20px 24px; border-right: 1px solid var(--border)`
- Numbers: mono, weight 600, `letter-spacing: -0.02em`
- Delta: mono, `0.6875rem`, green/red only

### Data Table
- Zebra rows: `#FFFFFF` / `#F9FAFB`
- Header: `background: var(--elevated)`, `0.6875rem`, UPPERCASE, weight 600
- Numbers: right-aligned, mono
- Hover row: `background: var(--accent-s)`
- Row height: `40px` dense / `48px` readable
- No rounded corners — straight lines only

### Section Panel
Labeled region via borders, not a wrapped box:
```
│ SECTION LABEL   ← 0.6875rem UPPERCASE, border-left: 3px accent, border-bottom
├────────────────
│ Row item                value
│ Row item                value
```

### Sidebar / Navigation
- Width: `200–240px`, `border-right: 1px solid var(--border)`, bg `var(--elevated)`
- Items: `padding: 7px 10px`, `border-radius: 6px`
- Active: `background: var(--accent-s)`, `color: var(--accent)`, `font-weight: 500`
- Inactive / secondary sections: `color: var(--tx-3)` or collapsed — they recede
- No icons unless functionally necessary

### Topbar
- `height: 52px`, `border-bottom: 1px solid var(--border)`, bg `var(--surface)`
- Contents: `Logo · Breadcrumb · [flex spacer] · muted meta · [icon btn] · [1 CTA]`
- Max 1 labeled button. Additional actions → icon-only (`opacity: 0.6`, hover to full)
- Never more than 3 interactive elements total

### Buttons
- Primary CTA: `background: #111318` or `var(--accent)`, `border-radius: 6–7px`, `padding: 6px 14px`
- Secondary: `border: 1px solid var(--border)`, surface bg, `color: var(--tx-2)`
- Ghost / tertiary: no border, no bg, `color: var(--tx-3)` — low-priority actions
- Destructive: ghost by default, red only on hover/confirm

### Tags / Badges (inline only)
```css
.tag {
  padding: 2px 7px; border-radius: 4px;
  font-size: 0.625rem; font-weight: 500;
  background: color-mix(in srgb, var(--c) 10%, transparent);
  color: var(--c);
  border: 1px solid color-mix(in srgb, var(--c) 18%, transparent);
}
```

---

## CSS Variables Template

```css
:root {
  --bg:        #F7F8FA;
  --surface:   #FFFFFF;
  --elevated:  #F0F2F5;
  --border:    #E4E6EB;
  --border-hi: #D1D5DB;

  --tx-1: #111318;
  --tx-2: #6B7280;
  --tx-3: #9CA3AF;

  --accent:   #2563EB;
  --accent-h: #1D4ED8;
  --accent-s: #EFF6FF;

  --green:  #16A34A;
  --amber:  #D97706;
  --red:    #DC2626;

  --font-sans: 'Inter', system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', monospace;
  --ease: 140ms ease;
  --r: 10px;
}

[data-theme="dark"] {
  --bg:        #0F1117;
  --surface:   #1A1D27;
  --elevated:  #22263A;
  --border:    #2A2D3A;
  --border-hi: #3D4155;
  --tx-1: #E8EAF0;
  --tx-2: #9CA3AF;
  --tx-3: #6B7280;
  --accent-s: rgba(37,99,235,0.14);
}
```

---

## Layout Patterns

### Core Rule: Proportion + Dividers = Structure
Use `grid` / `flex` with explicit proportions, `border` lines as delimiters.
The page is the container. Sections separated by lines, not wrapped in boxes.

### Standard App Layout
```
┌───────────────────────────────────────────────────────────┐
│  Logo  /  Breadcrumb              meta  [⋯]  [+ CTA]      │  52px topbar
├───────────┬───────────────────────────────────────────────┤
│  Sidebar  │  [KPI strip — only when page needs it]        │  border-bottom
│  200px    ├──────────────────────────┬────────────────────┤
│           │  PRIMARY CONTENT  (2fr)  │  Secondary (1fr)   │
│  nav      │  ← HERO of the page      │  only if needed    │
│           │                          │                    │
└───────────┴──────────────────────────┴────────────────────┘
```

### Proportional Splits
```css
grid-template-columns: 1fr 1fr;           /* equal */
grid-template-columns: 2fr 1fr;           /* content-heavy */
grid-template-columns: 3fr 2fr 1fr;       /* three-pane */
grid-template-columns: 200px 1fr 300px;   /* sidebar + main + detail */
```
All: `gap: 0`, `border-right` on left pane(s), padding inside each pane.

---

## What to AVOID

| ❌ Never | ✓ Instead |
|---|---|
| Cluttered topbar (5+ buttons) | Logo + title + icon actions + 1 CTA |
| Always-visible secondary controls | Hide until needed — hover, collapsed |
| Multiple primary CTAs on one page | One CTA per page context |
| Cards as layout containers | Proportion + dividers |
| Drop shadows | `1px solid var(--border)` only |
| `border-radius` > 10px on containers | 8–10px cards, 4–6px buttons |
| Color for decoration | State/delta only |
| Purple/pink/gradient accents | Single muted blue |
| Emoji as decoration | Functional icons only |
| Centered layout | Left-aligned data grid |
| Full-saturation colors | Muted, desaturated palette |
| `font-weight: 700` for body text | Bold only for headings and KPI values |

---

## Delivery Checklist

**Progressive Disclosure**
- [ ] Page function is immediately obvious and visually dominant
- [ ] Topbar: ≤ 1 labeled CTA, all other actions are icon-only
- [ ] Secondary actions (filter, sort, export) are collapsed or icon-only
- [ ] Destructive / admin actions hidden in default state
- [ ] Sidebar inactive items are muted or collapsed

**Visual System**
- [ ] Cards only for discrete repeatable units — not layout containers
- [ ] Spacing on 8px grid, rows feel individually scannable
- [ ] Max 2 accent colors visible at once
- [ ] Numbers: right-aligned + monospace
- [ ] No drop shadows — borders only
- [ ] No decorative gradients
- [ ] Green / Red / Amber for state/delta only
- [ ] Typography hierarchy respected: section label → heading → body → caption
- [ ] Dark mode CSS vars defined

---

## References

- `references/color-psychology.md` — scientific basis for palette and contrast choices
- `references/component-examples.md` — copy-paste HTML/CSS for all components
