# Adopt Zen-Mode Skill into Personal Finance Frontend

## Context

The `data-oriented-zenmode` skill prescribes a single-feature, distraction-free UX with a warm light canvas, recessed chrome, and editorial serif titles. The current app is the inverse: a dense dark "Toloshi" dashboard with a persistent left [Sidebar.tsx](apps/frontend/src/components/Sidebar.tsx) and right [ActivityPanel.tsx](apps/frontend/src/components/dashboard/ActivityPanel.tsx) competing for attention with the centered tabs.

Per discussion, we will **not** convert wholesale. Instead, we add **two independent, composable toggles**:

1. **Theme** — `dark` (default, current Toloshi) vs `light` (warm zen canvas `#F5F3EE`). Lives in Settings → Appearance.
2. **Focus mode** — a global toggle (`Cmd/Ctrl + .` + button) that recesses [Sidebar.tsx](apps/frontend/src/components/Sidebar.tsx) and [ActivityPanel.tsx](apps/frontend/src/components/dashboard/ActivityPanel.tsx) and lets the active route's primary content take the stage.

Composition: `dark + normal` (today), `dark + focus` (recessed dark), `light + normal` (warm "paper" feel), `light + focus` (full zen experience). The skill's spirit is preserved without forcing it on every screen.

## Approach

### Phase 1 — Theme system: dark + light

`next-themes ^0.3.0` is already in [package.json](apps/frontend/package.json) but not wired up. [index.css](apps/frontend/src/index.css) defines all tokens once under `:root` (dark) with no `.dark`/light variant.

**Changes:**

1. [apps/frontend/src/index.css](apps/frontend/src/index.css)
   - Move the existing dark Toloshi tokens from `:root` into `.dark` (next-themes adds the class to `<html>`).
   - Add a `:root` (light) variant using the zen palette converted to HSL:
     - `--background: 42 17% 94%` (`#F5F3EE`)
     - `--card: 0 0% 100%` (`#FFFFFF`)
     - `--popover/elevated: 36 17% 97%` (`#FAF9F7`)
     - `--foreground: 35 9% 19%` (`#37352F`)
     - `--muted-foreground: 0 0% 42%` (`#6B6B6B`)
     - `--border: 39 18% 88%` (`#E8E5DF`)
     - Keep `--success/income/expense/warning/info` shared between themes (skill says functional colors are unchanged).
     - Sidebar tokens map to `bg-background` (no separate dark stripe) for the light variant.
   - Add `--font-title: ui-serif, Georgia, ...` (editorial serif), apply to `h1` only when `[data-zen="true"]` or `.light` (TBD which selector reads cleanest).
   - Add zen utility classes scoped to `[data-focus="true"]`:
     - `.zen-canvas` — 80px grid texture via two linear-gradients at `0.018` opacity (skill spec).
     - `.zen-cta` — warm peach button (`#E8C5A8` bg / `#5C3D1E` text).

2. [apps/frontend/src/main.tsx](apps/frontend/src/main.tsx) — wrap `<App />` with `<ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>` from `next-themes`.

3. **New file** [apps/frontend/src/pages/settings/AppearanceTab.tsx](apps/frontend/src/pages/settings/AppearanceTab.tsx) — Theme radio (Dark / Light) + Focus mode switch (with the `Cmd+.` keyboard hint shown next to it). Use existing shadcn `RadioGroup` and `Switch` primitives.

4. [apps/frontend/src/pages/settings/SettingsLayout.tsx](apps/frontend/src/pages/settings/SettingsLayout.tsx) — add `{ value: 'appearance', label: 'Appearance', path: '/settings/appearance', disabled: false }` to `TABS`. Drop the hardcoded `text-white` on the `<h1>` (it breaks light mode) — use `text-foreground`.

5. [apps/frontend/src/App.tsx](apps/frontend/src/App.tsx) — register `/settings/appearance` route → `<AppearanceTab />`.

### Phase 2 — Focus mode

**New file** [apps/frontend/src/lib/focus-mode.ts](apps/frontend/src/lib/focus-mode.ts) — small Zustand store (Zustand is not yet installed; if we want to avoid the dep, use a plain React Context + `useReducer`. Recommendation: **React Context** to avoid a new dependency for one boolean) exposing `{ focused: boolean; toggle(): void }`. Persist to `localStorage` under key `pf:focus-mode`.

**New file** [apps/frontend/src/hooks/useFocusModeShortcut.ts](apps/frontend/src/hooks/useFocusModeShortcut.ts) — `useEffect` adding a `keydown` listener for `Cmd/Ctrl + .` that calls `toggle()`.

[apps/frontend/src/components/AppShell.tsx](apps/frontend/src/components/AppShell.tsx) — wrap output in `<FocusModeProvider>`, mount the shortcut hook, set `data-focus={focused}` on the root flex container, and add transition classes so the Sidebar/ActivityPanel can fade.

**Recession behavior** (when `data-focus="true"`):
- [Sidebar.tsx](apps/frontend/src/components/Sidebar.tsx) — `opacity-30 hover:opacity-100 transition-opacity duration-300`. Keep it visible per skill rule "Do not hide on hover" but deeply recessed.
- [ActivityPanel.tsx](apps/frontend/src/components/dashboard/ActivityPanel.tsx) — same recession pattern.
- Center `<main>` — widen by removing the right-rail's reserved space via flex; `border-white/[0.03]` border on the inner card softens further.
- In **light + focus**, the `<main>` background gets the `.zen-canvas` grid texture; `<h1>` uses the editorial serif via the `[data-zen]` selector set by AppShell when both light & focus are on.

