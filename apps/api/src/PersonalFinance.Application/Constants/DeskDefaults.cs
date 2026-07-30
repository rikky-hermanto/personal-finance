using PersonalFinance.Application.Dtos.Desk;

namespace PersonalFinance.Application.Constants;

/// <summary>
/// Product policy for the Trading Desk mandate defaults and drawdown regime table.
/// Not demo data — genuine defaults, reviewable in a diff. Seed rows (accounts/positions/journal)
/// live in a migration instead; see supabase/migrations/20260730000002_trading_desk_seed.sql.
/// </summary>
public static class DeskDefaults
{
    public static readonly MandateParamsDto MandateDefault = new(
        Preset: "Conservative Personal Trader",
        ActiveTradingNav: 100_000_000m,
        ActiveTradingNavMode: "absolute",
        ActiveTradingNavPct: null,
        ActiveTradingNavApproved: false,
        RiskPerTradePct: 0.50m,
        HardCeilingPct: 1.00m,
        DailyLossLimitPct: 1.00m,
        WeeklyLossLimitPct: 2.50m,
        MonthlyLossLimitPct: 5.00m,
        NormalHeatPct: 2.00m,
        HardHeatPct: 3.00m,
        ClusterHeatPct: 1.25m,
        MaxSingleStockPct: 10.00m,
        MaxCryptoSymbolPct: 7.50m,
        MaxAltcoinPct: 2.50m,
        MinRR: 2.00m,
        ConsecutiveLossStop: 3,
        ReviewAt: 5,
        LeverageEnabled: false,
        AveragingDownEnabled: false
    );

    public static readonly IReadOnlyDictionary<string, RegimeDto> Regimes = new Dictionary<string, RegimeDto>
    {
        ["Normal"] = new RegimeDto("Normal", 1.5m, 1.00m),
        ["Caution"] = new RegimeDto("Caution", 4.0m, 0.50m),
        ["Defensive"] = new RegimeDto("Defensive", 6.5m, 0.25m),
        ["Risk Freeze"] = new RegimeDto("Risk Freeze", 9.0m, 0.00m),
    };

    public const string DefaultRegime = "Normal";
}
