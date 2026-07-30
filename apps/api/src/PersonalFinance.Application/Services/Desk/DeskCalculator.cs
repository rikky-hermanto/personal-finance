using System.Globalization;
using PersonalFinance.Application.Constants;
using PersonalFinance.Application.Dtos.Desk;

namespace PersonalFinance.Application.Services.Desk;

public record NavChainInputDto(
    decimal TentativeNav,
    decimal ReconciledNav,
    decimal LegacyMv,
    decimal OpenRisk,
    decimal TodaysRealizedPnl, // negative = loss
    string DrawdownRegime,
    MandateParamsDto Mandate
);

public record GateEvaluationInputDto(
    NavChainDto Chain,
    SizingDto? Sizing,
    TradePlanInputDto? Inputs,
    MandateParamsDto Mandate,
    JournalStatsDto JournalStats,
    List<DeskJournalEntryDto> JournalEntries,
    List<DeskPositionDto> Positions,
    DateOnly AsOfDate // "today" in Asia/Jakarta (WIB) — caller resolves wall-clock before calling
);

/// <summary>
/// Trading Desk gate/sizing engine — pure static class, zero Supabase/HTTP/ILogger dependencies.
/// Ported from docs/ideas/prototypes/trading-desk/pf-desk-data.js:100-302. Same formulas, same
/// thresholds, same rounding. Diverges from the prototype on daily/weekly/monthly-loss,
/// add-to-loser, cluster-heat and margin — see PF-133 Gate Rule Registry for rationale.
/// </summary>
public static class DeskCalculator
{
    public static decimal FloorToStep(decimal v, decimal step)
    {
        if (step == 0) return v;
        return Math.Floor(v / step) * step;
    }

    public static NavChainDto ComputeNavChain(NavChainInputDto input)
    {
        var reconciledNav = input.ReconciledNav;
        var legacyMv = input.LegacyMv;

        var mandate = input.Mandate;
        var activeTradingNav = mandate.ActiveTradingNavMode == "pctOfReconciled"
            ? reconciledNav * (mandate.ActiveTradingNavPct ?? 9.7m) / 100m
            : mandate.ActiveTradingNav;

        var reserve = reconciledNav - legacyMv - activeTradingNav;

        var regime = DeskDefaults.Regimes.TryGetValue(input.DrawdownRegime, out var r)
            ? r
            : DeskDefaults.Regimes[DeskDefaults.DefaultRegime];

        var adjustedRiskBudget = mandate.ActiveTradingNavApproved
            ? activeTradingNav * (mandate.RiskPerTradePct / 100m) * regime.Multiplier
            : 0m;

        var openRisk = input.OpenRisk;
        var heat = activeTradingNav != 0 ? openRisk / activeTradingNav * 100m : 0m;

        var dailyLossLimit = activeTradingNav * (mandate.DailyLossLimitPct / 100m);
        var dailyHeadroom = dailyLossLimit - Math.Max(0, -input.TodaysRealizedPnl);

        return new NavChainDto(
            TentativeNav: input.TentativeNav,
            ReconciledNav: reconciledNav,
            LegacyMv: legacyMv,
            Reserve: reserve,
            ActiveTradingNav: activeTradingNav,
            Regime: regime,
            AdjustedRiskBudget: adjustedRiskBudget,
            OpenRisk: openRisk,
            Heat: heat,
            DailyLossLimit: dailyLossLimit,
            DailyHeadroom: dailyHeadroom
        );
    }

