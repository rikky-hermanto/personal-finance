# PersonalFinance Frontend — Claude Code Context

React 18 + Vite + TypeScript SPA.

## Quick Commands (run from project root, NOT from `src/`)

```
npm run dev      # Dev server on port 8080
npm run build    # Production build to dist/
npm run lint     # ESLint check
npm run preview  # Preview production build
```

## Key Directories

| Directory | Purpose |
|-----------|---------|
| `api/` | API client functions (plain fetch, typed responses) |
| `components/` | Business components (CashFlowDashboard, TransactionTable, etc.) |
| `components/ui/` | shadcn/ui primitives — **DO NOT EDIT** (managed by CLI) |
| `pages/` | Route-level views (Index.tsx, NotFound.tsx) |
| `types/` | TypeScript interfaces (Transaction.ts) |
| `hooks/` | Custom React hooks (use-mobile, use-toast) |
| `lib/` | Utility functions (utils.ts with `cn()`) |
| `utils/` | Helper functions (transactionParser.ts) |
| `data/` | Mock/static data |

## Path Alias

`@/` maps to this directory (`./src`). Always use it for imports:
```typescript
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
```

## Adding a shadcn/ui Component

```
npx shadcn@latest add <component-name>
```

This auto-generates files in `components/ui/`. Never edit them manually.
