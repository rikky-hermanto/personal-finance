# Codex finance domain rules

Apply to financial code, UI, specifications, and finance-facing documentation.

| Rule | Invariant |
|---|---|
| FIN-01 | Use decimal/Decimal for financial calculations; explicit decimal strings or integer minor units in TS. Preserve existing wire compatibility until deliberately migrated. |
| FIN-02 | Every financial threshold or rate has a source, units, scope, and rationale. Distinguish product methodology from law or an industry convention. |
| FIN-03 | Label TWR versus MWR/XIRR and compare like with like; never mix methods in a return series. |
| FIN-04 | Green means evaluated and clear. Missing data or unimplemented rules return unevaluated/unresolved, never pass. |
| FIN-05 | Ranking, recommendation, sizing, and projection features need contextual disclosures and a review of actual regulatory exposure. Disclaimers do not remove substantive obligations. |
| FIN-06 | Tax/regulatory values are time-sensitive. Check verification dates and primary sources before publishing rates; do not repeat historical change dates as current truth without checking. |

Read root `docs/reference/finance-domain/formulas.md`, `instruments-id.md`, and
`tax-id.md` as relevant. Product scoring methodology in `docs/ideas/scoring-rubric.md`
and actual gate implementations take precedence over generic assumptions. Locate
historical plans by filename rather than relying on a fixed active-plan location.

Use cio for financial substance/methodology, risk-officer for limits/sizing/gate
honesty, compliance for Indonesian exposure/tax/disclosures, and pm-brainstorm for
user value. These are complementary review lenses, not real professional credentials
or automatic permission to execute trades or publish financial advice.
