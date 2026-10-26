using System.Text.Json;
using Microsoft.Extensions.Logging;
using PersonalFinance.Application.Dtos;
using PersonalFinance.Application.Interfaces;
using PersonalFinance.Application.Quests;
using PersonalFinance.Domain.Entities;
using static Supabase.Postgrest.Constants;

namespace PersonalFinance.Application.Services;

public class JourneyScoringService(
    Supabase.Client supabase,
    IJourneyConfirmationService confirmation,
    ILogger<JourneyScoringService> logger,
    TimeProvider time
) : IJourneyScoringService
{
    private static readonly Dictionary<string, string> AchievementNames = new()
    {
        ["positive_cashflow_3mo"] = "Positive Cashflow Streak",
        ["emergency_ready"] = "Emergency Ready",
        ["debt_free"] = "Light Footprint",
        ["consistent_investor"] = "Steady Builder",
        ["graduated_l1"] = "Level 1 Cleared",
        ["graduated_l2"] = "Level 2 Cleared",
        ["graduated_l3"] = "Level 3 Cleared",
    };

    public async Task<JourneyStateDto> GetStateAsync(Guid userId, CancellationToken ct = default)
    {
        var state = await supabase.From<UserJourneyState>()
            .Filter("user_id", Operator.Equals, userId.ToString())
            .Get();

        if (state.Models.Count == 0)
            return await RecalculateAsync(userId, ct);

        var row = state.Models[0];
        var levelScores = ParseJsonDecimalMap(row.LevelScoresJson);
        var indicatorScores = ParseJsonDecimalMap(row.IndicatorScoresJson);
        var achievements = await LoadAchievementsAsync(userId, ct);

        var indicators = BuildIndicatorDtos(indicatorScores);
        return new JourneyStateDto(row.CurrentLevel, row.TotalScore, levelScores, indicators, achievements, row.LastComputedAt);
    }

    public async Task<JourneyStateDto> RecalculateAsync(Guid userId, CancellationToken ct = default) =>
        (await RecalculateWithSnapshotAsync(userId, ct)).State;

    public async Task<JourneyRecalculation> RecalculateWithSnapshotAsync(Guid userId, CancellationToken ct = default)
    {
        logger.LogInformation("Recalculating journey scores for user {UserId}", userId);

        // The moment the data was read: the honest meaning of "computed at", and the ordering key
        // a newer pass compares against (STEP 9). "Today" is the owner's calendar day (Asia/Jakarta),
        // never the host's, so month windows and freshness do not flip hours late on a UTC host.
        var startedAt = time.GetUtcNow().UtcDateTime;
        var today = DateOnly.FromDateTime(time.GetLocalNow().DateTime);

        var inputs = await LoadInputsAsync(userId, today, ct);

        var indicators = new List<IndicatorScoreDto>
        {
            ComputeSpendLtIncome(inputs),
            Unavailable("pay_bills_on_time", "Bill due-date tracking not yet available"),
            ComputeLiquidSavings(inputs),
            ComputeDti(inputs),
            ComputeSavingsRate(inputs),
            Unavailable("appropriate_insurance", "Insurance module not yet available"),
            Unavailable("prime_credit", "Credit bureau integration not yet available"),
            Unavailable("passive_income", "Dividend/yield tracker not yet available"),
        };

        var levelScores = ComputeLevelScores(indicators);
        var totalScore = levelScores.Values.Any() ? Math.Round(levelScores.Values.Average(), 2) : 0m;
        var currentLevel = DetermineCurrentLevel(levelScores, indicators);

        await PersistStateAsync(userId, currentLevel, totalScore, levelScores, indicators, ct);
        await PersistSnapshotsAsync(userId, indicators, ct);
        var achievements = await EvaluateAchievementsAsync(userId, indicators, ct);

        logger.LogInformation("Journey recalculated: level={Level} score={Score}", currentLevel, totalScore);

        var state = new JourneyStateDto(currentLevel, totalScore, levelScores, indicators, achievements, startedAt);
        return new JourneyRecalculation(state, inputs with { Indicators = indicators });
    }

    // ─── Load once ───────────────────────────────────────────────────────────────

    // Everything a scoring pass needs, loaded once. Each source is read in its own try/catch and
    // left null on failure, so a dependent indicator reports "Computation error" instead of guessing.
    private async Task<ScoringSnapshot> LoadInputsAsync(Guid userId, DateOnly today, CancellationToken ct)
    {
        var start = new DateTime(today.Year, today.Month, 1).AddMonths(-3);
        var end = today.ToDateTime(TimeOnly.MinValue);

        IReadOnlyList<Transaction>? transactions = null;
        try { transactions = await FetchTransactionsAsync(start, end); }
        catch (Exception ex) { logger.LogError(ex, "Failed to load transactions for scoring"); }

        IReadOnlyList<SavingsAccountFact>? savings = null;
        try { savings = await LoadSavingsAccountsAsync(); }
        catch (Exception ex) { logger.LogError(ex, "Failed to load savings accounts for scoring"); }

        IReadOnlyList<Liability>? liabilities = null;
        try { liabilities = (await supabase.From<Liability>().Get()).Models; }
        catch (Exception ex) { logger.LogError(ex, "Failed to load liabilities for scoring"); }

        DateTime? confirmedAt = null;
        var confirmationLoaded = false;
        try
        {
            confirmedAt = await confirmation.GetNoDebtsConfirmedAtAsync(userId, ct);
            confirmationLoaded = true;
        }
        catch (Exception ex) { logger.LogError(ex, "Failed to read no-debts confirmation for scoring"); }

        return new ScoringSnapshot(today, transactions, savings, liabilities, confirmedAt, confirmationLoaded,
            Array.Empty<IndicatorScoreDto>());
    }

    // Savings accounts plus their latest valuation, loaded with one valuations query (not one per
    // account): fetch all valuations for the savings accounts ordered newest-first, then take the
    // first row per account in memory.
    private async Task<IReadOnlyList<SavingsAccountFact>> LoadSavingsAccountsAsync()
    {
        var accounts = await supabase.From<Account>()
            .Filter("account_type", Operator.Equals, JourneyScoringRules.SavingsAccountType)
            .Get();

        if (accounts.Models.Count == 0)
            return Array.Empty<SavingsAccountFact>();

        var ids = accounts.Models.Select(a => (object)a.Id.ToString()).ToList();
        var valuations = await supabase.From<Valuation>()
            .Filter("subject_type", Operator.Equals, JourneyScoringRules.AccountValuationSubjectType)
            .Filter("subject_id", Operator.In, ids)
            .Order("valued_at", Ordering.Descending)
            .Get();

        var latestByAccount = valuations.Models
            .GroupBy(v => v.SubjectId)
            .ToDictionary(g => g.Key, g => g.First());  // ordered descending, so first is latest

        return accounts.Models.Select(a =>
        {
            latestByAccount.TryGetValue(a.Id, out var v);
            return new SavingsAccountFact(a.Id, a.Name, v?.ValueIdr, v?.ValuedAt);
        }).ToList();
    }

    // ─── Indicators (computed from the snapshot, no I/O) ─────────────────────────

    internal IndicatorScoreDto ComputeSpendLtIncome(ScoringSnapshot s)
    {
        const string code = "spend_lt_income";
        const string level = "L1";
        const string displayName = "Spend less than income";
        const string description = "3-month rolling average of spending (excluding money you saved or invested) vs. income";

        if (s.Transactions is null)
            return NotAvailable(code, level, displayName, "Computation error");

        try
        {
            var months = MonthsBack(s.Today);
            var ratios = JourneyScoringRules.MonthlyConsumptionRatios(s.Transactions, months);

            if (!ratios.Any())
                return NotAvailable(code, level, displayName, "No income data in last 3 months");

            var avgRatio = ratios.Average();
            var score = ScoreSpendRatio(avgRatio);
            var status = DeriveStatus(score);

            return new IndicatorScoreDto(code, level, Math.Round(score, 1), Math.Round(avgRatio, 4), status, displayName, description);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Failed to compute {Indicator}", code);
            return NotAvailable(code, level, displayName, "Computation error");
        }
    }

    internal IndicatorScoreDto ComputeLiquidSavings(ScoringSnapshot s)
    {
        const string code = "liquid_savings_ratio";
        const string level = "L2";
        const string displayName = "Liquid savings ratio";
        const string description = "Emergency fund in months of average monthly spending (excluding money you saved or invested)";

        if (s.SavingsAccounts is null || s.Transactions is null)
            return NotAvailable(code, level, displayName, "Computation error");

        try
        {
            if (s.SavingsAccounts.Count == 0)
                return NotAvailable(code, level, displayName, "No savings accounts found");

            var totalLiquidIdr = s.SavingsAccounts.Sum(a => a.LatestValueIdr ?? 0m);

            var months = MonthsBack(s.Today);
            var avgMonthlyExpense = JourneyScoringRules.AverageMonthlyConsumption(s.Transactions, months);

            if (avgMonthlyExpense <= 0)
                return NotAvailable(code, level, displayName, "No expense data to compute ratio");

            var monthsCoverage = totalLiquidIdr / avgMonthlyExpense;
            var score = ScoreLiquidSavings(monthsCoverage);
            var status = DeriveStatus(score);

            return new IndicatorScoreDto(code, level, Math.Round(score, 1), Math.Round(monthsCoverage, 2), status, displayName, description);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Failed to compute {Indicator}", code);
            return NotAvailable(code, level, displayName, "Computation error");
        }
    }

    internal IndicatorScoreDto ComputeDti(ScoringSnapshot s)
    {
        const string code = "manageable_dti";
        const string level = "L2";
        const string displayName = "Manageable debt (DTI)";
        const string description = "Monthly debt payments as % of take-home income";

        // Fail closed if debt data or the confirmation could not be read (PF-151's rule): never guess.
        if (s.Liabilities is null || !s.ConfirmationLoaded)
            return NotAvailable(code, level, displayName, "Computation error");

        try
        {
            var months = MonthsBack(s.Today);
            var avgMonthlyIncome = JourneyScoringRules.AverageMonthlyIncome(s.Transactions ?? Array.Empty<Transaction>(), months);

            var outcome = JourneyScoringRules.EvaluateDti(s.Liabilities, s.NoDebtsConfirmedAt, avgMonthlyIncome);
            if (outcome.Dti is not { } dti)
                return NotAvailable(code, level, displayName, outcome.NotEvaluatedReason!);

            var score = ScoreDti(dti);
            var status = DeriveStatus(score);

            return new IndicatorScoreDto(code, level, Math.Round(score, 1), Math.Round(dti, 4), status, displayName, description);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Failed to compute {Indicator}", code);
            return NotAvailable(code, level, displayName, "Computation error");
        }
    }

    internal IndicatorScoreDto ComputeSavingsRate(ScoringSnapshot s)
    {
        const string code = "savings_rate";
        const string level = "L3";
        const string displayName = "Long-term savings rate";
        const string description = "Investment contributions as % of monthly income (3-month avg)";

        if (s.Transactions is null)
            return NotAvailable(code, level, displayName, "Computation error");

        try
        {
            var months = MonthsBack(s.Today);

            var avgMonthlyIncome = JourneyScoringRules.AverageMonthlyIncome(s.Transactions, months);

            if (avgMonthlyIncome <= 0)
                return NotAvailable(code, level, displayName, "No income data to compute savings rate");

            var avgMonthlyContribution = JourneyScoringRules.AverageMonthlySavingsOutflow(s.Transactions, months);

            var savingsRate = avgMonthlyContribution / avgMonthlyIncome;
            var score = ScoreSavingsRate(savingsRate);
            var status = DeriveStatus(score);

            return new IndicatorScoreDto(code, level, Math.Round(score, 1), Math.Round(savingsRate, 4), status, displayName, description);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Failed to compute {Indicator}", code);
            return NotAvailable(code, level, displayName, "Computation error");
        }
    }

    // The three months before "today", exactly as the service used (today.AddMonths(-1..-3)).
    private static List<DateTime> MonthsBack(DateOnly today)
    {
        var anchor = today.ToDateTime(TimeOnly.MinValue);
        return Enumerable.Range(1, 3).Select(i => anchor.AddMonths(-i)).ToList();
    }

    // ─── Scoring Formulas (from specs/scoring-rubric.md) ───────────────────────

    internal static decimal ScoreSpendRatio(decimal ratio)
    {
        if (ratio >= 1.00m) return 0m;
        if (ratio <= 0.80m) return 100m;
        if (ratio <= 0.95m)
            return 50m + (0.95m - ratio) / (0.95m - 0.80m) * 50m;
        return (1.00m - ratio) / (1.00m - 0.95m) * 50m;
    }

    internal static decimal ScoreLiquidSavings(decimal months)
    {
        if (months <= 0.5m) return 0m;
        if (months >= 3.0m) return 100m;
        if (months <= 1.5m)
            return (months - 0.5m) / (1.5m - 0.5m) * 50m;
        return 50m + (months - 1.5m) / (3.0m - 1.5m) * 50m;
    }

    internal static decimal ScoreDti(decimal dti)
    {
        if (dti >= 0.50m) return 0m;
        if (dti <= 0.20m) return 100m;
        if (dti <= 0.36m)
            return 50m + (0.36m - dti) / (0.36m - 0.20m) * 50m;
        return (0.50m - dti) / (0.50m - 0.36m) * 50m;
    }

    internal static decimal ScoreSavingsRate(decimal rate)
    {
        if (rate <= 0m) return 0m;
        if (rate >= 0.15m) return 100m;
        if (rate <= 0.05m)
            return rate / 0.05m * 50m;
        return 50m + (rate - 0.05m) / (0.15m - 0.05m) * 50m;
    }

    // ─── Level Aggregation ─────────────────────────────────────────────────────

    internal static Dictionary<string, decimal> ComputeLevelScores(List<IndicatorScoreDto> indicators)
    {
        var result = new Dictionary<string, decimal>();
        foreach (var level in new[] { "L1", "L2", "L3", "L4", "L5" })
        {
            var live = indicators
                .Where(i => i.Level == level && i.Status != "no_data")
                .ToList();

            if (live.Any())
                result[level] = Math.Round(live.Average(i => i.Score), 2);
        }
        return result;
    }

    internal static int DetermineCurrentLevel(
        Dictionary<string, decimal> levelScores,
        List<IndicatorScoreDto> indicators)
    {
        var graduated = 1;
        foreach (var level in new[] { "L1", "L2", "L3", "L4", "L5" })
        {
            var liveIndicators = indicators
                .Where(i => i.Level == level && i.Status != "no_data")
                .ToList();

            if (!liveIndicators.Any()) break;
            if (liveIndicators.All(i => i.Score >= 70))
                graduated = int.Parse(level[1..]);
            else
                break;
        }
        return graduated;
    }

    // ─── Achievements ──────────────────────────────────────────────────────────

    private async Task<List<AchievementDto>> EvaluateAchievementsAsync(
        Guid userId,
        List<IndicatorScoreDto> indicators,
        CancellationToken ct)
    {
        var toUnlock = JourneyScoringRules.AchievementsEarned(indicators);
        var unlocked = (await LoadAchievementsAsync(userId, ct)).Select(a => a.Code).ToHashSet();

        // Insert, never Upsert: postgrest-csharp serializes the primary key on Upsert even with
        // shouldInsert: false, so every upsert wrote id 0 and a new unlock overwrote the previous
        // one. Inserting only new codes also keeps the original unlocked_at.
        foreach (var code in toUnlock.Where(c => !unlocked.Contains(c)))
        {
            try
            {
                await supabase.From<JourneyAchievement>()
                    .Insert(new JourneyAchievement
                    {
                        UserId = userId,
                        AchievementCode = code,
                        UnlockedAt = DateTime.UtcNow,
                    });
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Failed to insert achievement {Code}", code);
            }
        }

        return await LoadAchievementsAsync(userId, ct);
    }

    private async Task<List<AchievementDto>> LoadAchievementsAsync(Guid userId, CancellationToken ct)
    {
        var rows = await supabase.From<JourneyAchievement>()
            .Filter("user_id", Operator.Equals, userId.ToString())
            .Get();

        return rows.Models.Select(a => new AchievementDto(
            a.AchievementCode,
            AchievementNames.GetValueOrDefault(a.AchievementCode, a.AchievementCode),
            a.UnlockedAt)).ToList();
    }

    // ─── Persistence ───────────────────────────────────────────────────────────

    private async Task PersistStateAsync(
        Guid userId, int currentLevel, decimal totalScore,
        Dictionary<string, decimal> levelScores, List<IndicatorScoreDto> indicators,
        CancellationToken ct)
    {
        var indicatorMap = JourneyScoringRules.LiveScoreMap(indicators);

        await supabase.From<UserJourneyState>()
            .Upsert(new UserJourneyState
            {
                UserId = userId,
                CurrentLevel = (short)currentLevel,
                TotalScore = totalScore,
                LevelScoresJson = JsonSerializer.Serialize(levelScores),
                IndicatorScoresJson = JsonSerializer.Serialize(indicatorMap),
                LastComputedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow,
            });
    }

    private async Task PersistSnapshotsAsync(
        Guid userId, List<IndicatorScoreDto> indicators, CancellationToken ct)
    {
        var today = DateOnly.FromDateTime(DateTime.Today);

        // Today's rows become exactly the live indicators: clear today's rows, then insert the live
        // ones. This also removes today's row for an indicator that is not evaluated, so state and
        // snapshot cannot disagree on the same day (e.g. "I have no debts" then Undo). Earlier days
        // are never touched. Insert, never Upsert: postgrest-csharp serializes the primary key on
        // Upsert even with shouldInsert: false, so every upsert wrote id 0 over one shared row.
        try
        {
            await supabase.From<JourneyIndicatorSnapshot>()
                .Filter("user_id", Operator.Equals, userId.ToString())
                .Filter("snapshot_date", Operator.Equals, today.ToString("yyyy-MM-dd"))
                .Delete();

            var rows = indicators
                .Where(i => i.Status != "no_data")
                .Select(i => new JourneyIndicatorSnapshot
                {
                    UserId = userId,
                    SnapshotDate = today,
                    IndicatorCode = i.Code,
                    Score = i.Score,
                    RawValue = i.RawValue,
                    CreatedAt = DateTime.UtcNow,
                })
                .ToList();

            if (rows.Count > 0)
                await supabase.From<JourneyIndicatorSnapshot>().Insert(rows);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Failed to persist today's indicator snapshots");
        }
    }

    // ─── Helpers ───────────────────────────────────────────────────────────────

    private async Task<List<Transaction>> FetchTransactionsAsync(DateTime start, DateTime end)
    {
        var all = new List<Transaction>();
        int pageSize = 1000;
        int offset = 0;
        bool hasMore = true;

        while (hasMore)
        {
            var result = await supabase.From<Transaction>()
                .Filter("date", Operator.GreaterThanOrEqual, start)
                .Filter("date", Operator.LessThanOrEqual, end)
                .Order("date", Ordering.Descending)
                .Range(offset, offset + pageSize - 1)
                .Get();

            all.AddRange(result.Models);
            if (result.Models.Count < pageSize) hasMore = false;
            else offset += pageSize;
        }

        return all;
    }

    private static IndicatorScoreDto NotAvailable(string code, string level, string displayName, string description) =>
        new(code, level, 0m, null, "no_data", displayName, description);

    private static IndicatorScoreDto Unavailable(string code, string reason)
    {
        var definition = JourneyScoringRules.Definitions.First(d => d.Code == code);
        return NotAvailable(code, definition.Level, definition.DisplayName, reason);
    }

    private static string DeriveStatus(decimal score) =>
        score >= 70 ? "achieved" : score > 0 ? "in_progress" : "not_started";

    internal static List<IndicatorScoreDto> BuildIndicatorDtos(Dictionary<string, decimal> liveScores) =>
        JourneyScoringRules.Definitions.Select(d =>
            d.HasDataSource && liveScores.TryGetValue(d.Code, out var score)
                ? new IndicatorScoreDto(d.Code, d.Level, score, null, DeriveStatus(score), d.DisplayName, d.Description)
                : new IndicatorScoreDto(d.Code, d.Level, 0m, null, "no_data", d.DisplayName, d.Description)).ToList();

    private static Dictionary<string, decimal> ParseJsonDecimalMap(string json)
    {
        try
        {
            return JsonSerializer.Deserialize<Dictionary<string, decimal>>(json) ?? new();
        }
        catch
        {
            return new();
        }
    }
}
