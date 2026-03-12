---
name: data-oriented-zenmode
description: >
  Zen-mode UI/UX theme for web apps, tools, and artifacts. Apply this skill whenever
  the user asks for a web app, dashboard, tool, or artifact AND wants a minimal,
  distraction-free, feature-focused experience. Triggers on keywords like: "zen mode",
  "zen", "focus mode", "clean", "minimal app", "distraction-free", or when the user
  references this skill by name. This skill OVERRIDES data-oriented-theme when triggered.
  Enforces: single-feature focus, hidden chrome, warm off-white canvas with subtle grid
  texture, centered content staging, progressive reveal of controls, and breathing-room
  whitespace. Inspired by Claude.ai Cowork UI, Notion's blank page, iA Writer,
  Things 3, Linear's detail views, and Apple's Focus mode philosophy.
---

# Data-Oriented Zen Mode Skill

## Relationship to data-oriented-theme

This skill is a **layer on top of** `data-oriented-theme`. It inherits the base color
system, typography scale, spacing grid, and component specs — then **overrides layout,
chrome visibility, and interaction patterns** to enforce a distraction-free, single-feature
focus mode.

**When both skills are available:** This skill takes priority when the user requests zen/focus/minimal mode. The base theme's CSS variables, font stacks, and color-function rules still apply — this skill only changes *structure and visibility*.

**Read `data-oriented-theme/SKILL.md` first** if you haven't already. This skill assumes
you know the base system.

---

## Core Philosophy: One Thing at a Time

The Claude Cowork UI in the reference screenshot demonstrates the principle perfectly:
- **Centered stage** — content floats in the vertical center of a warm canvas
- **Subtle texture** — faint grid lines on the background create depth without distraction
- **Zero visible chrome** — no sidebar, no topbar, no hamburger menu
- **One input, one action** — the prompt box + "Let's go" is the entire interface
- **Scheduled items recede** — secondary content is muted, listed below, small text
- **Warm, not sterile** — off-white `#F5F3EE` background, not clinical `#FFFFFF`

This is the zen mode mental model: **the page IS the feature. Everything else is invisible until summoned.**

---

## Design Principles

### 1. The Feature IS the Page

No sidebars. No persistent navigation. No topbar (or a ghost topbar that appears on hover/scroll-up only). The currently active feature — a form, a table, a chart, an editor — occupies the full viewport, centered both horizontally and vertically when content is short, or top-aligned with generous top padding when content is long.

**Decision matrix:**

| Content Height | Alignment | Top Padding |
|---|---|---|
| < 60vh | Center vertically + horizontally | Auto (flex centering) |
| 60–100vh | Top-aligned, centered horizontally | `max(8vh, 48px)` |
| > 100vh (scrollable) | Top-aligned, centered horizontally | `max(6vh, 40px)` |

**Max content width:** `800px` to `1024px` for text/form-heavy features, `1280px` to `1440px` for tables/data, and **fluid responsive width** (e.g., `80-95%` of viewport up to `1728px`) for dashboards. The UI must be responsive, adapting smoothly to different screen sizes while maintaining the desktop standard UX width.

### 2. Subtle Chrome — Present but Recessed

Navigation, settings, secondary actions, and metadata are visible by default but must be **subtle**. They should not steal focus from the primary content.

**Reveal and Visibility patterns:**

| Trigger | What Appears | Use When |
|---|---|---|
| `Cmd/Ctrl + K` | Command palette (search + navigate) | Power-user navigation |
| Default State | Muted Topbar / Sidebar | App needs persistent navigation |
| `Esc` or top-left back arrow | Return to parent / home | Drill-down feature views |
| Bottom-anchored pill | Contextual actions for current feature | Active editing / data entry |
| Floating action button (FAB) | Primary creation action | Single-purpose creation tools |

**Rules:**
- **Navigation Menus:** Show the menu (sidebar or topbar) by default, but make it very subtle (e.g., low contrast, muted colors, or slight opacity) so it doesn't compete with the centered content.
- **Do not hide on hover:** The menu should be consistently visible, just recessed in visual weight.
- Breadcrumbs: icon-only back arrow (`←`) in top-left, consistently visible with muted styling.
- All dropdown menus: **dismiss on outside click or Esc**.
- Tab bars / segmented controls: Place **above** content, centered, muted styling.

### 3. The Warm Canvas

The background is **not pure white**. It is a warm, low-saturation off-white with a subtle grid texture. This creates depth, reduces eye strain, and gives the interface a crafted, physical feel — like quality paper.

**Background specification:**

```css
/* Base warm canvas */
--zen-bg: #F5F3EE;

/* Subtle grid pattern — like the Claude Cowork UI */
background-color: var(--zen-bg);
background-image:
  linear-gradient(rgba(0, 0, 0, 0.018) 1px, transparent 1px),
  linear-gradient(90deg, rgba(0, 0, 0, 0.018) 1px, transparent 1px);
background-size: 80px 80px;
```