    public static SizingDto ComputeSizing(TradePlanInputDto inputs, NavChainDto chain, MandateParamsDto mandate)
    {
        var step = inputs.QtyStep > 0 ? inputs.QtyStep : 100m;

        if (inputs.Entry is null || inputs.Stop is null || inputs.Entry <= 0 || inputs.Stop <= 0)
            return new SizingDto(false, "entry-or-stop-missing", null, null, null, null, null, null, null, null, null, null, null, null, null);

        var entry = inputs.Entry.Value;
        var stop = inputs.Stop.Value;
        var isLong = inputs.Side != "short";

        if (isLong && stop >= entry)
            return new SizingDto(false, "invalid-stop-direction", null, null, null, null, null, null, null, null, null, null, null, null, null);
        if (!isLong && stop <= entry)
            return new SizingDto(false, "invalid-stop-direction", null, null, null, null, null, null, null, null, null, null, null, null, null);

        var unitRisk = isLong
            ? (entry - stop) + entry * (inputs.SlippagePct / 100m) + entry * (inputs.BuyFeePct / 100m) + stop * (inputs.SellFeePct / 100m)
            : (stop - entry) + entry * (inputs.SlippagePct / 100m) + entry * (inputs.SellFeePct / 100m) + stop * (inputs.BuyFeePct / 100m);

        var riskBudget = chain.AdjustedRiskBudget;
        var riskSizedQty = unitRisk > 0 ? riskBudget / unitRisk : 0m;
        var exposureCappedQty = entry > 0 ? (mandate.MaxSingleStockPct / 100m * chain.ActiveTradingNav) / entry : 0m;
        var entryCostPerUnit = isLong ? entry * (1 + inputs.BuyFeePct / 100m) : entry * (1 + inputs.SellFeePct / 100m);
        var cashCappedQty = entryCostPerUnit > 0 ? inputs.AvailableCash / entryCostPerUnit : 0m;

        var caps = new List<SizingCapDto>
        {
            new("risk", "Risk-sized", riskSizedQty),
            new("exposure", $"Exposure cap ({mandate.MaxSingleStockPct:F0}%)", exposureCappedQty),
            new("cash", "Cash cap", cashCappedQty),
        };

        var minQty = Math.Min(riskSizedQty, Math.Min(exposureCappedQty, cashCappedQty));
        var binding = caps.Aggregate((a, b) => b.Qty <= a.Qty ? b : a);
        var finalQty = FloorToStep(Math.Max(0, minQty), step);

        var plannedLoss = finalQty * unitRisk;
        var exitCosts = inputs.Target is not null ? finalQty * inputs.Target.Value * (inputs.SellFeePct / 100m) : 0m;
        var plannedReward = inputs.Target is not null ? finalQty * Math.Abs(inputs.Target.Value - entry) - exitCosts : (decimal?)null;
        var rr = plannedReward is not null && plannedLoss > 0 ? plannedReward / plannedLoss : (decimal?)null;
        var exposurePct = chain.ActiveTradingNav != 0 ? finalQty * entry / chain.ActiveTradingNav * 100m : 0m;
        var heatAfter = chain.ActiveTradingNav != 0 ? (chain.OpenRisk + plannedLoss) / chain.ActiveTradingNav * 100m : 0m;

        return new SizingDto(
            Valid: true,
            Reason: null,
            UnitRisk: unitRisk,
            Caps: caps,
            Binding: binding.Key,
            RiskSizedQty: riskSizedQty,
            ExposureCappedQty: exposureCappedQty,
            CashCappedQty: cashCappedQty,
            FinalQty: finalQty,
            FinalLots: Math.Floor(finalQty / step),
            PlannedLoss: plannedLoss,
            PlannedReward: plannedReward,
            Rr: rr,
            ExposurePct: exposurePct,
            HeatAfter: heatAfter
        );
    }

    /// <summary>
    /// Collapses positions of the same symbol held across multiple portfolios into one economic
    /// exposure. Gate rules evaluate aggregates; the UI still renders the per-portfolio rows.
    /// </summary>
    public static List<DeskPositionDto> AggregateBySymbol(List<DeskPositionDto> positions) =>
        positions
            .GroupBy(p => p.Symbol)
            .Select(g => g.Count() == 1 ? g.First() : g.First() with
            {
                AccountExternalKey = null,
                QtyShares = g.Sum(p => p.QtyShares ?? 0),
                QtyLots   = g.Sum(p => p.QtyLots ?? 0),
                CostIdr   = g.Sum(p => p.CostIdr),
                MvIdr     = g.Sum(p => p.MvIdr),
                PnlIdr    = g.Sum(p => p.PnlIdr),
                PnlPct    = g.Sum(p => p.CostIdr) != 0
                            ? g.Sum(p => p.PnlIdr) / g.Sum(p => p.CostIdr) * 100m
                            : 0m,
                AvgPrice  = g.Sum(p => p.QtyShares ?? 0) != 0
                            ? g.Sum(p => p.CostIdr) / g.Sum(p => p.QtyShares ?? 0)
                            : null,
                Weight    = g.Sum(p => p.Weight),
                // Any portfolio holding this name unclassified taints the whole exposure.
                Sleeve    = g.Any(p => p.Sleeve == "Legacy / Unclassified")
                            ? "Legacy / Unclassified"
                            : g.First().Sleeve,
            })
            .ToList();

