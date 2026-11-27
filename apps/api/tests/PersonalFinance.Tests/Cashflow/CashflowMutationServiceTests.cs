using System.Net;
using System.Text.Json;
using PersonalFinance.Application.Commands.Accounts;
using PersonalFinance.Application.Commands.Institutions;
using PersonalFinance.Application.Dtos;
using PersonalFinance.Infrastructure.Supabase;
using PersonalFinance.Tests.Support;

namespace PersonalFinance.Tests.Cashflow;

/// <summary>
/// SupabaseCashflowMutationService calls the checked cashflow functions (rpc/*) over HttpClient,
/// pointed at FakePostgrest. Every call must carry the caller's bearer token and the anon key, and
/// must send no user_id: the database takes the owner from the token (backend.md, owner decision 1).
/// </summary>
public sealed class CashflowMutationServiceTests
{
    private const string AnonKey = "public-anon-key";

    private static async Task<(FakePostgrest Fake, SupabaseCashflowMutationService Service, HttpClient Http)> StartAsync()
    {
        var fake = await FakePostgrest.StartAsync();
        var http = new HttpClient();
        return (fake, Create(http, fake.Url), http);
    }

    private static SupabaseCashflowMutationService Create(HttpClient http, string url) =>
        new(http, new SupabaseSettings { Url = url + "/", AnonKey = AnonKey }, new TestCaller());

    private static JsonElement AssertCheckedCall(FakePostgrest fake, string function)
    {
        var request = Assert.Single(fake.RequestsTo("POST", $"rpc/{function}"));
        Assert.Equal($"Bearer {TestCaller.Token}", request.Headers["Authorization"]);
        Assert.Equal(AnonKey, request.Headers["apikey"]);
        Assert.DoesNotContain("user_id", request.Body);
        Assert.DoesNotContain(TestCaller.Id.ToString(), request.Body);
        return JsonDocument.Parse(request.Body).RootElement.Clone();
    }

    private static TransactionDto Row() => new()
    {
        Date = new DateTime(2026, 3, 10, 0, 0, 0, DateTimeKind.Utc),
        Description = "GOFOOD", Remarks = "lunch", Flow = "DB", Type = "Expense", Category = "Food",
        AccountId = Guid.Parse("aaaaaaaa-0000-0000-0000-000000000001"), AccountName = "BCA",
        AmountIdr = 1_600_000.50m, Currency = "USD", ExchangeRate = 16_000.005m, StatementBalance = 9_000_000m,
        CategoryRuleDto = new CategoryRuleDto { Keyword = "GOFOOD", Type = "Expense", Flow = "DB", Category = "Food" },
    };

    // ── SubmitAsync ───────────────────────────────────────────────────────────

    [Fact]
    public async Task SubmitAsync_Rows_SendsEveryContractFieldExactlyAndNoOwner()
    {
        // Arrange
        var (fake, service, http) = await StartAsync();
        await using var _ = fake;
        using var __ = http;
        fake.On("POST", "rpc/submit_cashflow_import", """{"insertedIds":[41,42],"insertedCount":2,"duplicateCount":1}""");
        var requestId = Guid.NewGuid();

        // Act
        var result = await service.SubmitAsync(requestId, [Row()], "hash-1", "bca.csv");

        // Assert
        Assert.Equal(new CashflowImportResult([41, 42], 2, 1).InsertedCount, result.InsertedCount);
        Assert.Equal([41, 42], result.InsertedIds);
        Assert.Equal(1, result.DuplicateCount);
        var body = AssertCheckedCall(fake, "submit_cashflow_import");
        Assert.Equal(requestId, body.GetProperty("p_request_id").GetGuid());
        Assert.Equal("hash-1", body.GetProperty("p_file_hash").GetString());
        Assert.Equal("bca.csv", body.GetProperty("p_file_name").GetString());
        var row = Assert.Single(body.GetProperty("p_rows").EnumerateArray());
        Assert.Equal("2026-03-10T00:00:00.0000000Z", row.GetProperty("date").GetString());
        Assert.Equal(1_600_000.50m, row.GetProperty("amount_idr").GetDecimal());   // decimal, not rounded through double
        Assert.Equal(16_000.005m, row.GetProperty("exchange_rate").GetDecimal());
        Assert.Equal(9_000_000m, row.GetProperty("statement_balance").GetDecimal());
        Assert.Equal("USD", row.GetProperty("currency").GetString());
        Assert.Equal("BCA", row.GetProperty("account_name").GetString());
        Assert.Equal("GOFOOD", row.GetProperty("category_rule").GetProperty("keyword").GetString());
    }

