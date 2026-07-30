# PF-137 — Show mandate presets when editing an existing mandate

> **GitHub Issue:** _(none — local plan tracking)_
> **Status:** Done
> **Started:** 2026-07-30
> **Planned from branch:** main
> **Source spec:** [docs/superpowers/specs/2026-07-30-mandate-edit-presets-design.md](docs/superpowers/specs/2026-07-30-mandate-edit-presets-design.md)

## Objective

`MandatePresetPicker` ([MandatePresetPicker.tsx](apps/frontend/src/components/desk/MandatePresetPicker.tsx), shipped in PF-136) currently only appears on first-run — when no mandate version exists yet. Once a mandate exists, clicking "Edit (creates new draft)" in [MandateTab.tsx](apps/frontend/src/pages/desk/MandateTab.tsx) jumps straight to the raw 10-field parameter form. A user revising their mandate has no way to switch risk tier (e.g. Learning → Growth) without manually re-typing every field.

This ticket makes the picker appear whenever a new draft is started — both first-run and when revising an existing mandate — while preserving the existing "advanced" escape hatch to the raw form.

## Acceptance Criteria

- [x] No mandate yet → picker shows automatically (unchanged first-run behavior)
  > Verified by code trace: `showPicker = presets.length > 0 && !editing && (pickingPreset || !latest)` — with `latest === null`, `!latest` is `true` regardless of `pickingPreset`, so this reduces to the original condition.
- [x] Mandate exists → clicking "Edit (creates new draft)" shows the preset picker (new behavior) instead of jumping straight to the form
  > Verified by code trace: button now calls `openPicker()`, which sets `pickingPreset = true` when `presets.length > 0`; `showPicker` then evaluates true via the `pickingPreset` branch.
- [x] From that picker, selecting a preset opens the draft form pre-filled with the preset's values
  > Verified by code trace: `choosePreset(params, key)` sets `draft = params` and `editing = true`; `showPicker` becomes false (`!editing` is false), so the form renders with `draft` as its field values.
