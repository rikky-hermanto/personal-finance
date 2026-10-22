---
id: PF-144
epic: E-001
flags: []
---

# PF-144 — Harden the upload endpoints (no leaked errors, real file-type checks, time limits)

> **GitHub Issue:** _(create when scheduling)_
> **Status:** Done (accepted by owner 2026-10-22)
> **Started:** 2026-10-22
> **Epic:** E-001 (slice 2 of 8)
> **Sensitive:** security (ERR-01, SEC-02). A wrong guess here is silent.
> **Planned from branch:** main

## Objective

Uploading a statement must not leak internals, and must not trust what the client claims. Today `TransactionsController` returns exception text to the browser (`ex.Message` and `Detail = ex.Message`) and the generic catch in `UploadPreview` never logs. The upload trusts the content type the client sends, with no magic-byte check, and PDF parsing has no timeout. The Python `/parse-pdf` endpoint has no size cap, no timeout around PyMuPDF, and returns `str(e)`. This ticket closes ERR-01 and SEC-02 for both services.

## Acceptance Criteria

- [x] `UploadPreview` and the second upload action in `TransactionsController` never put `ex.Message`, `ex.StackTrace` or an inner exception into a response body. Each failure returns a fixed generic message plus a correlation ID (the request trace identifier), and the full exception is logged with `_logger.LogError(ex, ...)` before responding. The catch-all branch logs too.
  > Verification note: `TransactionsUploadErrorTests` throws an exception carrying a unique marker (and an inner exception) from the importer, identifier and LLM client in both actions; asserts the marker is absent from the serialized body, `correlationId` equals `TraceIdentifier`, and an Error log entry holds the exception. 20 cases pass.
- [x] The 400, 422, 503 and 500 status codes stay as they are (ERR-03). The `Retry-After` header on 503 stays. The frontend still shows a usable message.
  > Verification note: status mapping asserted per exception kind; `Retry-After: 30` asserted. `FileUpload.tsx` reads `message`/`Message` and treats `Detail` as optional, so removing `Detail` only drops the suffix; not exercised in a browser.
- [x] Before parsing, the API checks the file's leading bytes against the claimed type: `%PDF-` for PDF, the PNG, JPEG and WEBP signatures for images, and for CSV that the content is valid text with no NUL bytes. A mismatch returns 400 with a generic message. The 10 MB cap stays.
  > Verification note: `UploadFileValidatorTests` (signatures, mismatches, Windows-1252, UTF-8 split at the 8 KB boundary, stream position restored) and controller tests proving the identifier, LLM client and storage are never reached on a mismatch. The `[RequestSizeLimit]` attributes are untouched.
- [x] PDF parsing and bank identification run under a cancellation timeout (default 60 seconds, set in configuration); a timeout returns a generic 422 and is logged.
  > Verification note: `Upload:ParseTimeoutSeconds` (default 60, in `appsettings.json`). Tests cover an import that never completes and an identifier that blocks its thread; both return 422 within the 1 s budget and the first asserts the log entry.
- [x] Python `/parse-pdf` rejects files over 10 MB with 413, runs PyMuPDF extraction under a timeout, and returns the error codes in `.claude/rules/ai-service.md` (`llm_parse_error`, `provider_unavailable`, `response_truncated`, `internal_error`) with generic text, not `str(e)`. Details go to the log. The same generic-detail fix is applied to `/parse`, `/parse-image` and the category endpoints that return `str(e)` (see `services/ai-service/app/main.py` lines near 209, 230, 237, 272, 346–360).
  > Verification note: `grep "str(e)" app/main.py` finds nothing. `/parse`, `/parse-pdf`, `/parse-image`, `/portfolio-review` and `/journey/advise` were the only endpoints that echoed it; the categorize endpoints already used fixed codes.
- [x] New tests cover: leaked-text regression (a thrown exception with a unique message never appears in the response), magic-byte mismatch, timeout, and Python 413 and sanitized detail. `dotnet test` and `pytest` pass; mocked LLM only.
  > Verification note: `dotnet test PersonalFinance.slnx` 471 passed, 9 skipped (the existing skips), 0 failed. `pytest` 366 passed.

## Approach

Keep the controller thin (ARCH-04): move the type check into a small `UploadFileValidator` service in `Application` (interface in `Application/Interfaces/`, ARCH-02) and call it at the top of each upload action. Map failures through one shared helper in the Api layer that logs, builds the generic body with the correlation ID, and returns the status code, so the two actions stop duplicating four catch blocks. Wrap PDF identification and import in a `CancellationTokenSource` with a configured timeout. On the Python side, add a size check and `asyncio.wait_for` (running PyMuPDF in a thread) to `/parse-pdf`, and replace `str(e)` in error details with the documented codes. Do not change the extraction behaviour, parsers, or frozen `TransactionDto` fields. `upload-preview-new` is handled in the low-items ticket, not here, but if it shares the helper, use it.

