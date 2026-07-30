# Finance Domain Rules

> This file is loaded into every session. It holds only the invariants that must never be
> forgotten. The bulky material — formula library, instrument conventions, tax tables — lives in
> [docs/reference/finance-domain/](../../docs/reference/finance-domain/) and is read on demand.
>
> Last updated: 2026-07-30

This is a finance product. A wrong number here is not a rendering bug — it is a user making a
real money decision on bad information. The six rules below exist because each one has a silent
failure mode: no compiler error, no exception, just wrong output that looks plausible.

## Rules

| Rule | Constraint |
|------|-----------|
| **FIN-01** | Money and rates are `decimal` (C#) / `Decimal` (Python) / integer minor units or string (TS). Never `float`/`double`/JS `number` for an amount that will be summed, compared, or displayed. |
| **FIN-02** | No magic thresholds. Any financial constant in code (a ratio, a limit, a band, a rate) cites its source — either a line in [formulas.md](../../docs/reference/finance-domain/formulas.md) / [tax-id.md](../../docs/reference/finance-domain/tax-id.md), or an inline `// Source:` comment naming the framework or regulation. A threshold nobody can trace cannot be defended or updated. |
| **FIN-03** | Return figures state their method. Time-weighted (TWR) and money-weighted (MWR/XIRR) answer different questions and disagree, often by a lot. Label which one is shown, never average or mix them in one series, and never compare a TWR portfolio number against an MWR benchmark. |
| **FIN-04** | On any risk or health screen, green means *checked and clear*. A rule that is not wired up renders as explicitly unevaluated (neutral, "not evaluated"), never as a pass. This is why PF-133 ships seven gate rules as `unresolved / notImplemented` instead of hardcoded `pass`. |
| **FIN-05** | Computed output is a tool, not licensed advice. Anything that ranks, recommends, sizes, or projects carries its disclosure, and Indonesian regulatory exposure is checked with `/compliance` before it ships. See [FIN-06] for what triggers this. |
| **FIN-06** | Tax and regulatory numbers are perishable. Never quote a rate to the user — in UI copy, docs, or analysis — without checking the `Verified` date in [tax-id.md](../../docs/reference/finance-domain/tax-id.md). Rows marked ⚠ must be re-verified against a primary source (pajak.go.id, ojk.go.id, idx.co.id) before use. Indonesian crypto tax changed on 2026-01-01; assume anything older than a year is stale. |

## Which skill owns which question

Domain judgment does not belong in the same head as implementation judgment. Route explicitly:

| Question | Skill |
|----------|-------|
| Is this feature financially sound and worth having in a wealth product? Is this formula/rubric correct? | `/cio` |
| What are the limits, and what is the sizing math? Is this risk screen honest? | `/risk-officer` |
| Are we allowed to ship this in Indonesia, and what does it cost the user in tax? | `/compliance` |
| Do users want it, and do competitors have it? | `/pm-brainstorm` |
| Where does the code live and how is it structured? | `/consult` · `/arch-review` |

`/pm-brainstorm` can pass a feature and `/cio` still reject it — users often want things a
professional could not defend (price prediction, guaranteed returns, market timing signals).
Both verdicts are legitimate; the product needs both to agree before building.

## Reference material (read on demand)

| Doc | Contents |
|-----|----------|
| [formulas.md](../../docs/reference/finance-domain/formulas.md) | Canonical formulas — health ratios, journey scoring breakpoints, returns, risk, sizing, allocation, FIRE math |
| [instruments-id.md](../../docs/reference/finance-domain/instruments-id.md) | Indonesian instrument mechanics — IDX lots/settlement, SBN/ORI/SR/ST, mutual fund cut-offs, crypto, P2P, deposits, FX |
| [tax-id.md](../../docs/reference/finance-domain/tax-id.md) | Tax treatment per instrument, with regulation citation and verification date |

Where the product's own methodology is defined, that document is the source of truth and the
reference files defer to it: [docs/ideas/scoring-rubric.md](../../docs/ideas/scoring-rubric.md)
(pyramid indicators, adopted from the Financial Health Network framework) and the Gate Rule
Registry in [PF-133](../plans/PF-133-trading-desk-foundation-todo.md) (Trading Desk risk rules).
