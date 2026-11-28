using System.Text.Json;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using PersonalFinance.Application.Dtos;
using PersonalFinance.Application.Interfaces;
using PersonalFinance.Application.Services;
using PersonalFinance.Tests.Cashflow;
using PersonalFinance.Tests.Support;

namespace PersonalFinance.Tests.Journey;

/// <summary>
/// The orchestration in JourneyScoringService: what it reads, what it writes and when it writes
/// nothing. The rubric math and the pure rules are covered in Services/.
/// The service catches read and snapshot-write failures, so a broken stub does not fail a test by
/// itself: it turns an indicator into "no_data". That is why these tests assert computed values,
/// reasons and recorded requests, not statuses alone.
/// </summary>
public sealed class JourneyScoringOrchestratorTests
{
    // 2026-10-15 in a UTC local zone, so the scoring window is July to September 2026.
    private sealed class JourneyTime() : AppTimeProvider(TimeZoneInfo.Utc)
    {
        public override DateTimeOffset GetUtcNow() => new(2026, 10, 15, 10, 0, 0, TimeSpan.Zero);
    }

    private static readonly DateTime StartedAt = new(2026, 10, 15, 10, 0, 0, DateTimeKind.Utc);

    private static readonly Guid SavingsAccountId = Guid.Parse("22222222-2222-2222-2222-222222222222");

    // Each month: income 10M and consumption 8M, a spend ratio of 0.8 (score 100).
    private static string ThreeMonthsOfTransactions() => CashflowRows.Json(
        new[] { 9, 8, 7 }.SelectMany((month, i) => new[]
        {
            CashflowRows.Tx(i * 2 + 1, new DateTime(2026, month, 10), "Income", "Salary", 10_000_000m),
            CashflowRows.Tx(i * 2 + 2, new DateTime(2026, month, 10), "Expense", "Food", 8_000_000m),
        }));

    private static string SavingsAccounts() => CashflowRows.Json(new
    {
        id = SavingsAccountId,
        user_id = TestCaller.Id,
        name = "Emergency fund",
        account_type = "savings",
        currency = "IDR",
        opening_balance = 0m,
        is_active = true,
    });

    // 30M against 8M average consumption is 3.75 months of cover (score 100).
    private static string SavingsValuations() => CashflowRows.Json(new
    {
        id = Guid.Parse("33333333-3333-3333-3333-333333333333"),
        user_id = TestCaller.Id,
        subject_type = "account",
        subject_id = SavingsAccountId,
        value_native = 30_000_000m,
        currency = "IDR",
        fx_rate_to_idr = 1m,
        value_idr = 30_000_000m,
        valued_at = "2026-09-30T00:00:00+00:00",
    });

    // level_scores and indicator_scores are JSON strings because that is what the upsert writes.
    private static string StoredState(string lastComputedAt) => CashflowRows.Json(new
    {
        user_id = TestCaller.Id,
        current_level = 2,
        total_score = 66.67m,
        level_scores = """{"L1":100,"L2":100,"L3":0}""",
        indicator_scores = """{"spend_lt_income":100,"liquid_savings_ratio":100,"savings_rate":0}""",
        indicator_raw = new Dictionary<string, decimal>
        {
            ["spend_lt_income"] = 0.8m,
            ["liquid_savings_ratio"] = 3.75m,
            ["savings_rate"] = 0m,
        },
        last_computed_at = lastComputedAt,
    });

    private static object AchievementRow(string code) => new
    {
        id = 1,
        user_id = TestCaller.Id,
        achievement_code = code,
        unlocked_at = "2026-10-15T10:00:00+00:00",
    };

    /// <summary>Every route a recalculation touches: no stored state, no debts, no achievements yet.</summary>
    private static async Task<FakePostgrest> StartFakeAsync()
    {
        var fake = await FakePostgrest.StartAsync();
        return fake
            .On("GET", "transactions", ThreeMonthsOfTransactions())
            .On("GET", "accounts", SavingsAccounts())
            .On("GET", "valuations", SavingsValuations())
            .On("GET", "liabilities", "[]")
            .On("GET", "user_journey_state", "[]")
            .On("POST", "user_journey_state", "[]", 201)
            .On("DELETE", "journey_indicator_snapshots", "[]")
            .On("POST", "journey_indicator_snapshots", "[]", 201)
            .On("GET", "journey_achievements", "[]")
            .On("POST", "journey_achievements", "[]", 201);
    }

