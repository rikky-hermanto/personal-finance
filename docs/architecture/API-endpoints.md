# Personal Finance — HTTP Endpoint Reference

> **Code reviewed:** 2026-10-08. Inventory derived from controller attributes, Program.cs and FastAPI decorators. Contract source remains the DTO/request models. This reference does not claim the services were running today.

## Common behavior

- .NET local base: `http://localhost:7208`; FastAPI base: `http://localhost:8000`.
- No application JWT authentication is registered. Current app-table policies/placeholders are not authenticated tenant isolation.
- .NET CORS allows frontend localhost ports 8080/8081/8082; Python's coded defaults allow localhost 7208/8080.
- JSON is camelCase on normal .NET DTO responses and snake_case on Python models. Uploaded files use multipart form data.
- `GET /health` on .NET checks configured dependencies; `GET /api/transactions/health` and Python `GET /health` are simple liveness responses.
- .NET development OpenAPI is `GET /openapi/v1.json`; FastAPI schema/docs are `/openapi.json` and `/docs`. No WeatherForecast controller exists.

## .NET route inventory

Route constraints below (`:guid` / `:int`) describe parameter types; omit the constraint suffix when constructing an actual URL.

| Method | Route template | Controller action |
|---|---|---|
| GET | `/api/accounts/institutions` | GetInstitutions |
| POST | `/api/accounts/institutions` | CreateInstitution |
| PUT | `/api/accounts/institutions/{id:guid}` | UpdateInstitution |
| DELETE | `/api/accounts/institutions/{id:guid}` | DeleteInstitution |
| GET | `/api/accounts` | GetAccounts |
| POST | `/api/accounts` | CreateAccount |
| PUT | `/api/accounts/{id:guid}` | UpdateAccount |
| DELETE | `/api/accounts/{id:guid}` | DeleteAccount |
| GET | `/api/accounts/balances` | GetAccountBalances |
| PATCH | `/api/accounts/{id:guid}/cashflow` | SetCashflowFlag |
| PATCH | `/api/accounts/{id:guid}/opening-balance` | SetOpeningBalance |
| GET | `/api/assets` | GetAssets |
| POST | `/api/assets` | CreateAsset |
| PUT | `/api/assets/{id:guid}` | UpdateAsset |
| DELETE | `/api/assets/{id:guid}` | DeleteAsset |
| GET | `/api/assets/holdings` | GetHoldings |
| POST | `/api/assets/holdings` | CreateHolding |
| PUT | `/api/assets/holdings/{id:guid}` | UpdateHolding |
| DELETE | `/api/assets/holdings/{id:guid}` | DeleteHolding |
| GET | `/api/assets/valuations/{subjectType}/{subjectId:guid}` | GetValuations |
| POST | `/api/assets/valuations` | CreateValuation |
| DELETE | `/api/assets/valuations/{id:guid}` | DeleteValuation |
| GET | `/api/buckets` | GetBuckets |
| GET | `/api/buckets/month-close` | GetMonthClose |
| POST | `/api/buckets/future-plan` | SetFuturePlan |
| POST | `/api/buckets/committed-items/demote` | DemoteCommittedItem |
| GET | `/api/categoryrules` | GetAll |
| POST | `/api/categoryrules` | Add |
| PUT | `/api/categoryrules/{id}` | Update |
| DELETE | `/api/categoryrules/{id}` | Delete |
| DELETE | `/api/categoryrules/reset` | ResetAllRules |
| GET | `/api/categoryrules/export` | ExportCsv |
| POST | `/api/categoryrules/import` | ImportCsv |
| GET | `/api/desk/state` | GetState |
| GET | `/api/desk/mandate/versions` | GetMandateVersions |
| GET | `/api/desk/mandate/presets` | GetMandatePresets |
| POST | `/api/desk/mandate/draft` | SaveMandateDraft |
| POST | `/api/desk/mandate/approve` | ApproveMandate |
| POST | `/api/desk/recon/{id:guid}/resolve` | ResolveReconIssue |
| PUT | `/api/desk/positions/{id:guid}/sleeve` | SetPositionSleeve |
| GET | `/api/insights` | GetInsights |
| GET | `/api/insights/daily-pulse` | GetDailyPulse |
| GET | `/api/investments/archetypes` | GetArchetypes |
| GET | `/api/investments/setups` | GetSetups |
| GET | `/api/investments/setups/{id:guid}` | GetSetup |
| POST | `/api/investments/setups` | CreateSetup |
| PUT | `/api/investments/setups/{id:guid}` | UpdateSetup |
| DELETE | `/api/investments/setups/{id:guid}` | DeleteSetup |
| PUT | `/api/investments/setups/{id:guid}/holdings` | UpsertHoldings |
| POST | `/api/investments/setups/{id:guid}/review` | RunReview |
| GET | `/api/investments/setups/{id:guid}/snapshots/{snapshotId:guid}` | GetSnapshot |
| GET | `/api/journey/state` | GetState |
| POST | `/api/journey/recalculate` | Recalculate |
| GET | `/api/journey/quests` | GetQuests |
| GET | `/api/liabilities` | GetAll |
| POST | `/api/liabilities` | Create |
| PUT | `/api/liabilities/{id:guid}` | Update |
| DELETE | `/api/liabilities/{id:guid}` | Delete |
| GET | `/api/macro-scenarios` | GetAll |
| POST | `/api/macro-scenarios` | Create |
| DELETE | `/api/macro-scenarios/{id:guid}` | Delete |
| GET | `/api/networth/current` | GetCurrent |
| GET | `/api/networth/allocation` | GetAllocation |
| GET | `/api/networth/history` | GetHistory |
| GET | `/api/spending-analysis/safe-to-spend` | GetSafeToSpend |
| GET | `/api/spending-analysis/variance` | GetVariance |
| GET | `/api/transactions/health` | HealthCheck |
| POST | `/api/transactions/categorize-preview` | CategorizePreview |
| GET | `/api/transactions/supported-types` | GetSupportedTypes |
| POST | `/api/transactions/upload-preview` | UploadPreview |
| POST | `/api/transactions/upload-preview-new` | UploadPreviewNEW |
| POST | `/api/transactions/submit` | SubmitTransactions |
| GET | `/api/transactions` | GetTransactions |
| GET | `/api/transactions/{id:int}` | GetTransactionById |
| GET | `/api/transactions/aggregated` | GetDashboardData |
| GET | `/api/transactions/statement` | GetCashflowStatement |
| GET | `/api/transactions/account-summaries` | GetAccountSummaries |
| GET | `/api/transactions/resolve-alias` | ResolveAlias |
| GET | `/api/transactions/export` | ExportCsv |
| DELETE | `/api/transactions/reset` | ResetAllTransactions |

