---
id: PF-158
size: L
flags: [Ready]
sensitive: []
rework: 0
loopFailures: 0
review: none
recommended:
  model: opus
  effort: high
  estimate5h: null
  estimateWeek: null
approved:
  model: opus
  effort: high
  by: owner
  at: 2026-11-27T02:44:37Z
  at-label: 2026-11-27 10:44 Asia/Makassar
  budgetOverride: true
run:
  worktree: .worktrees/pf-158
  branch: loop/pf-158
  slot: 2
  fixRounds: 0
  segments: 0
  checkpoint: .loop/runs/PF-158/checkpoint.json
  logs: .loop/runs/PF-158/
---

# PF-158 — Unit-test coverage per module

> **GitHub Issue:** _(not created yet; supersedes #42 PF-034, #43 PF-035, #44 PF-036)_
> **Status:** To Do
> **Started:** 2026-11-27
> **Planned from branch:** main
> **Depends on:** the coverage tracking from 2026-11-27 (`npm run coverage`, docs/records/coverage/)
> **Board objective:** Every module's money and data logic gets checked by automated tests, so wrong numbers and broken saves are caught before they reach the app.

## Objective

The 2026-11-27 baseline shows unit tests run 51.0% of the .NET API, 86.5% of the AI service and 89.5% of the frontend's `src/lib`. The weakest code is the Supabase-backed services that compute dashboard, spending, bucket, goal and journey numbers: most sit at 0–37% because they take the concrete `Supabase.Client`, which Moq cannot fake. This ticket adds a fake PostgREST harness so those classes can be tested as written, then closes the gaps module by module (Cashflow, Journey, Assets, Investment and Desk, Settings), followed by the AI service and the frontend's non-UI code. React components, pages and hooks stay with PF-038.

## Acceptance Criteria

- [ ] `npm run coverage` reports .NET line coverage **≥ 75%** (baseline 51.0%), with no Application service below 60%.
  > Not met: later phases. After Phase 3, .NET is 75.5% (7,285 of 9,653 lines), but seven Application services are still below 60%.
- [ ] AI service line coverage **≥ 93%** (baseline 86.5%); `app/providers/gemini.py` and `anthropic.py` each ≥ 80%, including the `max_tokens` truncation path.
  > Not met: Phase 5. Now 86.5%.
- [ ] Frontend non-UI code (`src/lib`, `src/utils`, `src/api`) line coverage **≥ 85%** combined (baseline: 89.5% / 0% / 0%).
  > Not met: Phase 6.
- [ ] The 9 skipped `CategoryRuleService` tests run against the harness and pass; `dotnet test` reports 0 skipped.
  > Not met: Phase 4. Only 8 of the 9 skipped tests are in `CategoryRuleServiceTests`; the ninth is in `CategoryPresetServiceTests`, which STEP 14 does not mention.
- [ ] Every Supabase-backed write test asserts the request carries the caller's bearer token and sends no `user_id` (the owner comes from RLS, per CLAUDE.md "Auth").
  > Not met: later phases. The "sends no `user_id`" part applies as worded in checklist decision 1. Phase 2's write tests follow decision 1: the checked cashflow functions send no `user_id`; the direct writes (`uploaded_files`, `wallet_account_aliases`, the delete-all filter, the FX cache) carry the caller's id or, for the shared FX cache, the service-role key.
- [ ] docs/records/coverage/README.md has a **By module** section, and history.csv has one row per completed phase.
  > Not met yet: the By module section exists and Phases 1 to 3 have history rows. Phases 4 to 6 still need theirs.
- [ ] No production file changes, except fixes for bugs the tests expose. Each such fix is listed in Notes with the test that found it.
  > Not met: ticket-wide, so it stays open. Phase 2 made no bug fixes. Its only production changes are the owner-approved deletions of decision 2 (see Notes), which also changed two assembly-marker types in `Program.cs`. Phase 3's only production change is the owner-approved `BucketsService` fix, listed in Notes with its tests.
- [ ] The flaky `test_unique_artifacts_are_resumable_and_validate_dataset_identity` either passes 20 runs in a row or is fixed, with the cause in Notes.
  > Not met: Phase 5.

## Approach

Build `FakePostgrest`, an in-process Kestrel server on `127.0.0.1:0`. The real `Supabase.Client` is pointed at it; it serves canned JSON per method and table, records every request, and fails loudly (HTTP 501) on any request without a stub. This tests services exactly as they are, without the repository refactor (rejected: it rewrites ~20 untested classes before any safety net exists) and without Docker. Work then goes one module per phase: pure logic first (validators, calculators, parsers, controllers with a mocked `IMediator`), then the Supabase-backed services and handlers through the harness. Expected money values are `decimal` literals traced to formulas.md or scoring-rubric.md, never copied from what the code currently returns. Out of scope: React components, pages and hooks (PF-038), Playwright e2e, and coverage thresholds in CI.

## Affected Files

| File | Change |
|------|--------|
| `apps/api/tests/PersonalFinance.Tests/Support/FakePostgrest.cs` | Create — in-process PostgREST fake, request recorder |
| `apps/api/tests/PersonalFinance.Tests/Support/FakePostgrestTests.cs` | Create — spike proving `Supabase.Client` talks to it |
| `apps/api/tests/PersonalFinance.Tests/Support/TestCaller.cs` | Create — shared `ICurrentUser` stub |
| `apps/api/tests/PersonalFinance.Tests/Cashflow/*` | Create — Transaction, Dashboard, SpendingAnalysis, Insight, pipeline, mutation, storage, FX, parser tests |
| `apps/api/tests/PersonalFinance.Tests/Journey/*` | Create — JourneyScoring, JourneyConfirmation, QuestStore, Goal, Buckets tests |
| `apps/api/tests/PersonalFinance.Tests/Assets/*` | Create — Assets, Liabilities, Valuations, Accounts, Institutions handlers, NetWorth and Valuation services, controllers |
| `apps/api/tests/PersonalFinance.Tests/Investment/*` | Create — Investments, Holdings, PortfolioReview, MacroScenarios, Desk services and controllers |
| `apps/api/tests/PersonalFinance.Tests/Services/CategoryRuleServiceTests.cs` | Edit — un-skip the 9 tests and run them on the harness |
| `apps/api/tests/PersonalFinance.Tests/Settings/*` | Create — CategoryRules handlers and controller |
| `apps/api/tests/PersonalFinance.Tests/Platform/ExceptionMiddlewareTests.cs` | Create — ERR-01/03/04 mapping |
| `services/ai-service/tests/test_providers_gemini.py`, `test_providers_anthropic.py` | Create — provider adapters with mocked SDKs |
| `services/ai-service/tests/test_main_errors.py`, `test_llm_parser_errors.py`, `test_pdf_extractor.py` | Create — error-contract paths |
| `apps/frontend/src/lib/*.test.ts`, `src/utils/*.test.ts`, `src/api/*.test.ts` | Create — remaining pure logic and API clients with stubbed `fetch` |
| `scripts/coverage-report.mjs` | Edit — add the By module section |
| `.claude/rules/backend.md` | Edit — document the harness under Testing Conventions |

---

## TODO

## Phase 1 — Harness and module report

### [x] STEP 1 — Spike: prove `Supabase.Client` can talk to a local fake

Create `apps/api/tests/PersonalFinance.Tests/Support/FakePostgrest.cs`:

```csharp
using System.Collections.Concurrent;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Hosting.Server.Features;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;

namespace PersonalFinance.Tests.Support;

public sealed record RecordedRequest(
    string Method, string Table, string Query, string Body, IReadOnlyDictionary<string, string> Headers);

public sealed record FakeResponse(string Json, int Status = 200, string? ContentRange = null);

/// <summary>
/// In-process stand-in for PostgREST. The real Supabase.Client is pointed at it, so services are
/// tested exactly as written. Postgrest-csharp uses its own static HttpClient, so a handler stub
/// cannot be injected; a real loopback server is the only seam. Unstubbed requests return 501 so a
/// missing stub fails the test instead of silently returning an empty list.
/// </summary>
public sealed class FakePostgrest : IAsyncDisposable
{
    private readonly WebApplication _app;
    private readonly ConcurrentQueue<RecordedRequest> _requests = new();
    private readonly ConcurrentDictionary<(string Method, string Table), Func<RecordedRequest, FakeResponse>> _routes = new();

    public string Url { get; private set; } = "";
    public IReadOnlyList<RecordedRequest> Requests => _requests.ToArray();

    private FakePostgrest(WebApplication app) => _app = app;

    public static async Task<FakePostgrest> StartAsync()
    {
        var builder = WebApplication.CreateSlimBuilder();
        builder.WebHost.UseUrls("http://127.0.0.1:0");
        var app = builder.Build();
        var fake = new FakePostgrest(app);
        app.Map("/rest/v1/{**path}", fake.HandleAsync);
        await app.StartAsync();
        fake.Url = app.Services.GetRequiredService<IServer>()
            .Features.Get<IServerAddressesFeature>()!.Addresses.First();
        return fake;
    }

    /// <summary>Stub a fixed response. Table is the PostgREST path, e.g. "transactions" or "rpc/upsert_harvest_months".</summary>
    public FakePostgrest On(string method, string table, string json, int status = 200, string? contentRange = null)
        => On(method, table, _ => new FakeResponse(json, status, contentRange));

    public FakePostgrest On(string method, string table, Func<RecordedRequest, FakeResponse> respond)
    {
        _routes[(method.ToUpperInvariant(), table)] = respond;
        return this;
    }

    public IEnumerable<RecordedRequest> RequestsTo(string method, string table)
        => Requests.Where(r => r.Method == method.ToUpperInvariant() && r.Table == table);

    /// <summary>Builds a client the same way Infrastructure/Supabase/DependencyInjection.cs does.</summary>
    public async Task<global::Supabase.Client> CreateClientAsync(string accessToken = TestCaller.Token)
    {
        var client = new global::Supabase.Client(Url, "anon-key", new global::Supabase.SupabaseOptions
        {
            AutoRefreshToken = false,
            AutoConnectRealtime = false,
            Headers = new Dictionary<string, string> { ["Authorization"] = $"Bearer {accessToken}" },
        });
        await client.InitializeAsync();
        return client;
    }

    private async Task HandleAsync(HttpContext ctx)
    {
        using var reader = new StreamReader(ctx.Request.Body);
        var body = await reader.ReadToEndAsync();
        var path = (string?)ctx.Request.RouteValues["path"] ?? "";
        var segments = path.Split('/');
        var table = segments[0] == "rpc" && segments.Length > 1 ? $"rpc/{segments[1]}" : segments[0];
        var recorded = new RecordedRequest(
            ctx.Request.Method, table, ctx.Request.QueryString.Value ?? "", body,
            ctx.Request.Headers.ToDictionary(h => h.Key, h => h.Value.ToString(), StringComparer.OrdinalIgnoreCase));
        _requests.Enqueue(recorded);

        var response = _routes.TryGetValue((recorded.Method, table), out var respond)
            ? respond(recorded)
            : new FakeResponse($"{{\"message\":\"FakePostgrest: no stub for {recorded.Method} {table}\"}}", 501);

        ctx.Response.StatusCode = response.Status;
        ctx.Response.ContentType = "application/json";
        if (response.ContentRange is not null) ctx.Response.Headers["Content-Range"] = response.ContentRange;
        await ctx.Response.WriteAsync(response.Json);
    }

    public async ValueTask DisposeAsync() => await _app.DisposeAsync();
}
```

Create `Support/TestCaller.cs`:

```csharp
using PersonalFinance.Application.Interfaces;

namespace PersonalFinance.Tests.Support;

public sealed class TestCaller : ICurrentUser
{
    public const string Token = "verified-user-token"; // commit-skill:allow (made-up test value)
    // Implement ICurrentUser's members with fixed values: a fixed user id (Guid) and AccessToken => Token.
    // Copy the member list from Application/Interfaces/ICurrentUser.cs; do not add members it does not declare.
}
```

Create `Support/FakePostgrestTests.cs` with two tests:
- `Get_StubbedTable_ReturnsModelsAndSendsCallerToken`: stub `GET transactions` with one row, call `client.From<Transaction>().Get()`, then assert one model came back and the request's `Authorization` is `Bearer verified-user-token`.
- `Get_UnstubbedTable_Throws`: call any table without a stub and assert a `PostgrestException` (or whatever the SDK throws on 501).

```bash
cd apps/api && dotnet test tests/PersonalFinance.Tests --filter "FullyQualifiedName~FakePostgrestTests"
```

> **Why:** Every later phase depends on this seam. If `InitializeAsync` reaches GoTrue, or the SDK rejects a loopback URL, it surfaces here in an hour rather than mid-phase. Fallback if Kestrel binding fails: WireMock.Net (one new test-only package).
> **Check:** both tests pass. If either fails for a reason that is not a typo, stop (see "Stop and ask if").

---

### [x] STEP 2 — Learn the response shapes the services need

For `.Get()`, `.Single()`, `.Count(...)`, `.Insert(...)`, `.Update()`, `.Delete()` and `.Rpc(...)`, write one harness test each, recording what the SDK sends (the `Prefer` header, the query string) and what it needs back (body shape; `Content-Range` such as `0-0/42` for counts). Put the findings in a doc comment at the top of `FakePostgrest.cs` as a table.

> **Why:** PostgREST returns arrays for inserts and updates, and counts through `Content-Range`. Getting these wrong produces tests that pass against a fake no real server matches.
> **Check:** seven passing tests; the shapes table is in the file.

---

### [x] STEP 3 — Add the By module section to the coverage report

In `scripts/coverage-report.mjs`, add a `MODULES` map from path patterns to module names, and use it for a "By module" table (one row per module, with .NET, Python and frontend lines summed):

| Module | .NET patterns (substring of file path) | Frontend patterns |
|---|---|---|
| Cashflow | `Transaction`, `Dashboard`, `SpendingAnalysis`, `Insight`, `Cashflow`, `Parsers/`, `Storage`, `JisdorFx`, `LlmExtraction`, `Pipeline` | `transaction`, `importPreview`, `keywordExtractor`, `chat` |
| Journey | `Journey`, `Quest`, `Harvest`, `Goal`, `Bucket`, `Foundation` | `journey`, `goals` |
| Assets | `Asset`, `Liabilit`, `Valuation`, `Account`, `Institution`, `NetWorth` | `accounts`, `assets`, `netWorth` |
| Investment & Desk | `Investment`, `Holding`, `Portfolio`, `Desk`, `MacroScenario`, `Archetype` | `desk`, `macroScenario`, `investment`, `archetypes` |
| Settings | `CategoryRule`, `Categoriz` | `categoryRules` |
| Platform | anything else | anything else |

The whole AI service counts as its own module row, "AI service". Add a matching `cashflow_line … platform_line` column per module to history.csv, keeping old rows readable (missing values stay blank).

```bash
npm run coverage -- --no-run
```

> **Why:** you asked for coverage per module, and the layer view can't show "Journey went from 40% to 80%". The map lives in one constant so adding a module is a one-line change.
> **Check:** the README shows six module rows plus the AI service, and the lines covered add up to the same total as the "All three" row.

---

### [x] STEP 4 — Document the harness and record the phase

Add a "Supabase-backed services" bullet under Testing Conventions in `.claude/rules/backend.md`: use `FakePostgrest` (link it), stub every table the method touches, and assert the bearer token and the absence of `user_id` on writes. Run `npm run coverage` and commit `docs/records/coverage/` with the harness.

> **Why:** the next person to test a service will otherwise reach for Moq on `Supabase.Client` and give up, which is how these services ended up at 0%.
> **Check:** history.csv has a new row.

---

## Phase 2 — Cashflow (money paths)

For every service step below: stub only the tables the method touches; assert both the returned DTO and the recorded requests (filters, ordering, pagination per PERF-02); add one test for an empty result and one for a PostgREST error (stub status 500, then assert the exception type and that `ex.Message` doesn't leak, per ERR-01). Expected amounts are `decimal` literals worked out by hand from formulas.md, with the formula cited in a comment on the assertion.

### [x] STEP 5 — `TransactionService` (191 uncovered lines, 31%)

Cover: paged listing (default 50, max 200, page beyond the end), the date-range and account filters, the count query (`Content-Range`), the running-balance view `TransactionWithBalance`, and the update and delete paths publishing their MediatR events (verify `IMediator.Publish` with Moq). Closes PF-036 (#44).

> **Why:** every Cashflow number reads through this service; a wrong filter silently drops transactions from totals.
> **Check:** `TransactionService.cs` ≥ 80% in `npm run coverage`.

### [!] STEP 6 — `DashboardService` (254 lines, 3%) and `SpendingAnalysisService` (154 lines, 0%)

> **Failure:** coverage is met (99.6% and 100%), but 7 tests' hand-computed totals disagree with the code, so the step stops here (THINK-04). The failing tests are left in place; see Notes, "Phase 2 mismatches".

Cover: income, expense and net per month; category breakdown sums matching the total; savings and investment transfers excluded from spending (as scoring-rubric.md defines spending); months with no data; and multi-currency rows using `AmountIdr` only. For each, build one hand-checked fixture of about 8 transactions whose totals you compute on paper first.

> **Why:** these are the numbers on the Cashflow screen. A test that copies today's output proves nothing, so the expected values must come from the fixture worked out by hand.
> **Check:** both files ≥ 75%. Any mismatch between hand totals and the code is a stop-and-ask, not an assertion change (THINK-04).

### [x] STEP 7 — `InsightService` (54% to ≥ 80%) and `TransactionPipelineService` (73% to ≥ 90%)

Fill the branches the current tests miss. To find them, read the lines with `hits="0"` for these files in `apps/api/TestResults/coverage/*/coverage.cobertura.xml`.

> **Why:** both are already partly tested, so these are cheap points; the pipeline is the five-stage gate every import passes.
> **Check:** targets met.

### [x] STEP 8 — Write paths: `SupabaseCashflowMutationService` (180 lines, 26%), `CreateTransactionCommandHandler` with its validator, `DeleteAllTransactionsCommandHandler`, `StorageService`

Cover: the request body contains no `user_id`; the bearer token is the caller's; validator rules (one passing and one failing case per rule, named `Validate_{Condition}_{Result}`); delete-all scoped by RLS (it sends no owner filter of its own; assert the request has no `user_id` in the query); storage upload path and content type.

> **Why:** these are the writes. The owner-from-RLS rule is a security property; a test that pins it stops a future "helpful" `user_id` from being added.
> **Check:** each file ≥ 80%.

### [!] STEP 9 — Parsers and external clients: `CsvTransactionParser` (0%), `NeoBankPdfParser` (6%), `JisdorFxRateService` (0%), `LlmExtractionClient` (68%), `TransactionsController` (37%)

> **Failure:** 3 tests fail on production defects that need a code fix (not made): `CsvTransactionParser` throws on every row, so it reaches only 63.4%; `JisdorFxRateService` reads the rate 100 times too high under the `id-ID` culture; `NeoBankPdfParser` corrupts a description when the balance text ends with the amount text. The other files are at 95.5% to 100%. The history row is the orchestrator's.

Parsers: use the sanitized fixtures in `tests/PersonalFinance.Tests/Fixtures/` (add one sanitized NeoBank text fixture if none exists; never a real statement). JISDOR: stub its HTTP source with the existing `StubHandler` pattern and its Supabase cache with `FakePostgrest`. Controller: instantiate it with a mocked `IMediator` and services, covering each action's success path and the ERR-03 status mapping. Closes PF-035 (#43).

> **Why:** parsers are deterministic (THINK-01), so they are the easiest place for exact-value tests, and an FX rate error multiplies through every foreign-currency row.
> **Check:** each file ≥ 75%; run `npm run coverage` and commit the history row for Phase 2.

---

## Phase 3 — Journey

### [x] STEP 10 — `JourneyScoringService` (232 lines, 37%)

> The check passes (89.4%), and `JourneyScoringServiceTests` now asserts that each of the four Cleared values scores exactly 70. The service reads no investments table, so there is no investment loading to test.

The internal static scoring functions are already tested; cover the orchestration: snapshot loading from transactions, assets, liabilities and investments; each tier's indicators at the cleared (≥ 70) and mastered (100) boundaries from scoring-rubric.md (spend ratio 89% / 80%; cover 2.1 / 3 months; DTI 29.6% / 20%; savings rate 9% / 15%); DTI marked unevaluated when no debts are recorded or confirmed (FIN-04); the quest engine invoked on the same snapshot.

> **Why:** this is the product's core. The boundary tests pin the published thresholds, so a change to scoring-rubric.md must come with a test change.
> **Check:** ≥ 80%. Any threshold that differs from scoring-rubric.md is a stop-and-ask.

### [x] STEP 11 — `GoalService` (126 lines, 0%), `BucketsService` (204 lines, 0%), `BucketCalculator` (80%), `JourneyConfirmationService` (0%), `SupabaseQuestStore` (100 lines, 0%)

> Coverage is met (`BucketCalculator` 99.2%, `BucketsService` 97.5%, `GoalService`, `SupabaseQuestStore` and `JourneyConfirmationService` 100%). The tests found defects in `BucketsService`, fixed with the owner's approval on 2026-11-28 (Notes, "Phase 3 mismatches"). The Phase 3 history row (`b9663466`) is committed.

Quest store: completions are append-only; assert it never issues a DELETE or a PATCH on `quest_completions` (CLAUDE.md "Quests"). Buckets and goals: filtered reads by kind and status, the progress arithmetic against hand-computed fixtures.

> **Why:** the quest store's append-only rule is an invariant with no other guard.
> **Check:** each ≥ 75%; commit the Phase 3 history row.

---

## Phase 4 — Assets, Investment & Desk, Settings, Platform

### [ ] STEP 12 — Assets: handlers for Assets, Liabilities, Valuations, Accounts, Institutions; `NetWorthService`; `ValuationService`; their controllers

Each Create, Update and Delete handler: validator called, the write request shape, `AssetUpdatedEvent` published (it triggers recalculation, per CLAUDE.md), and not-found mapping to `KeyNotFoundException`. Net worth: assets minus liabilities from a hand-computed fixture. Controllers: one test per action with a mocked `IMediator`.

> **Why:** a missed `AssetUpdatedEvent` means the pyramid silently stops updating after an asset edit.
> **Check:** the Assets module row ≥ 75%.

### [ ] STEP 13 — Investment & Desk: Investments, Holdings and MacroScenarios handlers; `RunPortfolioReviewCommandHandler`; `PortfolioReviewClient`; `DeskService`; `DeskMandateService`; `DeskMappers`; `SaveMandateDraftCommandValidator`; their controllers

Portfolio review: AI service call stubbed with `StubHandler`; the disclosure (FIN-05) present on the result. Desk: gate rules that are not implemented must return `unresolved / notImplemented`, never `pass` (FIN-04); add a test that pins this for each of the seven PF-133 rules.

> **Why:** the FIN-04 test is what keeps a future refactor from turning an unchecked rule green.
> **Check:** the Investment & Desk module row ≥ 75%.

### [ ] STEP 14 — Settings: un-skip `CategoryRuleServiceTests`; CategoryRules handlers and controller

Remove `Skip = ...` from the 9 tests and rewrite their arrange steps on `FakePostgrest`. Keep their names and assertions; if an assertion must change, add a `// Reason:` comment (THINK-04). Add one test that categorization loads the rules once per batch, not once per row (PERF-01): assert exactly one GET to `category_rules`. Closes PF-034 (#42) for handlers and validators.

Also bring `StatementImportService` (38.5% on 2026-11-28) to at least 60%. No other step targets it, and the first acceptance criterion needs every Application service at 60% or more. (Added 2026-11-28 with the owner's agreement.)

> **Why:** these tests were written and then parked for want of exactly this harness.
> **Check:** `dotnet test` reports `Skipped: 0`.

### [ ] STEP 15 — Platform: `ExceptionMiddlewareExtensions` (43%)

One test per row of the ERR-03 mapping (`ValidationException` 400, `KeyNotFoundException` 404, `NotSupportedException` 400, `InvalidDataException` 422, others 500), each asserting the body has a correlation ID and no `ex.Message` (ERR-01), and that `LogError` was called (ERR-04). Use `WebApplicationFactory` or a `DefaultHttpContext`, whichever the existing `Controllers/` tests already use.

> **Why:** the error contract is a security rule; it is currently half tested.
> **Check:** ≥ 90%; run `npm run coverage` and commit the Phase 4 row. .NET overall should now read ≥ 75%.

---

## Phase 5 — AI service

### [ ] STEP 16 — Provider adapters: `gemini.py` (16%), `anthropic.py` (14%), `factory.py`, `openai_embedding.py`

Mock `google.genai` and `anthropic.AsyncAnthropic` with the canonical pattern in `.claude/rules/ai-service.md`. Cover: structured output requested (Gemini `response_mime_type`, Anthropic forced `tool_use` with `tool_choice`), `temperature=0.0`, `stop_reason == "max_tokens"` raising `response_truncated` (non-retriable), malformed output raising `llm_parse_error`, rate-limit exhaustion raising `llm_rate_limited`, and token usage logged. Never a real call.

> **Why:** these adapters enforce the extraction rules in ai-service.md; nothing tests them today, so a refactor could drop `tool_choice` unnoticed.
> **Check:** `python -m pytest --cov` shows both ≥ 80%.

### [ ] STEP 17 — Error contract: `main.py` (83 statements missed), `llm_parser.py`, `pdf_extractor.py`, leftovers

Use FastAPI's `TestClient`. One test per row of the Error Handling Contract table in ai-service.md (413 `file_too_large`, 422 `pdf_unreadable`, 502 codes, 400 `input_flagged`, the `/ask/stream` `output_flagged` event), each asserting `detail` is the code, not `str(e)`. Then close the small gaps in `similarity.py`, `config.py`, `mcp_server.py` and others if each takes under 15 minutes; skip any that need a live service, and say so in Notes.

> **Why:** the .NET side maps these exact codes to user messages; a changed code shows up as a generic 500 in the app.
> **Check:** AI service ≥ 93%.

### [ ] STEP 18 — Flaky eval test

Run `python -m pytest tests/test_eval_categorize.py -k resumable --count 20` (install `pytest-repeat` only for this check, without adding it to the project) or loop it 20 times in the shell. If it fails, find the cause (shared temp directory, clock, ordering) and fix the test or the code under THINK-04.

> **Why:** it failed once on 2026-11-27 and passed on the next run; a flaky test trains everyone to ignore red CI.
> **Check:** 20 passes in a row; commit the Phase 5 history row.

---

## Phase 6 — Frontend non-UI code

### [ ] STEP 19 — `src/lib` leftovers: `format.ts` (0%), `macroScenario/comparison.ts` (0%), `desk/deskFormat.ts` (56%), `accounts.ts` (77%), `desk/deskCalculations.ts`, `macroScenario/stakeholders.ts`

Put each test next to its file as `name.test.ts`. Money formatting: Indonesian separators (`1.000.000,50`), negative amounts, and values passed as strings or integer minor units (FIN-01). Skip `focus-mode.tsx`; it is React and belongs to PF-038.

> **Why:** `format.ts` renders every amount in the app and has no test.
> **Check:** `src/lib` ≥ 95% in the By module report.

### [ ] STEP 20 — `src/utils`: `transactionParser.ts`, `assetsCsv.ts`, `keywordExtractor.ts`, `journeyLabels.ts`

Parsers: fixture strings with edge rows (quoted commas, blank lines, Indonesian decimals, a bad date). Labels: one test per tier and state.

> **Why:** these parse user files in the browser before anything reaches the API; a dropped row is silent.
> **Check:** `src/utils` ≥ 85%.

### [ ] STEP 21 — `src/api` clients with a stubbed `fetch`

Use `vi.stubGlobal("fetch", vi.fn())`. For `authenticatedFetch.ts`: the bearer header is attached, a 401 triggers the existing sign-out or refresh path, and the base URL comes from `VITE_API_URL`. For each `*Api.ts`: the URL, the method and the body for each function, and that non-2xx responses throw. Group the small clients into one test file if they share no logic.

> **Why:** these are the contract with the .NET API; the known `id: string` vs `number` mismatch (CLAUDE.md Gotchas) is the kind of drift such tests surface. Record it in Notes rather than fixing it here.
> **Check:** `src/api` ≥ 80%; non-UI frontend combined ≥ 85%. Run `npm run coverage`, commit the final history row, and confirm every acceptance criterion.

---

## Notes

- **Why a real loopback server:** Postgrest-csharp sends through its own static `HttpClient`, so the `StubHandler` trick used for `SupabaseHarvestLedger` (which takes an `HttpClient`) cannot reach `Supabase.Client`. STEP 1 proves the loopback route works before anything depends on it.
- **The harness is not an integration test.** It checks the requests we send and how we handle responses; it does not check RLS policies or SQL. The real-database harness for RLS remains a separate need (see the pf-s08 scripts in `scripts/`).
- **DTO and entity lines** (`DashboardDto`, `DeskDtos`, `Domain/Entities/Desk/*`) are auto-properties; they get covered through the service tests and need no tests of their own.
- **`src/data/mockTransactions.ts`** (247 lines) is fixture data. If nothing in production imports it, exclude it from coverage in `vitest.config.ts` and say so; otherwise leave it.
- **Old tickets:** when done, close #42 (PF-034), #43 (PF-035) and #44 (PF-036) as superseded by PF-158. #45 (PF-037, controller integration) is partly covered by the controller tests here; leave it open for `WebApplicationFactory` end-to-end auth tests.
- **Bugs found:** list each production fix here with the test that exposed it.
  - Phase 2 fixed none. The defects it found are listed under "Phase 2 mismatches" and "Phase 2 defects" below, each with its test.
  - Phase 3 fixed `BucketsService`; each fix and its test are under "Phase 3 mismatches".
- **Phase 2 deletions (owner decision 2).** A second search (all of the worktree except `bin`, `obj` and `node_modules`: production code, tests, DI registration, interface use, `Send(...)` calls, frontend and AI service) found no caller of `CreateTransactionCommand` (no `Send`, no endpoint, no test) or of `ITransactionService.AddTransactionsAsync` (no call in `src`, no Moq setup in `tests`). The only references were `Program.cs`, which used `CreateTransactionCommandHandler` and `CreateTransactionCommandValidator` as assembly markers, and documents. Deleted: `Application/Commands/CreateTransactionCommand.cs`, `Application/Commands/CreateTransactionCommandHandler.cs`, `Application/Validation/CreateTransactionCommandValidator.cs`, `AddTransactionsAsync` (interface and implementation), and the private `TransactionService.MapToEntity`, which only `AddTransactionsAsync` used. `Program.cs` now uses `RecalculateJourneyCommandHandler` and `CreateAccountCommandValidator` as markers for the same Application assembly, so the same handlers and validators are registered. `.claude/skills/add-endpoint/SKILL.md` now points at `CreateAssetCommandValidator.cs`. No tests existed for the deleted code, so none were removed. Kept, because something else uses them: `TransactionCreatedEvent` and `JourneyRecalcOnTransactionHandler` (used by `JourneyRecalcOwnerTests`); nothing publishes the event any more. Still stale: the AddTransactionsAsync references in `docs/architecture/sequences/*.html` and in the backlog plan `PF-130-submit-transactions-command-handler-todo.md`.
- **Phase 2 deviation from STEP 8's wording.** `DeleteAllTransactionsCommandHandler` does send an owner filter (`user_id=eq.<caller>&id=gt.0`) on both deletes. The test pins the caller's id, following owner decision 1, instead of asserting no `user_id`. The handler has no caller either (no `Send` of `DeleteAllTransactionsCommand`; `DELETE /reset` uses `rpc/reset_cashflow`), and the migrations revoke direct DELETE on `transactions` from `authenticated`, so it would fail on a real database. It was tested, not deleted, because decision 2 does not cover it.
- **Phase 2 mismatches (hand totals against code; tests left failing, THINK-04):**
  - `DashboardServiceTests.GetDashboardDataAsync_InvestmentTransfer_IsNotCountedAsSpending` and `..._TopCategories_ExcludeTransfersAndSumToSpending`: an `Investment` expense (the rubric's savings outflow, and the pipeline's default category) is counted as spending in the monthly cash flow and the top categories, because `CashflowSectionMapping`'s Investing list (Stock, Mutual Fund, ...) does not include it. The summary and current-month `Expenses` count every Expense row, including the code's own Investing categories, so they never match the monthly figures or the rubric; top-category percentages divide by that larger total and do not add up to 100. The rubric's set {Investment, Savings Transfer, Investasi, Tabungan} and the code's Investing list do not overlap at all.
  - `DashboardServiceTests.GetCashflowStatementAsync_Monthly_OutflowsAreNegativeInInvestingFinancingAndGrandTotal`: a stock purchase and a loan repayment appear as positive cash flow, so the grand total adds them instead of subtracting (+1,000,000 instead of −1,000,000 in the fixture).
  - `DashboardServiceTests.GetDashboardDataAsync_LateEveningRowOnLastDay_CountsInItsStatementMonth`: the SDK converts `timestamptz` values to the host's local time and drops the kind (verified: `2026-03-31T20:00:00+00:00` reads back as `2026-04-01T04:00:00`, kind Unspecified, on this UTC+8 host). A row stored at 23:30Z on 31 March lands in April. It passes on a UTC host (CI, containers) and fails on this machine, which is where `npm start` runs the API. On UTC+8, any row stored at 16:00Z or later moves to the next day.
  - `SpendingAnalysisServiceTests.GetSafeToSpendAsync_InvestmentAlreadyMadeThisMonth_IsNotAlsoCountedAsSpent`: this month's investment is subtracted twice, once as the savings goal and once as already spent.
  - `SpendingAnalysisServiceTests.GetSafeToSpendAsync_RecurringInvestment_CountsAsSavingsGoalNotCommittedBill`: a recurring investment debit is also counted as a committed bill (1,352,667 instead of 186,000).
  - `SpendingAnalysisServiceTests.GetVarianceExplainerAsync_InvestmentPurchases_AreNotSpendingDrivers`: investment purchases count as spending in the variance explainer.
- **Phase 2 defects (need a production fix; tests left failing):**
  - `StatementParserTests.CsvTransactionParser_ExportFormat_ParsesEveryColumnExactly`: `record["Amount (IDR)"]` on CsvHelper's dynamic record throws `RuntimeBinderException` for every row. The parser is registered in `Program.cs` but is not in the `IStatementImportService` parser map, so nothing reaches it in production.
  - `JisdorFxRateServiceTests.GetRateToIdrAsync_IndonesianCulture_ParsesBankIndonesiaRateExactly`: `decimal.Parse` uses the current culture, so under `id-ID` the rate "16450.00" becomes 1,645,000. This host runs `en-US`, so it is latent here. The same method also fails if BI sends the rate as a JSON number.
  - `StatementParserTests.NeoBankPdfParser_CreditWhoseAmountEndsTheBalance_KeepsDescriptionClean`: the description ends at `LastIndexOf(amount)`, which finds the amount inside the balance ("1.100.000,00" ends with "100.000,00"), giving "Refund Tokopedia 100.000,00 1.". Amounts are unaffected.
- **Phase 2 observations (no test fails):**
  - `GetTransactionPageAsync`'s count query is a plain `Get()`: it downloads every matching row with no `Range`, and the SDK sends `Prefer: count=estimated`, so above PostgREST's exact-count threshold the page total can be an estimate.
  - `NeoBankPdfParser` marks the statement's WIB clock time as UTC, which is what feeds the late-evening case above.
  - `LlmExtractionClient` carries `amount_idr`, `exchange_rate` and `statement_balance` as `double` before casting to `decimal` (FIN-01).
  - `RegisterFileHashAsync` and `UpsertAliasAsync` have no production caller and insert directly into tables whose DML the migrations revoke. `UploadPreviewNEW` stores under the literal user "default-user", and the migrations drop the storage policies. Both were tested as written.
  - `SpendingAnalysisService`'s −500,000 "warning" band has no cited source (FIN-02). The tests only assert "danger" far below it and "not ok" at zero.
  - Services propagate `PostgrestException` unchanged. The "`ex.Message` doesn't leak" check therefore belongs to the exception middleware (STEP 15); the controller tests assert fixed bodies for the checked-function failures.
  - `FakePostgrest` now also serves `/storage/v1/*` (keyed as `storage/<path>`), so `StorageService` runs on the harness.

- **Orchestrator review of Phase 2 (2026-11-27).** A separate `dotnet test` run gave the same result: 1,098 passed, 9 skipped, and the same 10 tests failed. Per-file coverage matches (.NET 51.0% to 67.7%). Facts to use when fixing the findings:
  - The saving and investing category lists disagree: `JourneyScoringRules.SavingsCategories`, the Investing section of `CashflowSectionMapping` (dashboard, safe-to-spend, variance and buckets use it) and the two lists in `InsightService`. The first two share no names.
  - Presets apply automatically when no user rule matches (`CategoryRuleService`, layer 2b). Investment keywords give `Investment`. `TABUNGAN`, `AUTODEBET`, `AUTO DEBET`, `CICILAN` and `ANGSURAN` give `Saving` (migration `20260510000003`), which neither of the first two lists includes, although the scoring rubric says only `Investment` comes from a preset. `CICILAN` and `ANGSURAN` mean loan installments, so move them before treating `Saving` as saving.
  - Safe-to-spend: in the failing "already invested" test, this month's investment equals the usual amount (1,000,000). Only dropping investments from "already spent" would pass that test, but would overstate the result whenever the month's investment is larger: with 3,000,000 invested it would leave 8,564,000 for the month instead of 6,564,000. Set aside the larger of the two amounts, and add a test for that case.
  - The time-zone shift also reaches Journey: `JourneyScoringRules.MonthTotal` groups rows read the same way by `t.Date.Month`. No Phase 2 test covers this.
- **Phase 3 mismatches (2026-11-28).** All were in `BucketsService`, with the tests in `Journey/BucketsServiceTests.cs`. The tests were left failing until the owner approved the fixes the same day (see "Fixes" below the list). Each item describes the behaviour before the fix.
  1. `Read_TransactionDateRange_CoversTheWholeLastDay` (`close` and `current`): the upper bound is `date=lte.<day>T00:00:00` on a `timestamptz` column. Month close drops last-day rows that carry a clock time. The current view sends `+08:00` on this host, so it also drops today's date-only rows (stored at 00:00Z, after the bound of 16:00Z the day before).
  2. `GetMonthCloseAsync_LateEveningRowOnLastDay_StaysInItsStatementMonth`: dates are not passed through `StatementDate.FromSdk`, the Phase 2 fix, so on UTC+8 a 20:00Z row moves to the next month (free spent 9,200,000 instead of 8,200,000). It passes on a UTC host.
  3. `GetMonthCloseAsync_RefundInASpendingCategory_IsNotCountedAsSpending`: the biggest-driver sum includes every row in a category, whatever its type, so a 6,000,000 refund makes Shopping the driver instead of Food.
  4. `GetMonthCloseAsync_CommittedBillRises_IsNotNamedAsTheFreeOverspendDriver`: committed items are not left out of the driver, so a rent rise names "Bill" as the cause of a free overspend that rent is not part of. The expected value rests on reading the build plan's "cause-attached" shortfall rule as meaning a cause within free spending; the owner should confirm it.
  5. `GetMonthCloseAsync_Transfers_NameTheSourceAccount`: `Transaction.AccountName` is never filled. `transactions` stores only `account_id` (since migration `20260518000001`) and the service does not read `accounts`, so each transfer's source and each committed item's source are blank. The build plan (Ticket 3) asks for date, from, to and amount.
  - **Fixes (all in `BucketsService.cs`):** (1) both reads use an exclusive end at UTC midnight (next month, or tomorrow); (2) dates pass through `StatementDate.FromSdk`; (3 and 4) free spending has one definition, `IsFreeSpend`, used by both totals and by both sides of the driver comparison, also pinned by `GetMonthCloseAsync_OneOffBillBesideACommittedOne_DriverCountsOnlyTheFreePart`; (5) account names are read from `accounts` for the owner, also pinned by `GetBucketsAsync_CommittedItem_NamesItsSourceAccount`.
  - **A related fix made with them:** `Last7DayFreeSpend` summed eight calendar days while `BucketsCard.tsx` divides it by 7. Fixing mismatch 1 would have brought today back into the sum on UTC+8, so the window is now today and the six days before it (`GetBucketsAsync_LastSevenDays_CoversTodayAndTheSixDaysBefore`).
- **Phase 3 observations (seen in the code, no test):**
  - `BucketsService` still takes today from the host clock (`DateTime.Today`), not the registered `AppTimeProvider` (Asia/Jakarta). On a UTC host, between 00:00 and 07:00 in Jakarta it treats the previous day as today.
  - `BucketsCard.tsx` shows a green check on month close even for "Some commitments were missed". With no commitments, `AllCommittedPaid` is true and the streak is 0, so it reads "Everything committed was paid. 0 months running." This conflicts with FIN-04. React component tests are not set up (PF-038).
  - The committed streak cannot exceed 4, because only four months are read.
  - `SpendingAnalysisService` and `InsightService` also pass today at midnight as an inclusive end date, so they likely share mismatch 1. `DashboardService` ends at 23:59:59.
  - `GoalService.EarmarkedInAccountsAsync` and `ContributionsForAsync` read without paging. `supabase/config.toml` sets `max_rows = 1000`, so their totals would be cut short beyond 1,000 rows.

## Execution Notes

### Phase 1 — Harness and module report

Model: **Sonnet 5.5** · Effort: **high**. Test infrastructure with a spike; nothing touches production code.

```
/execute plans/in-progress/PF-158-unit-test-coverage-per-module-todo.md phase 1
```

### Phase 2 — Cashflow

Model: **Opus 5.5** · Effort: **high**. Hand-computed money totals: a wrong expected value passes silently.
Before you start: Phase 1 committed and the harness tests green.

```
/execute plans/in-progress/PF-158-unit-test-coverage-per-module-todo.md phase 2
```

### Phase 3 — Journey

Model: **Opus 5.5** · Effort: **high**. Pins the published scoring thresholds and the FIN-04 unevaluated state.

```
/execute plans/in-progress/PF-158-unit-test-coverage-per-module-todo.md phase 3
```

### Phase 4 — Assets, Investment & Desk, Settings, Platform

Model: **Sonnet 5.5** · Effort: **high**. Mostly handler and controller patterns; the FIN-04 gate-rule tests are the only judgment calls.

```
/execute plans/in-progress/PF-158-unit-test-coverage-per-module-todo.md phase 4
```

### Phase 5 — AI service

Model: **Sonnet 5.5** · Effort: **medium**. Mocked SDKs against a documented error contract.

```
/execute plans/in-progress/PF-158-unit-test-coverage-per-module-todo.md phase 5
```

### Phase 6 — Frontend non-UI code

Model: **Sonnet 5.5** · Effort: **medium**. Pure functions and stubbed fetch.

```
/execute plans/in-progress/PF-158-unit-test-coverage-per-module-todo.md phase 6
```

### Stop and ask if

- STEP 1 fails: `Supabase.Client` cannot be pointed at the loopback fake. The approach changes, so the owner decides between WireMock.Net and the repository refactor.
- A hand-computed money total, or a scoring threshold, disagrees with what the code returns. That is a possible product bug, and the owner decides whether the code or the rubric is wrong.

---

## ✅ Owner Review Checklist (G3)

**State (Phase 1, 2026-11-27):** STEPs 1 to 4 are done. Phase 1 is committed on `main` as `e8c18753`, and its history row is recorded. This was a hand run with no independent verifier. The owner asked for Phases 2 to 6 to run one subagent at a time on branch `loop/pf-158`.

**State (Phase 2, 2026-11-27):** STEPs 5, 7 and 8 are done; STEPs 6 and 9 are marked `[!]`. Their coverage is met except `CsvTransactionParser` (63.4%), but 10 tests fail on purpose: 7 money mismatches and 3 production defects (Notes). `dotnet test`: 1,098 passed, 10 failed, 9 skipped. .NET coverage rose from 51.0% to 67.7%. The work is uncommitted in `.worktrees/pf-158`; the orchestrator records the history row. No independent verifier has run.

**State (Phase 3, 2026-11-28):** STEPs 10 and 11 are done. `dotnet test`: 1,185 passed, 0 failed, 9 skipped. `npm run coverage` exits 0, with .NET at 75.5%. Phase 3 is committed as `b9663466` and merged into `main` with the Phase 2 commits, at the owner's request and before the live checks in D and E. On the merged `main`, the .NET, pytest and Vitest suites, the lockfile check, lint, both type checks and the frontend build passed. Phase 3's only production change is `BucketsService.cs`. The fixes have not been checked against a real database or in the browser. This was a hand run with no independent verifier. The Phase 2 state above predates commit `7e21fc34`, whose message says it fixed six bugs, removed the unused `CsvTransactionParser` and left no failing tests. The STEP 6 and STEP 9 `[!]` marks and the Phase 2 Notes have not been updated.

**Known defects to confirm (Phase 3).** The `BucketsService` defects the tests found are fixed (Notes, "Phase 3 mismatches"). Still open, none with a test:

- `apps/frontend/src/components/buckets/BucketsCard.tsx` shows a green check whether or not commitments were paid, including when there are none (FIN-04). A .NET test cannot reach it, and React component tests are not set up.
- `SpendingAnalysisService.cs` and `InsightService.cs` likely share the end-date gap. No test reads the query they send.
- `BucketsService.cs` takes today from the host clock, not Asia/Jakarta. Its tests use the same host clock, so they cannot show this.

**Known defects to confirm** (found while building the harness; no production code was changed):

- `CreateTransactionCommandHandler.cs` and `TransactionService.AddTransactionsAsync` insert a `Transaction` model straight into `transactions`. I found no caller of either in `apps/api/src`. They would fail on a real database: the request body carries `"AccountName":""`, which no migration creates as a column, and only the `pf_cashflow_mutator` role has INSERT on that table (`20261009100000_pf_s08_checked_cashflow_import.sql`). A mocked or faked test cannot catch this, because the fake accepts any body. This was read from the code and migrations, not run against a database. STEPs 5 and 8 plan to test both paths; deleting them may be the better choice.
  - Resolved in Phase 2: deleted under decision 2 (Notes, "Phase 2 deletions").

- Found after the Phase 1 commit, and fixed: `npm run coverage` failed when started from a lower-case drive letter (`c:\`). Vite could not load `harvestStyles.test.ts`, so 4 tests did not run and no history row was written. `scripts/coverage-report.mjs` now upper-cases the drive letter. Running that test directly with Vitest from such a terminal still fails.
- Not fixed: when a Vitest test fails, no frontend coverage file is written, so `coverage-report.mjs` stops without recording, even though it first says coverage "is still recorded".

**Known defects to confirm (Phase 2).** Each has a failing test; none can be caught by the fake alone, because they are wrong arithmetic or parsing, not wrong requests. Decide for each whether the code or the documented rule is wrong:

_Update (Phase 3 session): the `7e21fc34` commit message reports these fixed. The list is kept as the record of what Phase 2 found._

- `Application/Services/DashboardService.cs`: Investment-category spending, summary expenses that include investing, top-category percentages, and positive investing and financing outflows in the cash-flow statement (4 tests).
- `Application/Services/SpendingAnalysisService.cs`: investments subtracted twice in safe-to-spend, and counted as spending in the variance explainer (3 tests).
- Host time zone: `timestamptz` values read back in local time, so on this UTC+8 machine late-evening rows move to the next day (1 test, passes on UTC hosts).
- `Infrastructure/Services/JisdorFxRateService.cs`: culture-dependent `decimal.Parse` (1 test).
- `Infrastructure/Parsers/CsvTransactionParser.cs`: throws on every row; also unused (1 test).
- `Infrastructure/Parsers/NeoBankPdfParser.cs`: description cut at the wrong place (1 test).

**Decisions for the later phases.** The owner approved these in chat on 2026-11-27, and Phases 2 to 6 follow them. The plan text above is unchanged.

1. **`user_id` on writes.** The fifth acceptance criterion and STEP 8 say writes send no `user_id`. That applies to the checked cashflow functions only. On direct PostgREST writes, `user_id` equals the caller's id, because the column has no default or trigger and RLS only checks the value.
2. **Module-row targets.** STEPs 12 and 13 apply their 75% targets to the .NET column of the By module table. With untested UI files included, the combined rows can reach at most 38.4% (Assets) and 58.0% (Investment & Desk).
3. **Ninth skipped test.** STEP 14 also covers the skipped test in `CategoryPresetServiceTests`.
4. **Unused insert paths.** Phase 2 deletes them, and anything only they use, if a second search finds no caller. It does not write tests for them.

### A. Before you start

- ☐ Phase 1 is on `main`: `e8c18753`, followed by the coverage-script fix and the history-row commit. No Supabase, Docker or other service is needed.
- ☐ Phase 2: check out `loop/pf-158` with the Phase 2 commit. No service is needed.
- ☐ Phase 3: check out `main` (.NET 10 SDK). Pass: `git show --stat b9663466` lists `BucketsService.cs` and four test files.

### B. Read the code

- ☐ `Support/FakePostgrest.cs`: the doc-comment table of request and response shapes. Pass: you accept the warning that `Single()` must be stubbed with one object, or 406 when nothing matches.
- ☐ `Support/FakePostgrestTests.cs`: 10 tests, made up of the 2 spike tests and 8 operations (the plan's 7 plus Upsert, which the services also use). The assertions were written from requests recorded from the real SDK. The response shapes follow PostgREST's documented behavior and were not compared against a running server.
- ☐ `scripts/coverage-report.mjs`: the `MODULES` list. Pass: you agree with the first-match order (Settings, Journey, Investment & Desk, Cashflow, Assets). Patterns are the plan's, case-sensitive, so files such as `components/TransactionTable.tsx` and `api/liabilitiesApi.ts` count as Platform.
- ☐ `.claude/rules/backend.md`, "Supabase-backed services" bullet. It differs from STEP 4's wording on `user_id` (decision 1).
- ☐ Phase 2: the fixture tables in the doc comments of `Cashflow/DashboardServiceTests.cs` (`QuarterFixture`, `StatementRows`) and `Cashflow/SpendingAnalysisServiceTests.cs` (`BaseFixture`, `VarianceFixture`). Pass: you recompute each total from the table and get the asserted value.
- ☐ Phase 2: the deletions in `git show --stat 7e21fc34` (including the three create-transaction files, plus edits to `ITransactionService.cs`, `TransactionService.cs`, `Program.cs`). Pass: `Program.cs` only swaps the two marker types, and `rg "CreateTransactionCommand|AddTransactionsAsync" apps` finds nothing.
- ☐ Phase 3: `Journey/BucketsServiceTests.cs`, the month-close fixture table. Pass: you recompute from the table a free budget of 7,200,000, free spending of 8,200,000, an overspend of 1,000,000, 1,500,000 invested, and Food as the biggest driver.
- ☐ Phase 3: `Journey/JourneyServicesTests.cs`, earmarked total. Pass: 2,000,000.50 - 500,000.25 + 1,000,000 = 2,500,000.25, with the closed goal left out.
- ☐ Phase 3: `Services/JourneyScoringServiceTests.cs`, "Cleared bars". Pass: the four values match scoring-rubric.md, and each expects exactly 70.
- ☐ Phase 3: `git show b9663466 -- apps/api/src`. Pass: only `BucketsService.cs` changed, and you accept that the seven-day total is today plus the six days before it.
- ☐ Phase 3: `Journey/JourneyServicesTests.cs`, quest store tests. Pass: you accept that `InsertCompletionsAsync` sends no DELETE or PATCH, and that `MarkSeenAsync` does PATCH `quest_completions`, changing `seen_at` only. That is narrower than STEP 11's "never issues a DELETE or a PATCH".
- ☐ Phase 3: `Journey/JourneyScoringOrchestratorTests.cs`, with `Commands/RecalculateJourneyCommandHandlerTests.cs` for the quest engine. Pass: DTI is `no_data` with no debts recorded or confirmed, and the engine receives the same snapshot instance that scoring returned.

### C. Run the tests

- ☐ `cd apps/api && dotnet test tests/PersonalFinance.Tests --filter "FullyQualifiedName~FakePostgrestTests"`. Pass: 10 passed.
- ☐ `npm run coverage` from the repo root. Pass: exit 0; .NET 893 passed and 9 skipped; pytest 385 passed; Vitest 170 passed.
- ☐ Phase 3: `cd apps/api && dotnet build PersonalFinance.slnx && dotnet test --no-build`. Pass: 1,185 passed, 0 failed, 9 skipped. Build first: `--no-build` alone runs old binaries. This replaces the Phase 2 expected counts. The tests were run on a UTC+8 host only; CI covers UTC.
- ☐ Phase 3: `cd apps/api && dotnet test tests/PersonalFinance.Tests --filter "FullyQualifiedName~Journey.BucketsServiceTests"`. Pass: 18 passed.
- ☐ Phase 3: `npm run coverage` from the repo root (it rewrites `docs/records/coverage/`). Pass: exit 0, .NET 75.5%, and `BucketsService.cs` at 97.5%.

### D. Start the stack

- ☐ Not needed for Phase 1: no production code changed.
- ☐ Phase 2: optional. Start with `npm start` and open `/cashflow`; the app should load as before, since the deleted paths had no endpoint.
- ☐ Phase 3: run `npm start` from the main checkout and open Buckets. Pass: the card loads with no error.

### E. Check what could not be proven here

- ☐ Open `docs/records/coverage/history.csv`. Pass: it has the `d6bd0854+dirty` row and the `e8c18753` row. The first row now stands for the baseline: compared with the original, one more .NET line is covered (4948 to 4949, Domain 32.3% to 32.6%), the headline percentages are the same, and it gained the module columns.
- ☐ Open `docs/records/coverage/README.md`. Pass: By module shows six module rows plus AI service, and their covered and total lines add up to the "All three" row (8,931 of 32,251 in this run).
- ☐ Phase 2: with a Cashflow screen open on real data that includes an `Investment` row, compare the dashboard's monthly expense with the Journey spending indicator. Pass: you decide which definition the dashboard should use.
- ☐ Phase 2: the PostgREST shapes for `Prefer: count=estimated` and for `timestamptz` output were read from the SDK, not from a running server. Optional: confirm both against local Supabase.
- ☐ Phase 3: on that stack, add an expense dated today. Pass: free spending includes it.
- ☐ Phase 3: open the committed list, and month close when it is shown. Pass: each row with a linked account shows the account's name.
- ☐ Phase 3, optional: the Buckets writes are proven with a mock. Change the future plan amount in Buckets and reload. Pass: the new amount is still shown.

### F. Optional

- ☐ Point one harness test at a local Supabase and compare the real `Single()` and count responses with the table.

### G. Decide and close

- ☐ Phase 1 is accepted when C and E pass. Do not move the ticket to `done/`: Phases 2 to 6 remain, and `/loop-accept` does not apply to this hand run.
- ☐ Phase 2 is accepted when you have confirmed the `7e21fc34` fixes settle each defect above the way you want.
- ☐ Decide whether to take the three open items above as follow-ups.
- ☐ Phase 3 is accepted when C, D and E pass and you have reviewed the fix and the new tests.
- ☐ Commit, history row and merge are done. The ticket stays in `in-progress` because Phases 4 to 6 remain.
- ☐ Phases 1 to 3 are on `main`. After Phase 6, review the later commits on `loop/pf-158` before merging.

## Loop Notes
- 2026-11-27 12:01 Asia/Makassar Phase 2 committed (7e21fc34): 1,107 passed, 0 failed, 9 skipped; .NET 67.8%; 6 bugs fixed; starting Phase 3
- 2026-11-27 16:55 Asia/Makassar Phase 3 done: Journey orchestration + GoalService + BucketsService + JourneyConfirmationService + SupabaseQuestStore covered. Gaps: STEP 11's 75% check not met (GoalService 36.5%, SupabaseQuestStore 41.0%, BucketsService 59.3%); STEP 10's Cleared values not asserted; Phase 3 history row not recorded; uncommitted.
- 2026-11-28 11:43 Asia/Makassar Phase 3 follow-up: coverage targets met for all STEP 10 and 11 files (.NET 75.4%); STEP 11 now [!] because 6 new tests fail on 5 BucketsService defects (no production code changed); history row recorded with dotnet flagged failing; uncommitted.
- 2026-11-28 11:53 Asia/Makassar Phase 3 BucketsService defects fixed with owner approval (plus the 7-day window): 1,185 passed, 0 failed, 9 skipped; .NET 75.5%; STEP 11 ticked; uncommitted; not checked against a real database or in the browser.
- 2026-11-28 12:32 Asia/Makassar Phase 3 committed (b9663466) and merged into main with Phase 2 at the owner's request: 1,185 passed, 0 failed, 9 skipped; .NET 75.5%; history row recorded. Live Buckets checks not done.