    [Fact]
    public async Task SubmitAsync_LocalDate_IsSentAsUtc()
    {
        // Arrange
        var (fake, service, http) = await StartAsync();
        await using var _ = fake;
        using var __ = http;
        fake.On("POST", "rpc/submit_cashflow_import", """{"insertedIds":[],"insertedCount":0,"duplicateCount":1}""");
        var local = new DateTime(2026, 3, 10, 8, 0, 0, DateTimeKind.Local);
        var row = Row();
        row.Date = local;
        row.CategoryRuleDto = null;

        // Act
        await service.SubmitAsync(Guid.NewGuid(), [row], null, null);

        // Assert
        var sent = Assert.Single(AssertCheckedCall(fake, "submit_cashflow_import").GetProperty("p_rows").EnumerateArray());
        Assert.Equal(local.ToUniversalTime().ToString("O"), sent.GetProperty("date").GetString());
        Assert.Equal(JsonValueKind.Null, sent.GetProperty("category_rule").ValueKind);
    }

    [Theory]
    [InlineData(true, 1)]
    [InlineData(false, 0)]
    [InlineData(false, 5001)]
    public async Task SubmitAsync_InvalidRequest_ThrowsInvalidInputWithoutCalling(bool emptyRequestId, int rows)
    {
        // Arrange
        var (fake, service, http) = await StartAsync();
        await using var _ = fake;
        using var __ = http;
        var transactions = Enumerable.Range(0, rows).Select(_ => Row()).ToList();

        // Act
        var exception = await Assert.ThrowsAsync<CashflowMutationException>(() =>
            service.SubmitAsync(emptyRequestId ? Guid.Empty : Guid.NewGuid(), transactions, null, null));

        // Assert
        Assert.Equal(CashflowMutationFailure.InvalidInput, exception.Failure);
        Assert.Empty(fake.Requests);
    }

    [Theory]
    [InlineData("null")]
    [InlineData("not json")]
    public async Task SubmitAsync_UnreadableResult_ThrowsBackendFailure(string body)
    {
        // Arrange
        var (fake, service, http) = await StartAsync();
        await using var _ = fake;
        using var __ = http;
        fake.On("POST", "rpc/submit_cashflow_import", body);

        // Act
        var exception = await Assert.ThrowsAsync<CashflowMutationException>(() =>
            service.SubmitAsync(Guid.NewGuid(), [Row()], null, null));

        // Assert
        Assert.Equal(CashflowMutationFailure.BackendFailure, exception.Failure);
    }

    // ── Error mapping ─────────────────────────────────────────────────────────