The grid lines are barely perceptible — they should be felt, not seen. At arm's length,
the background reads as a solid warm tone. Up close, the grid provides subtle spatial
anchoring.

**Surface elements (cards, inputs, modals):**
```css
--zen-surface: #FFFFFF;
--zen-surface-elevated: #FAF9F7;
```

White surfaces sit on the warm canvas, creating natural figure/ground separation without
borders or shadows.

### 4. Focused Input Staging

Input fields (search, prompt, form fields) are the **hero** of zen mode. They are
visually prominent, generously sized, and centered.

**Primary input (the main action of the page):**
```css
.zen-input-primary {
  width: min(100%, 800px);
  margin: 0 auto;
  padding: 16px 20px;
  font-size: 1rem;
  line-height: 1.5;
  background: var(--zen-surface);
  border: 1px solid #E8E5DF;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  transition: border-color 160ms ease, box-shadow 160ms ease;
}

.zen-input-primary:focus {
  outline: none;
  border-color: #D4D0C8;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}
```

Note: this is the **one exception** to the "no shadows" rule from `data-oriented-theme`. In zen mode, a whisper shadow on the primary input creates necessary figure/ground when there are no structural chrome borders to anchor the eye.

### 5. Receding Secondary Content

Any content that is not the primary feature — scheduled items, suggestions, history,
metadata — follows a strict recession pattern:

```
Visual Weight Scale (zen mode):

████████████  Primary feature (input, main content)     — full contrast, large
██████░░░░░░  Primary label / heading                   — #37352F, weight 600
████░░░░░░░░  Secondary content (lists, suggestions)    — #6B6B6B, weight 400
██░░░░░░░░░░  Tertiary metadata (timestamps, IDs)       — #9B9B9B, weight 400, small
█░░░░░░░░░░░  Ghost elements (hover-only controls)      — opacity 0 → 0.5 on hover
```

**Secondary lists** (like the "Scheduled" items in the reference):
```css
.zen-secondary-list {
  margin-top: 32px;
  max-width: 800px;  /* match primary input width */
  margin-inline: auto;
}

.zen-secondary-label {
  font-size: 0.75rem;
  font-weight: 500;
  color: #9B9B9B;
  text-transform: none;  /* NOT uppercase in zen mode — too aggressive */
  margin-bottom: 12px;
}

.zen-secondary-item {
  padding: 10px 0;
  border-bottom: 1px solid rgba(0, 0, 0, 0.04);
  color: #6B6B6B;
  font-size: 0.875rem;
}
```

### 6. Transition Choreography

Zen mode uses **slow, deliberate** transitions. Nothing snaps. Everything eases.

```css
--zen-ease-reveal:  300ms cubic-bezier(0.16, 1, 0.3, 1);   /* element appearing */
--zen-ease-dismiss: 200ms cubic-bezier(0.4, 0, 0.2, 1);    /* element disappearing */
--zen-ease-morph:   400ms cubic-bezier(0.16, 1, 0.3, 1);   /* layout shift */
```

**Key animations:**
- **Page load:** Content fades in from `opacity: 0; transform: translateY(8px)` over 400ms, staggered 60ms per element group.
- **Feature switch:** Cross-fade with 200ms overlap. Old content fades out + shifts left 12px, new content fades in + shifts from right 12px.
- **Modal / overlay open:** Background dims to `rgba(0,0,0,0.08)`, content scales from `0.98` to `1.0` with fade-in.
- **Ghost chrome reveal:** `opacity: 0 → 1` over 200ms on hover. No transform — just presence.

### 7. Contextual Action Bar (Bottom-Anchored)

When the user is actively working (editing, selecting, filling a form), a **bottom pill bar** appears with contextual actions. This replaces toolbars, button rows, and action menus.

```
┌─────────────────────────────────────────────────┐
│                                                 │
│              [Main Feature Content]              │
│                                                 │
│                                                 │
│         ┌──────────────────────────┐            │
│         │  💾 Save   │  ⟳ Reset   │            │  ← bottom pill, centered
│         └──────────────────────────┘            │
└─────────────────────────────────────────────────┘
```

```css
.zen-action-bar {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 1px;
  background: var(--zen-surface);
  border: 1px solid #E8E5DF;
  border-radius: 10px;
  padding: 4px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06);
  opacity: 0;
  transition: opacity var(--zen-ease-reveal), transform var(--zen-ease-reveal);
  pointer-events: none;
}

.zen-action-bar.visible {
  opacity: 1;
  pointer-events: auto;
}

.zen-action-bar button {
  padding: 8px 16px;
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--tx-2);
  background: transparent;
  border: none;
  border-radius: 7px;
  cursor: pointer;
  transition: background 140ms ease, color 140ms ease;
}

.zen-action-bar button:hover {
  background: #F0EEEA;
  color: var(--tx-1);
}

.zen-action-bar button.primary {
  background: #37352F;
  color: #FFFFFF;
}
```

