# Supabase Migration — Current Implementation and Remaining Scope

> **Code reviewed:** 2026-10-08. Capability status is based on source/migrations. GitHub PF-S issue/project closure and the live database's applied migration list were not checked.

## Decision and current topology

The .NET middle tier and Python AI service remain. Supabase replaces EF Core persistence with PostgREST and supplies local Postgres 17, Storage and Realtime. AI embeddings/retrieval/aggregation use direct asyncpg queries. The Persistence project is gone; schema changes are timestamped SQL migrations.

The standard wizard is synchronous: file → .NET parser/AI client → review → submit. Successful submit triggers optional background embeddings. Browser chat calls FastAPI directly. Browser realtime subscribes to transaction INSERT and invalidates the transaction query. Auth and webhook-based extraction remain future work.

## Phase status

| Phase | Tasks | Actual implementation |
|---|---|---|
| 1 — setup/schema | PF-S01–S03 | Implemented: CLI config, schema/seed SQL and permissive initial app RLS |
| 2 — SDK/EF removal | PF-S04–S07 | Implemented: Supabase DI/entities/handlers/services; no Persistence project |
| 3 — app authentication | PF-S08/S09 | Not implemented: no JWT registration, login/session forwarding or tenant-enforcing app policies |
| 4 — Storage | PF-S10 | Bucket/client implemented; experimental endpoint uses it; normal wizard does not |
| 5 — event-driven extraction | PF-S11 | Not implemented: no statement_uploads schema, processing webhook or result writeback |
| 5 — realtime | PF-S12 | Transaction INSERT scope implemented by PF-AI005; original upload-status scope still missing |
| 6 — RAG | PF-S13 | Capability implemented under PF-AI003–006, with streaming and SQL routing; issue closure unverified |

PF-S09 is frontend Auth, not Storage. Capability overlap with the AI track should not be counted as fresh remote issue completion.

## Implemented paths

- **Persistence:** AddSupabase creates a singleton SDK client using server-side ServiceRoleKey. Application services/handlers use PostgREST. Many app RLS policies remain allow-all; service-role access and placeholder user IDs do not provide tenant isolation.
- **Storage:** migration creates private bank-statements bucket and path policies; IFileStorageService/StorageService exist. upload-preview-new uses a placeholder user path. Its CSV branch uploads/downloads and calls the full TransactionPipelineService. PDFs/images return 202 without further processing.
- **Realtime:** migration 20260706000001_add_realtime.sql publishes public.transactions. useRealtimeTransactions subscribes to INSERT, and TransactionsTab debounces notifications and refetches. It is not statement upload status tracking.
- **RAG:** transaction_embeddings stores vector(1536) with model metadata. Gemini/OpenAI embedding adapters and model-filtered retrieval are implemented; FlashRank, /ask, /ask/stream, query planning and deterministic aggregation exist. Full-text/RRF alternatives exist but vector stays default after the historical benchmark. Failed background embedding has no durable retry queue.

## Remaining target flow

The following is planned, not current:

1. Authenticated upload stores a file and creates a statement_uploads job with tenant identity/status.
2. A validated webhook/worker receives the job and extracts using the configured provider.
3. Validation and transactional writeback persist results and update job completion/failure.
4. Authenticated React subscriptions receive status and load results.

No reviewed migration defines statement_uploads, and FastAPI has no /webhooks/process route. Existing transaction INSERT subscriptions cannot substitute for job-status ownership/completion. Keep the standard upload path until the job pipeline is implemented and tested.

Auth work must cover JWT validation, frontend login/session forwarding, data ownership, service-role boundaries and cross-user tests. The current LangGraph MemorySaver session key is not authenticated ownership.

## Local environment and schema operations

Supabase config: API 54321, Postgres 17 on 54322, Studio 54323. Compose still retains Postgres 16 on 5432, and npm start starts both. The .NET health probe's connection string is separate from Supabase persistence. Compose has not been updated into a complete Supabase deployment.

From repository root, for explicitly intended local startup/migration operations:

```powershell
rtk proxy npx supabase start
rtk proxy npx supabase migration list --local
rtk proxy npx supabase db push --local
```

API startup does not apply migrations. Database reset removes data; remote push is separate from local setup. No startup/migration/reset was performed by this documentation sync. See [setup](../SETUP.md).

## Verification still required

| Scope | Needed evidence |
|---|---|
| Auth | Login → forwarded JWT → identity-scoped access; cross-user denial |
| Storage integration | Correct identity/path policies and actual file roundtrip under chosen runtime |
| Webhook extraction | Job delivery, retries/idempotency, bounded extraction, validated writeback, failed/completed state |
| Upload-status realtime | Scoped subscriptions, reconnect and error/completion UI |
| RAG | Compatible model vectors/backfill, retrieval evaluation and independent numeric checks |
| Deployment | API Supabase settings, reachable AI DB/API URLs, frontend build settings and provider configuration |

For historical evaluations and pending feature checks, use [STATUS.md](../STATUS.md) and the original [learning plans](../../.claude/plans/learning/). Architecture context is [current diagram](architecture-diagram.md).
