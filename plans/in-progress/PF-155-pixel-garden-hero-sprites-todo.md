# PF-155 — Pixel-art plant for the Journey garden hero

> **GitHub Issue:** #120
> **Status:** In Progress (implemented; STEP 7 e2e not run; awaiting owner review)
> **Started:** 2026-11-10 (planned)
> **Planned from branch:** main
> **Board objective:** The Journey garden shows a pixel-art plant that sways in the wind and drops leaves when you tap it, instead of a plain emoji.

## Objective

The Journey hero shows the current level's growth stage as one 88px emoji (🌱 🌿 🌳 🌳🍎). It looks different on every operating system and cannot move. This plan replaces it with a pixel-art tree whose still image is close in richness to FeralUI's Pixel Play demo (cherry tree, bush, autumn maple): a canopy built from many small leaf clumps in five tones, a dark trunk with visible branches, and an irregular silhouette.

**The picture is the deliverable.** The owner judges this plan by how the trees look, not by how the generator is written. Sway and falling leaves are a bonus on top.

The growth logic does not change: four stages from the level score, and a plant never shrinks below the best stage it reached.

### What changed from the first version of this plan (2026-11-10 rewrite)

The first version drew a 48×48 tree from six shaded circles. The owner tried it and found it far too simple next to the target. This version keeps the delivery shape (generated PNG sprite sheets, CSS `steps()` sway, a `PixelPlant` component, tested pure logic) and replaces the drawing method and the size:

| | First version | This version |
|---|---|---|
| Drawing method | Union of 3–6 shaded circles | A 3D cloud of hundreds of small leaf spheres, lit, depth-sorted, quantised to a five-tone ramp with dither |
| Frame size | 48×48, shown at 96 | 96×96, shown at 192 |
| Variety | One green tree | One species per level (five), four stages each |
| Sway | Whole rows shift sideways | Each leaf shifts by whole pixels on its own phase; trunk fixed |
| How "done" is decided | Code matches the plan | The executor renders a contact sheet, looks at it, and iterates until the visual checklist passes |

