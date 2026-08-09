---
name: create-diagram
description: Use when creating a self-contained interactive HTML architecture diagram — a node-graph visualization with pan/zoom/drag-to-reposition, light/dark theme toggle, and click-to-drill-down group cards. Triggers on "draw a diagram", "visualize the architecture", "diagram this system/subsystem", "node graph", "system diagram", or documenting how components connect for onboarding/review.
---

# Create Diagram

## Overview

Produces a single **self-contained interactive HTML file** — a node-graph diagram of a system or subsystem, styled like a Foglamp/n8n-style agent-workflow canvas: sparse, calm, readable at a glance. It documents the **same truth** as the codebase — read the source first, then render. Never invent components; if wiring status is unclear (built vs. planned), check `docs/STATUS.md` and mark planned pieces visually distinct.

## When to use

- User asks to visualize, diagram, or map out how components/services/modules connect
- Documenting a subsystem's internal wiring for onboarding, architecture review, or a design doc
- **Not** for a markdown/ASCII box diagram — this skill only produces the interactive HTML format (for that, use `tech-write diagram text`)

## Arguments

`$ARGUMENTS` — optional subject scope:

```
/create-diagram                      # full system architecture
/create-diagram rag-pipeline         # just the RAG subsystem
/create-diagram upload-flow          # just the upload flow
```

Omitted subject → full system architecture.

## Output location

`docs/architecture/` — filename `diagram-<subject-kebab>.html` (full system: `interactive-architecture.html`).

**Local file only — never publish externally.** Write the HTML to its repo path and stop there. Do NOT call the Artifact tool or host the output on claude.ai — the local file IS the deliverable (self-contained HTML opens by double-click). Exception only if the user explicitly asks for a shareable link.

## Step 1 — Gather the truth

1. Read [docs/architecture/architecture-diagram.md](../../../docs/architecture/architecture-diagram.md) — the canonical topology
2. Read `docs/STATUS.md` for built ✅ / in-progress 🔄 / planned 🚧 status per component
3. If the subject is a subsystem, read its source (controllers, services, parsers) to get node/edge details right
4. List nodes and edges explicitly before rendering: node name, subtitle, group/lane, badges (tech, model, tool rows), status; edge source → target. The relationship verb goes into the node tooltip/panel prose — edges render unlabeled.

## The HTML node-graph format

A single **self-contained HTML file** (inline CSS + JS + font, zero CDN/external requests — must work by double-clicking the file offline). Visual language modeled on Foglamp/n8n-style agent-workflow canvases: **sparse, calm, readable at a glance**. The reference exemplar is [docs/architecture/diagram-ai-system-target.html](../../../docs/architecture/diagram-ai-system-target.html) — reuse its engine (pan/zoom/drag/tooltip/drill-down machinery) and swap the data arrays; do not rebuild from scratch.

**Anti-crowding rule (the core lesson — never regress on this):**
A canvas with 20+ visible nodes, edge labels, and always-on tag pills is unreadable. Structure every diagram as **two tiers**:
1. **Overview (default view):** max ~6–9 high-level group cards (Clients, API, RAG Pipeline, Data, Observability…), each showing only icon + title + subtitle + at most 3 bullet chips of what's inside. A handful of unlabeled curved edges between groups.
2. **Drill-down (click a group):** canvas swaps to that group's internal components only, with a `◂ back` breadcrumb. Cross-group edges collapse into small clickable "jump" stub cards on the canvas edge (click → jump to that group's view).

**The one-view contract (the test every diagram must pass — check it before delivering):**
A reader opens a view and must be able to (a) see every card in it without panning, and (b) tell which way each arrow runs without tracing the line with their eye. Everything below exists to serve those two sentences. When a rule below conflicts with a nicety, the contract wins. Concretely, a view fails if any of these is true — and all six are mechanically checkable, so check them (harness recipe under **Implementation rules**):

| Failure | Why it breaks the contract |
|---|---|
| A card sits outside the canvas box | Fit-to-view frames the canvas, so the card is invisible until the reader pans hunting for it |
| An edge segment passes under a card | Cards paint over edges — the line vanishes and reappears, and the reader loses which end it came from |
| Two edges run along the same line for more than ~25px | The reader sees one line where there are two ("tumpang tindih") |
| Two cards overlap | The one underneath is unreachable — its ports, its hover, its click |
| An edge loops back around its own endpoint | Reads as pointing the wrong way |
| Fit-to-view scale drops much below ~0.7 | Titles get too small to read, so the reader zooms — which is panning by another name |

