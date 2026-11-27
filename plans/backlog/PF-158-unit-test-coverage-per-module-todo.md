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
  > Not met: later phases. After Phase 1, .NET is 51.0%.
- [ ] AI service line coverage **≥ 93%** (baseline 86.5%); `app/providers/gemini.py` and `anthropic.py` each ≥ 80%, including the `max_tokens` truncation path.
  > Not met: Phase 5. Now 86.5%.
- [ ] Frontend non-UI code (`src/lib`, `src/utils`, `src/api`) line coverage **≥ 85%** combined (baseline: 89.5% / 0% / 0%).
  > Not met: Phase 6.
- [ ] The 9 skipped `CategoryRuleService` tests run against the harness and pass; `dotnet test` reports 0 skipped.
  > Not met: Phase 4. Only 8 of the 9 skipped tests are in `CategoryRuleServiceTests`; the ninth is in `CategoryPresetServiceTests`, which STEP 14 does not mention.
- [ ] Every Supabase-backed write test asserts the request carries the caller's bearer token and sends no `user_id` (the owner comes from RLS, per CLAUDE.md "Auth").
  > Not met: later phases. The "sends no `user_id`" part needs a decision first (checklist, decision 1).
- [ ] docs/records/coverage/README.md has a **By module** section, and history.csv has one row per completed phase.
  > Not met: the By module section exists; history.csv still has one row until Phase 1 is committed (STEP 4).
- [ ] No production file changes, except fixes for bugs the tests expose. Each such fix is listed in Notes with the test that found it.
  > Not met: ticket-wide, so it stays open. It holds after Phase 1: nothing under `apps/api/src`, `apps/frontend/src` or `services/ai-service/app` changed.
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

### [!] STEP 4 — Document the harness and record the phase

> **Failure:** the harness rule and the coverage run are done, but there is no new history.csv row: the script keeps one row per commit, the baseline was recorded on this same uncommitted HEAD (`d6bd0854+dirty`) so the run replaced it, and `/execute` commits nothing. See checklist item E.

Add a "Supabase-backed services" bullet under Testing Conventions in `.claude/rules/backend.md`: use `FakePostgrest` (link it), stub every table the method touches, and assert the bearer token and the absence of `user_id` on writes. Run `npm run coverage` and commit `docs/records/coverage/` with the harness.

> **Why:** the next person to test a service will otherwise reach for Moq on `Supabase.Client` and give up, which is how these services ended up at 0%.
> **Check:** history.csv has a new row.

---

## Phase 2 — Cashflow (money paths)

