# Buckets — prototype bundle

Open `Buckets Budgeting.html` in a browser (needs internet for React/Tailwind/Lucide CDNs).

| File | What it is |
|---|---|
| `Buckets Budgeting.html` | English v2 — the reference prototype. Six states + variable-income runway. |
| `pf-buckets-data.js` | Fixtures + money formatters. Median derivation inputs, commitment line items, per-state fixtures. |
| `pf-buckets.jsx` | `BucketsCard` (all six states), `BkCommittedSheet`, `BkStrip`, `BkWaterfall`. |
| `pf-buckets-app.jsx` | Shell: state switcher, rationale rail, tweaks wiring. Not part of the feature. |
| `buckets-build-plan.md` | The implementation plan — read this first. |
| `Kantong Budgeting.html` + `pf-kantong*` | Indonesian v1. Reference for tone only; naming is superseded by Buckets. |
| `pf-icons.jsx`, `tweaks-panel.jsx` | Prototype-only support files. Do not port. |

**States** are switchable from the segmented control at the top; "Variable income" swaps the daily
hero for runway. The rationale rail on the right explains each state and can be hidden.

Copy, thresholds and number formatting in `pf-buckets.jsx` are the spec. The shell, the rail and the
tweaks panel are review scaffolding — ignore them when porting.