Edge *crossings* are not on that list. A real graph will always have some, and they are resolved at read time by hover-focus (see **Edges**). Overlap, tunnelling and off-canvas cards are bugs; crossings are life.

**Stub cards must read as "other stages," not as more internals of the current one — this was a real defect, fixed once, do not regress:**
A stub styled like a smaller leaf card is indistinguishable from the group's actual internals at a glance, forcing the reader to back out to the overview just to check what's upstream/downstream. Give stubs a category of their own:
- **Visually distinct from internal leaf cards** — dashed border (not solid), a translucent fill tinted with the *target* group's own overview color (`hexToRgba(targetColor, .10)`), and a colored accent bar (2–3px) on the side facing that direction.
- **Direction from the real edges, not from card position** — compute whether the stub is upstream or downstream by counting `outbound` vs inbound links in the cross-group edge list (`outbound >= links.length - outbound` ⇒ downstream), not by which side of the canvas it happens to sit on.
- **Label with the arrow only, no direction words** — `◂ open` (only feeds us) / `open ▸` (we only feed it) / `◂ open ▸` (a genuine round trip). Not `"◂ prev stage · open"` / `"next stage ▸ · open"` — the words repeat what the arrow and accent-bar side already say, and on a card sized ~148×46px the extra text is pure crowding, not clarity. Size the stub card's width to the short label, not the long one. Derive the arrows from the edge list, never from which side of the canvas the card landed on.
- **The canvas box must contain every stub — a stub at a negative coordinate is a card the reader cannot find. Real defect, fixed once, do not regress.** Placing stubs by subtracting from the leaf block's margin (`x = MARGIN - gap - STUB_W`) puts them at negative x whenever the margin is smaller than the card, and `setCanvasSize()` — computed from the leaves alone — then excludes them. Fit-to-view frames the leaf column, both stubs hang off-screen, and the reader must pan to discover that the view even has upstream/downstream pointers. Instead derive the padding from what each side actually needs, and let the canvas grow to match:
  ```js
  var padLeft = bySide.left.length ? STUB_EDGE + STUB_W + STUB_GAP : PAD;   // …and right/top/bottom
  var offsetX = padLeft - minX;                       // leaves shift right to make room
  var canvasW = (maxX - minX) + padLeft + padRight;   // canvas grows to contain the stubs
  ```
- **Reserve a real corridor between the stub column and the leaf block — `STUB_GAP` ≥ ~120px.** This is where every stub edge makes its turn. At 24px there is nowhere to turn, lane offsets overshoot the gap, and each line hooks back around its own endpoints — the single ugliest failure mode this format has, and what a reader means by "the arrows are confusing and overlapping."
- **Put a stub level with the leaves it actually links to** — the mean centre of its own connected leaves, then push apart any stubs on the same side that would collide, then slide the run back inside the canvas. A stub parked at the canvas midpoint sends every one of its lines diagonally past unrelated cards before arriving; on its own centroid, its lines leave and arrive travelling the same direction, which is what makes them readable without tracing.
- **A stub must be connected by a real routed edge, not just parked nearby — position alone does not read as "connected," this was a real defect, fixed once, do not regress.** A dashed-border card sitting near the leaf row with no line to it looks like an unrelated floating card, not a pointer to the higher-level view — exactly the "arrow to the higher level isn't visible" failure. Draw an actual `<path>` + arrowhead from each stub to the drilled-in group's own content on every drill-down, the same way group-to-group edges are drawn on the overview:
  - **Layout convention: source/upstream stubs on the left, destination/downstream stubs on the right** — matches the overview's left-to-right flow lanes, so the reader never has to re-learn which side means what between the overview and a drill-down. Stack multiple stubs on the same side vertically, centered on the leaf row's vertical midpoint.
  - **Anchor the edge to the leaf row's bounding box, not to a specific leaf card** — the cross-group edge is defined at the group level in the data (`GROUP_EDGES`), not against any one internal leaf, so drawing it into an individual leaf would assert a relationship the data doesn't actually contain. Compute `rowLeft`/`rowRight`/`rowTop`/`rowBottom` from the current leaf positions (recomputed on every redraw, so it stays correct if a leaf gets dragged) and route the stub's edge to that box's near edge, entry-point Y clamped to the box so it never enters above/below the row.
  - Preserve the edge's original dashed/solid style from `GROUP_EDGES` (a dashed cross-cutting group edge should still render dashed here, not silently become solid).
  - Reference implementation: [docs/mentor/production-llm-topics-diagram.html](../../../docs/mentor/production-llm-topics-diagram.html) — `layoutStubs()` (left/right placement, source vs. destination) and the stub-connector loops inside `drawLeafEdges()` (`upStubs`/`downStubs`, `clampY`) in `openGroup()`.
