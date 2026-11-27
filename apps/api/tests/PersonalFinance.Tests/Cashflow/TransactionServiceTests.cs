using System.Text.Json;
using MediatR;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using PersonalFinance.Application.Dtos;
using PersonalFinance.Tests.Support;
using Supabase.Postgrest.Exceptions;
using static PersonalFinance.Tests.Cashflow.CashflowRows;

namespace PersonalFinance.Tests.Cashflow;

/// <summary>
/// TransactionService on the FakePostgrest harness. Every read must be scoped to the caller
/// (user_id = TestCaller.Id) and page through PostgREST's 1,000-row cap, or rows silently drop
/// out of the totals built on top of it.
/// </summary>
public sealed class TransactionServiceTests
{
    private static readonly Guid AccountA = Guid.Parse("aaaaaaaa-0000-0000-0000-000000000001");
    private static readonly Guid AccountB = Guid.Parse("bbbbbbbb-0000-0000-0000-000000000002");
    private static readonly string Owner = $"user_id=eq.{TestCaller.Id}";

    private static async Task<(FakePostgrest Fake, TransactionService Service)> StartAsync()
    {
        var fake = await FakePostgrest.StartAsync();
        var client = await fake.CreateClientAsync();
        return (fake, new TransactionService(client, Mock.Of<IMediator>(), NullLogger<TransactionService>.Instance, new TestCaller()));
    }

    private static TransactionDto Incoming(DateTime date, decimal amount, string description, decimal? statementBalance = null) => new()
    {
        Date = date, AmountIdr = amount, Description = description, Flow = "DB", Type = "Expense",
        AccountId = AccountA, StatementBalance = statementBalance,
    };

    // ── IdentifyDuplicatesAsync / FilterOutDuplicatesAsync ────────────────────

    [Fact]
    public async Task IdentifyDuplicatesAsync_ExistingRowMatches_TagsOnlyThatRowAndScopesQueryToCaller()
    {
        // Arrange
        var (fake, service) = await StartAsync();
        await using var _ = fake;
        fake.On("GET", "transactions", Json(
            Tx(7, new DateTime(2026, 3, 10), "Expense", "Food", 50_000m, "GOFOOD  Warung", accountId: AccountA)));
        var incoming = new List<TransactionDto>
        {
            Incoming(new DateTime(2026, 3, 10, 0, 0, 0, DateTimeKind.Utc), 50_000m, "gofood warung"),
            Incoming(new DateTime(2026, 3, 12, 0, 0, 0, DateTimeKind.Utc), 75_000m, "GRAB"),
        };

        // Act
        var tagged = await service.IdentifyDuplicatesAsync(incoming);

        // Assert
        Assert.Equal([true, false], tagged.Select(t => t.IsDuplicate));
        var request = Assert.Single(fake.Requests);
        var query = Query(request);
        Assert.Contains(Owner, query);
        Assert.Contains("date=gte.2026-03-09T00:00:00.0000000Z", query); // earliest incoming date minus one day
        Assert.Contains("date=lte.2026-03-13T00:00:00.0000000Z", query); // latest incoming date plus one day
        Assert.Contains("order=date.desc.nullsfirst,id.desc.nullsfirst", query);
        Assert.Equal("0-999", request.Headers["Range"]);
    }

    [Fact]
    public async Task IdentifyDuplicatesAsync_StatementBalanceDiffers_IsNotDuplicate()
    {
        // Arrange: same date, amount and description, but the bank's running balance differs, so
        // these are two real transactions (e.g. two identical coffees in one day).
        var (fake, service) = await StartAsync();
        await using var _ = fake;
        fake.On("GET", "transactions", Json(
            Tx(7, new DateTime(2026, 3, 10), "Expense", "Food", 50_000m, "KOPI", accountId: AccountA, statementBalance: 950_000m)));

        // Act
        var tagged = await service.IdentifyDuplicatesAsync(
            [Incoming(new DateTime(2026, 3, 10, 0, 0, 0, DateTimeKind.Utc), 50_000m, "KOPI", statementBalance: 900_000m)]);

        // Assert
        Assert.False(Assert.Single(tagged).IsDuplicate);
    }