    public static GateResultDto EvaluateGate(GateEvaluationInputDto input)
    {
        var chain = input.Chain;
        var sizing = input.Sizing;
        var inputs = input.Inputs;
        var mandate = input.Mandate;
        var journalStats = input.JournalStats;
        var rows = new List<GateRuleDto>();

        var noPlan = inputs is null || (inputs.Entry is null && inputs.Stop is null && string.IsNullOrEmpty(inputs.Symbol));
        var stopMissing = inputs is null || inputs.Entry is null || inputs.Stop is null;

        // 1. nav-approved
        rows.Add(new GateRuleDto(
            "nav-approved", "Active Trading NAV approved",
            mandate.ActiveTradingNavApproved ? "pass" : "blocked",
            mandate.ActiveTradingNavApproved ? "Approved" : "Unapproved", "Required", "—",
            mandate.ActiveTradingNavApproved ? null : "Active Trading NAV has not been approved",
            "The gate cannot open until Active Trading NAV is explicitly approved via triage step 4.",
            false));

        // 2. entry-stop
        rows.Add(new GateRuleDto(
            "entry-stop", "Entry & stop present",
            noPlan ? "unresolved" : (stopMissing ? "blocked" : "pass"),
            stopMissing ? "Missing" : "Present", "Both required", "—",
            stopMissing && !noPlan ? "Entry or stop is missing" : null,
            "A plan without entry and stop has no defined risk and cannot be sized.",
            false));

        // 3. stop-direction
        var invalidDir = sizing is { Valid: false, Reason: "invalid-stop-direction" };
        rows.Add(new GateRuleDto(
            "stop-direction", "Stop valid for direction",
            noPlan ? "unresolved" : (invalidDir ? "blocked" : (stopMissing ? "unresolved" : "pass")),
            invalidDir ? "Invalid" : (stopMissing ? "—" : "Valid"), "Stop on correct side of entry", "—",
            invalidDir ? "Stop is invalid for the selected direction" : null,
            "A long stop must sit below entry; a short stop must sit above entry.",
            false));

        // 4. risk-per-trade
        var riskOk = sizing is { Valid: true };
        rows.Add(new GateRuleDto(
            "risk-per-trade", "Risk per trade",
            noPlan ? "unresolved" : (riskOk ? "pass" : "unresolved"),
            riskOk ? FmtIdr(sizing!.PlannedLoss!.Value) : "—", FmtIdr(chain.AdjustedRiskBudget),
            riskOk ? FmtIdr(chain.AdjustedRiskBudget - sizing!.PlannedLoss!.Value) : "—",
            null,
            $"Planned loss at final size must not exceed the risk budget derived from Active Trading NAV × {mandate.RiskPerTradePct:F2}% × regime multiplier.",
            false));

        // 5. daily-loss — REAL: sum of today's negative NetPnl from journal
        var dailyLossAmt = -input.JournalEntries
            .Where(e => e.TradeDate == input.AsOfDate && e.NetPnl < 0)
            .Sum(e => e.NetPnl);
        var dailyBreach = dailyLossAmt > chain.DailyLossLimit;
        rows.Add(new GateRuleDto(
            "daily-loss", "Daily loss limit",
            dailyBreach ? "blocked" : "pass",
            FmtIdr(dailyLossAmt), FmtIdr(chain.DailyLossLimit), dailyBreach ? "Rp0" : FmtIdr(chain.DailyHeadroom),
            dailyBreach ? $"Daily loss limit {FmtIdr(chain.DailyLossLimit)} reached — all brokers are blocked" : null,
            $"Realized loss today across ALL brokers vs the daily limit of {mandate.DailyLossLimitPct:F2}% of Active Trading NAV. A breach blocks every broker simultaneously.",
            false));

        // 6. weekly-loss — REAL: sum of this ISO week's negative NetPnl
        var (asOfYear, asOfWeek) = (ISOWeek.GetYear(input.AsOfDate.ToDateTime(TimeOnly.MinValue)), ISOWeek.GetWeekOfYear(input.AsOfDate.ToDateTime(TimeOnly.MinValue)));
        var weeklyLossAmt = -input.JournalEntries
            .Where(e => e.NetPnl < 0)
            .Where(e =>
            {
                var dt = e.TradeDate.ToDateTime(TimeOnly.MinValue);
                return ISOWeek.GetYear(dt) == asOfYear && ISOWeek.GetWeekOfYear(dt) == asOfWeek;
            })
            .Sum(e => e.NetPnl);
        var weeklyLimit = chain.ActiveTradingNav * mandate.WeeklyLossLimitPct / 100m;
        var weeklyBreach = weeklyLossAmt > weeklyLimit;
        rows.Add(new GateRuleDto(
            "weekly-loss", "Weekly loss limit",
            weeklyBreach ? "blocked" : "pass",
            FmtIdr(weeklyLossAmt), FmtIdr(weeklyLimit), weeklyBreach ? "Rp0" : FmtIdr(weeklyLimit - weeklyLossAmt),
            weeklyBreach ? $"Weekly loss limit {FmtIdr(weeklyLimit)} reached" : null,
            $"Realized loss this ISO week (Asia/Jakarta) vs {mandate.WeeklyLossLimitPct:F2}% of Active Trading NAV.",
            false));

        // 7. monthly-loss — REAL: sum of this calendar month's negative NetPnl
        var monthlyLossAmt = -input.JournalEntries
            .Where(e => e.NetPnl < 0 && e.TradeDate.Year == input.AsOfDate.Year && e.TradeDate.Month == input.AsOfDate.Month)
            .Sum(e => e.NetPnl);
        var monthlyLimit = chain.ActiveTradingNav * mandate.MonthlyLossLimitPct / 100m;
        var monthlyBreach = monthlyLossAmt > monthlyLimit;
        rows.Add(new GateRuleDto(
            "monthly-loss", "Monthly loss limit",
            monthlyBreach ? "blocked" : "pass",
            FmtIdr(monthlyLossAmt), FmtIdr(monthlyLimit), monthlyBreach ? "Rp0" : FmtIdr(monthlyLimit - monthlyLossAmt),
            monthlyBreach ? $"Monthly loss limit {FmtIdr(monthlyLimit)} reached" : null,
            $"Realized loss this calendar month (Asia/Jakarta) vs {mandate.MonthlyLossLimitPct:F2}% of Active Trading NAV.",
            false));

        // 8. hard-heat
        var heatAfter = sizing is { Valid: true } ? sizing.HeatAfter!.Value : chain.Heat;
        var hardHeatBreach = heatAfter > mandate.HardHeatPct;
        rows.Add(new GateRuleDto(
            "hard-heat", "Hard portfolio heat",
            hardHeatBreach ? "blocked" : "pass",
            $"{heatAfter:F2}%", $"{mandate.HardHeatPct:F2}%", $"{mandate.HardHeatPct - heatAfter:F2}%",
            hardHeatBreach ? "Hard portfolio heat ceiling exceeded" : null,
            $"Sum of initial planned risk on all open positions, including this plan, vs the hard ceiling of {mandate.HardHeatPct:F2}% of Active Trading NAV.",
            false));

        // 9. cluster-heat — NOT IMPLEMENTED (PF-135: needs a correlation-group model)
        rows.Add(new GateRuleDto(
            "cluster-heat", "Correlated-cluster heat", "unresolved",
            "—", $"{mandate.ClusterHeatPct:F2}%", "—", null,
            "Combined risk of positions in the same correlation group — requires a correlation-group model. Tracked in PF-135.",
            true));

        // 10. single-symbol
        var exposurePct = sizing is { Valid: true } ? sizing.ExposurePct!.Value : 0m;
        var exposureBreach = exposurePct > mandate.MaxSingleStockPct;
        rows.Add(new GateRuleDto(
            "single-symbol", "Single-symbol exposure",
            noPlan ? "unresolved" : (exposureBreach ? "blocked" : "pass"),
            noPlan ? "—" : $"{exposurePct:F2}%", $"{mandate.MaxSingleStockPct:F2}%",
            noPlan ? "—" : $"{mandate.MaxSingleStockPct - exposurePct:F2}%",
            exposureBreach ? $"Single-symbol exposure exceeds the {mandate.MaxSingleStockPct:F2}% limit" : null,
            $"Planned position value ÷ Active Trading NAV vs the {mandate.MaxSingleStockPct:F2}% limit.",
            false));

        // 11. cash
        var cashBlock = sizing is { Valid: true } && sizing.FinalQty!.Value < (inputs?.QtyStep ?? 100m);
        rows.Add(new GateRuleDto(
            "cash", "Sufficient cash",
            noPlan ? "unresolved" : (cashBlock ? "blocked" : "pass"),
            noPlan ? "—" : (cashBlock ? "Insufficient" : "Sufficient"), "≥ 1 lot", "—",
            cashBlock ? "Sized quantity does not clear one full lot" : null,
            "Cash-capped quantity must clear at least one full lot at the configured step.",
            false));

        // 12. margin — REAL
        rows.Add(new GateRuleDto(
            "margin", "Margin required",
            mandate.LeverageEnabled == false ? "pass" : "unresolved",
            mandate.LeverageEnabled == false ? "Not applicable" : "Leverage enabled", "Cash accounts only", "—", null,
            "This mandate does not permit leverage; no margin call applies. If leverage is enabled, margin is not yet evaluated.",
            false));

        // 13. consecutive-loss
        var breaker = journalStats.ConsecutiveLosses >= mandate.ConsecutiveLossStop;
        rows.Add(new GateRuleDto(
            "consecutive-loss", "Consecutive-loss breaker",
            breaker ? "blocked" : "pass",
            $"{journalStats.ConsecutiveLosses} losses", $"{mandate.ConsecutiveLossStop} losses",
            breaker ? "0" : $"{mandate.ConsecutiveLossStop - journalStats.ConsecutiveLosses}",
            breaker ? "Consecutive-loss breaker is active" : null,
            $"Consecutive realized losses in the journal vs the breaker threshold of {mandate.ConsecutiveLossStop}.",
            false));

        // 14. drawdown-freeze
        var regimeFreeze = chain.Regime.Multiplier == 0;
        rows.Add(new GateRuleDto(
            "drawdown-freeze", "Drawdown risk freeze",
            regimeFreeze ? "blocked" : "pass",
            $"{chain.Regime.DrawdownPct:F2}% dd", "8.00% freeze threshold",
            regimeFreeze ? "0.00%" : $"{8 - chain.Regime.DrawdownPct:F2}%",
            regimeFreeze ? "Drawdown regime has frozen new risk (0.00x multiplier)" : null,
            "Regime is measured on the Active Trading NAV equity curve. Above 8% drawdown, the risk multiplier goes to 0.00x.",
            false));

        // 15. add-to-loser — REAL: position lookup, never a literal symbol
        var symbol = inputs?.Symbol;
        bool IsLosingLegacy(DeskPositionDto p) =>
            p.Symbol == symbol && p.Sleeve == "Legacy / Unclassified" && p.PnlPct < 0;
        var loserPosition = string.IsNullOrEmpty(symbol) ? null : input.Positions.FirstOrDefault(IsLosingLegacy);
        var addingLoser = loserPosition is not null;
        rows.Add(new GateRuleDto(
            "add-to-loser", "Adding to losing legacy position",
            noPlan ? "unresolved" : (addingLoser ? "blocked" : "pass"),
            noPlan ? "—" : (addingLoser ? $"{symbol} {loserPosition!.PnlPct:F2}%" : "n/a"),
            "No new risk on losing legacy names", "—",
            addingLoser ? $"Adding new risk to a losing legacy position ({symbol} {loserPosition!.PnlPct:F2}%)" : null,
            "A position that is Legacy / Unclassified and unrealized-negative may be trimmed or stopped out, never added to.",
            false));

        // 16. min-rr (warning)
        var rr = sizing is { Valid: true } ? sizing.Rr : null;
        var rrWarn = rr is not null && rr < mandate.MinRR;
        rows.Add(new GateRuleDto(
            "min-rr", "Minimum reward:risk",
            rrWarn ? "warning" : (rr is null ? "unresolved" : "pass"),
            rr is null ? "—" : FmtR(rr.Value), $"{mandate.MinRR:F2}R",
            rr is null ? "—" : $"{rr.Value - mandate.MinRR:F2}R", null,
            $"Planned reward ÷ planned loss vs the {mandate.MinRR:F2}R minimum this mandate requires.",
            false));

        // 17. near-concentration (warning)
        var nearLimit = exposurePct > mandate.MaxSingleStockPct * 0.9m && exposurePct <= mandate.MaxSingleStockPct;
        rows.Add(new GateRuleDto(
            "near-concentration", "Near concentration limit",
            nearLimit ? "warning" : "pass",
            $"{exposurePct:F2}%", $"90% of {mandate.MaxSingleStockPct:F2}%", nearLimit ? "<10%" : "clear", null,
            "Exposure within 10% of the single-name concentration limit deserves a second look before sizing up further.",
            false));

        // 18. wide-stop (warning)
        var wideStopPct = sizing is { Valid: true } && inputs?.Entry > 0
            ? Math.Abs(inputs.Entry!.Value - inputs.Stop!.Value) / inputs.Entry.Value * 100m
            : (decimal?)null;
        var wideStop = wideStopPct is not null && wideStopPct > 8m;
        rows.Add(new GateRuleDto(
            "wide-stop", "Stop width",
            wideStop ? "warning" : "pass",
            wideStopPct is null ? "—" : $"{wideStopPct:F2}%", "8.00% typical max", wideStop ? "over" : "clear", null,
            "Unusually wide stops raise unit risk and can indicate the setup does not fit this instrument's volatility.",
            false));

        var blockingRows = rows.Where(r => r.State == "blocked").ToList();
        var overall = blockingRows.Count > 0 ? "BLOCKED" : (rows.Any(r => r.State == "warning") ? "WARNING" : "PASS");
        var blockingReasons = blockingRows.Select(r => r.ReasonText ?? r.Name).ToList();

        return new GateResultDto(rows, overall, blockingReasons);
    }

