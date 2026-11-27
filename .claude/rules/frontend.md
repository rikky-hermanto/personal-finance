---
description: Rules for frontend React/TypeScript development
paths: apps/frontend/**
---

# Frontend Development Rules (React 18 + TypeScript)

Commands run from `apps/frontend/` (not `src/`): `npm run dev` (port 8080), `npm run build`, `npm run lint`, `npm run preview`.

## Component Conventions

- Use functional components with arrow functions: `const MyComponent = () => { ... }`
- Use `@/` path alias for ALL imports (maps to `./src`)
- Business components → `src/components/`
- Route views → `src/pages/`
- NEVER manually edit files in `src/components/ui/` — managed by shadcn/ui CLI (`npx shadcn@latest add`)
- Use shadcn/ui components for all standard UI elements (Button, Dialog, Table, Card, etc.)
- Icons: always use `lucide-react`

## State & Data Fetching

- Use `@tanstack/react-query` (`useQuery` / `useMutation`) for all API data fetching and caching
- Use `react-hook-form` with Zod schemas for form validation
- Charts: Recharts. Routing: react-router-dom v6, routes in `App.tsx`
- Keep server state in React Query, local UI state in `useState`
- API client functions go in `src/api/` — use plain `fetch()`, NOT axios
- Follow existing patterns in `transactionsApi.ts` and `categoryRulesApi.ts`

## Styling

- Use Tailwind CSS utility classes exclusively — no CSS modules, no styled-components, no inline `style={}`
- Use `cn()` from `@/lib/utils` for conditional class merging
- Theme support via `next-themes` — use CSS variables for colors (defined in `index.css`)

## TypeScript

- Define shared interfaces/types in `src/types/`
- API response types go alongside fetch functions in `src/api/*.ts`
- Use strict typing — avoid `any` (flag as technical debt if unavoidable)
- Prefer `interface` over `type` for object shapes

## File Naming

- Components: PascalCase (`CashFlowDashboard.tsx`)
- Hooks: camelCase with `use-` prefix (`use-mobile.tsx`)
- Utilities/API clients: camelCase (`transactionsApi.ts`, `transactionParser.ts`)

## Testing

- **Unit:** Vitest runs pure logic under `src/lib/` in a node environment. Per-area scripts (`test:desk`, `test:macro`, `test:journey`, …) are for local iteration; CI runs `npm run test:coverage`, which picks up every `src/**/*.test.ts` file, so a new test needs no CI line. Put the test next to the code as `name.test.ts`.
- **Coverage:** `npm run coverage` from the repo root runs all three unit suites and updates [docs/records/coverage/](../../docs/records/coverage/README.md) (report plus `history.csv` trend). Commit both files when you want a point on the trend.
- **Component tests:** not set up. There is no repo-wide `test` script and no React Testing Library yet (PF-038).
- **E2E:** Playwright specs in `e2e/` are the main functional coverage: `npm run e2e`, `npm run e2e:ui`, or `npx playwright test e2e/health.spec.ts`. They need the full stack running and are not run in CI.
