# Show mandate presets when editing an existing mandate

Date: 2026-07-30
Status: Approved

## Problem

`MandatePresetPicker` (component: [MandatePresetPicker.tsx](../../../apps/frontend/src/components/desk/MandatePresetPicker.tsx)) only appears on first-run — when no mandate version exists yet (`!latest`). Once a mandate exists, clicking "Edit (creates new draft)" in [MandateTab.tsx](../../../apps/frontend/src/pages/desk/MandateTab.tsx) jumps straight to the raw 10-field parameter form via `startDraft()`. A user revising their mandate has no way to switch to a different risk tier (e.g. Learning → Growth) without manually re-typing every field — the preset cards are effectively invisible after the first draft is created.

## Design

Reuse the existing `MandatePresetPicker` component for both first-run and edit-existing-mandate flows, gated by a new `pickingPreset` state.

### `MandateTab.tsx`

- Add `const [pickingPreset, setPickingPreset] = useState(false);`
- Replace the `showPicker` condition:
  - Before: `!latest && !editing && presets.length > 0`
  - After: `presets.length > 0 && !editing && (pickingPreset || !latest)`
- The "Create mandate" / "Edit (creates new draft)" button handler becomes a new `openPicker()` function:
  - If `presets.length > 0` → `setPickingPreset(true)`
  - Else → call `startDraft()` directly (no presets to offer, preserve current behavior)
- `choosePreset()` and `startDraft()` both set `pickingPreset` to `false` on entry, so that canceling out of the subsequent edit form (`setEditing(false)`) returns to the version view, not back to the picker.
- Pass `onCancel={latest ? () => setPickingPreset(false) : undefined}` to `MandatePresetPicker` — no cancel affordance on first-run (nothing to fall back to).
- Pass `customLabel={latest ? 'Edit current version manually' : undefined}` — `startDraft()` pre-fills the form with the current version's values, not a blank form, so the first-run copy ("set every parameter myself") is misleading once a mandate already exists.

### `MandatePresetPicker.tsx`

- Add optional props: `onCancel?: () => void` and `customLabel?: string`.
- Render a "Cancel" ghost button next to the existing "Advanced" button, only when `onCancel` is provided.
- Use `customLabel ?? 'Advanced — set every parameter myself'` as the escape-hatch button text.

### Out of scope

- No backend or type changes — `useMandatePresets()` hook and `MandatePreset` type already exist and are already wired into `MandateTab`.
- No change to preset content, locking logic, or the parameter form itself.

## Testing

Manual verification in the browser (frontend-only, no new business logic to unit test):
1. No mandate yet → picker shows automatically (unchanged behavior).
2. Mandate exists → click "Edit (creates new draft)" → picker shows (new behavior) → selecting a preset opens the form pre-filled with that preset's values → "Cancel" returns to the version view without entering edit mode.
3. Mandate exists → click "Edit" → picker shows → "Edit current version manually" opens the form pre-filled with the current version's values (not the blank/default draft).