- Reference implementation (stub visual styling): [docs/architecture/diagram-query-pipeline-listrik.html](../../../docs/architecture/diagram-query-pipeline-listrik.html) — `.node.kind-stub` / `.stub-up` / `.stub-down` CSS, and the `isDownstream` computation + `--stub-accent` / `--stub-bg` custom properties in `openGroup()`.

**Progressive disclosure — where detail lives (never all at once on the canvas):**
- Card face: icon + title + one-line subtitle only. **Never render a bullet/chip list on the card face** — a 2–3 item list almost always wraps to more lines than the card's fixed height allows and spills past the border (seen and fixed once already — do not regress). Bullet/chip lists belong exclusively in the hover tooltip.
- **Hover:** floating tooltip with tech tags + chip/bullet list (if any) + short description excerpt
- **Click:** slide-in side panel with full description, key files, endpoints, ticket refs
- Card container must have `overflow: hidden` as a hard backstop, so if content is ever added back to the face by mistake, it clips instead of visibly crossing the border. Size card `w`/`h` for icon + title + subtitle only (~90–95px tall) — do not pad height to fit list content that no longer lives there.

**Typography — no "AI fonts":**
- Embed **Inter** (variable woff2) as a base64 `@font-face` data URI — download it at build time (`https://rsms.me/inter/font-files/InterVariable.woff2`, ~350KB) and inject with a Node one-liner so the base64 never passes through chat output. Fallback stack: system UI fonts.
- **NEVER** set body/label text in monospace — mono everywhere reads as generated dev-tool output. Mono is allowed ONLY for file paths inside the detail panel.
- Card titles ~15px/600, subtitles ~12.5px/400 muted. Generous padding (16–18px). No tiny 9–10px labels on the canvas.

**Canvas**
- Dark theme: near-black background (`#0b0b0d`). Light theme (default): cream/off-white background (`#f7f5f0`). Both share a subtle dot-grid texture, themed via `--bg-dot`.
- Pan (drag empty canvas) + zoom (wheel), fit-to-view on load, zoom controls bottom-right
- **Nodes are draggable** — mousedown-drag moves a single card, its edges reroute live; a 3px movement threshold separates drag from click. Canvas pan only triggers on empty space.
- **Persist dragged positions across a refresh** — a drag that's forgotten on reload trains the user not to bother rearranging. Load a `savedPositions` object once from a per-diagram `localStorage` key (`pf-diagram-<subject>:positions`), keyed by `<view>::<nodeId>` (view = `'overview'` or the drilled-into group's own id, so a leaf index reused across different groups' drill-downs — every group has a leaf 0, 1, 2… — never collides with another group's saved leaf). Save via `saveNodePosition(key,x,y)` on drag-**end** only (mouseup, and only if the movement crossed the drag threshold — not on every mousemove, not on a bare click). Apply saved overrides once at init, right after the default layout runs, so a dragged node keeps its spot while everything else still gets the fresh layout. Reference: `savedPositions`/`positionKey()`/`saveNodePosition()` in [docs/architecture/diagram-ai-system-target.html](../../../docs/architecture/diagram-ai-system-target.html) (original, per-node closure drag handling) and [docs/mentor/production-llm-topics-diagram.html](../../../docs/mentor/production-llm-topics-diagram.html) (adapted for a single shared drag-state variable instead of per-node closures).