Controller sources: [directory](../../apps/api/src/PersonalFinance.Api/Controllers/). Desk Pre-Trade/Journal mutation routes and a .NET chat/advisor proxy are absent. Macro scenarios support list/create/delete, not an update route.

## Transaction contracts

`TransactionDto` includes int `id`, `date`, `description`, `remarks`, `flow` (DB/CR), `type`, `category`, transient `accountName`, nullable UUID `accountId`, decimal `amountIdr`/`balance`, nullable `exchangeRate`/`statementBalance`, `currency`, `isDuplicate` and optional `categoryRuleDto`. AccountName is resolved to account_id; it is not a persisted wallet column. Existing frontend adapters use different display names/types.

### Upload preview

`POST /api/transactions/upload-preview` accepts `file` plus optional `pdfPassword`, `bankHint` and `dateFormat`. Allowed MIME types: text/csv, application/pdf, image/png, image/jpeg, image/webp; request limit 10 MiB. Success returns `{transactions, hash}`, not a bare array. File-hash conflict returns 409. Bad/unsupported input returns 400, extraction failure 422, transient extraction failure 503 with Retry-After:30, unexpected processing failure 500.

`bankHint` is forwarded on the image path; the PDF parser currently supplies null to Python even when Superbank is detected. Full TransactionPipelineService is not invoked by this standard endpoint.

`POST /api/transactions/upload-preview-new` is experimental: CSV storage roundtrip + full pipeline; PDF/image returns 202 processing_id with no completing worker. Do not use it as a finished asynchronous upload API.

### Preview suggestions and submit

`categorize-preview` body: `{descriptions: string[], availableCategories?: string[]}`; returns `{results}` via merchant suggestions. This is separate from Python `/categorize` and its Jev switch.

`submit` body is an envelope, not an array:

```json
{
  "transactions": [
    {"date":"2026-10-01", "description":"Lunch", "flow":"DB", "type":"Expense", "category":"Food & Drinks", "accountName":"Example Account", "amountIdr":50000, "currency":"IDR"}
  ],
  "fileHash": "<hash-from-preview>",
  "fileName": "example.csv"
}
```

Returns message + confirmed inserted transactions (or an empty list when all duplicate). Background embeddings are optional and do not establish a durable job completion contract.

### Lists and summaries

