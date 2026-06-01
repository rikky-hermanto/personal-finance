using System.Text.Json;
using Microsoft.Extensions.Logging;
using PersonalFinance.Application.Dtos;
using PersonalFinance.Application.Interfaces;
using PersonalFinance.Domain.Entities;
using static Supabase.Postgrest.Constants;

namespace PersonalFinance.Application.Services;

public class JourneyScoringService(
    Supabase.Client supabase,
    ILogger<JourneyScoringService> logger
) : IJourneyScoringService
{
    private static readonly Guid PlaceholderUserId = Guid.Parse("00000000-0000-0000-0000-000000000001");

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

    public async Task<JourneyStateDto> RecalculateAsync(Guid userId, CancellationToken ct = default)
    {
        logger.LogInformation("Recalculating journey scores for user {UserId}", userId);

        var indicators = new List<IndicatorScoreDto>();

        var spendLtIncome = await ComputeSpendLtIncomeAsync(ct);
        indicators.Add(spendLtIncome);
        indicators.Add(NotAvailable("pay_bills_on_time", "L1", "Pay bills on time",
            "Bill due-date tracking not yet available"));

        var liquidSavings = await ComputeLiquidSavingsAsync(ct);
        indicators.Add(liquidSavings);

        var dti = await ComputeDtiAsync(ct);
        indicators.Add(dti);

        var savingsRate = await ComputeSavingsRateAsync(ct);
        indicators.Add(savingsRate);

        indicators.Add(NotAvailable("appropriate_insurance", "L3", "Appropriate insurance",
            "Insurance module not yet available"));
        indicators.Add(NotAvailable("prime_credit", "L3", "Prime credit score",
            "Credit bureau integration not yet available"));
        indicators.Add(NotAvailable("passive_income", "L4", "Passive income coverage",
            "Dividend/yield tracker not yet available"));

        var levelScores = ComputeLevelScores(indicators);
        var totalScore = levelScores.Values.Any() ? Math.Round(levelScores.Values.Average(), 2) : 0m;
        var currentLevel = DetermineCurrentLevel(levelScores, indicators);

        await PersistStateAsync(userId, currentLevel, totalScore, levelScores, indicators, ct);
        await PersistSnapshotsAsync(userId, indicators, ct);
        var achievements = await EvaluateAchievementsAsync(userId, indicators, ct);

        logger.LogInformation("Journey recalculated: level={Level} score={Score}", currentLevel, totalScore);

        return new JourneyStateDto(currentLevel, totalScore, levelScores, indicators, achievements, DateTime.UtcNow);
    }

    // ─── Indicators ────────────────────────────────────────────────────────────

    private async Task<IndicatorScoreDto> ComputeSpendLtIncomeAsync(CancellationToken ct)
    {
        const string code = "spend_lt_income";
        const string level = "L1";
        const string displayName = "Spend less than income";
        const string description = "3-month rolling average of expense vs. income ratio";

        try
        {
            var today = DateTime.Today;
            var start = new DateTime(today.Year, today.Month, 1).AddMonths(-3);
            var transactions = await FetchTransactionsAsync(start, today);

            var months = Enumerable.Range(1, 3)
                .Select(i => today.AddMonths(-i))
                .ToList();

            var ratios = months
                .Select(m =>
                {
                    var income = transactions
                        .Where(t => t.Date.Year == m.Year && t.Date.Month == m.Month
                                 && t.Type.Equals("Income", StringComparison.OrdinalIgnoreCase))
                        .Sum(t => t.AmountIdr);
                    var expense = transactions
                        .Where(t => t.Date.Year == m.Year && t.Date.Month == m.Month
                                 && t.Type.Equals("Expense", StringComparison.OrdinalIgnoreCase))
                        .Sum(t => t.AmountIdr);
                    return income > 0 ? (decimal?)(expense / income) : null;
                })
                .Where(r => r.HasValue)
                .Select(r => r!.Value)
                .ToList();

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

    private async Task<IndicatorScoreDto> ComputeLiquidSavingsAsync(CancellationToken ct)
    {
        const string code = "liquid_savings_ratio";
        const string level = "L2";
        const string displayName = "Liquid savings ratio";
        const string description = "Emergency fund in months of average monthly expense";

        try
        {
            // Get savings accounts
            var accounts = await supabase.From<Account>()
                .Filter("account_type", Operator.Equals, "Savings")
                .Get();

            if (!accounts.Models.Any())
                return NotAvailable(code, level, displayName, "No savings accounts found");

            // Get latest valuations for each savings account
            decimal totalLiquidIdr = 0m;
            foreach (var account in accounts.Models)
            {
                var valuation = await supabase.From<Valuation>()
                    .Filter("subject_type", Operator.Equals, "Account")
                    .Filter("subject_id", Operator.Equals, account.Id.ToString())
                    .Order("valued_at", Ordering.Descending)
                    .Limit(1)
                    .Get();

                if (valuation.Models.Count > 0)
                    totalLiquidIdr += valuation.Models[0].ValueIdr;
            }

            // Avg monthly expense (last 3 months)
            var today = DateTime.Today;
            var start = new DateTime(today.Year, today.Month, 1).AddMonths(-3);
            var transactions = await FetchTransactionsAsync(start, today);

            var months = Enumerable.Range(1, 3).Select(i => today.AddMonths(-i)).ToList();
            var avgMonthlyExpense = months
                .Select(m => transactions
                    .Where(t => t.Date.Year == m.Year && t.Date.Month == m.Month
                             && t.Type.Equals("Expense", StringComparison.OrdinalIgnoreCase))
                    .Sum(t => t.AmountIdr))
                .DefaultIfEmpty(0m)
                .Average();

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

    private async Task<IndicatorScoreDto> ComputeDtiAsync(CancellationToken ct)
    {
        const string code = "manageable_dti";
        const string level = "L2";
        const string displayName = "Manageable debt (DTI)";
        const string description = "Monthly debt payment as % of monthly income";

        try
        {
            var liabilities = await supabase.From<Liability>().Get();
            var totalMonthlyPayment = liabilities.Models
                .Where(l => l.MonthlyPayment.HasValue)
                .Sum(l => l.MonthlyPayment!.Value);

            var today = DateTime.Today;
            var start = new DateTime(today.Year, today.Month, 1).AddMonths(-3);
            var transactions = await FetchTransactionsAsync(start, today);

            var months = Enumerable.Range(1, 3).Select(i => today.AddMonths(-i)).ToList();
            var avgMonthlyIncome = months
                .Select(m => transactions
                    .Where(t => t.Date.Year == m.Year && t.Date.Month == m.Month
                             && t.Type.Equals("Income", StringComparison.OrdinalIgnoreCase))
                    .Sum(t => t.AmountIdr))
                .DefaultIfEmpty(0m)
                .Average();

            if (avgMonthlyIncome <= 0)
                return NotAvailable(code, level, displayName, "No income data to compute DTI");

            var dti = totalMonthlyPayment / avgMonthlyIncome;
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

    private async Task<IndicatorScoreDto> ComputeSavingsRateAsync(CancellationToken ct)
    {
        const string code = "savings_rate";
        const string level = "L3";
        const string displayName = "Long-term savings rate";
        const string description = "Investment contributions as % of monthly income (3-month avg)";

        try
        {
            var today = DateTime.Today;
            var start = new DateTime(today.Year, today.Month, 1).AddMonths(-3);
            var transactions = await FetchTransactionsAsync(start, today);

            var months = Enumerable.Range(1, 3).Select(i => today.AddMonths(-i)).ToList();

            var investmentCategories = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
            {
                "Investment", "Savings Transfer", "Investasi", "Tabungan"
            };

            var avgMonthlyIncome = months
                .Select(m => transactions
                    .Where(t => t.Date.Year == m.Year && t.Date.Month == m.Month
                             && t.Type.Equals("Income", StringComparison.OrdinalIgnoreCase))
                    .Sum(t => t.AmountIdr))
                .DefaultIfEmpty(0m)
                .Average();

            if (avgMonthlyIncome <= 0)
                return NotAvailable(code, level, displayName, "No income data to compute savings rate");

            var avgMonthlyContribution = months
                .Select(m => transactions
                    .Where(t => t.Date.Year == m.Year && t.Date.Month == m.Month
                             && investmentCategories.Contains(t.Category))
                    .Sum(t => t.AmountIdr))
                .DefaultIfEmpty(0m)
                .Average();

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

    // ─── Scoring Formulas (from specs/scoring-rubric.md) ───────────────────────

    private static decimal ScoreSpendRatio(decimal ratio)
    {
        if (ratio >= 1.00m) return 0m;
        if (ratio <= 0.80m) return 100m;
        if (ratio <= 0.95m)
            return 50m + (0.95m - ratio) / (0.95m - 0.80m) * 50m;
        return (1.00m - ratio) / (1.00m - 0.95m) * 50m;
    }

    private static decimal ScoreLiquidSavings(decimal months)
    {
        if (months <= 0.5m) return 0m;
        if (months >= 3.0m) return 100m;
        if (months <= 1.5m)
            return (months - 0.5m) / (1.5m - 0.5m) * 50m;
        return 50m + (months - 1.5m) / (3.0m - 1.5m) * 50m;
    }

    private static decimal ScoreDti(decimal dti)
    {
        if (dti >= 0.50m) return 0m;
        if (dti <= 0.20m) return 100m;
        if (dti <= 0.36m)
            return 50m + (0.36m - dti) / (0.36m - 0.20m) * 50m;
        return (0.50m - dti) / (0.50m - 0.36m) * 50m;
    }

    private static decimal ScoreSavingsRate(decimal rate)
    {
        if (rate <= 0m) return 0m;
        if (rate >= 0.15m) return 100m;
        if (rate <= 0.05m)
            return rate / 0.05m * 50m;
        return 50m + (rate - 0.05m) / (0.15m - 0.05m) * 50m;
    }

    // ─── Level Aggregation ─────────────────────────────────────────────────────

    private static Dictionary<string, decimal> ComputeLevelScores(List<IndicatorScoreDto> indicators)
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

    private static int DetermineCurrentLevel(
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
        var toUnlock = new List<string>();
        Func<string, IndicatorScoreDto?> get = indicator => indicators.FirstOrDefault(i => i.Code == indicator);

        if (get("spend_lt_income")?.Score >= 70) toUnlock.Add("positive_cashflow_3mo");
        if (get("liquid_savings_ratio")?.Score >= 100) toUnlock.Add("emergency_ready");
        if (get("manageable_dti")?.Score >= 100) toUnlock.Add("debt_free");
        if (get("savings_rate")?.Score >= 70) toUnlock.Add("consistent_investor");

        var l1Indicators = indicators.Where(i => i.Level == "L1" && i.Status != "no_data").ToList();
        if (l1Indicators.Any() && l1Indicators.All(i => i.Score >= 70)) toUnlock.Add("graduated_l1");

        var l2Indicators = indicators.Where(i => i.Level == "L2" && i.Status != "no_data").ToList();
        if (l2Indicators.Any() && l2Indicators.All(i => i.Score >= 70)) toUnlock.Add("graduated_l2");

        var l3Indicators = indicators.Where(i => i.Level == "L3" && i.Status != "no_data").ToList();
        if (l3Indicators.Any() && l3Indicators.All(i => i.Score >= 70)) toUnlock.Add("graduated_l3");

        foreach (var code in toUnlock)
        {
            try
            {
                await supabase.From<JourneyAchievement>()
                    .Upsert(new JourneyAchievement
                    {
                        UserId = userId,
                        AchievementCode = code,
                        UnlockedAt = DateTime.UtcNow,
                    });
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Failed to upsert achievement {Code}", code);
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
        var indicatorMap = indicators.ToDictionary(i => i.Code, i => i.Score);

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
        foreach (var indicator in indicators.Where(i => i.Status != "no_data"))
        {
            try
            {
                await supabase.From<JourneyIndicatorSnapshot>()
                    .Upsert(new JourneyIndicatorSnapshot
                    {
                        UserId = userId,
                        SnapshotDate = today,
                        IndicatorCode = indicator.Code,
                        Score = indicator.Score,
                        RawValue = indicator.RawValue,
                    });
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Failed to persist snapshot for {Indicator}", indicator.Code);
            }
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

    private static string DeriveStatus(decimal score) =>
        score >= 70 ? "achieved" : score > 0 ? "in_progress" : "not_started";

    private static List<IndicatorScoreDto> BuildIndicatorDtos(Dictionary<string, decimal> map)
    {
        // Rebuild full indicator list from persisted scores — N/A indicators get no_data
        var definitions = new[]
        {
            (code: "spend_lt_income",          level: "L1", name: "Spend less than income",        desc: "3-month rolling average of expense vs. income ratio"),
            (code: "pay_bills_on_time",         level: "L1", name: "Pay bills on time",             desc: "Bill due-date tracking not yet available"),
            (code: "liquid_savings_ratio",      level: "L2", name: "Liquid savings ratio",          desc: "Emergency fund in months of average monthly expense"),
            (code: "manageable_dti",            level: "L2", name: "Manageable debt (DTI)",         desc: "Monthly debt payment as % of monthly income"),
            (code: "savings_rate",              level: "L3", name: "Long-term savings rate",        desc: "Investment contributions as % of monthly income"),
            (code: "appropriate_insurance",     level: "L3", name: "Appropriate insurance",         desc: "Insurance module not yet available"),
            (code: "prime_credit",              level: "L3", name: "Prime credit score",            desc: "Credit bureau integration not yet available"),
            (code: "passive_income",            level: "L4", name: "Passive income coverage",       desc: "Dividend/yield tracker not yet available"),
        };

        var naSet = new HashSet<string> { "pay_bills_on_time", "appropriate_insurance", "prime_credit", "passive_income" };

        return definitions.Select(d =>
        {
            if (naSet.Contains(d.code))
                return new IndicatorScoreDto(d.code, d.level, 0m, null, "no_data", d.name, d.desc);

            if (map.TryGetValue(d.code, out var score))
                return new IndicatorScoreDto(d.code, d.level, score, null, DeriveStatus(score), d.name, d.desc);

            return new IndicatorScoreDto(d.code, d.level, 0m, null, "not_started", d.name, d.desc);
        }).ToList();
    }

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