**Nodes** — cards, not boxes:
- Dark card (`#141519`), 1px border (`#26272d`), 14px radius, soft shadow
- Header row: small rounded icon tile (emoji, color-coded per group) + **title** + muted subtitle
- **Status styling:** live = normal solid border + normal fill; in-progress = small corner dot in a clean amber/orange (e.g. `#f0b429` dark / `#d97706` light) — avoid a rust/red-leaning hex (e.g. `#b45309`) for this, it visually collides with warning/error red (`.badge.warn`) and reads as "broken" instead of "in progress"; planned = **dashed border only**, neutral gray color (`var(--border-hover)`, never the accent or a status color) plus a fill that reuses `var(--header-grad)` (the same gradient as the header bar) — ties the "not built yet" card visually to the chrome instead of inventing a third background tone.
  - **Never fade a planned node with element `opacity`** (e.g. `opacity: .74` on the whole `.node`). Opacity blends border + fill + text toward the canvas color together, and on a light/cream canvas where a near-canvas fill already sits close to `--bg`, the node nearly disappears — a real regression hit and fixed on the PF-AI006 diagram. Instead, get the "planned" distinction entirely from the dashed border and a fill value chosen with enough delta from `--bg` to read on its own (check both themes — light canvases have much less headroom between "canvas" and "muted card" than dark ones).

**Edges**
- Muted gray (`#35363d`), ~1.6px, round linecap
- **No edge labels, no animated flows, no per-edge colors** — uniform quiet curves (dashed = planned/telemetry). Relationship detail belongs in the node's tooltip/panel prose, not on the line.
- **Near-orthogonal elbow routing, not diagonal S-curve bezier.** Plain point-to-point cubic beziers between node centers produce wavy, overlapping lines once a canvas has more than a few edges — unreadable. Instead:
  - Give each node discrete **ports per side** (left/right/top/bottom); edges sharing a side spread evenly along it, sorted by the neighbor's position, instead of bunching at the center and swinging wide to avoid each other.
  - Route each edge as a **rounded elbow**: straight off the source port, one turn at the midline, straight into the target port — corners rounded (~20px radius) so turns read as *almost* a right angle, not a hard mechanical kink or a diagonal sweep.
  - On drag, reroute using the node's fixed port/side assignment (don't recompute which side an edge exits from mid-drag — it causes edges to flip and look broken).
  - **Clamp the elbow's turn line to the corridor between the two node boxes. Real defect, fixed once, do not regress.** A lane offset is added to the midline so parallel edges don't share a pixel line — but nothing stops it exceeding the gap. When it does, the turn lands *behind* the source card or *inside* the target column and the edge visibly hooks back around its own endpoint, which reads as pointing the wrong way. The narrower the gap, the worse it gets — so this and the stub-gutter rule are the same bug seen from two ends. Clamp, and fall back to the plain midpoint when the two boxes leave no corridor at all:
    ```js
    function clampElbow(v1, v2, lo, hi, laneOffset) {   // lo/hi = the facing edges of the two boxes
      var mid = (v1 + v2) / 2 + (laneOffset || 0);
      if (hi - lo < 18) return (v1 + v2) / 2;           // no usable corridor — keep it straight
      return Math.min(hi - 9, Math.max(lo + 9, mid));
    }
    ```
  - **Assign lane offsets per corridor, not by summing each edge's lane index at its two ends.** The obvious implementation gives every edge a lane index at its source port and another at its target port and adds them — but an edge that is outermost at its source and innermost at its target sums to the same offset as one that is the reverse, so the two elbows turn on the same line and draw as one. Bucket edges by the corridor they turn in, spread each bucket evenly around the midline, and shrink the gap to fit when the corridor is tight; sort the bucket by target position then source position so edges heading for the same card sit in adjacent lanes instead of interleaving. Collisions then aren't merely unlikely, they're impossible.
  - Reference implementation: [docs/architecture/diagram-ai-system-target.html](../../../docs/architecture/diagram-ai-system-target.html) — `assignPorts()`, `sidePoint()`, `roundedWaypointPath()`, `edgePath()`.
