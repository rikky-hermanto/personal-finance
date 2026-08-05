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

    // ---------------------------------------------------------------------
    // Mandate presets
    //
    // Source: CIO review, 2026-07-30 (FIN-02 — no magic thresholds). Two presets only, plus an
    // earned unlock. Deliberately NO "Aggressive" preset: a first-time user who can select the
    // loosest limits on day one has no basis for knowing they should not, and the product's own
    // sequencing principle says a tier you have not earned reads as locked, not as a menu item.
    //
    // "Standard" is DeskDefaults.MandateDefault verbatim — already a defensible institutional-style
    // conservative default. It is surfaced as a named preset rather than invented anew, so there is
    // exactly one place these numbers live.
    // "Learning" halves it again, because habit formation, not return, is the job at that stage.
    // ---------------------------------------------------------------------

    /// <summary>Closed trades required before the Standard preset unlocks.</summary>
    public const int StandardUnlockClosedTrades = 20;

    /// <summary>Mandate-compliance rate (0–1) required across those trades.</summary>
    public const decimal StandardUnlockComplianceRate = 0.90m;

    public const string LearningPresetKey = "learning";
    public const string StandardPresetKey = "standard";

    /// <summary>Learning tier — the forced default for any user with no approved mandate history.</summary>
    public static readonly MandateParamsDto LearningParams = MandateDefault with
    {
        Preset = "Learning",
        RiskPerTradePct = 0.25m,        // half of Standard — one bad trade barely dents the account
        HardCeilingPct = 0.50m,
        DailyLossLimitPct = 0.75m,      // ~3 losing trades stops the day
        WeeklyLossLimitPct = 2.00m,
        MonthlyLossLimitPct = 4.00m,
        NormalHeatPct = 1.00m,
        HardHeatPct = 1.50m,            // caps concurrent positions at ~6 at this risk/trade
        ClusterHeatPct = 0.75m,
        MaxSingleStockPct = 7.50m,
        MaxCryptoSymbolPct = 5.00m,
        MaxAltcoinPct = 1.50m,
        MinRR = 2.00m,                  // unchanged — 2R is the floor at every tier
        ConsecutiveLossStop = 2,        // tighter than Standard's 3: no track record yet
        LeverageEnabled = false,
        AveragingDownEnabled = false,
    };

    /// <summary>Standard tier — MandateDefault, unlocked by demonstrated discipline.</summary>
    public static readonly MandateParamsDto StandardParams = MandateDefault with { Preset = "Standard" };

    /// <summary>
    /// Builds the selectable preset list. <paramref name="stats"/> decides whether Standard is
    /// unlocked — the gate is demonstrated discipline, never time elapsed.
    /// </summary>
    public static List<MandatePresetDto> BuildPresets(JournalStatsDto stats)
    {
        var standardUnlocked =
            stats.Closed >= StandardUnlockClosedTrades &&
            stats.ComplianceRate >= StandardUnlockComplianceRate;

        return
        [
            new MandatePresetDto(
                Key: LearningPresetKey,
                Name: "Learning",
                Tagline: "Smallest sensible risk while you build the habit.",
                WhoItIsFor: "Start here if this is your first mandate, or if you have ever overridden your own position size.",
                Highlights:
                [
                    "Risk 0.25% of trading capital per trade — about Rp250.000 on a Rp100 juta account.",
                    "The day stops after roughly three losing trades (0.75% daily limit).",
                    "Two losses in a row pauses trading until you review.",
                    "No leverage, no averaging down — not adjustable at this tier.",
                    "Reward:risk must be at least 2:1, same as every tier.",
                ],
                Params: LearningParams,
                Locked: false,
                UnlockRequirement: null),

            new MandatePresetDto(
                Key: StandardPresetKey,
                Name: "Standard",
                Tagline: "The desk's normal operating limits.",
                WhoItIsFor: "Unlocks once your journal shows you actually trade the plan you wrote.",
                Highlights:
                [
                    "Risk 0.50% per trade — double Learning, still half the common retail 1–2% rule.",
                    "Daily 1% / weekly 2.5% / monthly 5% loss limits.",
                    "Up to 3% total risk across all open positions at once.",
                    "Three losses in a row pauses trading.",
                    "No leverage, no averaging down.",
                ],
                Params: StandardParams,
                Locked: !standardUnlocked,
                UnlockRequirement: standardUnlocked
                    ? null
                    : $"Log {StandardUnlockClosedTrades} closed trades with at least "
                      + $"{StandardUnlockComplianceRate:P0} mandate compliance "
                      + $"(currently {stats.Closed} closed, {stats.ComplianceRate:P0} compliant)."),
        ];
    }
}