## Affected Files

| File | Change |
|------|--------|
| `apps/api/src/PersonalFinance.Api/Controllers/TransactionsController.cs` | Edit — use validator and shared error helper; log every catch; stop returning exception text |
| `apps/api/src/PersonalFinance.Api/` (new error-response helper) | Create — builds generic body plus correlation ID, logs the exception |
| `apps/api/src/PersonalFinance.Application/Interfaces/IUploadFileValidator.cs` | Create — interface |
| `apps/api/src/PersonalFinance.Application/Services/UploadFileValidator.cs` | Create — magic-byte and text checks |
| `apps/api/src/PersonalFinance.Api/Program.cs` | Edit — register the validator; read the timeout setting |
| `apps/api/tests/PersonalFinance.Tests/` | Create — validator tests and controller leak/timeout tests |
| `services/ai-service/app/main.py` | Edit — `/parse-pdf` size cap and timeout; generic error details |
| `services/ai-service/tests/` | Edit — tests for 413, timeout and sanitized detail |
| `.claude/rules/ai-service.md` | Edit — add any new error code to the table in the same commit (rule in that file) |

---

## TODO

### [x] STEP 1 — Pin down current behaviour with failing tests
Write controller tests that make `IStatementImportService`, `IBankIdentifier` and the LLM client throw an exception with a unique message, and assert that message is not in the response body or anywhere in the serialized result. Also add a test that the catch-all path logs. They should fail now.

> **Why:** ERR-01 failures are silent. A regression test with a unique marker string is the only reliable way to see them (THINK-04: tests are diagnostic signals).

### [x] STEP 2 — Add the shared error helper and fix the catches
Create one helper that takes the exception, a status code and a fixed message, calls `_logger.LogError(ex, ...)`, and returns `new { Message = fixedMessage, CorrelationId = HttpContext.TraceIdentifier }`. Replace the four catch blocks in each upload action with it. Keep the 503 `Retry-After` header and the `NotSupportedException` to 400 mapping, but with a fixed message such as "This file type or format is not supported."

> **Why:** ERR-01 and ERR-04 require the full exception in the log and only a generic message plus ID for the client. One helper keeps the two actions from drifting apart again.

### [x] STEP 3 — Add the file-type validator
Create `IUploadFileValidator` and `UploadFileValidator` with `ValidateAsync(Stream, string declaredContentType)`. Check the first bytes: `%PDF-`; PNG `89 50 4E 47 0D 0A 1A 0A`; JPEG `FF D8 FF`; WEBP `RIFF....WEBP`; CSV decodes as UTF-8 or Windows-1252 text with no NUL bytes in the first 8 KB. Reject on mismatch. Register it as scoped in `Program.cs` and call it in both upload actions right after the existing size and empty checks, then rewind the stream.

> **Why:** SEC-02 says validate the MIME type and the magic bytes. The client-sent content type is attacker-controlled. Interface goes in `Application/Interfaces/` (ARCH-02).

### [x] STEP 4 — Add the parsing timeout
Read `Upload:ParseTimeoutSeconds` (default 60) from configuration. Create a linked `CancellationTokenSource` and pass its token through bank identification and import where the interfaces accept one; where they do not, wrap with `Task.WaitAsync(timeout)`. On timeout return the generic 422 and log it.

> **Why:** SEC-02 requires a timeout around PDF parsing, because a crafted PDF can otherwise hold a request thread indefinitely.

### [x] STEP 5 — Fix the Python PDF endpoint
In `services/ai-service/app/main.py`, reject `/parse-pdf` uploads over 10 MB with 413 (mirror `_MAX_IMAGE_BYTES`). Run the PyMuPDF extraction in `asyncio.to_thread` inside `asyncio.wait_for` with a 60 second limit, and map a timeout to the documented 502 `internal_error` style response. Replace `detail=str(e)` with the documented codes and generic text everywhere it appears, logging the real exception with `logger.exception`.

> **Why:** Same rules as the .NET side (SEC-02, and the error contract in `.claude/rules/ai-service.md`). The .NET API maps these codes, so keep the code strings exactly as documented.

### [x] STEP 6 — Python tests
Add tests for the 413, the timeout and the sanitized detail, mocking all LLM calls (never hit a real provider).

> **Why:** `.claude/rules/ai-service.md` forbids real LLM calls in tests and asks for explicit error-path tests.

### [x] STEP 7 — Run the gates
```bash
cd apps/api && dotnet build PersonalFinance.slnx && dotnet test PersonalFinance.slnx
cd ../../services/ai-service && .venv/Scripts/python.exe -m pytest -q
```
Do not commit.