---

## Zen Mode Color Overrides

These override the base `data-oriented-theme` palette for zen contexts:

```css
:root[data-zen] {
  /* Canvas */
  --bg:           #F5F3EE;
  --surface:      #FFFFFF;
  --elevated:     #FAF9F7;

  /* Borders — warmer, softer */
  --border:       #E8E5DF;
  --border-hi:    #D4D0C8;

  /* Typography — editorial serif for titles */
  --font-title:   ui-serif, Georgia, Cambria, "Times New Roman", Times, serif;

  /* Text — warmer blacks */
  --tx-1:         #37352F;
  --tx-2:         #6B6B6B;
  --tx-3:         #9B9B9B;

  /* Accent — muted warm CTA, not bright blue */
  --accent:       #37352F;       /* near-black primary actions */
  --accent-h:     #2A2825;       /* hover state */
  --accent-s:     #F0EEEA;       /* subtle accent surface */
  --accent-warm:  #C4A882;       /* warm highlight, like Claude's peach CTA */

  /* Functional colors remain unchanged from base theme */
  --green:        #16A34A;
  --amber:        #D97706;
  --red:          #DC2626;
}
```

**CTA Button:** Zen mode uses a **warm accent** for the primary action button (inspired by Claude Cowork's peach "Let's go" button):

```css
.zen-cta {
  background: #E8C5A8;
  color: #5C3D1E;
  border: none;
  border-radius: 16px;
  padding: 8px 18px;
  font-size: 0.8125rem;
  font-weight: 550;
  cursor: pointer;
  transition: background 160ms ease;
}

.zen-cta:hover {
  background: #DEBB9A;
}
```

Use this sparingly — **one warm CTA per view**. All other buttons use the dark or ghost style.

---

## Layout Templates

### Template A: Centered Stage (Default)

For single-action pages: search, prompt input, single form, creation entry point.

```
┌─────────────────────────────────────────────────────┐
│  ← (ghost, hover-only)                              │
│                                                     │
│                                                     │
│                                                     │
│              Page Title (H1, centered)              │
│              Subtitle (muted, centered)             │
│                                                     │
│         ┌────────────────────────────┐              │
│         │   Primary Input / Action   │  [CTA →]    │
│         └────────────────────────────┘              │
│                                                     │
│              Secondary content below                │
│              (muted, optional)                      │
│                                                     │
└─────────────────────────────────────────────────────┘

Background: warm canvas with 80px grid texture
Content: max-width 800px to 1024px, centered, vertically centered if short
```

### Template B: Focused Workspace

For active-work pages: editor, data table, form builder, analysis view.

```
┌─────────────────────────────────────────────────────┐
│  ← Title                          [icon] [icon]     │  ← ghost topbar (hover-only)
│─────────────────────────────────────────────────────│
│                                                     │
│    ┌─────────────────────────────────────────┐      │
│    │                                         │      │
│    │         Primary Workspace               │      │
│    │         (editor / table / chart)         │      │
│    │                                         │      │
│    │                                         │      │
│    │                                         │      │
│    └─────────────────────────────────────────┘      │
│                                                     │
│              ┌───────────────────┐                   │
│              │ Save │ Reset │ ⋯ │                   │  ← contextual action bar
│              └───────────────────┘                   │
└─────────────────────────────────────────────────────┘

Background: warm canvas with grid
Workspace: white surface, 1px warm border, 12px radius
Content: max-width 1280px to 1440px or responsive 80-95% of viewport based on data density
```

### Template C: Drill-Down Detail

For detail views: record detail, profile, single-item view.

```
┌─────────────────────────────────────────────────────┐
│  ← Back                                             │  ← ghost, hover-only
│                                                     │
│         Record Title (H1)                           │
│         Status badge   ·   Last updated meta        │
│                                                     │
│    ─────────────────────────────────────────────    │  ← subtle divider
│                                                     │
│         Field Label          Value                  │
│         Field Label          Value                  │
│         Field Label          Value                  │
│                                                     │
│    ─────────────────────────────────────────────    │
│                                                     │
│         Related Section Label                       │
│         [ list items ... ]                          │
│                                                     │
│              ┌─────────────────┐                    │
│              │  Edit  │  ⋯    │                    │
│              └─────────────────┘                    │
└─────────────────────────────────────────────────────┘

Content: max-width 800px to 1024px, left-aligned within centered container
```

---

## Component Overrides (vs data-oriented-theme)

### Cards in Zen Mode
Cards are allowed but must feel **weightless**:
```css
.zen-card {
  background: var(--zen-surface);
  border: 1px solid var(--border);
  border-radius: 12px;    /* slightly softer than base 8-10px */
  padding: 16px 20px;
  transition: border-color 160ms ease;
}

.zen-card:hover {
  border-color: var(--border-hi);
}
```
No left state bars. No shadows. No colored accents on cards. State is communicated through inline text color or small dot indicators.

### Tables in Zen Mode
Tables shed their chrome:
- **No zebra rows** — clean white background throughout
- **No header background** — header distinguished by weight and border-bottom only
- Row hover: `background: #FAF9F7`
- Border between rows: `1px solid rgba(0, 0, 0, 0.04)` — barely there
- Numbers: still mono, still right-aligned

### Typography in Zen Mode
Titles (H1) should use the editorial serif font stack to provide a classic, high-craft feel.
```css
.zen-title {
  font-family: var(--font-title);
  font-weight: 600;
  letter-spacing: -0.02em;
}
```

### Inputs in Zen Mode
All inputs follow the primary input styling — warm border, subtle shadow on focus, 12px radius. No sharp rectangles.

### Buttons in Zen Mode
| Type | Style |
|---|---|
| Primary CTA | Warm accent (`#E8C5A8` bg) — one per page |
| Secondary | Dark pill (`#37352F` bg, white text) |
| Tertiary | Ghost — text only, `color: var(--tx-2)`, hover underline |
| Destructive | Ghost red — text only, red on hover |

---

## Responsive Behavior

Zen mode maps naturally to mobile because it's already chrome-free:

| Breakpoint | Adjustment |
|---|---|
| `> 1200px` | Content max-width applies, generous side padding |
| `768–1200px` | Reduce side padding to `24px`, same structure |
| `< 768px` | Content padding `16px`, bottom action bar spans full width minus `16px` margin |
| `< 480px` | Title font size reduces, input padding tightens, grid texture hidden |

Grid texture is `display: none` below 480px — on small screens it reads as noise.

---

## What to AVOID in Zen Mode

| ❌ Never | ✓ Instead |
|---|---|
| Visually heavy navigation | Subtle, recessed persistent menus or command palette |
| Aggressively contrasting topbar | Soft, muted topbar that doesn't steal focus |
| Multiple visible CTAs | One warm CTA, rest are ghost/text |
| Colored card borders | White cards, warm border only |
| Bright accent colors | Near-black or warm muted accents |
| Pure white background | Warm `#F5F3EE` with grid texture |
| Uppercase section labels | Sentence case, muted weight |
| Dense multi-column layouts | Single column, centered, max-width constrained |
| Snap transitions | Ease curves, 200–400ms, staggered reveals |
| Cluttered bottom bar | Max 3 actions in pill, overflow to `⋯` menu |
| Shadows deeper than 16px blur | Whisper shadows only: `0 1px 3px` / `0 4px 16px` at ~4-6% opacity |

---

## Delivery Checklist

**Zen Focus**
- [ ] Page has ONE primary feature that is immediately visible and dominant
- [ ] Persistent navigation is visible but extremely subtle (muted colors, low opacity)
- [ ] Navigation doesn't compete with the centered content
- [ ] Max 1 warm CTA visible at any time

**Canvas**
- [ ] Background is `#F5F3EE` (warm off-white), not pure white
- [ ] Subtle 80px grid texture applied (`opacity ≈ 0.018`)
- [ ] Content is centered with appropriate max-width
- [ ] Breathing room: top padding ≥ `6vh`, side gutters visible

**Chrome Behavior**
- [ ] Secondary controls hidden by default, appear contextually
- [ ] Main menus (sidebar/topbar) always visible but visually recessed
- [ ] Bottom action bar for in-context actions (if needed)
- [ ] Escape key or back arrow returns to parent

**Visual Quality**
- [ ] Transitions use zen ease curves (200–400ms, cubic-bezier)
- [ ] Page load has staggered fade-in animation
- [ ] Cards are weightless — no shadows, no colored borders
- [ ] Text follows warm-black hierarchy (`#37352F` → `#6B6B6B` → `#9B9B9B`)
- [ ] Inputs have 12px radius, warm borders, focus glow

**Inherits from data-oriented-theme**
- [ ] Monospace for data/numbers
- [ ] Right-aligned numeric columns
- [ ] 8px spacing grid
- [ ] Green/Red/Amber for state only
- [ ] Max 2 functional colors visible at once

---

## References

- `references/zen-css-template.md` — Complete CSS variables + utility classes for zen mode
- `references/zen-component-examples.md` — Copy-paste HTML/JSX for all zen components
- `data-oriented-theme/SKILL.md` — Base theme (inherit from, don't duplicate)
- `data-oriented-theme/references/color-psychology.md` — Scientific basis for color choices