- [x] From that picker, a "Cancel" button (only present when a mandate already exists) returns to the version view without entering edit mode
  > Verified by code trace: `onCancel={latest ? () => setPickingPreset(false) : undefined}` — only passed (and thus only rendered, per `MandatePresetPicker`'s `{onCancel && (...)}` guard) when `latest` exists; clicking it sets `pickingPreset = false` without touching `editing`, so `showPicker` becomes false and the normal version view renders.
- [x] From that picker, the escape-hatch button reads "Edit current version manually" (not "set every parameter myself") when a mandate already exists, and opens the form pre-filled with the current version's values
  > Verified by code trace: `customLabel={latest ? 'Edit current version manually' : undefined}`, rendered as `{customLabel ?? 'Advanced — set every parameter myself'}`. Its `onClick` is `startDraft`, which sets `draft = latest.params` when `latest` exists.
- [x] On first-run, no "Cancel" button renders (nothing to cancel back to) and the escape-hatch button keeps its original label "Advanced — set every parameter myself"
  > Verified by code trace: with `latest === null`, both `onCancel` and `customLabel` are `undefined`, falling through to `MandatePresetPicker`'s no-render guard and default label string respectively.
- [x] `npm run lint` and `npm run build` pass with no new errors
  > `npm run lint`: 28 pre-existing problems (20 errors / 8 warnings) across unrelated files, unchanged from the PF-133 baseline — zero hits in `MandateTab.tsx` or `MandatePresetPicker.tsx` (confirmed via `npm run lint | grep -i "MandateTab\|MandatePresetPicker"`, no output). `npm run build`: exit 0, `✓ built in 32.31s`.

> **Verification caveat:** no browser-automation tool was available in this session to click through the running app (`localhost:8080`), so acceptance criteria above were verified by static code trace against the actual edited source plus a live API check (`GET /api/desk/mandate/presets` on the running local stack returned real preset data, and `GET /api/desk/state` confirmed a seeded draft mandate exists to exercise the "mandate exists" path against) rather than an interactive walkthrough. This is a state-machine change with no new business logic — every branch of the `showPicker` boolean and both handler functions were traced by hand against the five scenarios in STEP 3. Flagging this explicitly rather than presenting it as a visually-confirmed pass.

## Approach

Reuse the existing `MandatePresetPicker` component for both flows via one new piece of state in `MandateTab.tsx`: `pickingPreset`. The "Create mandate" / "Edit" button no longer starts the draft directly — it opens the picker (when presets exist) or falls straight to the draft form (when they don't, preserving current behavior for that edge case). Two new optional props on `MandatePresetPicker` (`onCancel`, `customLabel`) let the caller adapt copy and add a cancel path only when there's an existing version to fall back to. No backend, type, or hook changes — `useMandatePresets()` and `MandatePreset` already exist and are already wired into `MandateTab`.

## Affected Files

| File | Change |
|------|--------|
| `apps/frontend/src/components/desk/MandatePresetPicker.tsx` | Edit — add optional `onCancel` and `customLabel` props |
| `apps/frontend/src/pages/desk/MandateTab.tsx` | Edit — add `pickingPreset` state, rework `showPicker` condition and the edit-entry button handler |

---

### [x] STEP 1 — Add `onCancel` and `customLabel` props to `MandatePresetPicker`

Edit [MandatePresetPicker.tsx](apps/frontend/src/components/desk/MandatePresetPicker.tsx).

Extend the `Props` interface:

```tsx
interface Props {
  presets: MandatePreset[];
  onSelect: (params: MandateParams, presetKey: string) => void;
  onCustom: () => void;
  onCancel?: () => void;
  customLabel?: string;
}
```

Update the component signature and the bottom button row. Replace:

```tsx
const MandatePresetPicker = ({ presets, onSelect, onCustom }: Props) => (
```

with:

```tsx
const MandatePresetPicker = ({ presets, onSelect, onCustom, onCancel, customLabel }: Props) => (
```

Replace the final button block:

```tsx
    <Button size="sm" variant="ghost" onClick={onCustom} className="text-xs">
      Advanced — set every parameter myself
    </Button>
  </div>
);
```

with:

```tsx
    <div className="flex gap-2">
      <Button size="sm" variant="ghost" onClick={onCustom} className="text-xs">
        {customLabel ?? 'Advanced — set every parameter myself'}
      </Button>
      {onCancel && (
        <Button size="sm" variant="ghost" onClick={onCancel} className="text-xs">
          Cancel
        </Button>
      )}
    </div>
  </div>
);
```

> **Why:** `onCancel` is optional because first-run has nothing to cancel back to — there is no prior version to return to, so the button must not render there. `customLabel` exists because `onCustom` (wired to `startDraft()` in STEP 2) pre-fills the form with the *current* version's values once a mandate exists, not a blank form — the default copy "set every parameter myself" implies starting from scratch, which would be misleading in that case.

---

### [x] STEP 2 — Wire `pickingPreset` state into `MandateTab`

Edit [MandateTab.tsx](apps/frontend/src/pages/desk/MandateTab.tsx).

Add new state alongside the existing ones (after the `presetKey` line):

```tsx
  const [pickingPreset, setPickingPreset] = useState(false);
```

Replace the `showPicker` line:

```tsx
  // No mandate yet and the user has not opted into the raw form → show the preset picker.
  const showPicker = !latest && !editing && presets.length > 0;
```

with:

```tsx
  // Shown on first-run automatically, or after the user clicks "Edit" while presets exist.
  const showPicker = presets.length > 0 && !editing && (pickingPreset || !latest);
```

Replace the `startDraft` and `choosePreset` functions — both now reset `pickingPreset` so canceling a later-opened form returns to the version view, not back to the picker:

```tsx
  const startDraft = () => {
    setDraft(latest?.params ?? draft);
    setPresetKey(latest?.preset ?? null);
    setPickingPreset(false);
    setEditing(true);
  };

  const choosePreset = (params: MandateParams, key: string) => {
    setDraft(params);
    setPresetKey(key);
    setChangeReason(`Started from the ${params.preset} preset.`);
    setPickingPreset(false);
    setEditing(true);
  };
```

Add a new handler right after `choosePreset`, for the "Create mandate" / "Edit" button:

```tsx
  const openPicker = () => {
    if (presets.length > 0) {
      setPickingPreset(true);
    } else {
      startDraft();
    }
  };
```

Update the button's `onClick` — replace:

```tsx
        {!editing && (
          <Button size="sm" variant="outline" onClick={startDraft}>
            {latest ? 'Edit (creates new draft)' : 'Create mandate'}
          </Button>
        )}
```

with:

```tsx
        {!editing && (
          <Button size="sm" variant="outline" onClick={openPicker}>
            {latest ? 'Edit (creates new draft)' : 'Create mandate'}
          </Button>
        )}
```

Finally, pass the two new props where `MandatePresetPicker` is rendered — replace:

```tsx
      {showPicker ? (
        <MandatePresetPicker
          presets={presets}
          onSelect={choosePreset}
          onCustom={startDraft}
        />
      ) : (
```

with:

```tsx
      {showPicker ? (
        <MandatePresetPicker
          presets={presets}
          onSelect={choosePreset}
          onCustom={startDraft}
          onCancel={latest ? () => setPickingPreset(false) : undefined}
          customLabel={latest ? 'Edit current version manually' : undefined}
        />
      ) : (
```

> **Why:** `openPicker` falls back to `startDraft()` directly when there are no presets at all — this preserves current behavior for that edge case (e.g. presets still loading or the endpoint returns empty) instead of showing an empty picker screen. `onCancel`/`customLabel` are only passed when `latest` exists, matching STEP 1's optionality — first-run keeps its original copy and has no cancel path.

---

### [x] STEP 3 — Verify in the browser

Start the frontend dev server (`cd apps/frontend && npm run dev`) against a desk state that already has an approved or draft mandate version (the seeded desk demo data from PF-133 has one). Navigate to `/desk` → Mandate tab and check:

1. With a mandate already present, click "Edit (creates new draft)" → the preset picker renders (not the raw form).
2. Click a preset's "Use {name}" button → the raw form opens, pre-filled with that preset's values, and the change-reason textarea is pre-filled with `Started from the {preset} preset.`
3. Click "Edit (creates new draft)" again, then click "Cancel" → returns to the version view (not the picker, not the form).
4. Click "Edit (creates new draft)" again, then click "Edit current version manually" → the raw form opens pre-filled with the *current* version's values (not a preset's).
5. If reachable in this environment, clear all mandate versions (or use a fresh desk state) to confirm first-run still shows the picker automatically with no "Cancel" button and the original "Advanced — set every parameter myself" label.

> **Why:** This is a pure frontend state-wiring change with no new business logic — a unit test would only re-assert the JSX structure. Manual verification against the running app catches the one thing tests can't: whether the picker/form/cancel transitions actually feel right in sequence, which was the entire point of the change.

> **Execution note:** no browser-automation/screenshot tool was available in this session. Substituted a hand-trace of all five scenarios against the actual edited source (see the Acceptance Criteria verification notes above) plus a live API check confirming `/api/desk/mandate/presets` and `/api/desk/state` return real data against the running local stack. All five scenarios check out logically; none was visually confirmed in a browser. Recommend a quick manual click-through next time the app is open in a browser session.

---

### [x] STEP 4 — Lint and build

Run:

```bash
cd apps/frontend && npm run lint && npm run build
```

Expected: both exit 0, with no new errors attributable to `MandatePresetPicker.tsx` or `MandateTab.tsx`.

> **Why:** `tsc`/ESLint will catch prop-type mismatches (e.g. `onCancel`/`customLabel` used but not destructured) that a manual browser pass could miss if that exact path isn't clicked.

> Ran clean: `npm run lint` shows the same 28 pre-existing problems as the PF-133 baseline, none in the two touched files; `npm run build` succeeded (`✓ built in 32.31s`).

---

## Notes

- No backend, type (`desk.ts`), or hook changes — `useMandatePresets()` and `MandatePreset` already exist and are already wired into `MandateTab` from PF-136.
- No new tests added — this codebase has no frontend test harness yet (PF-038, still open); verification is manual (STEP 3) plus lint/build (STEP 4), consistent with how PF-133's frontend-only pieces were verified.
- Cross-file wiring check: `grep -rn "MandatePresetPicker" apps/frontend/src` returns exactly two hits — the component definition and its one consumer (`MandateTab.tsx`). No orphaned references.
- **Follow-up recommended:** do a real browser click-through of the 5 scenarios in STEP 3 next time the dev server is open interactively — this execution verified the logic by trace + API check only, not visually.