    private static async Task<JourneyScoringService> CreateServiceAsync(FakePostgrest fake)
    {
        var confirmation = new Mock<IJourneyConfirmationService>();
        confirmation
            .Setup(c => c.GetNoDebtsConfirmedAtAsync(TestCaller.Id, It.IsAny<CancellationToken>()))
            .ReturnsAsync((DateTime?)null);

        return new JourneyScoringService(
            await fake.CreateClientAsync(),
            confirmation.Object,
            NullLogger<JourneyScoringService>.Instance,
            new JourneyTime());
    }

    private static IndicatorScoreDto Indicator(IEnumerable<IndicatorScoreDto> indicators, string code) =>
        Assert.Single(indicators, i => i.Code == code);

    private static JsonElement Body(RecordedRequest request) =>
        JsonDocument.Parse(request.Body).RootElement.Clone();

    [Fact]
    public async Task RecalculateWithSnapshotAsync_TransactionsAndSavings_ComputesIndicatorsAndPersists()
    {
        // Arrange
        await using var fake = await StartFakeAsync();
        var service = await CreateServiceAsync(fake);

        // Act
        var result = await service.RecalculateWithSnapshotAsync(TestCaller.Id);

        // Assert
        Assert.Equal(2, result.State.CurrentLevel);
        Assert.Equal(66.67m, result.State.TotalScore);
        Assert.Equal(StartedAt, result.State.LastComputedAt);

        var spend = Indicator(result.State.Indicators, "spend_lt_income");
        Assert.Equal(100m, spend.Score);
        Assert.Equal(0.8m, spend.RawValue);
        var savings = Indicator(result.State.Indicators, "liquid_savings_ratio");
        Assert.Equal(100m, savings.Score);
        Assert.Equal(3.75m, savings.RawValue);

        var upsert = Assert.Single(fake.RequestsTo("POST", "user_journey_state"));
        Assert.Contains("resolution=merge-duplicates", upsert.Headers["Prefer"]);
        Assert.Equal(2, Body(upsert).GetProperty("current_level").GetInt32());

        var delete = Assert.Single(fake.RequestsTo("DELETE", "journey_indicator_snapshots"));
        Assert.Contains($"user_id=eq.{TestCaller.Id}", CashflowRows.Query(delete));

        // Only evaluated indicators get a snapshot row.
        var insert = Assert.Single(fake.RequestsTo("POST", "journey_indicator_snapshots"));
        Assert.Equal(
            new[] { "liquid_savings_ratio", "savings_rate", "spend_lt_income" },
            Body(insert).EnumerateArray()
                .Select(row => row.GetProperty("indicator_code").GetString()!)
                .Order());
    }

    [Fact]
    public async Task RecalculateWithSnapshotAsync_NoLiabilitiesNoConfirmation_DtiIsNoData()
    {
        // Arrange
        await using var fake = await StartFakeAsync();
        var service = await CreateServiceAsync(fake);

        // Act
        var result = await service.RecalculateWithSnapshotAsync(TestCaller.Id);

        // Assert
        var dti = Indicator(result.State.Indicators, "manageable_dti");
        Assert.Equal("no_data", dti.Status);
        Assert.Null(dti.RawValue);
        // A failed liabilities or confirmation read is also "no_data", with "Computation error".
        Assert.Equal("No debts recorded and none confirmed", dti.Description);
    }

    [Fact]
    public async Task RecalculateWithSnapshotAsync_ExistingStateIsNewer_SkipsPersistWrite()
    {
        // Arrange: another pass saved an hour after this one started.
        await using var fake = await StartFakeAsync();
        fake.On("GET", "user_journey_state", StoredState("2026-10-15T11:00:00+00:00"));
        var service = await CreateServiceAsync(fake);

        // Act
        await service.RecalculateWithSnapshotAsync(TestCaller.Id);

        // Assert
        Assert.Single(fake.RequestsTo("GET", "user_journey_state"));
        Assert.Empty(fake.RequestsTo("POST", "user_journey_state"));
    }

