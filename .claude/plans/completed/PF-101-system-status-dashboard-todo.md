# PF-101 — System Status Dashboard

> **GitHub Issue:** #N/A (User Request)
> **Status:** Completed
> **Started:** 2026-05-05
> **Finished:** 2026-05-05

## Objective

Create a minimalist, real-time "Status" page that monitors the health of all core components: Database, Backend API, AI Service, Frontend, and Grafana Monitoring. The design is simple, modern, and consistent with the application's minimalist "island" aesthetic.

## Acceptance Criteria

- [x] **Unified Health Endpoint**: Backend API aggregates health status of other internal services.
- [x] **Database Monitoring**: Backend health check includes a live PostgreSQL connection check.
- [x] **Status Page UI**: A new `/status` route in the frontend with:
    - [x] **Minimalist Design**: Standalone page with a central "island" container.
    - [x] **Clean Layout**: No sidebar or activity panels; just the main health dashboard.
    - [x] **Real-time Indicators**: Pulse status dots (Online/Offline/Degraded) with shadow effects.
    - [x] **Item Styling**: Borderless list items for service endpoints with response time details.
- [x] **Deep Links**: Link back to the main dashboard from the status page footer.

## Approach

1.  **Backend (API)**:
    - Added `AspNetCore.HealthChecks.Npgsql`, `AspNetCore.HealthChecks.Uris`, and `AspNetCore.HealthChecks.UI.Client`.
    - Configured `AddNpgSql`, `AddUrlGroup` (AI & Grafana), and mapped `/health` with `UIResponseWriter`.
    - Fixed CORS policy to support local development ports (8080-8082).
2.  **Frontend**:
    - Created `src/api/statusApi.ts` to map detailed health JSON to UI-friendly status.
    - Created `src/pages/StatusPage.tsx` with a standalone, centered "island" design.
    - Fixed `VITE_API_URL` environment synchronization.

## Affected Files

| File | Change |
|------|--------|
| `apps/api/src/PersonalFinance.Api/PersonalFinance.Api.csproj` | Added health check packages. |
| `apps/api/src/PersonalFinance.Api/Program.cs` | Implemented health check logic and fixed CORS. |
| `apps/frontend/src/api/statusApi.ts` | Created — Health check client. |
| `apps/frontend/src/pages/StatusPage.tsx` | Created — Minimalist standalone dashboard. |
| `apps/frontend/src/App.tsx` | Added `/status` route outside AppShell. |

---

## Final Verification (Completed)

- [x] **Backend Build**: Fixed `AddNpgSql` case-sensitivity build error.
- [x] **CORS Check**: Verified that the frontend can fetch health data without errors on port 8082.
- [x] **Visual Check**: Verified the minimalist island design with no sidebar/borders.
- [x] **Live Check**: Confirmed service statuses (Database: Offline, AI: Offline, Frontend: Online) reflect reality.

---

## Notes
- **Standalone View**: The page is purposely kept outside of `AppShell` to provide a focused, distraction-free monitoring view.
- **Portability**: All internal checks use configurable URLs (defaulting to localhost for dev).
