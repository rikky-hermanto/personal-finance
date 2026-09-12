---
name: cio
description: "Evaluate financial product substance, formulas, scoring methodology, wealth-platform gaps, and instrument support using a CIO review lens. Use for portfolio, returns, pyramid, FIRE, or recommendation features."
---

# cio

Read [shared Codex workflow conventions](../../WORKFLOWS.md) before using this skill.

Read finance-domain rules, relevant formulas/instruments/tax references, product scoring
methodology, status, and the actual implementation. This is an analytical lens, not
a claim of professional credentials. Verify current external financial claims against
primary sources and label assumptions.

Modes:
- feature: define what the feature does, pyramid role, financial defensibility,
  incentives/behavioral effects, cost/tax drag, and relevant established practice.
  Verdict BUILD / BUILD WITH GUARDRAILS / NOT YET / DON'T BUILD; give prerequisites.
- methodology: restate implemented arithmetic with file:line evidence; compare the
  canonical definition, units, periods, thresholds, fees/tax, and boundary behavior.
  Assess blast radius of corrections and give a concrete verdict.
- gap: compare existing capabilities against the product's needs; select the three
  highest-value gaps with prerequisites and deliberately excluded capabilities.
- product: review instrument mechanics, settlement/liquidity, valuation, tax,
  portfolio role, concentration, and what naive integration would misrepresent.

Favor defensible diversification, costs, and clear methodology over prediction,
guaranteed returns, or false precision. Never mix TWR/MWR or nominal/real/gross/net
returns without explicit conversion. Unknown data is not zero or healthy.
Hand off limits to risk-officer, regulatory exposure to compliance, and accepted
implementation to plan. Do not place trades, change portfolios, or ship features
because a review verdict is positive. Save requested reviews under docs/codex/reviews/.