    [Fact]
    public async Task RecalculateWithSnapshotAsync_AchievementEarned_InsertsAndReturnsThem()
    {
        // Arrange: empty before the insert check, one stored row on the final load.
        await using var fake = await StartFakeAsync();
        var achievementReads = 0;
        fake.On("GET", "journey_achievements", _ => new FakeResponse(
            Interlocked.Increment(ref achievementReads) == 1
                ? "[]"
                : CashflowRows.Json(AchievementRow("emergency_ready"))));
        var service = await CreateServiceAsync(fake);

        // Act
        var result = await service.RecalculateWithSnapshotAsync(TestCaller.Id);

        // Assert
        Assert.Equal(
            new[] { "emergency_ready", "graduated_l1", "graduated_l2", "positive_cashflow_3mo" },
            fake.RequestsTo("POST", "journey_achievements")
                .Select(r => Body(r).GetProperty("achievement_code").GetString()!)
                .Order());

        var returned = Assert.Single(result.State.Achievements);
        Assert.Equal("emergency_ready", returned.Code);
        Assert.Equal("Emergency Ready", returned.Name);
        Assert.Equal(2, achievementReads);
    }

    [Fact]
    public async Task GetStateAsync_ExistingRow_ReturnsStoredIndicators()
    {
        // Arrange
        await using var fake = await StartFakeAsync();
        fake.On("GET", "user_journey_state", StoredState("2026-10-14T10:00:00+00:00"));
        var service = await CreateServiceAsync(fake);

        // Act
        var state = await service.GetStateAsync(TestCaller.Id);

        // Assert
        Assert.Equal(2, state.CurrentLevel);
        Assert.Equal(66.67m, state.TotalScore);
        Assert.Equal(100m, state.LevelScores["L1"]);

        var savings = Indicator(state.Indicators, "liquid_savings_ratio");
        Assert.Equal(100m, savings.Score);
        Assert.Equal(3.75m, savings.RawValue);
        Assert.Equal("achieved", savings.Status);
        // Not in the stored score map, so not evaluated.
        Assert.Equal("no_data", Indicator(state.Indicators, "manageable_dti").Status);

        Assert.Empty(fake.RequestsTo("GET", "transactions"));
        Assert.All(fake.Requests, r => Assert.Equal("GET", r.Method));
    }

    [Fact]
    public async Task GetStateAsync_NoRow_DelegatesToRecalculate()
    {
        // Arrange
        await using var fake = await StartFakeAsync();
        var service = await CreateServiceAsync(fake);

        // Act
        var state = await service.GetStateAsync(TestCaller.Id);

        // Assert
        Assert.NotEmpty(fake.RequestsTo("GET", "transactions"));
        Assert.Equal(StartedAt, state.LastComputedAt);
        Assert.Single(fake.RequestsTo("POST", "user_journey_state"));
    }

    [Fact]
    public async Task LoadSnapshotAsync_NeverWrites_ReturnsSnapshotWithIndicators()
    {
        // Arrange: the write routes are stubbed, so a write would succeed and be recorded.
        await using var fake = await StartFakeAsync();
        var service = await CreateServiceAsync(fake);

        // Act
        var snapshot = await service.LoadSnapshotAsync(TestCaller.Id);

        // Assert
        Assert.Equal(new DateOnly(2026, 10, 15), snapshot.Today);
        Assert.Equal(6, snapshot.Transactions?.Count);
        Assert.Equal(30_000_000m, Assert.Single(snapshot.SavingsAccounts!).LatestValueIdr);
        Assert.Equal(100m, Indicator(snapshot.Indicators, "spend_lt_income").Score);
        Assert.Equal(100m, Indicator(snapshot.Indicators, "liquid_savings_ratio").Score);

        // No state, no snapshots and no achievements: every request is a read.
        Assert.All(fake.Requests, r => Assert.Equal("GET", r.Method));
    }
}