**Toggle entry points:**
- `Cmd/Ctrl + .` shortcut.
- A small ghost icon button (`Maximize2` from lucide) pinned in the top-right of the `<main>` card so it's discoverable without cluttering chrome. No badge, no label — tooltip only.

### Phase 3 — Per-route zen polish (deferred / optional)

Once toggles work, two routes are natural fits to lean further into zen patterns regardless of mode:
- [UploadTab.tsx](apps/frontend/src/pages/cashflow/UploadTab.tsx) (4-step wizard) — already a focus flow; would benefit from a centered max-w-[800px] layout and the bottom action pill from the skill.
- [StatementTab.tsx](apps/frontend/src/pages/cashflow/StatementTab.tsx) drill-down — Template C "drill-down detail" from the skill.

**Not in this plan** — keep the doc tight. Open separate tickets if/when desired.

## Critical Files

| File | Change |
|---|---|
| [apps/frontend/src/index.css](apps/frontend/src/index.css) | Dark tokens → `.dark`; new light token set in `:root`; zen utility classes |
| [apps/frontend/src/main.tsx](apps/frontend/src/main.tsx) | Wrap with `<ThemeProvider>` |
| [apps/frontend/src/components/AppShell.tsx](apps/frontend/src/components/AppShell.tsx) | Focus provider + `data-focus` attr + shortcut + ghost toggle button |
| [apps/frontend/src/components/Sidebar.tsx](apps/frontend/src/components/Sidebar.tsx) | Recession classes when `[data-focus="true"]` |
| [apps/frontend/src/components/dashboard/ActivityPanel.tsx](apps/frontend/src/components/dashboard/ActivityPanel.tsx) | Same recession |
| [apps/frontend/src/pages/settings/SettingsLayout.tsx](apps/frontend/src/pages/settings/SettingsLayout.tsx) | Add Appearance tab; fix hardcoded `text-white` |
| [apps/frontend/src/pages/settings/AppearanceTab.tsx](apps/frontend/src/pages/settings/AppearanceTab.tsx) | **New** — theme + focus toggles |
| [apps/frontend/src/App.tsx](apps/frontend/src/App.tsx) | Register `/settings/appearance` |
| [apps/frontend/src/lib/focus-mode.ts](apps/frontend/src/lib/focus-mode.ts) | **New** — React Context store + localStorage |
| [apps/frontend/src/hooks/useFocusModeShortcut.ts](apps/frontend/src/hooks/useFocusModeShortcut.ts) | **New** — `Cmd/Ctrl + .` listener |

## Things to Reuse

- `next-themes ^0.3.0` — already in `package.json`, just not wired.
- shadcn `RadioGroup`, `Switch`, `Tabs` — for the Appearance tab.
- shadcn `Tooltip` — for the focus-toggle ghost button.
- `cn()` from `@/lib/utils` — for conditional class merging.
- Existing CSS variable system in [tailwind.config.ts](apps/frontend/tailwind.config.ts) — no Tailwind config changes needed; we only swap what `:root` resolves to.

## Trade-offs and Risks

- **Hardcoded colors will break in light mode.** [SettingsLayout.tsx](apps/frontend/src/pages/settings/SettingsLayout.tsx) uses `text-white` directly, and likely other components do too. Phase 1 needs a quick `grep` sweep for `text-white`, `bg-white/`, `border-white/` usage and a remediation pass to swap to semantic tokens (`text-foreground`, etc.). This is the biggest risk to a clean light-mode launch.
- **Charts via Recharts** read CSS variables at render time. The Cash Flow chart in [OverviewTab.tsx](apps/frontend/src/pages/cashflow/OverviewTab.tsx) should adapt automatically as long as it uses `hsl(var(--chart-N))` references — verify in browser.
- **No Zustand dep added** — using React Context for focus mode keeps install footprint flat.
- **PF-052 (TS strict mode) is unrelated.** Don't bundle it in.

## Verification

1. `cd apps/frontend && npm run dev` — open http://localhost:8080.
2. **Theme switch:** navigate to `/settings/appearance`, toggle Dark ↔ Light. Inspect `<html class>` flips between `dark` and `(none)`. Walk through `/dashboard`, `/cashflow/overview`, `/cashflow/transactions`, `/cashflow/upload`, `/settings/categories` in both themes — look for hardcoded color leaks.
3. **Focus mode:** press `Cmd/Ctrl + .` from any page. Sidebar + ActivityPanel fade to `opacity-30`; hover restores to full opacity. Press again to exit. Verify the toggle button in `<main>` mirrors the shortcut.
4. **Composition:** Light + Focus on `/cashflow/overview` should show the warm canvas with grid texture, editorial serif "Cashflow" title, and recessed side rails.
5. **Persistence:** reload the page — theme + focus state restored from `localStorage`.
6. **MCP Playwright** screenshots of all four states (`dark/normal`, `dark/focus`, `light/normal`, `light/focus`) on the Overview page for visual diff record.
7. `npm run lint` and `npm run build` clean.
