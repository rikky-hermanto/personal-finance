# PF-S11 — Event-driven AI pipeline: statement_uploads table + Database Webhook + Python /webhooks/process

> **GitHub Issue:** #74
> **Status:** Not Started
> **Phase:** Phase 5 — Event-Driven AI Pipeline + Realtime

## Objective

Wire up the full async AI extraction pipeline: PDF/image upload triggers a Supabase Database Webhook, which calls the Python AI service, which writes results back to Supabase directly.

## Acceptance Criteria

- [ ] `statement_uploads` table created: `id`, `user_id`, `file_path`, `bank_id`, `status` (pending/processing/done/failed), `created_at`
- [ ] `supabase/migrations/004_statement_uploads.sql` committed
- [ ] Supabase Database Webhook configured: `INSERT` on `statement_uploads` → `POST http://ai-service:8000/webhooks/process`
- [ ] `WEBHOOK_SECRET` shared secret validated in Python handler
- [ ] `ai-service/app/routers/webhooks.py` created with `POST /webhooks/process` endpoint
- [ ] Python service: download file from Storage → extract via Claude `tool_use` → write transactions to Supabase → update `status = "done"`
- [ ] Error path: update `status = "failed"` with error message stored in `error_detail` column
- [ ] End-to-end test: upload PDF → check `statement_uploads.status` transitions to "done" and transactions appear in DB

## Approach

Create the status tracking table and webhook in Supabase. Set up the Python webhook endpoint to listen for database events, triggering the async Claude extraction. The Python service will use the Supabase service role key to write results directly to the database.

## Affected Files

| File | Change |
|------|--------|
| `supabase/migrations/004_statement_uploads.sql` | Create — table and webhook trigger |
| `services/ai-service/app/routers/webhooks.py` | Create — webhook endpoint |
| `services/ai-service/app/main.py` | Update — register webhooks router |
| `services/ai-service/app/services/extractor.py` | Update — wire to storage and DB |

---

## TODO

### [ ] STEP 1 — Create `statement_uploads` Migration
Create `004_statement_uploads.sql` for the tracking table and configure the Database Webhook (using `pg_net` or `http` extension) to hit the AI service.

### [ ] STEP 2 — Webhook Endpoint in Python
Create `ai-service/app/routers/webhooks.py` with a FastAPI endpoint to receive the webhook payload. Validate `WEBHOOK_SECRET`.

### [ ] STEP 3 — Async Extraction Logic
In Python, on receiving the webhook: update status to `processing`. Download the file from Supabase Storage using `supabase-py`. Extract using Claude `tool_use`.

### [ ] STEP 4 — Database Writeback
Write the extracted transactions to the Supabase `transactions` table using the service role key. Update the `statement_uploads` status to `done` or `failed`.

### [ ] STEP 5 — End-to-End Testing
Upload a test PDF and verify the webhook triggers, extraction happens, and data is saved.
