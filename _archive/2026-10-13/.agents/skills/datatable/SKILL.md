---
name: datatable
description: "Build or update Personal Finance's server-paginated, Excel-style filtered tables using the existing DataTable component and Zen financial data conventions."
---

# datatable

Read [shared Codex workflow conventions](../../WORKFLOWS.md) before using this skill.

Read frontend instructions, Zen UX, and the current
apps/frontend/src/components/DataTable.tsx plus a real caller. Its current types are
the API; do not duplicate an old props signature or invent a second table framework.

Preserve the layout contract: fixed toolbar, sticky header, flexing scrollable body
with incremental loading/sentinel as supported, and fixed footer/status area.
Use the existing height/container contract so headers and footers do not scroll away.

Parent/query code owns server pagination, sorting, and filters. Inspect current
onSortChange/filter/getValue/getDate and loading/hasMore callbacks before wiring.
Excel-style checklist values must represent the intended dataset, not silently only
the loaded page. Reset pagination when filters/sort change; guard duplicate loads
and preserve stable row identities/selection semantics.

Use compact monospace/tabular dates and amounts, right-aligned numbers, readable
descriptions with access to full text, quiet headers/dividers, and semantic income/
expense colors. Follow locale formatting; remove repeated Rp only if IDR is clearly
declared. Keep missing values distinct from zero. Zen uses sentence-case labels.

Test sort/filter/page interaction, empty/error/loading states, partial data, selection
and bulk actions, focus/keyboard/touch menus, sticky regions, and narrow viewport overflow.
Inspect real API behavior and report checks not run. Avoid assuming client filtering
of loaded rows is equivalent to server-wide filtering.
