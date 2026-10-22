---
id: PF-144
epic: E-001
flags: [Ready]
---

# PF-144 — Harden the upload endpoints (no leaked errors, real file-type checks, time limits)

> **GitHub Issue:** _(create when scheduling)_
> **Status:** To Do
> **Started:** —
> **Epic:** E-001 (slice 2 of 8)
> **Sensitive:** security (ERR-01, SEC-02). A wrong guess here is silent.
> **Planned from branch:** main

## Objective

Uploading a statement must not leak internals, and must not trust what the client claims. Today `TransactionsController` returns exception text to the browser (`ex.Message` and `Detail = ex.Message`) and the generic catch in `UploadPreview` never logs. The upload trusts the content type the client sends, with no magic-byte check, and PDF parsing has no timeout. The Python `/parse-pdf` endpoint has no size cap, no timeout around PyMuPDF, and returns `str(e)`. This ticket closes ERR-01 and SEC-02 for both services.

## Acceptance Criteria

- [ ] `UploadPreview` and the second upload action in `TransactionsController` never put `ex.Message`, `ex.StackTrace` or an inner exception into a response body. Each failure returns a fixed generic message plus a correlation ID (the request trace identifier), and the full exception is logged with `_logger.LogError(ex, ...)` before responding. The catch-all branch logs too.
- [ ] The 400, 422, 503 and 500 status codes stay as they are (ERR-03). The `Retry-After` header on 503 stays. The frontend still shows a usable message.
- [ ] Before parsing, the API checks the file's leading bytes against the claimed type: `%PDF-` for PDF, the PNG, JPEG and WEBP signatures for images, and for CSV that the content is valid text with no NUL bytes. A mismatch returns 400 with a generic message. The 10 MB cap stays.
- [ ] PDF parsing and bank identification run under a cancellation timeout (default 60 seconds, set in configuration); a timeout returns a generic 422 and is logged.
- [ ] Python `/parse-pdf` rejects files over 10 MB with 413, runs PyMuPDF extraction under a timeout, and returns the error codes in `.claude/rules/ai-service.md` (`llm_parse_error`, `provider_unavailable`, `response_truncated`, `internal_error`) with generic text, not `str(e)`. Details go to the log. The same generic-detail fix is applied to `/parse`, `/parse-image` and the category endpoints that return `str(e)` (see `services/ai-service/app/main.py` lines near 209, 230, 237, 272, 346–360).
- [ ] New tests cover: leaked-text regression (a thrown exception with a unique message never appears in the response), magic-byte mismatch, timeout, and Python 413 and sanitized detail. `dotnet test` and `pytest` pass; mocked LLM only.

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

### [ ] STEP 1 — Pin down current behaviour with failing tests
Write controller tests that make `IStatementImportService`, `IBankIdentifier` and the LLM client throw an exception with a unique message, and assert that message is not in the response body or anywhere in the serialized result. Also add a test that the catch-all path logs. They should fail now.

> **Why:** ERR-01 failures are silent. A regression test with a unique marker string is the only reliable way to see them (THINK-04: tests are diagnostic signals).

### [ ] STEP 2 — Add the shared error helper and fix the catches
Create one helper that takes the exception, a status code and a fixed message, calls `_logger.LogError(ex, ...)`, and returns `new { Message = fixedMessage, CorrelationId = HttpContext.TraceIdentifier }`. Replace the four catch blocks in each upload action with it. Keep the 503 `Retry-After` header and the `NotSupportedException` to 400 mapping, but with a fixed message such as "This file type or format is not supported."

> **Why:** ERR-01 and ERR-04 require the full exception in the log and only a generic message plus ID for the client. One helper keeps the two actions from drifting apart again.

### [ ] STEP 3 — Add the file-type validator
Create `IUploadFileValidator` and `UploadFileValidator` with `ValidateAsync(Stream, string declaredContentType)`. Check the first bytes: `%PDF-`; PNG `89 50 4E 47 0D 0A 1A 0A`; JPEG `FF D8 FF`; WEBP `RIFF....WEBP`; CSV decodes as UTF-8 or Windows-1252 text with no NUL bytes in the first 8 KB. Reject on mismatch. Register it as scoped in `Program.cs` and call it in both upload actions right after the existing size and empty checks, then rewind the stream.

> **Why:** SEC-02 says validate the MIME type and the magic bytes. The client-sent content type is attacker-controlled. Interface goes in `Application/Interfaces/` (ARCH-02).

### [ ] STEP 4 — Add the parsing timeout
Read `Upload:ParseTimeoutSeconds` (default 60) from configuration. Create a linked `CancellationTokenSource` and pass its token through bank identification and import where the interfaces accept one; where they do not, wrap with `Task.WaitAsync(timeout)`. On timeout return the generic 422 and log it.

> **Why:** SEC-02 requires a timeout around PDF parsing, because a crafted PDF can otherwise hold a request thread indefinitely.

### [ ] STEP 5 — Fix the Python PDF endpoint
In `services/ai-service/app/main.py`, reject `/parse-pdf` uploads over 10 MB with 413 (mirror `_MAX_IMAGE_BYTES`). Run the PyMuPDF extraction in `asyncio.to_thread` inside `asyncio.wait_for` with a 60 second limit, and map a timeout to the documented 502 `internal_error` style response. Replace `detail=str(e)` with the documented codes and generic text everywhere it appears, logging the real exception with `logger.exception`.

> **Why:** Same rules as the .NET side (SEC-02, and the error contract in `.claude/rules/ai-service.md`). The .NET API maps these codes, so keep the code strings exactly as documented.

### [ ] STEP 6 — Python tests
Add tests for the 413, the timeout and the sanitized detail, mocking all LLM calls (never hit a real provider).

> **Why:** `.claude/rules/ai-service.md` forbids real LLM calls in tests and asks for explicit error-path tests.

### [ ] STEP 7 — Run the gates
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