    public static JournalStatsDto ComputeJournalStats(List<DeskJournalEntryDto> entries)
    {
        var closed = entries.Count;
        var wins = entries.Where(e => e.RealizedR > 0).ToList();
        var losses = entries.Where(e => e.RealizedR < 0).ToList();

        var winRate = closed > 0 ? (decimal)wins.Count / closed : 0m;
        var avgWinR = wins.Count > 0 ? wins.Average(e => e.RealizedR!.Value) : 0m;
        var avgLossR = losses.Count > 0 ? Math.Abs(losses.Average(e => e.RealizedR!.Value)) : 0m;
        var expectancyR = winRate * avgWinR - (1 - winRate) * avgLossR;

        var grossProfit = wins.Sum(e => e.RealizedR ?? 0m);
        var grossLoss = losses.Sum(e => e.RealizedR ?? 0m);
        var profitFactor = grossLoss != 0 ? grossProfit / Math.Abs(grossLoss) : (decimal?)null;

        var complianceRate = closed > 0 ? (decimal)entries.Count(e => e.Compliant) / closed : 0m;

        var consecutiveLosses = 0;
        for (var i = entries.Count - 1; i >= 0; i--)
        {
            if (entries[i].RealizedR < 0) consecutiveLosses++;
            else break;
        }

        return new JournalStatsDto(
            Closed: closed,
            WinRate: winRate,
            AvgWinR: avgWinR,
            AvgLossR: avgLossR,
            ExpectancyR: expectancyR,
            ProfitFactor: profitFactor,
            ComplianceRate: complianceRate,
            ConsecutiveLosses: consecutiveLosses,
            CompliantCount: entries.Count(e => e.Compliant)
        );
    }

    private static string FmtIdr(decimal v) => "Rp" + Math.Round(v, 0).ToString("N0", CultureInfo.InvariantCulture);

    private static string FmtR(decimal v) => (v > 0 ? "+" : v < 0 ? "-" : "") + Math.Abs(v).ToString("F2", CultureInfo.InvariantCulture) + "R";
}