- **Collapse an `A → B` / `B → A` pair into ONE line carrying an arrowhead at each end.** Two separate lines say "two relationships", and routed through the same corridor they braid around each other; one double-headed line says "round trip", which is what a call and its return leg actually are. Merge at draw time only — the layout pass still needs to see both directions, since a dashed back-edge is often what tells a layered layout where a node belongs. On merge, solid wins over dashed and `hot` wins over plain: a live path with a dashed return leg is still a live path. This applies to group edges on the overview and to cross-group stub links alike — for stubs it means deduping on `(target group, local leaf)` and **not** on direction.
- **An edge must never pass under a card.** Cards paint over the SVG, so a tunnelling edge doesn't look like an overlap — it looks like a line that stops at one card and an unrelated line that starts at another, and the reader cannot tell they're the same edge. This is almost always a *layout* fault, not a routing one: fix it with the two placement rules under **Layout**, not by building a bypass router.
- **Direction must be readable without following the line by eye — always render an arrowhead** at the point the edge enters the target node, oriented to the port's side (a `polygon` whose tip sits on the port point, base pulled back along the incoming direction — see `arrowPoints()` in the reference implementation). A canvas of unlabeled curves with no arrowheads reads as "these nodes are related," not "A feeds into B" — that ambiguity is the same defect as a missing legend.
- **"Diusahakan tidak numpuk" (edges must not stack/cross unreadably) is a target, not a guarantee** — a dense graph will always have some crossings once it exceeds a handful of nodes. Treat it as two obligations, not one "make it perfect" ask:
  1. **At layout time:** route through `assignPorts()` port-spreading (already required above) so parallel edges between the same two nodes fan out instead of literally overlapping on one pixel line — true overlap (two edges tracing the identical path) is a bug and must not happen; crossing between *unrelated* edges is normal and acceptable.
  2. **At read time:** give the reader a way to disambiguate crossings on demand — hovering (or selecting) a node fades every edge that doesn't touch it and highlights the ones that do (`edge-active` class + a dimmed `has-focus` state on the SVG root, driven by the node's existing `mouseenter`/`mouseleave`). This is what actually resolves "which line goes where" at a crowded junction — static routing alone cannot fully prevent visual crossings on a real system diagram.
  - Reference implementation for both: `arrowPoints()`, `focusEdgesFor()`, `clearEdgeFocus()`, `.has-focus` / `.edge-active` CSS in [docs/architecture/diagram-ai-system-target.html](../../../docs/architecture/diagram-ai-system-target.html).

**Layout**
- Left-to-right flow lanes: clients → API/orchestration → workers/AI → data stores/outputs
- **A card that fans out to N siblings must stand perpendicular to the way those siblings are stacked.** Left or right of a column; above or below a row. Put the hub *in line with* the stack — a fourth card under a column of three, a hub at the top of the column it feeds — and every non-adjacent edge has to run under the cards in between to arrive. There is no routing trick that fixes this; only the placement does. Stubs already obey it (a column of leaves gets its stubs on the left/right flanks), so the rule is really about internal cards forgetting it.
  - Two hubs on the same flank must be **stacked along that flank, not queued behind each other** — a card between the block and a stub shadows everything the stub connects to. Same column, different rows; then every fan reaches its target through the one shared corridor.
