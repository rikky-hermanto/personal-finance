---
name: data-oriented-theme
description: "Apply the base data-oriented visual system for explicit base-theme requests and standalone analytical interfaces. In Personal Finance, Zen UX takes precedence unless the user chooses this base style."
---

# data-oriented-theme

Read [shared Codex workflow conventions](../../WORKFLOWS.md) before using this skill.

Read frontend instructions for app work. The project's default remains
data-oriented-zenmode; use this base style when explicitly requested or for a suitable
standalone analytical artifact. In a Zen view, its warm palette, serif titles,
navigation, and component overrides win.

Make the primary table/form/chart the visual focus. Secondary filters and navigation
are quieter; advanced/export/bulk actions appear contextually without sacrificing
keyboard/touch access. Use neutral surfaces, functional color, generous readable rows,
and whitespace/dividers. Cards group discrete tasks/results, not every layout region.
Avoid decorative gradients and redundant panels.

Use an 8px spacing grid, 4px half-steps, restrained 8–10px card radii, thin borders,
and no decorative shadows. Sans-serif text, monospace/tabular numeric data, right-aligned
numeric columns, clear heading/body/caption hierarchy. Base section labels may be
small uppercase; Zen overrides them to sentence case.

Color communicates action/state consistently, with text/icons in addition to color.
Limit competing accents without suppressing meaningful multi-series chart distinctions.
Reuse existing theme tokens and dark mode, rather than installing a new global palette.
Base reference colors and component examples are in references/; use only relevant
sections and adapt standalone examples to typed React/Tailwind/shadcn conventions.

Review responsive density, contrast, focus, empty/loading/error/partial states, and
financial units. A clean interface must not omit information needed for decisions.

- [Color guidance](references/color-psychology.md): semantics and contrast.
- [Component examples](references/component-examples.md): layouts, KPI strips, and tables.