- `GET /api/transactions`: `accountId`, `category`, `type`, `search`, `sortOrder=desc`, `page=1`, `pageSize=50` (clamped 1–200). Returns `{items,total,page,pageSize}`.
- `aggregated`: optional `accountId/year/month`, `months=6`. Returns DashboardDto; time selection follows DashboardService's baseline logic, not an unconditional current-month promise.
- `statement`: `months=6`, optional `accountId`, `groupBy=quarterly`.
- `account-summaries`: `months=12`; `resolve-alias`: required `aliasText`.
- `export`: optional `accountId/from/to`; CSV file response.
- `DELETE /api/transactions/reset` removes transactions; category-rule reset is a separate endpoint.
- `GET /api/networth/history`: optional `from/to`, defaults to trailing 12 months ending at UTC now.
- `GET /api/spending-analysis/safe-to-spend` and `variance` accept optional `accountId`.

## FastAPI route inventory

| Method | Route | Purpose |
|---|---|---|
| GET | `/health` | Liveness/version, not DB/provider readiness |
| POST | `/parse` | Text extraction; ParseRequest → ParseResponse |
| POST | `/parse-pdf` | Multipart file + optional bank_hint/password → PdfParseResponse |
| POST | `/parse-image` | Multipart PNG/JPEG/WebP + optional bank_hint, 10 MiB limit |
| POST | `/categorize` | Closed-vocabulary request, independent llm/jev backend; response category/confidence/rule_seed_allowed |
| POST | `/suggest-categories` | Merchant batch → suggestion list |
| POST | `/portfolio-review` | Seven-section analysis; optional provider/model override |
| POST | `/journey/advise` | Indicator state → generated quest list |
| POST | `/embed-transactions` | Item batch → embedded/skipped/model; asyncpg upsert |
| POST | `/search` | Vector/full-text/hybrid retrieval, metadata filters, optional rerank |
| POST | `/ask` | Routed aggregate/lookup answer + citations/timing/verification |
| POST | `/ask/stream` | Routed SSE answer |
| POST | `/ask/followups` | Optional contextual suggestion list; provider failure → empty list |
| POST | `/categorize-agent` | Separate smolagents tool-calling demo/debug path |
| POST | `/advisor` | Separate LangGraph stateful financial advisor |

Source: [main.py](../../services/ai-service/app/main.py), [models.py](../../services/ai-service/app/models.py). No webhook processing route exists.

### Retrieval and streaming contracts

`/search`: query 1–500 chars; top_k default 5 (1–50); min_similarity default 0 (0–1); optional category/account/date_from/date_to; rerank=false; search_mode=vector (vector/bm25/hybrid). Date fields validate YYYY-MM-DD shape. The bm25 mode uses PostgreSQL full-text ranking; hybrid fuses ranks with RRF.

`/ask` and `/ask/stream`: query 1–500 chars; top_k default 3 (1–10); optional category/account/date bounds. Planner chooses aggregate or lookup. Aggregate filtering is compiled from QueryPlan (categories, flow, dates); it does not apply the request's account field. Do not promise equivalent filtering across both branches.

SSE events:

| Event | Payload |
|---|---|
| metadata | contexts, intent, and aggregate total_idr/count when applicable |
| token | Plain answer chunk |
| done | confident, verified, intent, optional total_idr |
| error | JSON detail for planner/generation failure |

For aggregate answers the numeric value comes from SQL, but verified does not validate planner interpretation or prose claims. For lookup answers it checks citation-marker mapping, not entailment. JSON monetary payloads retain existing float/number serialization.

`/ask/followups` accepts question, answer, optional intent/total_idr and up to five context rows. Returns `{questions}`. Frontend aborts/times out optional suggestions and falls back to static chips.

`/advisor` accepts query, optional session_id/date_from/date_to and returns answer/session_id/steps_taken. Sessions are process-local MemorySaver threads. Dates are prompt context rather than tool arguments. The transaction chat UI calls ask/stream, not advisor.

## Errors and development examples

Errors vary by controller/client. FluentValidation/model validation handles invalid input; missing resources commonly return 404. Unhandled .NET errors return 500 with DEBUG detail; upload catches still expose some exception text. Python extraction/review/agent failures commonly map to 502, malformed requests to 422; suggestions may degrade to an empty list. Inspect the individual action before relying on a uniform error schema.

PowerShell examples (read-only requests):

```powershell
rtk proxy curl.exe 'http://localhost:7208/api/transactions?page=1&pageSize=50'
rtk proxy curl.exe 'http://localhost:7208/api/desk/state'
rtk proxy curl.exe 'http://localhost:8000/health'
```

See [setup](../SETUP.md) and [current status](../STATUS.md). Live/paid LLM evaluation was not performed by this sync.
