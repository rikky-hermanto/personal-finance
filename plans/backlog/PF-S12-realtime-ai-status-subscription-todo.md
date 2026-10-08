# PF-S12 — Supabase Realtime: React subscription for live AI processing status

> **GitHub Issue:** #75
> **Status:** Not Started
> **Phase:** Phase 5 — Event-Driven AI Pipeline + Realtime

## Objective

Replace polling with Supabase Realtime WebSocket subscriptions so the React frontend automatically reflects AI processing status without any manual refresh.

## Acceptance Criteria

- [ ] Supabase Realtime enabled on `statement_uploads` table in Supabase config
- [ ] `src/hooks/useRealtimeSubscription.ts` created — subscribes to `statement_uploads` changes for current user
- [ ] Upload page shows live status: pending → processing → done (or failed with error)
- [ ] On `status = "done"`: transaction list automatically refreshes (React Query cache invalidated)
- [ ] On `status = "failed"`: user shown error message without page reload
- [ ] Subscription is cleaned up on component unmount (no memory leaks)
- [ ] Works with Supabase local stack (Studio shows Realtime events in real-time)

## Approach

Enable Postgres logical replication for Realtime on the tracking table. Build a React hook using `@supabase/supabase-js` to listen to table changes and invalidate React Query cache when the background process finishes.

## Affected Files

| File | Change |
|------|--------|
| `supabase/migrations/004_statement_uploads.sql` | Update — `alter publication supabase_realtime` |
| `src/hooks/useRealtimeSubscription.ts` | Create — Realtime React hook |
| `src/pages/UploadPage.tsx` | Update — display live status |

---

## TODO

### [ ] STEP 1 — Enable Realtime on Table
Update the migration (or create a new one) to run `alter publication supabase_realtime add table statement_uploads;`.

### [ ] STEP 2 — Create Realtime Hook
Create `src/hooks/useRealtimeSubscription.ts`. Use `supabase.channel('statement_uploads')` to listen to `postgres_changes`.

### [ ] STEP 3 — Integrate with Upload UI
Use the hook in the frontend file upload components to display status updates ("Pending", "Processing", "Done").

### [ ] STEP 4 — React Query Cache Invalidation
When the hook receives a `done` event, call `queryClient.invalidateQueries` for the transactions list to trigger a refetch.

### [ ] STEP 5 — Unmount Cleanup
Ensure `channel.unsubscribe()` is called in the `useEffect` cleanup function.
