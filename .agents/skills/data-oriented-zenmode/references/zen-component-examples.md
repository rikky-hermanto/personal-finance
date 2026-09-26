# Zen component patterns

Use existing React/Tailwind/shadcn primitives for application work. These patterns
adapt the original Zen guidance without its hover-only navigation or inline-style
demo dependencies.

## Centered stage

For a single-action input or creation view, center a short content group. For a
long form, use a top-aligned container instead. Retain the existing application shell.

```tsx
<main className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center px-4 py-12 sm:px-6">
  <header className="mb-8 text-center">
    <h1 className="font-[var(--font-title)] text-2xl font-semibold tracking-tight">
      Import transactions
    </h1>
    <p className="mt-2 text-sm text-muted-foreground">
      Choose a statement to review before importing.
    </p>
  </header>
  {/* Existing accessible upload form: visible label, one primary action,
      validation and progress near the input. */}
  {/* Relevant recent imports below, with quieter text and dividers. */}
</main>
```

Do not hide required form labels or replace validation messages with color alone.

## Focused workspace

Use a responsive wide container for a table/editor/analysis screen. Above it, keep
the title, persistent muted navigation, and contextual filters. A single warm CTA
may identify the main action; settings and less frequent actions live in menus.
Use a white/theme-card surface only where it meaningfully groups the work.

For financial tables:

- Headers have no contrasting fill; use weight and a bottom border.
- Transaction rows have faint separators and `hover:bg-accent/40` where supported.
- Numeric cells use `text-right font-mono text-xs tabular-nums`.
- Put units in headers, such as `Amount (IDR)`, before removing repeated symbols.
- Format values through existing financial helpers; do not introduce numeric
  conversions merely to satisfy a display example.
- Keep sorting controls labeled, selection accessible, and empty/error states explicit.

## Drill-down detail

Keep a visible back button/link, editorial title, subdued status/metadata, and a
centered 800–1024px container. Group fields with whitespace and dividers. Keep edit
actions discoverable; use a contextual bar only if it improves the active workflow.

## Contextual bottom actions

Show a pill when there are selected rows or unsaved changes, not on every page.
Use up to three actions; place additional actions in an accessible overflow menu.
Reserve bottom padding and account for `env(safe-area-inset-bottom)` on mobile.
Unmount or use proper hidden semantics when irrelevant, rather than leaving invisible
focusable buttons. Preserve focus when saving or dismissing the bar.

## Navigation and command palette

The standard application shell retains muted but visible navigation. A Cmd/Ctrl+K
palette is an optional shortcut, not the only route to essential features. Use the
existing accessible dialog/command primitives, including focus trapping/restoration,
Escape, outside-click dismissal, arrow navigation, and labeled input.

## UI review scenarios

- A cashflow table keeps units and debit/credit meaning clear in light and dark mode.
- An upload form remains usable on mobile with validation, progress, and keyboard focus.
- A selected-row action bar does not cover the last row or the focused control.
- An existing navigation shell stays usable without hover, including touch devices.