    [Fact]
    public async Task IdentifyDuplicatesAsync_FullFirstPage_FetchesNextPageBeforeTagging()
    {
        // Arrange: PostgREST caps a response at 1,000 rows; the match sits on the second page.
        var (fake, service) = await StartAsync();
        await using var _ = fake;
        var firstPage = Enumerable.Range(1, 1000)
            .Select(i => Tx(i, new DateTime(2026, 3, 10), "Expense", "Food", 1_000m + i, $"FILLER {i}", accountId: AccountA));
        var secondPage = new[] { Tx(2001, new DateTime(2026, 3, 10), "Expense", "Food", 50_000m, "KOPI", accountId: AccountA) };
        fake.On("GET", "transactions", r => new FakeResponse(r.Headers["Range"] == "0-999" ? Json(firstPage) : Json(secondPage)));

        // Act
        var tagged = await service.IdentifyDuplicatesAsync(
            [Incoming(new DateTime(2026, 3, 10, 0, 0, 0, DateTimeKind.Utc), 50_000m, "KOPI")]);

        // Assert
        Assert.True(Assert.Single(tagged).IsDuplicate);
        Assert.Equal(["0-999", "1000-1999"], fake.Requests.Select(r => r.Headers["Range"]));
    }

    [Fact]
    public async Task IdentifyDuplicatesAsync_EmptyInput_ReturnsEmptyWithoutQuerying()
    {
        // Arrange
        var (fake, service) = await StartAsync();
        await using var _ = fake;

        // Act
        var tagged = await service.IdentifyDuplicatesAsync([]);

        // Assert
        Assert.Empty(tagged);
        Assert.Empty(fake.Requests);
    }

    [Fact]
    public async Task FilterOutDuplicatesAsync_DuplicateInSameBatch_KeepsFirstOnly()
    {
        // Arrange: nothing stored yet; the file itself repeats a row.
        var (fake, service) = await StartAsync();
        await using var _ = fake;
        fake.On("GET", "transactions", "[]");
        var date = new DateTime(2026, 3, 10, 0, 0, 0, DateTimeKind.Utc);

        // Act
        var kept = await service.FilterOutDuplicatesAsync(
            [Incoming(date, 20_000m, "PARKIR"), Incoming(date, 20_000m, "PARKIR"), Incoming(date, 30_000m, "TOL")]);

        // Assert
        Assert.Equal(["PARKIR", "TOL"], kept.Select(t => t.Description));
    }

    [Fact]
    public async Task IdentifyDuplicatesAsync_PostgrestError_ThrowsSdkException()
    {
        // Arrange
        var (fake, service) = await StartAsync();
        await using var _ = fake;
        fake.On("GET", "transactions", ServerError, 500);

        // Act
        var exception = await Assert.ThrowsAsync<PostgrestException>(() =>
            service.IdentifyDuplicatesAsync([Incoming(DateTime.UtcNow, 1m, "x")]));

        // Assert: the service adds nothing; the exception middleware turns it into a generic 500.
        Assert.Equal(500, exception.StatusCode);
    }

    // ── GetTransactionsWithBalanceAsync ───────────────────────────────────────

    [Fact]
    public async Task GetTransactionsWithBalanceAsync_AllFilters_SendsEachFilterAndMapsAccountNames()
    {
        // Arrange
        var (fake, service) = await StartAsync();
        await using var _ = fake;
        fake.On("GET", "transactions", Json(
            Tx(3, new DateTime(2026, 3, 10), "Expense", "Food", 45_000.50m, "GOFOOD", accountId: AccountA),
            Tx(2, new DateTime(2026, 3, 9), "Expense", "Food", 12_000m, "KOPI", accountId: null)));
        fake.On("GET", "accounts", Json(Account(AccountA, "BCA Utama"), Account(AccountB, "Jago")));

        // Act
        var rows = await service.GetTransactionsWithBalanceAsync(AccountA, "gof", "Food", "Expense");

        // Assert
        Assert.Equal(2, rows.Count);
        Assert.Equal("BCA Utama", rows[0].AccountName);
        Assert.Equal(45_000.50m, rows[0].AmountIdr);
        Assert.Equal("", rows[1].AccountName);
        Assert.All(rows, r => Assert.Equal(0m, r.Balance));
        var query = Query(Assert.Single(fake.RequestsTo("GET", "transactions")));
        Assert.Contains(Owner, query);
        Assert.Contains($"account_id=eq.{AccountA}", query);
        Assert.Contains("category=eq.Food", query);
        Assert.Contains("type=eq.Expense", query);
        Assert.Contains("description=ilike.*gof*", query);
        Assert.Contains(Owner, Query(Assert.Single(fake.RequestsTo("GET", "accounts"))));
    }

