# PF-S10 — Supabase Storage: bank-statements bucket + StorageService + upload endpoint

> **GitHub Issue:** #73
> **Status:** Completed
> **Phase:** Phase 4 — Supabase Storage + Validation Pipeline

## Objective

Replace the current in-memory file handling with Supabase Storage. Bank statement files are stored in a `bank-statements` bucket with per-user path isolation before parsing begins.

## Acceptance Criteria

- [x] `bank-statements` Storage bucket created (via `supabase/migrations/003_storage.sql` or Studio)
- [x] Bucket policy: `{user_id}/{bank}/{filename}` path pattern enforced via RLS
- [x] `IFileStorageService` interface created in `Application/Interfaces/`
- [x] `StorageService.cs` implemented in `Infrastructure/Supabase/` using `supabase-csharp` Storage client
- [x] Upload endpoint updated: file → Storage FIRST, then route to parser
- [x] CSV path: upload → download from Storage → parse → return preview (synchronous, unchanged UX)
- [x] PDF/image path: upload → store → return `{ processing_id }` immediately (async, non-blocking)
- [x] Validation pipeline (DateNormalizer → DecimalFixer → CurrencyStandardizer → SchemaValidator → DeduplicateCheck) implemented and wired in

## Approach

Create the storage bucket and RLS policies. Implement the .NET storage service wrapper around `supabase-csharp`. Refactor the file upload API to use the storage service and return an async tracking ID for PDFs. Add the validation pipeline steps before returning CSV previews or saving results.

## Affected Files

| File | Change |
|------|--------|
| `supabase/migrations/003_storage.sql` | Create — migration for bucket and RLS |
| `Application/Interfaces/IFileStorageService.cs` | Create — storage interface |
| `Infrastructure/Supabase/StorageService.cs` | Create — Supabase implementation |
| `Infrastructure/DependencyInjection.cs` | Update — register storage service |
| `API/Controllers/UploadController.cs` | Update — refactor to use storage |

---

## TODO

### [x] STEP 1 — Create Storage Bucket Migration
Create `supabase/migrations/003_storage.sql` with queries to insert `bank-statements` bucket into `storage.buckets` and set up RLS policies on `storage.objects` for insert, select, update, delete filtering by `auth.uid()`.

### [x] STEP 2 — Implement `IFileStorageService`
Create the interface in `Application/Interfaces/IFileStorageService.cs` with `UploadAsync`, `DownloadAsync`, and `DeleteAsync` methods.

### [x] STEP 3 — Implement `StorageService`
Create `Infrastructure/Supabase/StorageService.cs` implementing `IFileStorageService` using `supabase-csharp`.

### [x] STEP 4 — Implement Validation Pipeline
Create the sequence of normalizers and validators. Update `DeduplicateCheck` to use Supabase to check existing transactions.

### [x] STEP 5 — Refactor Upload Endpoint
Modify the file upload controller to upload files to Supabase first using the storage service. Ensure CSV processing is synchronous and PDF/image processing returns `{ processing_id }`.
