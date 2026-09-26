---
name: compliance
description: "Review Indonesian regulatory exposure, tax accuracy, advice boundaries, disclosures, and financial data handling for a proposed product feature. Does not certify legal compliance."
---

# compliance

Read [shared Codex workflow conventions](../../WORKFLOWS.md) before using this skill.

Read finance-domain rules, affected code/UI, instrument/tax reference verification
dates, and actual feature data flows. Use current primary regulatory/tax sources
for substantive claims; distinguish law, interpretation, and unresolved exposure.
Do not infer that a disclaimer makes regulated activity permissible.

Modes:
- gate: inventory what the user sees and can do; regulatory exposure; tax/rate
  accuracy; required disclosures; data/privacy and provider transfers; verdict with
  concrete launch conditions or unresolved questions.
- advice-line: place the feature along education/calculation/personalized
  recommendation/execution; identify personalization, rankings, actionability, and
  compensation. Propose the smallest redesign preserving useful functionality.
- tax: compare gross/net, tax on proceeds versus gains, final/progressive treatment,
  instrument/date/residency conditions, and every displayed rate with verified sources.
  Explain computational and user-decision effects.
- disclosure: draft concise contextual copy, placement, timing, and limitations;
  avoid vague boilerplate or claims of immunity.

Give evidence, severity, owner/prerequisite, and a bounded verdict. Say when qualified
legal review is needed for unresolved jurisdiction-specific interpretation. Do not
claim to be licensed counsel or grant approval on behalf of a regulator.
Save requested output under docs/codex/reviews/ or the user's non-Claude target.
A review does not authorize publishing, remote data transfer, or modifying accounts.