    [Fact]
    public async Task GetTransactionsWithBalanceAsync_NoFilters_SendsOnlyOwnerFilter()
    {
        // Arrange
        var (fake, service) = await StartAsync();
        await using var _ = fake;
        fake.On("GET", "transactions", "[]");
        fake.On("GET", "accounts", "[]");

        // Act
        var rows = await service.GetTransactionsWithBalanceAsync();

        // Assert
        Assert.Empty(rows);
        var query = Query(Assert.Single(fake.RequestsTo("GET", "transactions")));
        Assert.DoesNotContain("account_id=", query);
        Assert.DoesNotContain("category=", query);
        Assert.DoesNotContain("type=", query);
        Assert.DoesNotContain("description=", query);
    }

    // ── GetTransactionByIdAsync ───────────────────────────────────────────────

    [Fact]
    public async Task GetTransactionByIdAsync_Found_ReturnsDtoWithAmount()
    {
        // Arrange
        var (fake, service) = await StartAsync();
        await using var _ = fake;
        fake.On("GET", "transactions", JsonSerializer.Serialize(
            Tx(42, new DateTime(2026, 3, 10), "Income", "Salary", 9_500_000m, "PAYROLL", currency: "IDR")));

        // Act
        var dto = await service.GetTransactionByIdAsync(42);

        // Assert
        Assert.NotNull(dto);
        Assert.Equal(42, dto.Id);
        Assert.Equal(9_500_000m, dto.AmountIdr);
        Assert.Equal("CR", dto.Flow);
        var query = Query(Assert.Single(fake.Requests));
        Assert.Contains(Owner, query);
        Assert.Contains("id=eq.42", query);
    }

    [Fact]
    public async Task GetTransactionByIdAsync_NoRow_ReturnsNull()
    {
        // Arrange
        var (fake, service) = await StartAsync();
        await using var _ = fake;
        fake.On("GET", "transactions", """{"code":"PGRST116","message":"no rows"}""", 406);

        // Act
        var dto = await service.GetTransactionByIdAsync(404);

        // Assert
        Assert.Null(dto);
    }

    // ── GetTransactionPageAsync ───────────────────────────────────────────────

    [Fact]
    public async Task GetTransactionPageAsync_SecondPage_ReadsTotalAndPagesTheBalanceView()
    {
        // Arrange: 120 matching rows, page 2 of 50 is rows 50..99.
        var (fake, service) = await StartAsync();
        await using var _ = fake;
        fake.On("GET", "transactions", "[]", contentRange: "0-0/120");
        fake.On("GET", "v_transactions_with_balance", Json(
            Tx(70, new DateTime(2026, 3, 10), "Expense", "Food", 45_000m, "GOFOOD", accountId: AccountA, runningBalance: 1_955_000m),
            Tx(69, new DateTime(2026, 3, 9), "Income", "Salary", 2_000_000m, "PAYROLL", accountId: AccountA, runningBalance: 2_000_000m)));
        fake.On("GET", "accounts", Json(Account(AccountA, "BCA Utama")));

        // Act
        var page = await service.GetTransactionPageAsync(2, 50, AccountA, "o", "Food", "Expense");

        // Assert
        Assert.Equal(120, page.Total);
        Assert.Equal(2, page.Page);
        Assert.Equal(50, page.PageSize);
        Assert.Equal([1_955_000m, 2_000_000m], page.Items.Select(i => i.Balance));
        Assert.All(page.Items, i => Assert.Equal("BCA Utama", i.AccountName));

        var count = Query(Assert.Single(fake.RequestsTo("GET", "transactions")));
        var view = Assert.Single(fake.RequestsTo("GET", "v_transactions_with_balance"));
        foreach (var query in new[] { count, Query(view) })
        {
            Assert.Contains(Owner, query);
            Assert.Contains($"account_id=eq.{AccountA}", query);
            Assert.Contains("category=eq.Food", query);
            Assert.Contains("type=eq.Expense", query);
            Assert.Contains("description=ilike.*o*", query);
        }
        Assert.Equal("50-99", view.Headers["Range"]);
        Assert.Contains("order=date.desc.nullsfirst,id.desc.nullsfirst", Query(view));
    }