For every service step below: stub only the tables the method touches; assert both the returned DTO and the recorded requests (filters, ordering, pagination per PERF-02); add one test for an empty result and one for a PostgREST error (stub status 500, then assert the exception type and that `ex.Message` doesn't leak, per ERR-01). Expected amounts are `decimal` literals worked out by hand from formulas.md, with the formula cited in a comment on the assertion.

### [ ] STEP 5 — `TransactionService` (191 uncovered lines, 31%)

Cover: paged listing (default 50, max 200, page beyond the end), the date-range and account filters, the count query (`Content-Range`), the running-balance view `TransactionWithBalance`, and the update and delete paths publishing their MediatR events (verify `IMediator.Publish` with Moq). Closes PF-036 (#44).

> **Why:** every Cashflow number reads through this service; a wrong filter silently drops transactions from totals.
> **Check:** `TransactionService.cs` ≥ 80% in `npm run coverage`.

### [ ] STEP 6 — `DashboardService` (254 lines, 3%) and `SpendingAnalysisService` (154 lines, 0%)

Cover: income, expense and net per month; category breakdown sums matching the total; savings and investment transfers excluded from spending (as scoring-rubric.md defines spending); months with no data; and multi-currency rows using `AmountIdr` only. For each, build one hand-checked fixture of about 8 transactions whose totals you compute on paper first.

> **Why:** these are the numbers on the Cashflow screen. A test that copies today's output proves nothing, so the expected values must come from the fixture worked out by hand.
> **Check:** both files ≥ 75%. Any mismatch between hand totals and the code is a stop-and-ask, not an assertion change (THINK-04).

### [ ] STEP 7 — `InsightService` (54% to ≥ 80%) and `TransactionPipelineService` (73% to ≥ 90%)

Fill the branches the current tests miss. To find them, read the lines with `hits="0"` for these files in `apps/api/TestResults/coverage/*/coverage.cobertura.xml`.

> **Why:** both are already partly tested, so these are cheap points; the pipeline is the five-stage gate every import passes.
> **Check:** targets met.

### [ ] STEP 8 — Write paths: `SupabaseCashflowMutationService` (180 lines, 26%), `CreateTransactionCommandHandler` with its validator, `DeleteAllTransactionsCommandHandler`, `StorageService`

Cover: the request body contains no `user_id`; the bearer token is the caller's; validator rules (one passing and one failing case per rule, named `Validate_{Condition}_{Result}`); delete-all scoped by RLS (it sends no owner filter of its own; assert the request has no `user_id` in the query); storage upload path and content type.

> **Why:** these are the writes. The owner-from-RLS rule is a security property; a test that pins it stops a future "helpful" `user_id` from being added.
> **Check:** each file ≥ 80%.

### [ ] STEP 9 — Parsers and external clients: `CsvTransactionParser` (0%), `NeoBankPdfParser` (6%), `JisdorFxRateService` (0%), `LlmExtractionClient` (68%), `TransactionsController` (37%)

Parsers: use the sanitized fixtures in `tests/PersonalFinance.Tests/Fixtures/` (add one sanitized NeoBank text fixture if none exists; never a real statement). JISDOR: stub its HTTP source with the existing `StubHandler` pattern and its Supabase cache with `FakePostgrest`. Controller: instantiate it with a mocked `IMediator` and services, covering each action's success path and the ERR-03 status mapping. Closes PF-035 (#43).

> **Why:** parsers are deterministic (THINK-01), so they are the easiest place for exact-value tests, and an FX rate error multiplies through every foreign-currency row.
> **Check:** each file ≥ 75%; run `npm run coverage` and commit the history row for Phase 2.

---

## Phase 3 — Journey

### [ ] STEP 10 — `JourneyScoringService` (232 lines, 37%)

The internal static scoring functions are already tested; cover the orchestration: snapshot loading from transactions, assets, liabilities and investments; each tier's indicators at the cleared (≥ 70) and mastered (100) boundaries from scoring-rubric.md (spend ratio 89% / 80%; cover 2.1 / 3 months; DTI 29.6% / 20%; savings rate 9% / 15%); DTI marked unevaluated when no debts are recorded or confirmed (FIN-04); the quest engine invoked on the same snapshot.

> **Why:** this is the product's core. The boundary tests pin the published thresholds, so a change to scoring-rubric.md must come with a test change.
> **Check:** ≥ 80%. Any threshold that differs from scoring-rubric.md is a stop-and-ask.

### [ ] STEP 11 — `GoalService` (126 lines, 0%), `BucketsService` (204 lines, 0%), `BucketCalculator` (80%), `JourneyConfirmationService` (0%), `SupabaseQuestStore` (100 lines, 0%)

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

**State (Phase 1, 2026-11-27):** STEPs 1 to 3 are done. STEP 4 is open only for the new history row, which needs a commit. This was a hand run with no independent verifier. Everything is uncommitted on `main`. I did not start a loop worktree, because a worktree starts from the last commit and `scripts/coverage-report.mjs` was not committed yet, so the ticket is still in `backlog/`.

**Known defects to confirm** (found while building the harness; no production code was changed):

- `CreateTransactionCommandHandler.cs` and `TransactionService.AddTransactionsAsync` insert a `Transaction` model straight into `transactions`. I found no caller of either in `apps/api/src`. They would fail on a real database: the request body carries `"AccountName":""`, which no migration creates as a column, and only the `pf_cashflow_mutator` role has INSERT on that table (`20261009100000_pf_s08_checked_cashflow_import.sql`). A mocked or faked test cannot catch this, because the fake accepts any body. This was read from the code and migrations, not run against a database. STEPs 5 and 8 plan to test both paths; deleting them may be the better choice.

**Decisions needed before the later phases** (the plan text is unchanged):

1. **`user_id` on writes (before Phase 2).** The fifth acceptance criterion and STEP 8 say writes send no `user_id`. That is true only for the checked cashflow functions. Other writes must send it: the column has no default or trigger, and RLS only checks the value (`WITH CHECK (user_id = auth.uid())`). `CreateTransactionCommandHandler` also sets it. Recommended wording: "no `user_id` on checked cashflow calls; on direct writes, `user_id` equals the caller's id". The new rule in `.claude/rules/backend.md` already says this.
2. **Module-row targets (before Phase 4).** STEPs 12 and 13 ask for the Assets and Investment & Desk rows to reach 75%. The rows include untested UI files, so without PF-038 their highest possible values are 38.4% and 58.0%. Recommended: apply those targets to the .NET column of the By module table.
3. **Ninth skipped test (before Phase 4).** Add `CategoryPresetServiceTests` to STEP 14, or `Skipped: 0` cannot be reached.

### A. Before you start

- ☐ You are on `main`. `git status` shows the new folder `apps/api/tests/PersonalFinance.Tests/Support/`, an edit to `.claude/rules/backend.md`, and the coverage-tracking files that were already uncommitted before this run. No Supabase, Docker or other service is needed.

### B. Read the code

- ☐ `Support/FakePostgrest.cs`: the doc-comment table of request and response shapes. Pass: you accept the warning that `Single()` must be stubbed with one object, or 406 when nothing matches.
- ☐ `Support/FakePostgrestTests.cs`: 10 tests, made up of the 2 spike tests and 8 operations (the plan's 7 plus Upsert, which the services also use). The assertions were written from requests recorded from the real SDK. The response shapes follow PostgREST's documented behavior and were not compared against a running server.
- ☐ `scripts/coverage-report.mjs`: the `MODULES` list. Pass: you agree with the first-match order (Settings, Journey, Investment & Desk, Cashflow, Assets). Patterns are the plan's, case-sensitive, so files such as `components/TransactionTable.tsx` and `api/liabilitiesApi.ts` count as Platform.
- ☐ `.claude/rules/backend.md`, "Supabase-backed services" bullet. It differs from STEP 4's wording on `user_id` (decision 1).

### C. Run the tests

- ☐ `cd apps/api && dotnet test tests/PersonalFinance.Tests --filter "FullyQualifiedName~FakePostgrestTests"`. Pass: 10 passed.
- ☐ `npm run coverage` from the repo root. Pass: exit 0; .NET 893 passed and 9 skipped; pytest 385 passed; Vitest 170 passed.

### D. Start the stack

- ☐ Not needed for Phase 1: no production code changed.

### E. Check what could not be proven here

- ☐ After committing Phase 1, run `npm run coverage`. Pass: `docs/records/coverage/history.csv` has a second row with the new commit hash, and the `d6bd0854+dirty` row is still there. That first row now stands for the baseline: compared with the original, one more .NET line is covered (4948 to 4949, Domain 32.3% to 32.6%), the headline percentages are the same, and it gained the module columns. Then commit the two coverage files and tick STEP 4.
- ☐ Open `docs/records/coverage/README.md`. Pass: By module shows six module rows plus AI service, and their covered and total lines add up to the "All three" row (8,931 of 32,251 in this run).

### F. Optional

- ☐ Point one harness test at a local Supabase and compare the real `Single()` and count responses with the table.

### G. Decide and close

- ☐ Phase 1 is accepted when C and E pass. Do not move the ticket to `done/`: Phases 2 to 6 remain, and `/loop-accept` does not apply to this hand run.
- ☐ Before Phase 2, answer decision 1 and the unused-insert question. To track Phase 2 on the board, commit first, then ask Claude to run the loop engine's `start --hand` for PF-158.
