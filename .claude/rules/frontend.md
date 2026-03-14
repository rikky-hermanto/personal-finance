---
description: Rules for frontend React/TypeScript development
globs: apps/frontend/**
---

# Frontend Development Rules (React 18 + TypeScript)

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

## Testing (when adding)

- Place tests alongside components as `ComponentName.test.tsx`
- Use Vitest + React Testing Library (not yet configured — add as needed)
- Test user interactions and rendered output, not implementation details
