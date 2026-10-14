# UI rules

Rikky's corrections from past UI sessions. Apply together with the `data-oriented-zenmode` / `data-oriented-theme` skills.
Guiding principle: **every line, element, and decoration is guilty until proven necessary.** Start from nothing and add only what earns its place.

## No dividers

- Never use `divide-y`, `divide-x`, `border-t`, or `<hr>` as a separator — not inside cards, not in sidebar nav, not between stacked blocks. Whitespace (`space-y-*`, `gap-*`, padding) is the only separator.
- Allowed lines: page-frame edges (topbar `border-b`, sidebar `border-r`) and semantic card dividers — solid for permanent sections, dashed for collapsible secondary content.
- The card border is already the frame. Side-by-side stats inside a card use spacing only.

## Cards

- `.pf-card` (in `index.css @layer components`) is the project card primitive: `className="pf-card p-5"`.
- Secondary detail (a chart explaining a primary card's numbers) lives **inside** that card, below a dashed `border-t`, with no card chrome of its own. Never a peer card next to it — a peer implies equal importance.
- Sparse data gets a compact layout; give label columns `flex-1`.

## Numbers and labels

- Never show a bare percentage. Anchor it with a mini bar or a tooltip that says "of what".
- Don't over-abbreviate labels that carry meaning. "Last Month" beats "1M" because it says *recent*, not just a duration. Abbreviate only units (3M, 1Y) or known codes (YTD, IDR).

## Emojis

- Size the emoji to its text block: one line of text → `text-sm`, two lines → `text-lg`, plus `mt-0.5` to align.
