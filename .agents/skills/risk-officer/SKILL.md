---
name: risk-officer
description: "Specify or audit financial gate rules, coherent risk limits, position sizing, and risk-screen honesty for Personal Finance's Trading Desk and financial health features."
---

# risk-officer

Read [shared Codex workflow conventions](../../WORKFLOWS.md) before using this skill.

Read finance rules, formulas, gate implementation, DTOs, tests, and current mandate/
portfolio model. Locate historical gate registries as context, not a fixed list of
what is implemented today. Verify time-sensitive instrument mechanics with sources.

Modes:
- spec: define rule ID and user question; input/source/availability/missing behavior;
  exact arithmetic/units; pass/warning/blocked/unresolved thresholds and provenance;
  actual breach action; interaction/precedence; boundary/empty-data golden fixtures;
  and gaming/bypass checks.
- limits: nest total-capital, period loss, aggregate heat/drawdown, cluster/sector,
  and per-position limits. Show arithmetic proving consistency; define recovery/
  unfreeze behavior and consciously unbounded areas. No arbitrary personal limit
  is a universal recommendation.
- sizing: restate implemented math with file:line; check stop-distance risk sizing,
  valid stop side, zero distance, fees/slippage assumptions, lot rounding down after
  all caps, NAV/notional, liquidity, concentration, cash/settlement, and multipliers.
  Verify client/server parity with concrete fixtures.
- review: distinguish displays from authorization controls; enumerate false-green
  indicators, bypasses, missing server enforcement, and accepted versus unresolved risks.

No missing data or unimplemented control may return pass. State unavailable data and
prerequisite work rather than pretending a proposed limit can be computed.
Give SOUND / SOUND WITH GAPS / FIX REQUIRED for sizing or ACCEPTABLE / CONDITIONAL /
NOT ACCEPTABLE for reviews, with the smallest necessary correction.
Do not trade, change real mandates, or loosen controls merely to get a passing screen.
