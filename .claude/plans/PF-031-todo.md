# PF-031 — Extract dashboard aggregation from controller to service

> **GitHub Issue:** [#39](https://github.com/rikky-hermanto/personal-finance/issues/39)
> **Status:** Ready
> **Started:** —

## Objective

`TransactionsController.GetDashboardData()` contains ~70 lines of inline aggregation (year/month filtering, income/expense sums, MoM change percentages, top categories, 6-month cash flow). `SubmitTransactions()` contains an inline loop that calls `_categoryRuleService.GetAllAsync()` once per DTO — another N+1. Both violate ARCH-04 (controller body > 15 lines). Moving the logic to dedicated services makes it independently unit-testable and keeps controllers as thin routing/delegation layers.

## Acceptance Criteria

- [ ] `IDashboardService` interface created in `Application/Interfaces/`
- [ ] `DashboardService` implementation in `Application/Services/`
- [ ] `GetDashboardDataAsync(string? wallet, int? year, int? month)` contains all aggregation logic currently in the controller
- [ ] Inline category-rule creation loop extracted from `SubmitTransactions` into a dedicated service method
- [ ] Controller action bodies are ≤ 15 lines each
- [ ] DI registration added in `Program.cs`
- [ ] `dotnet build` succeeds
- [ ] `dotnet test` passes
- [ ] API responses identical to current behavior (no breaking changes to JSON shape)

## Approach

Create `IDashboardService` / `DashboardService` in the Application layer. Move the entire `GetDashboardData` aggregation block verbatim — don't refactor it yet, just relocate it. The controller action collapses to 3 lines. For `SubmitTransactions`, add `EnsureCategoryRulesAsync(List<TransactionDto>)` to `ICategoryRuleService` that loads all rules once then creates missing ones — fixing the embedded N+1 at the same time.

Out of scope: changing the response JSON shape, adding tests (PF-034/036 cover those), rewriting the aggregation logic itself.

## Affected Files

| File | Change |
|------|--------|
| `src/PersonalFinance.Application/Interfaces/IDashboardService.cs` | Create — new interface |
| `src/PersonalFinance.Application/Services/DashboardService.cs` | Create — moves aggregation from controller |
| `src/PersonalFinance.Application/Interfaces/ICategoryRuleService.cs` | Add `EnsureCategoryRulesAsync` signature |
| `src/PersonalFinance.Application/Services/CategoryRuleService.cs` | Implement `EnsureCategoryRulesAsync` |
| `src/PersonalFinance.Api/Controllers/TransactionsController.cs` | Slim down `GetDashboardData` and `SubmitTransactions` |
| `src/PersonalFinance.Api/Program.cs` | Register `DashboardService` in DI |

---

## TODO

### [ ] STEP 1 — Create `IDashboardService`

Create `src/PersonalFinance.Application/Interfaces/IDashboardService.cs`:

```csharp
using PersonalFinance.Application.Dtos;

namespace PersonalFinance.Application.Interfaces;

public interface IDashboardService
{
    Task<DashboardDto> GetDashboardDataAsync(string? wallet, int? year, int? month);
}
```

Then create `src/PersonalFinance.Application/Dtos/DashboardDto.cs` to replace the anonymous object currently returned by the controller:

```csharp
namespace PersonalFinance.Application.Dtos;

public record DashboardSummaryDto(
    decimal TotalIncome,
    decimal TotalExpenses,
    decimal NetWorth,
    int TransactionCount);

public record DashboardCurrentMonthDto(
    string Month,
    decimal Income,
    decimal Expenses,
    decimal Net,
    decimal IncomeChangePercent,
    decimal ExpenseChangePercent,
    decimal NetChangePercent);

public record DashboardTopCategoryDto(
    string Category,
    decimal Amount,
    decimal Percentage);

public record DashboardCashFlowDto(
    string Month,
    decimal Income,
    decimal Expenses,
    decimal Net);

public record DashboardDto(
    DashboardSummaryDto Summary,
    DashboardCurrentMonthDto CurrentMonth,
    List<DashboardTopCategoryDto> TopCategories,
    List<DashboardCashFlowDto> CashFlow,
    DateTime LastUpdated);
```

> **Why typed DTOs instead of the existing anonymous objects:** Anonymous objects can't be serialized predictably across AOT or reflection-free contexts, and they can't be unit-tested as return values. Typed records make the service independently testable. The JSON field names remain identical because `record` properties serialize to camelCase by default in ASP.NET Core.

---

### [ ] STEP 2 — Create `DashboardService`

Create `src/PersonalFinance.Application/Services/DashboardService.cs`. Move the aggregation block verbatim from the controller, replacing the anonymous types with the DTOs from Step 1:

```csharp
using PersonalFinance.Application.Dtos;
using PersonalFinance.Application.Interfaces;
using Microsoft.Extensions.Logging;

namespace PersonalFinance.Application.Services;

public class DashboardService : IDashboardService
{
    private readonly ITransactionService _transactionService;
    private readonly ILogger<DashboardService> _logger;

    public DashboardService(ITransactionService transactionService, ILogger<DashboardService> logger)
    {
        _transactionService = transactionService;
        _logger = logger;
    }

    public async Task<DashboardDto> GetDashboardDataAsync(string? wallet, int? year, int? month)
    {
        _logger.LogDebug("Building dashboard data for wallet={Wallet} year={Year} month={Month}", wallet, year, month);

        var currentYear = year ?? DateTime.Now.Year;
        var currentMonth = month ?? DateTime.Now.Month;

        var allTransactions = await _transactionService.GetTransactionsWithBalanceAsync(wallet);
        var yearTransactions = allTransactions.Where(t => t.Date.Year == currentYear).ToList();
        var monthTransactions = yearTransactions.Where(t => t.Date.Month == currentMonth).ToList();

        var totalIncome = yearTransactions.Where(t => t.Type == "Income").Sum(t => t.AmountIdr);
        var totalExpenses = yearTransactions.Where(t => t.Type == "Expense").Sum(t => t.AmountIdr);

        var monthIncome = monthTransactions.Where(t => t.Type == "Income").Sum(t => t.AmountIdr);
        var monthExpenses = monthTransactions.Where(t => t.Type == "Expense").Sum(t => t.AmountIdr);
        var monthNet = monthIncome - monthExpenses;

        var prevMonth = currentMonth == 1 ? 12 : currentMonth - 1;
        var prevYear = currentMonth == 1 ? currentYear - 1 : currentYear;
        var prevMonthTransactions = allTransactions.Where(t => t.Date.Year == prevYear && t.Date.Month == prevMonth).ToList();
        var prevMonthIncome = prevMonthTransactions.Where(t => t.Type == "Income").Sum(t => t.AmountIdr);
        var prevMonthExpenses = prevMonthTransactions.Where(t => t.Type == "Expense").Sum(t => t.AmountIdr);
        var prevMonthNet = prevMonthIncome - prevMonthExpenses;

        var incomeChange = prevMonthIncome != 0 ? ((monthIncome - prevMonthIncome) / prevMonthIncome) * 100 : 0;
        var expenseChange = prevMonthExpenses != 0 ? ((monthExpenses - prevMonthExpenses) / prevMonthExpenses) * 100 : 0;
        var netChange = prevMonthNet != 0 ? ((monthNet - prevMonthNet) / Math.Abs(prevMonthNet)) * 100 : 0;

        var topCategories = monthTransactions
            .Where(t => t.Type == "Expense" && !string.IsNullOrEmpty(t.Category))
            .GroupBy(t => t.Category)
            .Select(g => new DashboardTopCategoryDto(
                g.Key,
                g.Sum(t => t.AmountIdr),
                totalExpenses != 0 ? Math.Round(g.Sum(t => t.AmountIdr) / totalExpenses * 100, 1) : 0))
            .OrderByDescending(x => x.Amount)
            .Take(5)
            .ToList();

        var cashFlow = Enumerable.Range(0, 6)
            .Select(i => DateTime.Now.AddMonths(-i))
            .OrderBy(d => d)
            .Select(targetDate =>
            {
                var monthly = allTransactions.Where(t => t.Date.Year == targetDate.Year && t.Date.Month == targetDate.Month).ToList();
                var inc = monthly.Where(t => t.Type == "Income").Sum(t => t.AmountIdr);
                var exp = monthly.Where(t => t.Type == "Expense").Sum(t => t.AmountIdr);
                return new DashboardCashFlowDto(targetDate.ToString("MMM yy"), inc, exp, inc - exp);
            })
            .ToList();

        return new DashboardDto(
            new DashboardSummaryDto(totalIncome, totalExpenses, totalIncome - totalExpenses, yearTransactions.Count),
            new DashboardCurrentMonthDto(
                DateTime.Now.ToString("MMMM yyyy"),
                monthIncome, monthExpenses, monthNet,
                Math.Round(incomeChange, 1), Math.Round(expenseChange, 1), Math.Round(netChange, 1)),
            topCategories,
            cashFlow,
            DateTime.Now);
    }
}
```

> **Why move verbatim first:** The goal of this ticket is relocation, not rewrite. Moving logic first means any behavior difference is a regression, not intentional. Refactoring the aggregation logic itself (e.g., pushing filtering into the DB layer) is future work that belongs in a separate ticket.

---

### [ ] STEP 3 — Add `EnsureCategoryRulesAsync` to `ICategoryRuleService`

The inline loop in `SubmitTransactions` calls `GetAllAsync()` once per DTO — another N+1. Add a method that handles the full "check + create if missing" pattern in one operation.

In `src/PersonalFinance.Application/Interfaces/ICategoryRuleService.cs`, add:

```csharp
Task EnsureCategoryRulesAsync(List<TransactionDto> transactions);
```

---

### [ ] STEP 4 — Implement `EnsureCategoryRulesAsync` in `CategoryRuleService`

In `src/PersonalFinance.Application/Services/CategoryRuleService.cs`, add:

```csharp
public async Task EnsureCategoryRulesAsync(List<TransactionDto> transactions)
{
    var existingRules = await GetAllAsync(); // single query

    foreach (var dto in transactions)
    {
        if (string.IsNullOrWhiteSpace(dto.Category)) continue;

        var alreadyExists = existingRules.Any(r =>
            r.Category == dto.Category &&
            r.Type == dto.Type);

        if (!alreadyExists && dto.CategoryRuleDto is not null)
        {
            var created = await AddAsync(dto.CategoryRuleDto);
            existingRules.Add(created); // keep local list in sync to avoid duplicates within the same batch
        }
    }
}
```

> **Why add to `existingRules` list locally:** Without updating the in-memory list, a batch with two transactions in the same new category would create duplicate rules (the second tx would not find the first newly created rule on its `Any()` check). This keeps the batch idempotent without extra DB reads.

---

### [ ] STEP 5 — Slim down the controller

In `src/PersonalFinance.Api/Controllers/TransactionsController.cs`:

1. Inject `IDashboardService` (add to constructor, remove `ICategoryRuleService` if it's now only used for `EnsureCategoryRulesAsync` — keep it if still needed for category CRUD via controller).
2. Replace `GetDashboardData` body with:

```csharp
[HttpGet("aggregated")]
public async Task<IActionResult> GetDashboardData(
    [FromQuery] string? wallet, [FromQuery] int? year, [FromQuery] int? month)
{
    var data = await _dashboardService.GetDashboardDataAsync(wallet, year, month);
    return Ok(data);
}
```

3. Replace the inline loop in `SubmitTransactions` with:

```csharp
await _categoryRuleService.EnsureCategoryRulesAsync(transactions);
```

> **Why keep `ICategoryRuleService` on the controller:** The `CategoryRulesController` (if it exists) handles CRUD, but `SubmitTransactions` still needs `EnsureCategoryRulesAsync`. Check if `ICategoryRuleService` is used elsewhere in `TransactionsController` before removing it from the constructor.

---

### [ ] STEP 6 — Register `DashboardService` in DI

In `src/PersonalFinance.Api/Program.cs`, add alongside the other service registrations:

```csharp
builder.Services.AddScoped<IDashboardService, DashboardService>();
```

> **Why `AddScoped`:** Consistent with all other services in this project. The service holds no shared state — it's safe to instantiate per request.

---

### [ ] STEP 7 — Build and verify

```bash
cd apps/api && dotnet build PersonalFinance.slnx
cd apps/api && dotnet test
```

Then manually verify the dashboard API returns the same shape:

```bash
curl http://localhost:7208/api/transactions/aggregated
```

> **What to check:** JSON keys are identical to before (`Summary`, `CurrentMonth`, `TopCategories`, `CashFlow`, `LastUpdated`). The typed DTOs serialize to camelCase in ASP.NET Core by default — confirm field names match what the frontend expects.

---

## Notes

- The `DashboardDto` records serialize to camelCase by default in ASP.NET Core (`JsonNamingPolicy.CamelCase`). The frontend currently reads `Summary.TotalIncome` etc. — confirm the frontend uses camelCase access already (it should, since ASP.NET Core defaults to it).
- The `SubmitTransactions` no-op DTO remapping loop (lines after the category rule creation) maps `TransactionDto` to `TransactionDto` with identical fields — it can be removed entirely. Add that as a micro-cleanup in Step 5.
- If `ICategoryRuleService` ends up unused in `TransactionsController` after both changes, remove it from the constructor to keep DI lean.
- After completing this ticket, `TransactionsController` should have every action under 15 lines — verify manually before closing.
