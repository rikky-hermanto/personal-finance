# Frontend Architecture

> **Code reviewed:** 2026-10-08. Source reference; no fresh browser/build verification in this sync.

## Stack and layout

React 18 + TypeScript + Vite, React Router, TanStack React Query, Tailwind/shadcn/Radix, lucide-react and Recharts. Forms use react-hook-form/Zod; theme/focus behavior uses existing providers and tokens. Sources live under `apps/frontend/src`: api clients, components, hooks, pages, shared types and lib modules. `App.tsx` is the routing reference.

| Route group | Implemented screens |
|---|---|
| `/journey` | Journey and achievements; root and legacy dashboard redirect here |
| `/cashflow` | Overview, Transactions, Upload, Accounts, Statement, Analysis |
| `/assets` | Overview, Accounts, Investments, Properties, Liabilities |
| `/investment` | Overview, Holdings, Snapshots, AI Review, new/setup/review detail |
| `/desk` | Command, Portfolio, Mandate, Reconcile; Pre-Trade/Journal disabled |
| `/lab` | Macro Scenario Lab with personalization/comparison/saved scenarios |
| `/chat` | Transaction Q&A; shared chat context also powers the AI panel |
| `/settings` | Appearance, Categories, Regional, Data, Banks |
| `/status` | Service health/status dashboard |

AppShell is wrapped by ErrorBoundary. Legacy upload/transactions/categories bookmarks redirect to nested routes. No login/signup or protected-route/session forwarding flow is implemented.

## Data paths and configuration

| Setting | Consumer |
|---|---|
| `VITE_API_URL` | .NET REST clients in src/api |
| `VITE_AI_SERVICE_URL` | Direct Python chat/SSE/follow-up calls; defaults to localhost:8000 |
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | Supabase realtime client; both required at module import |

Vite dev server binds at port 8080; there is no configured dev API proxy. Match the API URL protocol/port to launch settings (the example env currently uses HTTPS 7209). These Vite settings are baked into production bundles. Current Dockerfile only explicitly injects VITE_API_URL; full container configuration remains unfinished. Server-only service-role keys must never be placed in VITE variables.

REST fetch clients use feature-specific DTOs and error handling; do not assume every client has identical non-2xx behavior. React Query owns server state and mutation invalidation. Browser/local state owns theme/focus preferences, forms and transient chat state.

## Feature mechanics

- **Upload:** standard synchronous preview/submit endpoints, account linkage, editable/duplicate preview and optional bulk Suggest. Standard upload does not call the complete normalization/categorization service; it is not the experimental storage/webhook path.
- **Realtime:** TransactionsTab subscribes to public.transactions INSERT. A one-second debounce groups notifications and invalidates transaction queries. It refetches data; it does not provide extraction job progress or all update/delete events.
- **Buckets:** BucketsCard on Cashflow Analysis fetches /api/buckets and /month-close, saves Future allocations and commitment demotions, and switches between learning/setup/normal/forecast/over/shortfall/month-close/variable-income presentations according to available data and state. Thresholds belong to the feature implementation, not universal financial rules.
- **Chat:** useChatSession calls /ask/stream directly through fetch-event-source; metadata/sources/verification live per assistant message. Stop/error/done abort the stream to avoid replaying paid requests. /ask/followups receives the last question/answer/context and falls back to static chips on failure. Message history stays in local context and is not sent to the stateful /advisor endpoint.
- **Trading Desk:** useDeskState consumes foundation state/mandate/recon endpoints. The TS desk calculation mirror has a golden-fixture parity suite. No live Pre-Trade/Journal screen exists.
- **Macro Lab:** pure solver and personalization functions in src/lib/macroScenario; server-state hooks load holdings/assets/liabilities/spending/Buckets and saved driver sets. Scenario create/delete uses /api/macro-scenarios. Estimates use current available data and fallback assumptions; they are not forecasts verified by the backend.
- **Journey:** Living Garden plants, indicator/quest/achievement views and unavailable states; the five-tier visual framework includes finance domains not yet fully implemented.

## Quality and development

From repository root:

```powershell
rtk npm --prefix apps/frontend run dev
rtk npm run lint
rtk npm run build
rtk npm --prefix apps/frontend run test:desk
rtk npm --prefix apps/frontend run test:macro
rtk npm run e2e
```

Vitest suites exist for desk parity and macro solver/personalization. Seven Playwright specs cover assets, category rules, dashboard, deduplication, health, Journey and uploads; backend-dependent tests need supporting services. There is no broad React component test suite. Playwright configuration starts/reuses frontend port 8080.

TypeScript strictness/noImplicitAny remain disabled. Build runs Vite bundling without a separate tsc step. Transaction display IDs are string while .NET IDs are int; adapters and existing number-valued finance contracts remain compatibility boundaries. No fresh lint/build/unit/browser run was possible in this documentation task.

See [setup](../SETUP.md), [API reference](API-endpoints.md), [current status](../STATUS.md) and [architecture](architecture-diagram.md).