    [Fact]
    public async Task GetTransactionPageAsync_AscendingSort_OrdersOldestFirst()
    {
        // Arrange
        var (fake, service) = await StartAsync();
        await using var _ = fake;
        fake.On("GET", "transactions", "[]", contentRange: "0-0/1");
        fake.On("GET", "v_transactions_with_balance", Json(
            Tx(1, new DateTime(2026, 1, 5), "Income", "Salary", 1_000m, runningBalance: 1_000m)));
        fake.On("GET", "accounts", "[]");

        // Act
        var page = await service.GetTransactionPageAsync(1, 50, sortOrder: "asc");

        // Assert
        Assert.Single(page.Items);
        var view = Assert.Single(fake.RequestsTo("GET", "v_transactions_with_balance"));
        Assert.Contains("order=date.asc.nullsfirst,id.asc.nullsfirst", Query(view));
        Assert.Equal("0-49", view.Headers["Range"]);
    }

    [Fact]
    public async Task GetTransactionPageAsync_PageBeyondEnd_ReturnsEmptyItemsWithTotalAndSkipsViewQuery()
    {
        // Arrange: 120 rows; page 4 of 50 starts at row 150.
        var (fake, service) = await StartAsync();
        await using var _ = fake;
        fake.On("GET", "transactions", "[]", contentRange: "0-0/120");

        // Act
        var page = await service.GetTransactionPageAsync(4, 50);

        // Assert
        Assert.Empty(page.Items);
        Assert.Equal(120, page.Total);
        Assert.Equal(4, page.Page);
        Assert.Empty(fake.RequestsTo("GET", "v_transactions_with_balance"));
    }

    [Fact]
    public async Task GetTransactionPageAsync_NoRows_ReturnsEmptyPage()
    {
        // Arrange
        var (fake, service) = await StartAsync();
        await using var _ = fake;
        fake.On("GET", "transactions", "[]", contentRange: "*/0");

        // Act
        var page = await service.GetTransactionPageAsync(1, 50);

        // Assert
        Assert.Empty(page.Items);
        Assert.Equal(0, page.Total);
    }

    // ── Uploaded files ────────────────────────────────────────────────────────

    [Theory]
    [InlineData("[]", false)]
    [InlineData("""[{"id":1,"file_hash":"abc","file_name":"bca.csv"}]""", true)]
    public async Task IsFileProcessedAsync_ByHash_ReturnsWhetherCallerHasIt(string rows, bool expected)
    {
        // Arrange
        var (fake, service) = await StartAsync();
        await using var _ = fake;
        fake.On("GET", "uploaded_files", rows);

        // Act
        var processed = await service.IsFileProcessedAsync("abc");

        // Assert
        Assert.Equal(expected, processed);
        var query = Query(Assert.Single(fake.Requests));
        Assert.Contains(Owner, query);
        Assert.Contains("file_hash=eq.abc", query);
    }

    [Fact]
    public async Task RegisterFileHashAsync_Insert_SendsCallerTokenAndCallerAsOwner()
    {
        // Arrange
        var (fake, service) = await StartAsync();
        await using var _ = fake;
        fake.On("POST", "uploaded_files", """[{"id":1,"file_hash":"abc","file_name":"bca.csv"}]""", 201);

        // Act
        await service.RegisterFileHashAsync("abc", "bca.csv");

        // Assert: a direct PostgREST write carries the caller as owner (owner decision 1).
        var request = Assert.Single(fake.Requests);
        Assert.Equal($"Bearer {TestCaller.Token}", request.Headers["Authorization"]);
        using var body = JsonDocument.Parse(request.Body);
        Assert.Equal(TestCaller.Id.ToString(), body.RootElement.GetProperty("user_id").GetString());
        Assert.Equal("abc", body.RootElement.GetProperty("file_hash").GetString());
        Assert.Equal("bca.csv", body.RootElement.GetProperty("file_name").GetString());
    }

    // ── Wallet aliases ────────────────────────────────────────────────────────

