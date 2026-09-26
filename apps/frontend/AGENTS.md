# Codex frontend instructions

Applies to `apps/frontend/`, including configuration and `src/`; also follow the root `AGENTS.md`.

Read `../../.agents/rules/frontend.md` for implementation and reviews. For paginated/filterable data tables, also read `../../.agents/skills/datatable/SKILL.md`.

## Implementation

- React 18 functional components, TypeScript, Vite. Use `@/` for source imports (maps to `src/`), and package names for dependency imports.
- Use existing shadcn/ui primitives. Do not manually edit `src/components/ui/`; add managed components through the established shadcn CLI workflow when needed.
- API clients belong in `src/api/` and use plain `fetch`. React Query owns server state; local component state owns local interactions.
- Follow existing react-hook-form/Zod form patterns, lucide-react icons, Recharts charts, and React Router routing.
- Use Tailwind utilities and `cn()` from `@/lib/utils`. Reuse existing theme variables in `src/index.css` and theme configuration rather than hardcoding a new palette.
- Keep shared types in `src/types/`; avoid `any` and verify actual API response shapes.

## Visual essentials

- For frontend UI/UX creation, changes, and reviews, read and apply `../../.agents/skills/data-oriented-zenmode/SKILL.md` as the project's core design guidance unless the user requests another style. It is self-contained and does not depend on Claude configuration.
- Preserve the existing light/dark and Zen theme behavior and surrounding component patterns.
- Make the primary page task visually dominant. Keep secondary controls restrained and reveal advanced actions contextually without losing keyboard accessibility.
- Favor readable data layouts, whitespace and dividers over decorative panels. Cards should group meaningful discrete items.
- Use color for semantic state, with textual/icon cues as well. Align numeric columns and use tabular/monospace numerals where appropriate.
- Preserve loading, empty, error, and unevaluated states. Do not render missing financial data as zero or a successful check.
- Check responsive layouts and accessible names/focus behavior when changing interactions.

## Validation

Run from `apps/frontend/`:

```powershell
npm run lint
npm run build
npm run test:desk
npm run test:macro
# Targeted browser test:
npm run e2e -- e2e/health.spec.ts
```

Run the relevant Vitest suite for desk or macro changes; these suites already exist in `package.json`. For other areas, inspect nearby tests and choose behavior-focused coverage.

Playwright configuration is `playwright.config.ts`; specs live in `e2e/`. It starts/reuses the frontend at port 8080. Backend-dependent specs require their supporting services. Use `npm run e2e` for the full browser suite when the scope and environment justify it.