    [Theory]
    [InlineData("P0001", "idempotency_conflict", CashflowMutationFailure.IdempotencyConflict)]
    [InlineData("P0001", "file_already_processed", CashflowMutationFailure.FileAlreadyProcessed)]
    [InlineData("P0001", "account_unavailable", CashflowMutationFailure.AccountUnavailable)]
    [InlineData("P0001", "institution_unavailable", CashflowMutationFailure.InstitutionUnavailable)]
    [InlineData("P0001", "account_in_use", CashflowMutationFailure.AccountInUse)]
    [InlineData("P0001", "rule_exists", CashflowMutationFailure.RuleExists)]
    [InlineData("P0001", "something_else", CashflowMutationFailure.BackendFailure)]
    [InlineData("22023", "bad value", CashflowMutationFailure.InvalidInput)]
    [InlineData("22P02", "bad text", CashflowMutationFailure.InvalidInput)]
    [InlineData("22007", "bad date", CashflowMutationFailure.InvalidInput)]
    [InlineData("23505", "duplicate key", CashflowMutationFailure.ConstraintConflict)]
    [InlineData("55P03", "lock", CashflowMutationFailure.Retryable)]
    [InlineData("40P01", "deadlock", CashflowMutationFailure.Retryable)]
    [InlineData("57014", "timeout", CashflowMutationFailure.Retryable)]
    [InlineData("42501", "permission denied", CashflowMutationFailure.BackendFailure)]
    public async Task ResetAsync_PostgresError_MapsToSafeFailureWithoutLeakingDetail(
        string code, string message, CashflowMutationFailure expected)
    {
        // Arrange
        var (fake, service, http) = await StartAsync();
        await using var _ = fake;
        using var __ = http;
        fake.On("POST", "rpc/reset_cashflow", JsonSerializer.Serialize(new { code, message }), 400);

        // Act
        var exception = await Assert.ThrowsAsync<CashflowMutationException>(() => service.ResetAsync());

        // Assert
        Assert.Equal(expected, exception.Failure);
        Assert.DoesNotContain(code, exception.Message);
        Assert.DoesNotContain(message, exception.Message);
    }

    [Fact]
    public async Task ResetAsync_ErrorBodyNotJson_ThrowsBackendFailure()
    {
        // Arrange
        var (fake, service, http) = await StartAsync();
        await using var _ = fake;
        using var __ = http;
        fake.On("POST", "rpc/reset_cashflow", "<html>bad gateway</html>", 502);

        // Act
        var exception = await Assert.ThrowsAsync<CashflowMutationException>(() => service.ResetAsync());

        // Assert
        Assert.Equal(CashflowMutationFailure.BackendFailure, exception.Failure);
    }

    [Fact]
    public async Task ResetAsync_ServerUnreachable_ThrowsRetryable()
    {
        // Arrange: a port nothing listens on.
        await using var fake = await FakePostgrest.StartAsync();
        var url = fake.Url;
        await fake.DisposeAsync();
        using var http = new HttpClient();

        // Act
        var exception = await Assert.ThrowsAsync<CashflowMutationException>(() => Create(http, url).ResetAsync());

        // Assert
        Assert.Equal(CashflowMutationFailure.Retryable, exception.Failure);
    }

    [Fact]
    public async Task ResetAsync_HttpClientTimeout_ThrowsRetryable()
    {
        // Arrange
        await using var fake = await FakePostgrest.StartAsync();
        fake.On("POST", "rpc/reset_cashflow", _ =>
        {
            Thread.Sleep(1500);
            return new FakeResponse("3");
        });
        using var http = new HttpClient { Timeout = TimeSpan.FromMilliseconds(200) };

        // Act
        var exception = await Assert.ThrowsAsync<CashflowMutationException>(() => Create(http, fake.Url).ResetAsync());

        // Assert
        Assert.Equal(CashflowMutationFailure.Retryable, exception.Failure);
    }