> **Why:** CI-01 gates; the owner reviews at G3.

---

## Notes

- Line numbers in the audit (149–162, 236–245) have shifted; search for `ex.Message` in `TransactionsController.cs` rather than trusting them.
- The frontend may read `Detail` or `Message` from error bodies. Search `apps/frontend/src/api` for both before removing `Detail`, and keep what the UI shows readable.
- Related: PF-130 refactors `SubmitTransactions` in the same controller; avoid editing that action here to prevent merge conflicts.

## Execution Notes

Model: **Opus 5.5** · Effort: **high**. Security fixes across two services where a missed error path is silent.
Before you start: none.

```
/execute plans/in-progress/PF-144-harden-upload-endpoints-todo.md
```

### Stop and ask if

- The frontend depends on `Detail` in error bodies in a way that would break the upload screen.
- The interfaces for bank identification and import cannot take a cancellation token and wrapping them would change a public contract.

## ✅ Owner Review Checklist (G3)

**State:** all seven steps are done in worktree `.worktrees/pf-144-hand` on branch `fix/pf-144-harden-upload-endpoints`, uncommitted. `dotnet test` (471 passed, 9 skipped) and `pytest` (366 passed) are green. Ticket tracking did not start: `run.mjs start --hand` refused because slot 1 is held by PF-AI009, so this plan is still in `backlog/` and the board is not updated. Not checked: a live upload through the browser, and a real timeout against a crafted PDF.

**Known defects to confirm:**
- `TransactionsController.WithinParseBudgetAsync`: the interfaces take no cancellation token, so on timeout the request stops waiting but the abandoned parse keeps running on a thread-pool thread until it finishes. A mocked test cannot show real CPU cost; the plan allowed `WaitAsync` for this case.
- `LlmExtractionClient.cs` was edited (not in the plan's file list): the Python service no longer sends the provider's raw text, so the transient-busy check there now also recognises `provider_unavailable` and `llm_rate_limited`. Without it the 503 and `Retry-After` path would silently stop firing for overloaded Gemini.
- Added error codes `file_too_large` (413) and `pdf_unreadable` (422) to `.claude/rules/ai-service.md`; the `/parse-pdf` 422 no longer says "wrong password" versus "corrupt", so the UI cannot tell them apart.
- Stash `stash@{0}` ("WIP on fix/pf-147-vulnerable-deps") in the shared stash list holds a copy of my controller edits plus other sessions' PF-147 changes (csproj, docs, supabase config). A formatter or another session reset the main checkout mid-run. I left the stash alone; whoever owns PF-147 should check it.

### A. Before you start
- ☐ `git -C .worktrees/pf-144-hand status --short` shows the 9 new/changed API files, the 2 Python files, `ai-service.md` and this plan.

### B. Read the code
- ☐ `apps/api/src/PersonalFinance.Api/Controllers/TransactionsController.cs`: both upload actions end in a single `catch (Exception ex) { return UploadFailure(ex); }`; no `ex.Message` appears in any response.
- ☐ `apps/api/src/PersonalFinance.Application/Services/UploadFileValidator.cs`: signatures and the 8 KB text probe match STEP 3.
- ☐ `services/ai-service/app/main.py`: no `str(e)` left; `_llm_error_code` maps to the documented codes.

### C. Run the tests
- ☐ `cd .worktrees/pf-144-hand/apps/api && dotnet test PersonalFinance.slnx` → 471 passed, 9 skipped, 0 failed.
- ☐ `cd .worktrees/pf-144-hand/services/ai-service && python -m pytest -q` (use the main checkout's venv; the worktree has none) → 366 passed.

### D. Start the stack
- ☐ `npm start` from the worktree (or merge first), then open http://localhost:8080/cashflow.

### E. Live checks
- ☐ Upload a real BCA CSV: preview appears as before.
- ☐ Rename a `.png` to `.pdf` and upload it: the page shows "The file content does not match its type…".
- ☐ Stop the AI service, upload a PDF the direct parsers do not recognise: the page shows a generic message, the response has a `correlationId`, and the API log has the full exception under that ID.
- ☐ Set `Upload__ParseTimeoutSeconds=1`, upload a large PDF: generic 422 "took too long".

### F. Optional stretch
- ☐ Thread a real `CancellationToken` through `IBankIdentifier` and `IStatementImportService` so a timed-out parse actually stops.

### G. Decide and close
- ☐ Accepted means sections C and E pass. Tell Claude "PF-144 accepted": it commits and merges the branch, moves the plan to `done/` and removes the worktree. Do not run `/loop-accept` (it would try to merge again).