The method is the one used by the MIT-licensed [pixel-plays](https://github.com/amirmushichge/pixel-plays) games, which draw their trees in plain JavaScript with no image assets. Reimplement the idea; do not paste code from that repo. Research notes with sources are in the 2026-11-10 chat that produced this rewrite; the facts needed are restated below.

## Acceptance Criteria

- [ ] `/journey` shows a pixel-art tree for the current level in place of the emoji, with crisp (not blurred) pixels, readable in light and dark theme.
  > Not met (not verified on the real page): the hero change is in place and passes lint, tsc and build, and the same `PixelPlant` renders crisp on light and dark in a browser harness, but `/journey` itself needs sign-in and the API and no stack was running. Confirm it in step D of the review checklist.
- [x] **Visual checklist passes** on the contact sheet (STEP 2), for all 20 sprites:
  - The canopy reads as clumps of leaves in at least four distinct tones, lit from the top-left, with a dark underside. It does not read as a few shaded balls.
  - The silhouette is irregular, with small gaps and loose leaves at the edge.
  - Trunk and at least two branches are visible on stages 2 and 3, partly hidden by leaves.
  - The four stages of one species are clearly a seedling, a young tree, a full tree, and a full tree with fruit or blossom accents.
  - The five species are told apart at a glance by colour and crown shape.
  - No speckle: no scattered single pixels of a wrong tone inside flat areas.
  > Verification note: scored by looking at the light and dark contact sheets and the L3 sway strip over 4 rounds in STEP 2B, then again in a browser. Tones and clumps, silhouette, trunk and branches, four distinct stages and five distinct species pass; lone pixels are at most 12 per sprite across 8 frames. The one gap the owner may still see is grain: the art is chunkier and cleaner than the Pixel Play screenshot (see the pilot log).
- [x] The plant sways in a continuous loop in which leaves move and the trunk does not. With the operating system's "reduce motion" setting on, it shows one still frame and does not drop leaves.
  > Verification note: in headless Chromium through a throwaway harness (deleted afterwards) the sway moved in whole 192px steps, the 8 frames loop seamlessly (the 7-to-0 step differs by 619 pixels, inside the 262 to 757 range of the others) and the trunk geometry never moves. With reduced motion on, the animation is `none`, the frame does not change and a tap drops no leaves.
- [x] Clicking or tapping the plant drops a few leaves in that species' colours; they disappear after landing.
  > Verification note: in the same browser run a tap on a stage 2 plant added 6 leaves with a species colour class, all removed themselves within 2.2 s, and ten rapid taps were capped at 24 leaves in flight.
- [x] The stage shown still follows the existing rule (score bands of 25, never below the peak stage stored in `pf-journey-peak-stages`).
  > Verification note: the bands are unit-tested (0, 24.9, 25, 49.9, 50, 75, 100, clamping, NaN). The peak-stage logic and `PEAK_KEY` in `LivingGardenHero.tsx` are unchanged (diff read); the peak rule was not exercised in a browser.
- [x] The plant keeps `data-testid="plant-l{n}"` and `data-stage`, and is reachable by keyboard with a spoken label.
  > Verification note: in the browser harness all 20 plants had `data-testid`, `data-stage` and an aria-label such as `Level 2, stage 3 of 3. Shake the plant`; Tab focused the button with a visible ring and Enter shook it.
- [x] `npm run test:journey`, `npm run lint`, `npx tsc --noEmit` and `npm run build` pass from `apps/frontend/`.
  > Verification note: all exit 0. `test:journey` ran 27 tests (13 new); lint reports 0 errors and 9 existing warnings in files not touched; type checking used the two CI commands, `tsc --noEmit -p tsconfig.app.json` and `-p tsconfig.node.json`, because a bare `npx tsc --noEmit` on the solution-style `tsconfig.json` checks nothing. The `.mjs` generator is covered by neither ESLint nor tsc.
- [x] No new npm dependency, no CDN script, and no file from feralui.dev or pixel-plays in the repository.
  > Verification note: `package.json` and the lockfile are unchanged, the generator imports only `node:zlib`, `node:fs`, `node:path` and `node:url` and contains no URL, and no outside code or asset was used. Caution: the owner's Pixel Play screenshot sits untracked at `plans/backlog/PF-155-pixel-garden-hero-sprites-todo.png`; it is a screenshot of feralui.dev, so do not commit it.

## Approach

A dependency-free Node script draws every sprite and commits the PNGs. For each level and stage it builds a small 3D scene, renders it to a 96×96 grid, and writes a sheet of 8 sway frames in one row (768×96). The component shows a sheet at 2× (192×192) with `image-rendering: pixelated` and plays it with a CSS `steps(8)` animation. The script also writes a small generated TypeScript manifest (canopy box and leaf colours per sprite) so the falling-leaf code never drifts from the art.

### Drawing method (the part that decides quality)

1. **Skeleton.** A trunk and two to five branches as tapered capsules, leaning slightly, drawn in three bark tones (lit side, base, shadow side). Bigger stages get more and longer branches.
2. **Crown.** A list of four to eight crown blobs (centre, radius, vertical squash) placed around the branch ends. Scatter leaves inside each blob as small spheres of radius about 1.5–3.5 px, uniformly through the volume (cube-root radius distribution), with a few strays outside the edge. Rough leaf counts per stage: 12, 70, 260, 300.
3. **Render.** Orthographic view, per-pixel depth buffer, nearest leaf wins. Light each pixel from the top-left and slightly towards the viewer using the sphere normal, add ambient occlusion by depth inside the crown (leaves near the crown centre and bottom are darker), and add a small per-leaf tone offset so neighbours differ.
4. **Quantise.** Map light to five leaf tones (shadow, base, mid, light, high). Hue-shift the ramp: shadows lean cool (towards blue-violet), highlights lean warm (towards yellow). Use a 4×4 Bayer offset only between adjacent tones, at low strength, so tone edges break up without speckle.
5. **Clean up.** Remove orphan pixels (a pixel whose eight neighbours share none of its tone), add a one-pixel darkest-tone rim on the underside of the canopy, and keep the outside edge un-outlined.
6. **Ground.** A short grass tuft line under the trunk and a few fallen leaves in the species' colours.
7. **Stage 3 accents.** Fruit or blossom clusters of 2×2 to 3×3 px with one highlight pixel, placed on the lit side of leaf clumps.
8. **Sway frames.** Record which leaf owns each pixel. For frame `f` of 8, shift each leaf by `round(A · reach · (sin(2πf/8 + phase) + 0.5·sin(4πf/8 + phase2)))` pixels sideways, where `reach` grows with height and distance from the trunk and `A` is at most 2. Trunk, ground and the lowest leaves do not move. Both sine terms complete whole cycles in 8 frames, so the loop is seamless. Frame 0 need not be the unshifted image.

Everything is seeded, so the output is identical on every run.

### Species per level

Palettes are display colours, not financial thresholds. The executor may tune every value below; the requirement is five clearly different trees.

| Level | Species idea | Crown shape | Leaf ramp (shadow → high) | Stage 3 accent |
|---|---|---|---|---|
| L1 Foundations | Round green bush-tree | Low, wide, dense | deep green → yellow-green | Red berries |
| L2 Defense | Dark broadleaf (oak) | Tall, heavy, rounded | blue-green → mid green | Brown acorns / pale buds |
| L3 Growth | Cherry blossom | Wide, airy, layered | dusty rose → near-white pink | Deeper pink blossom clusters |
| L4 Freedom | Autumn maple | Broad umbrella | rust brown → golden orange | Bright yellow leaves |
| L5 Legacy | Old golden tree | Largest, spreading, thick trunk | olive → pale gold | White-gold lanterns of light |

Out of scope: a bone rig, dragging branches, per-pixel hit-mask (the whole sprite is the button), wind controls, sound, and showing all five levels' plants at once. The unused SVG plants in `src/components/journey/plants/` are left alone.

## Affected Files

| File | Change |
|------|--------|
| `apps/frontend/scripts/generate-garden-sprites.mjs` | Create — draws all sheets, the manifest, and (with `--preview`) a contact sheet |
| `apps/frontend/public/garden/l{1-5}-stage-{0-3}.png` | Create — 20 generated sheets, 768×96 each, committed |
| `apps/frontend/src/lib/journey/gardenSprites.generated.ts` | Create — generated manifest: canopy box and leaf colour classes per sprite |
| `apps/frontend/src/lib/journey/gardenSprite.ts` | Create — stage rule and falling-leaf maths (pure) |
| `apps/frontend/src/lib/journey/gardenSprite.test.ts` | Create — Vitest coverage for both |
| `apps/frontend/tailwind.config.ts` | Edit — add the `garden-sway` keyframes and animation |
| `apps/frontend/src/components/journey/PixelPlant.tsx` | Create — sprite, sway, tap reaction |
| `apps/frontend/src/components/journey/LivingGardenHero.tsx` | Edit — render `PixelPlant` instead of the emoji |
| `apps/frontend/e2e/journey.spec.ts` | Edit — repair two specs that describe the old five-plant hero |

---

## TODO

### [x] STEP 1 — Write the generator

Create `apps/frontend/scripts/generate-garden-sprites.mjs` following "Drawing method" above. Requirements:

- No dependencies: PNG encoding with `node:zlib` only (IHDR, one IDAT, IEND, CRC32).
- Constants: `SIZE = 96`, `FRAMES = 8`. One spec object per level (palette, crown blobs per stage, trunk, accent) so tuning a species is editing data.
- Seeded random generator (for example mulberry32) seeded from level and stage.
- `node scripts/generate-garden-sprites.mjs` writes the 20 sheets to `public/garden/` and the manifest to `src/lib/journey/gardenSprites.generated.ts`.
- `node scripts/generate-garden-sprites.mjs --pilot <dir>` writes only `pilot.png` for L3 stage 2 (see STEP 2) and touches nothing in `public/` or `src/`. For the pilot, only the L3 spec needs real data; the other levels can be filled in at STEP 2B.
- `node scripts/generate-garden-sprites.mjs --preview <dir>` additionally writes `contact-light.png` and `contact-dark.png` to `<dir>`: a 5×4 grid (levels as rows, stages as columns) of frame 0 at 4× scale, on `#f7f6f2` and on `#17181c`, plus `sway-l3.png` showing all 8 frames of L3 stage 2 at 4×. Preview files go to the session scratch directory and are never committed.

The manifest exports, per level and stage, the canopy box in display pixels relative to the sprite centre (`halfWidth`, `top`, `bottom`), the ground offset, and two Tailwind background classes for falling leaves written as full literal strings (for example `'bg-[#e79aa9]'`) so Tailwind generates them.

> **Why:** The first version proved that shaded circles cannot reach the target. Many small lit spheres with a depth buffer produce the clumped, layered canopy that hand-drawn pixel trees have, and every stage and species becomes a change of numbers.
> **Check:** The command writes 20 PNG files of 768×96 and the manifest; running it twice produces byte-identical files.

---

### [x] STEP 2 — Pilot: one tree, then stop for the owner (GATE)

Draw **only the L3 cherry blossom at stage 2** (the full tree). Do not tune any other species or stage yet.

1. Run the script with `--pilot <dir>`, which writes `pilot.png`: frame 0 at 4× on the light background and on the dark background side by side, with the 8 sway frames at 2× in a row underneath. Open it with the Read tool.
2. Score the single-tree items of the visual checklist (tones and clumps, silhouette, trunk and branches, no speckle) as pass or fail.
3. Fix the worst failure in the generator, regenerate, and look again. Expect at least four rounds; stop when every item passes, or after ten rounds.
4. Save the final image to `docs/features/assets/pf-155-pilot-cherry.png`.
5. **Stop here.** Report the image path and the checklist result, and wait for the owner to accept or give feedback. Do not start STEP 2B or any later step in the same run.

If the owner gives feedback, apply it to this one tree and repeat from 1. Tick this step only when the owner has accepted the pilot.

> **Why:** Twenty sprites tuned at once hide whether the method itself is good enough. One tree is cheap to judge and cheap to redo, and every later sprite inherits its renderer.
> **Check:** `docs/features/assets/pf-155-pilot-cherry.png` exists and the owner has said it is accepted. Record the number of rounds in Execution Notes.

---

### [x] STEP 2B — The other 19 sprites (only after the pilot is accepted)

Do not change the renderer the owner accepted; add species data and stage data only, unless a checklist item cannot pass otherwise.

1. Run the script with `--preview` and open `contact-light.png`, `contact-dark.png` and `sway-l3.png` with the Read tool.
2. Score every item of the visual checklist in Acceptance Criteria as pass or fail, per species.
3. Fix the worst failure in the generator, regenerate, and look again.
4. Repeat. Expect at least four rounds; stop when every checklist item passes for all 20 sprites, or after ten rounds.

Common failures and their fixes:

| What you see | Fix |
|---|---|
| Canopy looks like a few balls | More, smaller leaves; more blobs with smaller radii; stronger per-leaf tone offset |
| Canopy is flat or muddy | Widen the ramp's value range; strengthen depth occlusion; raise highlight threshold so "high" is rare |
| Noisy, speckled | Lower dither strength; larger leaf radius; run the orphan-pixel pass twice |
| Silhouette is a smooth circle | More stray leaves; offset blobs asymmetrically; cut one or two gaps showing branch |
| Stages look alike | Change trunk height and crown extent between stages, not only leaf count |
| Hard to see on dark theme | Lift the shadow tone; add a slightly lighter bark tone |
| Sway shimmers | Cap shift at 1 px for stages 0–1; make neighbouring leaves share phase by blob |

> **Why:** The owner cares about the picture and nothing else. An agent that cannot see its output will ship the first version's mistake again.
> **Check:** Record in Execution Notes how many rounds were run and the final pass/fail per checklist item. If any item still fails after ten rounds, say which, keep the best result, and continue.

---

### [x] STEP 3 — Stage rule and leaf maths in a tested library file

Create `apps/frontend/src/lib/journey/gardenSprite.ts` with:

- `type PlantStage = 0 | 1 | 2 | 3` and `type GardenLevel = 1 | 2 | 3 | 4 | 5`.
- `stageFromScore(score: number): PlantStage` — `floor(score / 25)` clamped to 0–3, and 0 for non-finite input. Comment that these are display bands carried over from PF-114, not financial thresholds.
- `interface Leaf { id; x; y; drift; duration; colorClass }`.
- `leafBurst(level, stage, firstId, rand = Math.random): Leaf[]` — 2, 4, 6, 6 leaves for stages 0–3, starting inside that sprite's canopy box from the generated manifest, alternating the two colour classes, `drift` within ±16 px, `duration` 0.8–1.5 s.

Create `gardenSprite.test.ts` next to it covering: the stage bands at 0, 24.9, 25, 49.9, 50, 75, 100; clamping of 140, −5 and NaN; leaf counts per stage; ids starting at `firstId`; every leaf starting inside the canopy box and above the ground for `rand` of 0, 0.5 and 0.999; determinism for a fixed `rand`.

> **Why:** Component tests are not set up in this project (PF-038), so anything worth testing has to be pure logic under `src/lib/`. `test:journey` already runs this folder in CI.
> **Check:** `npm run test:journey` passes, including the new file.

---

### [x] STEP 4 — Sway animation in Tailwind

In `apps/frontend/tailwind.config.ts`, add to `keyframes` and `animation`:

```ts
				'garden-sway': {
					from: { backgroundPosition: '0 0' },
					to: { backgroundPosition: '-1536px 0' }
				}
```

```ts
				'garden-sway': 'garden-sway 1.8s steps(8) infinite'
```

> **Why:** A sheet is 8 frames of 192px when displayed, so 1536px wide. `steps(8)` jumps one whole frame at a time. Defining it in the config keeps the project rule of utility classes only.
> **Check:** `npx tsc --noEmit` passes.

---

### [x] STEP 5 — `PixelPlant` component

Create `apps/frontend/src/components/journey/PixelPlant.tsx`:

- Props: `levelKey: string` (for example `L3`), `level: GardenLevel`, `label: string`, `stage: PlantStage`.
- A `<button type="button">` of `h-48 w-48` with `data-testid={`plant-${levelKey.toLowerCase()}`}`, `data-stage={stage}`, `aria-label={`${label}, stage ${stage} of 3. Shake the plant`}` and a visible focus ring.
- Inside, an `aria-hidden` span with `bg-no-repeat bg-[length:1536px_192px] [image-rendering:pixelated] animate-garden-sway motion-reduce:animate-none` and the sheet as a background class. The 20 sheet classes must exist as full literal strings (a `Record` keyed by level and stage), because Tailwind only generates classes it can find whole.
- On click, unless `useReducedMotion()` is true, append `leafBurst(...)` to state. Render each leaf as a `motion.span` of `h-1.5 w-1.5` with its `colorClass`, animated from its start to the ground offset with a sideways drift and a fade at the end, removed from state in `onAnimationComplete`.
- No inline `style`.

> **Why:** The art carries the idle motion and code is used only for the reaction to touch. A button makes the plant reachable by keyboard. Leaves remove themselves, so repeated tapping cannot pile up elements.
> **Check:** `npm run lint` and `npx tsc --noEmit` pass.

---

### [x] STEP 6 — Render `PixelPlant` in the hero

In `apps/frontend/src/components/journey/LivingGardenHero.tsx`:

1. Import `PixelPlant` and `stageFromScore` (from `@/lib/journey/gardenSprite`).
2. Delete the `PLANT_STAGES` constant with its comment, the local `stageFromScore` function, and `const emoji = ...`.
3. Replace the emoji `<span data-testid=...>` (the one with the inline `fontSize: '88px'` style) with `<PixelPlant levelKey={currentKey} level={state.currentLevel} label={meta.label} stage={effectiveStage} />`, casting or narrowing `state.currentLevel` to `GardenLevel` safely (clamp to 1–5).
4. Update the comment above it to `Pixel plant — single, animated on stage change`.

Leave the surrounding `AnimatePresence` / `motion.div`, the peak-stage logic and `PEAK_KEY` untouched.

> **Why:** The hero keeps owning which stage to show and the grow-in transition; `PixelPlant` only draws. Removing the emoji span also removes the file's only inline `style`.
> **Check:** `npm run dev`, open `http://localhost:8080/journey`: a swaying pixel tree replaces the emoji and clicking it drops leaves, in both themes. If a browser tool is available, take a screenshot and look at it; if the stack cannot be started, say so in Execution Notes.

---

### [ ] STEP 7 — Repair the two stale hero specs

> **Not done:** the two specs are replaced exactly as written, but they were not run. Their check needs the full stack and sign-in, and no stack was running (the API on port 7208 was down, and port 8080, the Playwright base URL, is held by an unrelated Keycloak server on this machine). Run them as step E of the review checklist, then tick this step.

In `apps/frontend/e2e/journey.spec.ts`, replace the tests `Living Garden hero renders all 5 plants` and `Clicking plant L2 scrolls to tier card L2` with:

```ts
  test('Living Garden hero renders the current level plant as a sprite', async ({ page }) => {
    await page.goto('/journey');
    const plant = page.locator('[data-testid^="plant-l"]');
    await expect(plant).toHaveCount(1);
    const stage = await plant.getAttribute('data-stage');
    expect(['0', '1', '2', '3']).toContain(stage);
    await expect(plant.locator('span').first()).toHaveCSS('background-image', /garden\/l\d-stage-\d\.png/);
  });

  test('Clicking the L2 dot scrolls to tier card L2', async ({ page }) => {
    await page.goto('/journey');
    await page.locator('button[title^="L2"]').click();
    await page.waitForTimeout(700);
    await expect(page.locator('#tier-card-L2')).toBeInViewport();
  });
```

> **Why:** These two specs describe the original PF-114 hero, which drew five plants. The hero has shown only the current level's plant for a while, so both are already wrong on main; E2E is not in CI, which is why nobody noticed.
> **Check:** With the full stack running, `npx playwright test e2e/journey.spec.ts` passes these two tests. If the stack is not running, say so in Execution Notes instead of marking this done.

---

### [x] STEP 8 — Final verification and hand-over

```bash
npm run test:journey
npm run lint
npx tsc --noEmit
npm run build
```

Then regenerate the contact sheets one last time and save `contact-light.png` to `docs/features/assets/pf-155-garden-contact-sheet.png` so the owner can open the result without running anything.

> **Why:** The build and type checks are the CI gates for this area (CI-01). The saved contact sheet is the owner's review surface.
> **Check:** All four commands exit 0. The final report leads with the contact sheet path and the checklist result, then lists anything not verified (reduced motion, e2e, dark theme in the browser).

---

## Notes

- **Nothing here is taken from FeralUI.** Its Pixel Play demo has no published licence; it is a quality reference only. Do not download its JSON sprites.
- **pixel-plays is MIT** and is the source of the method (leaf spheres, five-step hue-shifted ramp, Bayer dither, whole-pixel sway). The generator is written fresh, so no notice is required; if any code is copied after all, keep its MIT notice in the script header.
- Display is always an integer multiple of the native size (96 → 192). Never scale a sprite by a fraction.
- The 25-point stage bands are display bands, not scoring thresholds, so FIN-02 does not apply. The palettes are display colours.
- ESLint here only covers `*.ts` and `*.tsx`, so the `.mjs` script is not linted.
- If the owner later wants hand-drawn or purchased art, a sheet of 8 frames at 96×96 (768×96, transparent) under the same file name replaces a generated one with no code change; update that sprite's entry in the manifest.
- Possible follow-ups, not in this plan: a grow animation between stages, wind strength tied to the activity streak, a per-pixel hit-mask.

## Execution Notes

Model: **the strongest available model** · Effort: **high**. The work is visual judgment in a loop, not transcription.
Before you start: create the GitHub issue and move this plan to `plans/in-progress/`.

```
/execute plans/in-progress/PF-155-pixel-garden-hero-sprites-todo.md
```

This plan runs in two sessions. The first ends at the STEP 2 gate with one pilot tree. The second starts at STEP 2B after the owner accepts it.

### Stop and ask if

- STEP 2 is finished and the owner has not yet accepted the pilot. This is a planned stop, not a failure.
- The Read tool cannot display the generated PNGs, so STEP 2 cannot be done by looking. Do not continue blind.
- The sprite is blurred or does not animate after STEP 6 and the cause is not a typo in a class name.

### Pilot log (STEP 2, run on 2026-11-10)

- **Result:** pilot image saved to `docs/features/assets/pf-155-pilot-cherry.png`. STEP 2 was ticked when the owner asked for the rest of the plan with no feedback on the tree; that is treated as acceptance.
- **Rounds run: 10** (the ceiling). Each round rendered `pilot.png`, opened it with Read, scored it, changed the generator. From round 7 an 8x `--zoom` view was also read to judge single pixels.
- **What each round fixed:** 1 baseline (pale flat cloud, spoke branches, trunk poking through grass); 2 wider light range, smaller leaves, blobs moved onto branch ends; 3 shading moved from blob to clump and leaf level, see-through gaps, rim only on continuous undersides; 4 lighter tone mix, fragment removal, back-layer blob; 5 more directional light, thin-feature removal, asymmetric tiers; 6 scalloped edges, detached leaves, darker bark, tufted grass; 7 diagnostics (lone-pixel count, zoom); 8 four-neighbour speckle filter and narrower dither (lone pixels 217 to 11, the 11 being fallen petals on the ground); 9 darker creases between clumps; 10 lighter tone balance (leaf tones 24/17/21/22/15 percent, shadow to high).
- **Final checklist on the pilot (single-tree items):** tones and clumps PASS; irregular silhouette with gaps and loose leaves PASS; trunk and branches partly hidden by leaves PASS; no speckle PASS. Stage and species items are not applicable until STEP 2B.
- **Gap against the owner's screenshot (found after round 10):** the target is finer-grained and more ragged (leaves about 1 to 2 px, many tiny holes with dark twig lines showing through, a near-black high-contrast trunk, and it is shown mid-gale so edges dissolve). The pilot is chunkier and cleaner, with a mid-brown trunk. Likely next changes if the owner wants closer: leaf radius 1.2 to 2.0 with smaller clumps, more and smaller holes, darker trunk with lighter highlight edge, a few thin dark twig lines inside the canopy. Finer grain trades against the "no speckle" rule, so that call is the owner's.
- **Generator state at the gate:** all modes existed (`--pilot`, `--zoom`, `--out`, `--preview`, default) and the other 19 sprites were placeholders. Superseded by the full run log below.


### Full run log (STEPs 2B to 8, run on 2026-11-10 and 11)

- **STEP 2B, 4 rounds, renderer untouched:** the accepted pilot stayed byte-identical throughout (hash 075b4003). Only species and stage data were added: L1 a low round dense bush-tree, L2 a tall heavy oak, L4 a broad flat umbrella of maple, L5 the largest spreading tree with a thick trunk; stage 1 is the full tree scaled to 0.62; stage 3 is stage 2 with the same canopy seed plus accent clusters (red berries, pale buds, deeper pink blossom, bright yellow leaves, gold lanterns), each drawn with a highlight, body and shade pixel. Round fixes: oak low branches run into foliage instead of ending as stumps; L1 made rounder so it differs from the umbrella; L4 pulled in from the frame edge; L5 lanterns moved from white-on-pale-gold (invisible) to gold-amber with a white highlight.
- **STEP 3:** `gardenSprite.ts` and 13 tests. Also added `toGardenLevel` (rounds and clamps to 1-5) for the hero, and a manifest sanity test that every canopy fits the 192px frame above the ground.
- **STEP 4:** the two `garden-sway` entries. `tailwind.config.ts` has CRLF line endings in the working tree, so it was patched byte-exact.
- **STEPs 5 and 6:** `PixelPlant.tsx` (20 literal sheet classes, button with focus ring, leaves capped at 24 in flight) and the hero edit. The hero no longer has any inline `style`.
- **STEP 7:** specs replaced as written but not run (see the note under the step).
- **STEP 8:** all four gates exit 0 (see the acceptance notes). Built CSS contains the `garden-sway` keyframes, all 20 sheet URLs, all 10 leaf colour classes and the reduced-motion rule. Final contact sheet: `docs/features/assets/pf-155-garden-contact-sheet.png`.
- **Browser check, in place of STEP 6's `/journey` check:** no stack was running, so a throwaway page rendering the real `PixelPlant` for all 20 sprites ran on a Vite server on port 8099 under headless Chromium (Playwright, already a dev dependency). 22 of 22 checks passed: 768x96 sheets drawn at exactly 1536x192, `image-rendering: pixelated`, stepped sway, tap and cap behaviour, Tab focus ring, Enter, reduced motion, and no console errors. The throwaway files were deleted afterwards.
- **Pre-existing, not mine:** port 8080 on this machine is held by a Keycloak server, so the Playwright base URL and `npm run dev` collide with it.

## ✅ Owner Review Checklist (G3)

> **State:** STEPs 1 to 6 and 8 are done and verified (lint, both tsc configs, 27 journey tests, build, and a 22-check browser run of the real component). STEP 7 is edited but not run. Nothing is committed. **Not verified:** the real `/journey` page (it needs sign-in and the API, and no stack was running) and the two e2e specs. **Known gap to confirm:** the art is chunkier and cleaner than your Pixel Play screenshot (see the pilot log).

### A. Before you start

- ☐ You are on branch `main`. For D and E you need the full stack and your owner sign-in. Note that port 8080 on this machine is held by a Keycloak server, so stop it first or the project dev server and the Playwright base URL will not be where the config expects.

### B. Read the code

- ☐ `apps/frontend/scripts/generate-garden-sprites.mjs`: species data is near the top (`SPECIES[3].stages[2]` is the accepted pilot, `FULL_TREES` holds the other four), the renderer is `buildScene` and `renderFrame`.
- ☐ `apps/frontend/src/components/journey/PixelPlant.tsx`: the 20 literal sheet classes, the button, the capped leaf state.
- ☐ `apps/frontend/src/components/journey/LivingGardenHero.tsx`: the diff removes the emoji, the local stage function and the inline `style`; the peak-stage logic is untouched.
- ☐ `apps/frontend/src/lib/journey/gardenSprite.ts` and `gardenSprite.test.ts`.

### C. Run the checks

- ☐ From `apps/frontend/`: `npm run test:journey`. Pass: 4 files, 27 tests.
- ☐ `npm run lint`. Pass: 0 errors (9 existing warnings in other files).
- ☐ `npx --no-install tsc --noEmit -p tsconfig.app.json` and `... -p tsconfig.node.json`. Pass: both exit 0.
- ☐ `npm run build`. Pass: exit 0.
- ☐ `node scripts/generate-garden-sprites.mjs --out <folder>`, then `diff -r <folder>/garden public/garden`. Pass: no output (the committed sheets match a fresh run).

### D. Start the stack and look

- ☐ Start it (`npm start`, or `npm run dev` plus the API), sign in, open `/journey`. Pass: a pixel tree replaces the emoji, it sways, tapping it drops a few leaves that vanish after landing.
- ☐ Switch the theme to dark and back. Pass: the tree is readable in both.
- ☐ Turn on "reduce motion" in the operating system and reload. Pass: one still frame, no leaves on tap.
- ☐ Tab to the plant. Pass: a focus ring appears and Enter shakes it.

### E. Checks that were only done in a harness

- ☐ `npx playwright test e2e/journey.spec.ts -g "sprite|L2 dot"`. Pass: 2 passed. Then tick STEP 7 in this plan.
- ☐ On the real page the stage follows the level score and never drops below the best stage reached (stored in `pf-journey-peak-stages`).

### F. Optional

- ☐ Judge `docs/features/assets/pf-155-garden-contact-sheet.png` against your screenshot. If you want it closer: smaller leaves and clumps, more small holes, a darker trunk, thin twig lines inside the canopy. Finer grain trades against the no-speckle rule.
- ☐ Do not commit `plans/backlog/PF-155-pixel-garden-hero-sprites-todo.png`: it is a screenshot of feralui.dev.

### G. Decide and close

- ☐ Accepted means D and E pass. Tell Claude "PF-155 accepted": it moves the plan to `plans/done/`, updates the board and issue #120. Say what to change instead if not. Nothing has been committed; use `/commit` when you are ready.