    [Fact]
    public async Task ResetAsync_CallerCancels_PropagatesCancellation()
    {
        // Arrange
        var (fake, service, http) = await StartAsync();
        await using var _ = fake;
        using var __ = http;
        using var cancelled = new CancellationTokenSource();
        cancelled.Cancel();

        // Act + Assert: a caller's own cancellation is not turned into "retry".
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => service.ResetAsync(cancelled.Token));
    }

    // ── Other checked functions ───────────────────────────────────────────────

    [Fact]
    public async Task ResetAsync_Success_ReturnsDeletedCount()
    {
        // Arrange
        var (fake, service, http) = await StartAsync();
        await using var _ = fake;
        using var __ = http;
        fake.On("POST", "rpc/reset_cashflow", "17");

        // Act
        var deleted = await service.ResetAsync();

        // Assert
        Assert.Equal(17, deleted);
        Assert.Empty(AssertCheckedCall(fake, "reset_cashflow").EnumerateObject());
    }

    [Fact]
    public async Task CreateAccountAsync_Success_SendsParametersAndReturnsId()
    {
        // Arrange
        var (fake, service, http) = await StartAsync();
        await using var _ = fake;
        using var __ = http;
        var id = Guid.NewGuid();
        var institution = Guid.NewGuid();
        fake.On("POST", "rpc/create_cashflow_account", $"\"{id}\"");

        // Act
        var created = await service.CreateAccountAsync(new CreateAccountCommand(
            institution, "BCA Utama", "checking", "IDR", 2_500_000.75m, new DateOnly(2026, 1, 1), "#123456", "bank"));

        // Assert
        Assert.Equal(id, created);
        var body = AssertCheckedCall(fake, "create_cashflow_account");
        Assert.Equal(institution, body.GetProperty("p_institution_id").GetGuid());
        Assert.Equal("BCA Utama", body.GetProperty("p_name").GetString());
        Assert.Equal("checking", body.GetProperty("p_account_type").GetString());
        Assert.Equal(2_500_000.75m, body.GetProperty("p_opening_balance").GetDecimal());
        Assert.Equal("2026-01-01", body.GetProperty("p_opening_date").GetString());
        Assert.Equal("#123456", body.GetProperty("p_color").GetString());
        Assert.Equal("bank", body.GetProperty("p_icon").GetString());
    }

    [Theory]
    [InlineData("\"00000000-0000-0000-0000-000000000000\"")]
    [InlineData("\"not-a-guid\"")]
    public async Task CreateInstitutionAsync_EmptyOrBadId_ThrowsBackendFailure(string body)
    {
        // Arrange
        var (fake, service, http) = await StartAsync();
        await using var _ = fake;
        using var __ = http;
        fake.On("POST", "rpc/create_cashflow_institution", body);

        // Act
        var exception = await Assert.ThrowsAsync<CashflowMutationException>(() =>
            service.CreateInstitutionAsync(new CreateInstitutionCommand("BCA", "bank")));

        // Assert
        Assert.Equal(CashflowMutationFailure.BackendFailure, exception.Failure);
        var sent = AssertCheckedCall(fake, "create_cashflow_institution");
        Assert.Equal("ID", sent.GetProperty("p_country").GetString());
        Assert.Equal(JsonValueKind.Null, sent.GetProperty("p_logo_url").ValueKind);
    }

    [Fact]
    public async Task CreateInstitutionAsync_Success_ReturnsId()
    {
        // Arrange
        var (fake, service, http) = await StartAsync();
        await using var _ = fake;
        using var __ = http;
        var id = Guid.NewGuid();
        fake.On("POST", "rpc/create_cashflow_institution", $"\"{id}\"");

        // Act + Assert
        Assert.Equal(id, await service.CreateInstitutionAsync(new CreateInstitutionCommand("Jago", "bank", "ID", "https://logo")));
    }

    public static TheoryData<string, string, Func<SupabaseCashflowMutationService, Task<bool>>> BoolCalls => new()
    {
        { "update_cashflow_account", "p_is_active", s => s.UpdateAccountAsync(new UpdateAccountCommand(Guid.Empty, "BCA", "checking", "IDR", true, null, null)) },
        { "set_cashflow_account_flag", "p_include", s => s.SetAccountCashflowFlagAsync(Guid.Empty, true) },
        { "set_cashflow_opening_balance", "p_opening_balance", s => s.SetOpeningBalanceAsync(Guid.Empty, 1_000_000.25m, new DateOnly(2026, 1, 1)) },
        { "update_cashflow_institution", "p_country", s => s.UpdateInstitutionAsync(new UpdateInstitutionCommand(Guid.Empty, "BCA", "bank", "ID", null)) },
        { "delete_cashflow_account", "p_id", s => s.DeleteAccountAsync(Guid.Empty) },
        { "delete_cashflow_institution", "p_id", s => s.DeleteInstitutionAsync(Guid.Empty) },
        { "update_cashflow_rule", "p_keyword", s => s.UpdateRuleAsync(7, new CategoryRuleDto { Keyword = "GOFOOD", Type = "Expense", Category = "Food" }) },
        { "delete_cashflow_rule", "p_id", s => s.DeleteRuleAsync(7) },
    };

    [Theory]
    [MemberData(nameof(BoolCalls))]
    public async Task BooleanFunction_TrueOrFalse_IsReturnedAndBadBodyIsBackendFailure(
        string function, string parameter, Func<SupabaseCashflowMutationService, Task<bool>> call)
    {
        // Arrange
        var (fake, service, http) = await StartAsync();
        await using var _ = fake;
        using var __ = http;

        // Act + Assert
        fake.On("POST", $"rpc/{function}", "true");
        Assert.True(await call(service));
        fake.On("POST", $"rpc/{function}", "false");
        Assert.False(await call(service));
        fake.On("POST", $"rpc/{function}", "\"yes\"");
        var exception = await Assert.ThrowsAsync<CashflowMutationException>(() => call(service));
        Assert.Equal(CashflowMutationFailure.BackendFailure, exception.Failure);

        var requests = fake.RequestsTo("POST", $"rpc/{function}").ToList();
        Assert.Equal(3, requests.Count);
        Assert.All(requests, r =>
        {
            Assert.Equal($"Bearer {TestCaller.Token}", r.Headers["Authorization"]);
            Assert.DoesNotContain("user_id", r.Body);
            Assert.True(JsonDocument.Parse(r.Body).RootElement.TryGetProperty(parameter, out var _), $"{function} sends {parameter}");
        });
    }

    [Fact]
    public async Task SetOpeningBalanceAsync_Amount_IsSentAsExactDecimal()
    {
        // Arrange
        var (fake, service, http) = await StartAsync();
        await using var _ = fake;
        using var __ = http;
        fake.On("POST", "rpc/set_cashflow_opening_balance", "true");
        var account = Guid.NewGuid();

        // Act
        await service.SetOpeningBalanceAsync(account, 12_345_678.91m, new DateOnly(2026, 2, 1));

        // Assert
        var body = AssertCheckedCall(fake, "set_cashflow_opening_balance");
        Assert.Equal(account, body.GetProperty("p_id").GetGuid());
        Assert.Equal(12_345_678.91m, body.GetProperty("p_opening_balance").GetDecimal());
        Assert.Equal("2026-02-01", body.GetProperty("p_opening_date").GetString());
    }

    [Fact]
    public async Task CreateRuleAsync_Success_ReturnsIdAndCreatedFlag()
    {
        // Arrange
        var (fake, service, http) = await StartAsync();
        await using var _ = fake;
        using var __ = http;
        fake.On("POST", "rpc/create_cashflow_rule", """{"id":12,"created":true}""");

        // Act
        var result = await service.CreateRuleAsync(new CategoryRuleDto { Keyword = "GOFOOD", Type = "Expense", Category = "Food", Flow = "DB" });

        // Assert
        Assert.Equal(new CashflowRuleCreateResult(12, true), result);
        var body = AssertCheckedCall(fake, "create_cashflow_rule");
        Assert.Equal("GOFOOD", body.GetProperty("p_keyword").GetString());
        Assert.Equal("Food", body.GetProperty("p_category").GetString());
        Assert.Equal("DB", body.GetProperty("p_flow").GetString());
    }

    [Theory]
    [InlineData("null")]
    [InlineData("[")]
    public async Task CreateRuleAsync_UnreadableResult_ThrowsBackendFailure(string body)
    {
        // Arrange
        var (fake, service, http) = await StartAsync();
        await using var _ = fake;
        using var __ = http;
        fake.On("POST", "rpc/create_cashflow_rule", body);

        // Act
        var exception = await Assert.ThrowsAsync<CashflowMutationException>(() =>
            service.CreateRuleAsync(new CategoryRuleDto { Keyword = "X", Type = "Expense", Category = "Food" }));

        // Assert
        Assert.Equal(CashflowMutationFailure.BackendFailure, exception.Failure);
    }

    [Fact]
    public async Task ResetRulesAsync_Success_ReturnsCountAndBadBodyIsBackendFailure()
    {
        // Arrange
        var (fake, service, http) = await StartAsync();
        await using var _ = fake;
        using var __ = http;
        fake.On("POST", "rpc/reset_cashflow_rules", "106");

        // Act + Assert
        Assert.Equal(106, await service.ResetRulesAsync());
        fake.On("POST", "rpc/reset_cashflow_rules", "\"many\"");
        var exception = await Assert.ThrowsAsync<CashflowMutationException>(() => service.ResetRulesAsync());
        Assert.Equal(CashflowMutationFailure.BackendFailure, exception.Failure);
    }

    [Fact]
    public async Task ResetAsync_BadBody_ThrowsBackendFailure()
    {
        // Arrange
        var (fake, service, http) = await StartAsync();
        await using var _ = fake;
        using var __ = http;
        fake.On("POST", "rpc/reset_cashflow", "\"all\"");

        // Act
        var exception = await Assert.ThrowsAsync<CashflowMutationException>(() => service.ResetAsync());

        // Assert
        Assert.Equal(CashflowMutationFailure.BackendFailure, exception.Failure);
    }

    [Fact]
    public async Task SetFuturePlanAsync_Amount_IsSentAsExactDecimal()
    {
        // Arrange
        var (fake, service, http) = await StartAsync();
        await using var _ = fake;
        using var __ = http;
        fake.On("POST", "rpc/set_cashflow_future_plan", "");

        // Act
        await service.SetFuturePlanAsync(3_000_000.10m);

        // Assert
        Assert.Equal(3_000_000.10m, AssertCheckedCall(fake, "set_cashflow_future_plan").GetProperty("p_amount").GetDecimal());
    }

    [Fact]
    public async Task SetFuturePlanAsync_Error_Throws()
    {
        // Arrange
        var (fake, service, http) = await StartAsync();
        await using var _ = fake;
        using var __ = http;
        fake.On("POST", "rpc/set_cashflow_future_plan", """{"code":"22023","message":"negative"}""", 400);

        // Act
        var exception = await Assert.ThrowsAsync<CashflowMutationException>(() => service.SetFuturePlanAsync(-1m));

        // Assert
        Assert.Equal(CashflowMutationFailure.InvalidInput, exception.Failure);
    }

    [Fact]
    public async Task DemoteCommittedItemAsync_Key_IsSent()
    {
        // Arrange
        var (fake, service, http) = await StartAsync();
        await using var _ = fake;
        using var __ = http;
        fake.On("POST", "rpc/demote_cashflow_committed_item", "");

        // Act
        await service.DemoteCommittedItemAsync("netflix");

        // Assert
        Assert.Equal("netflix", AssertCheckedCall(fake, "demote_cashflow_committed_item").GetProperty("p_item_key").GetString());
    }

    [Fact]
    public async Task GetLiquidTotalAsync_Decimal_IsReadExactly()
    {
        // Arrange
        var (fake, service, http) = await StartAsync();
        await using var _ = fake;
        using var __ = http;
        fake.On("POST", "rpc/get_cashflow_liquid_total", "12345678901.23");

        // Act
        var total = await service.GetLiquidTotalAsync();

        // Assert
        Assert.Equal(12_345_678_901.23m, total);
        AssertCheckedCall(fake, "get_cashflow_liquid_total");
    }

    [Fact]
    public async Task GetLiquidTotalAsync_BadBody_ThrowsBackendFailure()
    {
        // Arrange
        var (fake, service, http) = await StartAsync();
        await using var _ = fake;
        using var __ = http;
        fake.On("POST", "rpc/get_cashflow_liquid_total", "\"lots\"");

        // Act
        var exception = await Assert.ThrowsAsync<CashflowMutationException>(() => service.GetLiquidTotalAsync());

        // Assert
        Assert.Equal(CashflowMutationFailure.BackendFailure, exception.Failure);
    }
}