- **When three hubs contend for the same siblings, move the third into the flank column — never delete its edges.** A block of stacked siblings looks like it has only two clear flanks, one per hub, and the third hub tunnels wherever you drop it *inside* the block. The fix is to stand that third card **in the flank column itself, stacked with the stub on that side** (support it with a `flank: "<side>"` property on the leaf, which lifts it out of the block's bounding box and into the side stack). All three fans then turn in the same corridor and cross each other there — which reads fine — instead of one of them running under the cards in between, which does not.
  - **Deleting the arrows is never the fix, and reaching for it is a sign you have mis-framed the problem.** An arrow is the information; the position is the presentation. "It's an annotation, not flow" is a real distinction and it may well change the card's *wording* — it does not license removing the reader's only evidence that the three tools and the docstring card have anything to do with each other. Move the card, re-route the edge, widen the corridor; if none of that works, say the layout is beaten and ask. Never quietly trade content for tidiness — a diagram that is clean because it says less is a worse diagram, and the person who asked for it will read the deletion as exactly the vandalism it is.
- **Pull a root with no incoming edges forward to sit one column left of its earliest successor.** A longest-path layering assigns layer 0 to anything with no predecessor, which parks a side-input card in the leftmost column even when the only thing it feeds is three columns right — and that one edge then spans the whole canvas, under every card in between. Its edges all still point right afterwards, so nothing else about the layering changes:
  ```js
  declOrder.forEach(function (id) {
    if (primaryIn[id].length || secondaryIn[id].length || !outOf[id].length) return;
    layer[id] = Math.max(0, Math.min.apply(null, outOf[id].map(function (s) { return layer[s]; })) - 1);
  });
  ```
- **Aim each view's canvas at roughly the viewport's aspect ratio (~1.3–1.9).** A tall narrow canvas fits by height, wastes the width, and shrinks every card until the titles stop being readable — which sends the reader to the zoom control. Reserving the stub gutters as real padding widens most drill-downs into this band for free; if one is still a tall single column, that's the signal to split it into two columns.
- All content in data arrays (`GROUPS`, `GROUP_EDGES`, `LEAF_NODES` with `parent` refs, `LEAF_EDGES`) at the top of the script — updating the diagram later = editing data, not markup
- **Position nodes by hand by default** (deterministic, simplest to reason about, no algorithm to get wrong) — right for a diagram documenting a fixed, curated topology, like the system architecture diagram.
- **Switch to a computed layered layout when the node set is expected to grow** — a roadmap, a curriculum/topics map, a backlog — anywhere hand-picked coordinates would otherwise need re-tuning by hand every time a node is added or removed:
  - **Column** = longest-path layer over the primary (non-dashed) edges only, root(s) = layer 0. A node with no primary predecessor but a dashed/"cross-cutting" one falls back to that predecessor's layer + 1, so it still lands downstream of what it conceptually builds on instead of defaulting to layer 0.
  - **Row** = single-pass barycenter: each node's Y is the average Y of its primary predecessors from strictly earlier columns only (a same-column/lateral edge's source isn't positioned yet, so it's excluded from this average — falls back to the dashed predecessor's Y when there's no primary one, so the node still visually anchors near what placed it). Ties break on declaration order for determinism; a minimum-row-gap pass resolves any collisions afterward. A root with no predecessor of its own is re-centered on the average Y of its direct children once they're placed, so a hub sits centered on its fan-out instead of pinned to the top.
  - **This pairs with 4-directional ports, not optionally.** A real layered layout will legitimately place two connected nodes in the *same column* (a lateral/cross-cutting edge between two same-depth nodes — that's the whole point of layering by depth). A port picker that only ever compares x (`x < x ? right : left`) has no x-difference to key off for that pair, exits/enters the wrong side, and loops the long way around the canvas instead of routing as a short top/bottom connector. The `assignPorts()`/`sideOf()` engine under **Edges** above already picks the dominant axis (`|dx| >= |dy|` → left/right, else top/bottom) precisely so this doesn't happen — don't add a computed layout on top of a port picker that only handles left/right.
  - Reference implementation: `layoutGroups()` in [docs/mentor/production-llm-topics-diagram.html](../../../docs/mentor/production-llm-topics-diagram.html) — verified via a Node.js simulation of the extracted `<script>` (zero node-box overlaps, zero backward-pointing edges, zero duplicate paths), not just by eye. Worth the same check on any diagram that adopts this.
- Header strip: diagram title, last-updated date, legend (Live / In progress / Planned)

**Implementation rules**
- **Start the file with `<!doctype html>` + `<meta charset="utf-8">` before the `<title>`.** Without it, a double-clicked local file falls back to Latin-1 decoding in Windows browsers and every smart quote, em-dash, and arrow in node text (`— " " ▸ ◂`) renders as mojibake (`â€œ`, `â€"`, `â†'`) — a real bug hit and fixed once on this format, do not regress. Also add `<meta name="viewport" content="width=device-width, initial-scale=1">` alongside it.
- Plain HTML + vanilla JS + inline SVG for edges; no framework, no build step, no external requests
- **Support both dark and light themes, default to light.** Define every color as a CSS custom property on `:root` (dark values), then add a `#app[data-theme="light"]` block that overrides each one with light-mode values (cream/white canvas, dark text, darkened accent/status colors for contrast on a light background) — never hardcode a color outside the variable set (e.g. no bare `#d6d7dc` on a text rule; route it through a themed var like `--chip-text`). Ship a header `theme-toggle` button that flips `#app`'s `data-theme` attribute between `"light"` and `"dark"` and swaps its icon (☀️/🌙); default `data-theme` to `"light"`. Reference implementation: [docs/architecture/diagram-ai-system-target.html](../../../docs/architecture/diagram-ai-system-target.html) — see the `:root` / `#app[data-theme="light"]` variable blocks and the theme-toggle IIFE near the end of the `<script>`.
- **`#app` itself must declare `color: var(--text)`, not just the theme's custom properties — a real bug, fixed once, do not regress.** The toggle only flips `data-theme` on `#app`, never on `<html>`/`<body>`. If `color: var(--text)` is only set on `html, body` (never re-declared on/under `#app`), the browser resolves that `color` once at the `body` element — using whatever `--text` equals in `:root`'s scope, i.e. the **dark** default — and inherits that literal computed value down through `#app` and every descendant that never re-declares `color` itself. Any element without its own explicit `color` (e.g. a bare `.node .title{font-size:…;font-weight:600}` with no `color` line) is silently stuck showing dark-theme text forever, even after switching to light — on a light/cream card that reads as "title barely visible, nearly invisible," not as an obvious color-swap bug. Fix: declare `color: var(--text)` on `#app` in addition to `html, body`, so anything inside the toggled subtree that relies on inheritance re-resolves against the *live* theme. Cheap audit before shipping: toggle the theme and check every card title, not just the canvas background and accent colors — background/border bugs are obvious at a glance, this one only shows up as low-contrast text.
- **Verify before delivering — run the geometry harness, don't eyeball it.** `node --check` on the extracted `<script>` only proves it parses; every failure in the one-view contract is a *geometry* bug that a syntax check and a glance at one view both sail straight past. [verify-diagram.js](verify-diagram.js) shims just enough DOM for the diagram's own script to run headlessly, opens the overview and every drill-down by firing each group card's real click handler, and asserts the whole contract per view — off-canvas cards, edges under cards, duplicate paths, edges stacked on the same line, overlapping cards, and the fit-to-view scale:
  ```bash
  node .claude/skills/create-diagram/verify-diagram.js path/to/diagram-<subject>.html
  ```
  It exits non-zero and names the offending view, edge and card (`EDGE-UNDER-CARD  edge#10 passes under D5`), which is enough to fix without opening a browser. Run it after any edit to the data arrays or the layout/routing code, not just at the end. It reads only the `<script>` block and standard node shapes, so it works unchanged on any diagram built to this format.

## After delivering

- Tell the user to open the local file in a browser (clickable link) — no external hosting.
- Note where future edits go: if hand-tuned positions, the `GROUPS`/`GROUP_EDGES`/`LEAF_NODES`/`LEAF_EDGES` data arrays including x/y; if a computed layout, the same arrays minus x/y — positions re-derive automatically, and any manual drag persists across a refresh via `localStorage`.
- Add/refresh a link in `docs/INDEX.md` if it exists.
- Note in the file: `> ⚠️ Keep current: regenerate via /create-diagram after architecture changes`.

## Principles (always active)

1. **Accuracy over completeness.** A diagram with three accurate nodes is better than one with ten where three are invented or stale. Flag uncertainty rather than papering over it.
2. **Stale diagrams are worse than no diagram.** Mark what will need updating so a future editor knows what to check.
3. **The one-view contract is non-negotiable.** A diagram that requires panning or eye-tracing to read has failed regardless of how accurate its content is — run [verify-diagram.js](verify-diagram.js) before calling it done.

## Common mistakes

| Mistake | Fix |
|---|---|
| Rendering 20+ nodes flat on one canvas | Two-tier: overview group cards → click to drill into internals |
| Putting a bullet/chip list on the card face | Card face is icon + title + subtitle only; lists live in the hover tooltip |
| Diagonal S-curve bezier edges | Orthogonal elbow routing with per-side ports (see **Edges**) |
| Two separate lines for `A → B` and `B → A` | One line, arrowhead at each end |
| Fading a "planned" node with `opacity` | Dashed border + a fill with real delta from `--bg`, no opacity |
| Shipping without running the geometry harness | `node .claude/skills/create-diagram/verify-diagram.js <file>` before delivering |