    [Fact]
    public async Task ResolveAliasAsync_Match_ReturnsNewestAliasAccount()
    {
        // Arrange
        var (fake, service) = await StartAsync();
        await using var _ = fake;
        fake.On("GET", "wallet_account_aliases",
            $$"""[{"id":"{{Guid.NewGuid()}}","alias_text":"BCA","account_id":"{{AccountA}}","created_at":"2026-03-01T00:00:00+00:00"}]""");

        // Act
        var accountId = await service.ResolveAliasAsync("  BCA ");

        // Assert
        Assert.Equal(AccountA, accountId);
        var request = Assert.Single(fake.Requests);
        var query = Query(request);
        Assert.Contains(Owner, query);
        Assert.Contains("alias_text=eq.BCA", query);
        Assert.Contains("order=created_at.desc", query);
        Assert.Contains("limit=1", query);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public async Task ResolveAliasAsync_BlankText_ReturnsNullWithoutQuerying(string text)
    {
        // Arrange
        var (fake, service) = await StartAsync();
        await using var _ = fake;

        // Act
        var accountId = await service.ResolveAliasAsync(text);

        // Assert
        Assert.Null(accountId);
        Assert.Empty(fake.Requests);
    }

    [Fact]
    public async Task ResolveAliasesBatchAsync_MixedCase_MatchesCaseInsensitivelyAndNewestWins()
    {
        // Arrange
        var (fake, service) = await StartAsync();
        await using var _ = fake;
        fake.On("GET", "wallet_account_aliases", $$"""
            [{"id":"{{Guid.NewGuid()}}","alias_text":"bca ","account_id":"{{AccountB}}","created_at":"2026-01-01T00:00:00+00:00"},
             {"id":"{{Guid.NewGuid()}}","alias_text":"BCA","account_id":"{{AccountA}}","created_at":"2026-03-01T00:00:00+00:00"},
             {"id":"{{Guid.NewGuid()}}","alias_text":"Other","account_id":"{{AccountB}}","created_at":"2026-03-01T00:00:00+00:00"}]
            """);

        // Act
        var map = await service.ResolveAliasesBatchAsync(["Bca", " bca", "", "Unknown"]);

        // Assert
        var pair = Assert.Single(map);
        Assert.Equal(AccountA, pair.Value);
        Assert.Equal(AccountA, map["BCA"]);
        Assert.Single(fake.Requests); // one query for the whole batch
    }

    [Fact]
    public async Task ResolveAliasesBatchAsync_OnlyBlankTexts_ReturnsEmptyWithoutQuerying()
    {
        // Arrange
        var (fake, service) = await StartAsync();
        await using var _ = fake;

        // Act
        var map = await service.ResolveAliasesBatchAsync(["", "  "]);

        // Assert
        Assert.Empty(map);
        Assert.Empty(fake.Requests);
    }

    [Fact]
    public async Task UpsertAliasAsync_NewAlias_InsertsTrimmedTextWithCallerAsOwner()
    {
        // Arrange
        var (fake, service) = await StartAsync();
        await using var _ = fake;
        fake.On("POST", "wallet_account_aliases",
            $$"""[{"id":"{{Guid.NewGuid()}}","alias_text":"BCA","account_id":"{{AccountA}}"}]""", 201);

        // Act
        await service.UpsertAliasAsync(" BCA ", AccountA);

        // Assert
        var request = Assert.Single(fake.Requests);
        Assert.Equal($"Bearer {TestCaller.Token}", request.Headers["Authorization"]);
        using var body = JsonDocument.Parse(request.Body);
        Assert.Equal(TestCaller.Id.ToString(), body.RootElement.GetProperty("user_id").GetString());
        Assert.Equal("BCA", body.RootElement.GetProperty("alias_text").GetString());
        Assert.Equal(AccountA.ToString(), body.RootElement.GetProperty("account_id").GetString());
    }

    [Fact]
    public async Task UpsertAliasAsync_PairAlreadyExists_IsSilentNoOp()
    {
        // Arrange: PostgREST answers a unique violation with 409 and SQLSTATE 23505.
        var (fake, service) = await StartAsync();
        await using var _ = fake;
        fake.On("POST", "wallet_account_aliases", """{"code":"23505","message":"duplicate key value"}""", 409);

        // Act
        var exception = await Record.ExceptionAsync(() => service.UpsertAliasAsync("BCA", AccountA));

        // Assert
        Assert.Null(exception);
    }

    [Fact]
    public async Task UpsertAliasAsync_OtherError_Throws()
    {
        // Arrange
        var (fake, service) = await StartAsync();
        await using var _ = fake;
        fake.On("POST", "wallet_account_aliases", ServerError, 500);

        // Act + Assert
        await Assert.ThrowsAsync<PostgrestException>(() => service.UpsertAliasAsync("BCA", AccountA));
    }

    [Fact]
    public async Task UpsertAliasAsync_BlankText_DoesNotWrite()
    {
        // Arrange
        var (fake, service) = await StartAsync();
        await using var _ = fake;

        // Act
        await service.UpsertAliasAsync(" ", AccountA);

        // Assert
        Assert.Empty(fake.Requests);
    }
}
