using PersonalFinance.Application.Constants;
using PersonalFinance.Application.Dtos.Desk;
using PersonalFinance.Application.Services.Desk;
using Xunit;

namespace PersonalFinance.Tests.Desk;

public class DeskCalculatorTests
{
    private static MandateParamsDto Mandate(bool approved = true) =>
        DeskDefaults.MandateDefault with { ActiveTradingNavApproved = approved };

    private static NavChainInputDto ChainInput(MandateParamsDto mandate, decimal openRisk = 0m, string regime = "Normal") =>
        new(
            TentativeNav: 970_000_000m,
            ReconciledNav: 970_000_000m,
            LegacyMv: 900_000_000m,
            OpenRisk: openRisk,
            TodaysRealizedPnl: 0m,
            DrawdownRegime: regime,
            Mandate: mandate);

    private static DeskPositionDto Position(
        string broker, string symbol, decimal qtyShares, decimal qtyLots, decimal avgPrice, decimal lastPrice,
        decimal costIdr, decimal mvIdr, decimal pnlIdr, decimal pnlPct, decimal weight, string sleeve,
        string? accountExternalKey = null) =>
        new(Guid.NewGuid(), broker, symbol, "IDX Stock", null, qtyShares, qtyLots, avgPrice, null, lastPrice, null,
            costIdr, mvIdr, pnlIdr, pnlPct, weight, sleeve, null, false, false, accountExternalKey);

    // ── ComputeNavChain ─────────────────────────────────────────────────────

    [Fact]
    public void ComputeNavChain_UnapprovedMandate_ReturnsZeroAdjustedRiskBudget()
    {
        var mandate = Mandate(approved: false);
        var chain = DeskCalculator.ComputeNavChain(ChainInput(mandate));

        Assert.Equal(0m, chain.AdjustedRiskBudget);
    }

    [Fact]
    public void ComputeNavChain_ApprovedMandate_ReturnsNonZeroAdjustedRiskBudget()
    {
        var mandate = Mandate(approved: true);
        var chain = DeskCalculator.ComputeNavChain(ChainInput(mandate));

        Assert.True(chain.AdjustedRiskBudget > 0m);
    }

    [Fact]
    public void ComputeNavChain_RiskFreezeRegime_ZeroesRiskBudgetViaMultiplier()
    {
        var mandate = Mandate(approved: true);
        var chain = DeskCalculator.ComputeNavChain(ChainInput(mandate, regime: "Risk Freeze"));

        Assert.Equal(0m, chain.Regime.Multiplier);
        Assert.Equal(0m, chain.AdjustedRiskBudget);
    }

    [Fact]
    public void ComputeNavChain_UnknownRegimeKey_FallsBackToNormal()
    {
        var mandate = Mandate(approved: true);
        var chain = DeskCalculator.ComputeNavChain(ChainInput(mandate, regime: "Nonexistent"));

        Assert.Equal("Normal", chain.Regime.Name);
    }

    [Fact]
    public void ComputeNavChain_ReconciledNavIsSumOfPortfolios_NoIncludeExcludeBranch()
    {
        var mandate = Mandate(approved: true);
        var input = ChainInput(mandate) with { TentativeNav = 999_000_000m, ReconciledNav = 500_000_000m };

        var chain = DeskCalculator.ComputeNavChain(input);

        Assert.Equal(500_000_000m, chain.ReconciledNav);
        Assert.Equal(999_000_000m, chain.TentativeNav);
    }

    // ── ComputeSizing ───────────────────────────────────────────────────────

    [Fact]
    public void ComputeSizing_MissingStop_ReturnsInvalidEntryOrStopMissing()
    {
        var mandate = Mandate();
        var chain = DeskCalculator.ComputeNavChain(ChainInput(mandate));
        var inputs = new TradePlanInputDto("long", 1000m, null, null, 0.15m, 0.25m, 0.05m, 50_000_000m, 100m, "TEST");

        var sizing = DeskCalculator.ComputeSizing(inputs, chain, mandate);

        Assert.False(sizing.Valid);
        Assert.Equal("entry-or-stop-missing", sizing.Reason);
    }

    [Fact]
    public void ComputeSizing_LongStopAboveEntry_ReturnsInvalidStopDirection()
    {
        var mandate = Mandate();
        var chain = DeskCalculator.ComputeNavChain(ChainInput(mandate));
        var inputs = new TradePlanInputDto("long", 1000m, 1050m, 1200m, 0.15m, 0.25m, 0.05m, 50_000_000m, 100m, "TEST");

        var sizing = DeskCalculator.ComputeSizing(inputs, chain, mandate);

        Assert.False(sizing.Valid);
        Assert.Equal("invalid-stop-direction", sizing.Reason);
    }

    [Fact]
    public void ComputeSizing_ShortStopBelowEntry_ReturnsInvalidStopDirection()
    {
        var mandate = Mandate();
        var chain = DeskCalculator.ComputeNavChain(ChainInput(mandate));
        var inputs = new TradePlanInputDto("short", 1000m, 950m, 800m, 0.15m, 0.25m, 0.05m, 50_000_000m, 100m, "TEST");

        var sizing = DeskCalculator.ComputeSizing(inputs, chain, mandate);

        Assert.False(sizing.Valid);
        Assert.Equal("invalid-stop-direction", sizing.Reason);
    }

    [Fact]
    public void ComputeSizing_ValidLongPlan_FinalQtyFlooredToStep()
    {
        var mandate = Mandate();
        var chain = DeskCalculator.ComputeNavChain(ChainInput(mandate));
        var inputs = new TradePlanInputDto("long", 1000m, 940m, 1300m, 0.15m, 0.25m, 0.05m, 50_000_000m, 100m, "TEST");

        var sizing = DeskCalculator.ComputeSizing(inputs, chain, mandate);

        Assert.True(sizing.Valid);
        Assert.Equal(0m, sizing.FinalQty % 100m);
    }

    [Fact]
    public void FloorToStep_RoundsDownToNearestStep()
    {
        Assert.Equal(4500m, DeskCalculator.FloorToStep(4599.9m, 100m));
        Assert.Equal(0m, DeskCalculator.FloorToStep(99m, 100m));
    }

    // ── AggregateBySymbol ───────────────────────────────────────────────────

    [Fact]
    public void AggregateBySymbol_SameSymbolTwoPortfolios_SumsQtyAndRecomputesPnlPct()
    {
        var positions = new List<DeskPositionDto>
        {
            Position("Stockbit", "ANTM", 11000, 110, 2854.27m, 2860, 31397025, 31460000, 62975, 0.20m, 3.21m, "Legacy / Unclassified", "stockbit_trading"),
            Position("Stockbit", "ANTM", 8300, 83, 3560.51m, 2870, 29552262, 23821000, -5731262, -19.39m, 2.44m, "Legacy / Unclassified", "stockbit_sectoral"),
        };

        var aggregated = DeskCalculator.AggregateBySymbol(positions);

        var antm = Assert.Single(aggregated);
        Assert.Equal(193m, antm.QtyLots);
        Assert.Equal(19300m, antm.QtyShares);
        Assert.Equal(60949287m, antm.CostIdr);
        Assert.Equal(55281000m, antm.MvIdr);
        Assert.Equal(-5668287m, antm.PnlIdr);
        // Recomputed from summed cost/pnl, never averaged — averaging the two rows' pct would give a different (wrong) number.
        Assert.Equal(antm.PnlIdr / antm.CostIdr * 100m, antm.PnlPct);
        Assert.Null(antm.AccountExternalKey);
    }

    [Fact]
    public void AggregateBySymbol_SingleRowSymbol_ReturnsRowUnchanged()
    {
        var position = Position("Mandiri", "BBRI", 174000, 1740, 4270.78m, 2930,
            743115720, 509820000, -233295720, -31.39m, 52.12m, "Legacy / Unclassified", "mandiri");

        var aggregated = DeskCalculator.AggregateBySymbol(new List<DeskPositionDto> { position });

        var bbri = Assert.Single(aggregated);
        Assert.Equal(position, bbri);
    }

    [Fact]
    public void AggregateBySymbol_ZeroCostBasis_ReturnsZeroPctWithoutDividing()
    {
        var positions = new List<DeskPositionDto>
        {
            Position("Mandiri", "WRITEOFF", 1000, 10, 0m, 0, 0, 0, 0, 0m, 0m, "Legacy / Unclassified"),
            Position("Stockbit", "WRITEOFF", 1000, 10, 0m, 0, 0, 0, 0, 0m, 0m, "Legacy / Unclassified"),
        };

        var aggregated = DeskCalculator.AggregateBySymbol(positions);

        var writeoff = Assert.Single(aggregated);
        Assert.Equal(0m, writeoff.CostIdr);
        Assert.Equal(0m, writeoff.PnlPct);
    }

    [Fact]
    public void AggregateBySymbol_OneLegUnclassified_AggregateIsLegacy()
    {
        var positions = new List<DeskPositionDto>
        {
            Position("Stockbit", "ANTM", 11000, 110, 2854.27m, 2860, 31397025, 31460000, 62975, 0.20m, 3.21m, "Active Trading"),
            Position("Stockbit", "ANTM", 8300, 83, 3560.51m, 2870, 29552262, 23821000, -5731262, -19.39m, 2.44m, "Legacy / Unclassified"),
        };

        var aggregated = DeskCalculator.AggregateBySymbol(positions);

        var antm = Assert.Single(aggregated);
        Assert.Equal("Legacy / Unclassified", antm.Sleeve);
    }

    // ── EvaluateGate ────────────────────────────────────────────────────────

    [Fact]
    public void EvaluateGate_UnapprovedNav_OverallBlocked()
    {
        var mandate = Mandate(approved: false);
        var chain = DeskCalculator.ComputeNavChain(ChainInput(mandate));
        var journalStats = DeskCalculator.ComputeJournalStats(new List<DeskJournalEntryDto>());

        var gate = DeskCalculator.EvaluateGate(new GateEvaluationInputDto(
            chain, null, null, mandate, journalStats, new List<DeskJournalEntryDto>(), new List<DeskPositionDto>(), new DateOnly(2026, 7, 30)));

        Assert.Equal("BLOCKED", gate.Overall);
        Assert.Contains(gate.Rows, r => r.Id == "nav-approved" && r.State == "blocked");
    }

    [Fact]
    public void EvaluateGate_ClusterHeatRule_AlwaysUnresolvedAndNotImplemented()
    {
        var mandate = Mandate(approved: true);
        var chain = DeskCalculator.ComputeNavChain(ChainInput(mandate));
        var journalStats = DeskCalculator.ComputeJournalStats(new List<DeskJournalEntryDto>());

        var gate = DeskCalculator.EvaluateGate(new GateEvaluationInputDto(
            chain, null, null, mandate, journalStats, new List<DeskJournalEntryDto>(), new List<DeskPositionDto>(), new DateOnly(2026, 7, 30)));

        var clusterHeat = gate.Rows.Single(r => r.Id == "cluster-heat");
        Assert.Equal("unresolved", clusterHeat.State);
        Assert.True(clusterHeat.NotImplemented);
    }

    [Fact]
    public void EvaluateGate_ExactlyEighteenRules_MatchRegistry()
    {
        var mandate = Mandate(approved: true);
        var chain = DeskCalculator.ComputeNavChain(ChainInput(mandate));
        var journalStats = DeskCalculator.ComputeJournalStats(new List<DeskJournalEntryDto>());

        var gate = DeskCalculator.EvaluateGate(new GateEvaluationInputDto(
            chain, null, null, mandate, journalStats, new List<DeskJournalEntryDto>(), new List<DeskPositionDto>(), new DateOnly(2026, 7, 30)));

        Assert.Equal(18, gate.Rows.Count);
        Assert.Equal(18, gate.Rows.Select(r => r.Id).Distinct().Count());
    }

    [Fact]
    public void EvaluateGate_NoRuleReturnsPassWhileNotImplemented()
    {
        // Structural invariant (STEP 5/7): a stub rule can never render green.
        var mandate = Mandate(approved: true);
        var chain = DeskCalculator.ComputeNavChain(ChainInput(mandate));
        var inputs = new TradePlanInputDto("long", 1000m, 940m, 1300m, 0.15m, 0.25m, 0.05m, 50_000_000m, 100m, "TEST");
        var sizing = DeskCalculator.ComputeSizing(inputs, chain, mandate);
        var journalStats = DeskCalculator.ComputeJournalStats(new List<DeskJournalEntryDto>());

        var gate = DeskCalculator.EvaluateGate(new GateEvaluationInputDto(
            chain, sizing, inputs, mandate, journalStats, new List<DeskJournalEntryDto>(), new List<DeskPositionDto>(), new DateOnly(2026, 7, 30)));

        Assert.DoesNotContain(gate.Rows, r => r.State == "pass" && r.NotImplemented);
    }

    [Fact]
    public void EvaluateGate_AddingToLosingLegacyPosition_Blocks()
    {
        var mandate = Mandate(approved: true);
        var chain = DeskCalculator.ComputeNavChain(ChainInput(mandate));
        var inputs = new TradePlanInputDto("long", 2930m, 2800m, 3200m, 0.15m, 0.25m, 0.05m, 50_000_000m, 100m, "BBRI");
        var sizing = DeskCalculator.ComputeSizing(inputs, chain, mandate);
        var journalStats = DeskCalculator.ComputeJournalStats(new List<DeskJournalEntryDto>());
        var positions = new List<DeskPositionDto>
        {
            Position("Mandiri", "BBRI", 174000, 1740, 4270.78m, 2930,
                743115720, 509820000, -233295720, -31.39m, 52.12m, "Legacy / Unclassified"),
        };

        var gate = DeskCalculator.EvaluateGate(new GateEvaluationInputDto(
            chain, sizing, inputs, mandate, journalStats, new List<DeskJournalEntryDto>(), positions, new DateOnly(2026, 7, 30)));

        Assert.Equal("BLOCKED", gate.Overall);
        Assert.Contains(gate.Rows, r => r.Id == "add-to-loser" && r.State == "blocked");
    }

    [Fact]
    public void EvaluateGate_AddingToUnrelatedSymbol_NeverBlocksOnLiteralComparison()
    {
        // Regression guard: add-to-loser must be a real position lookup, never `symbol === "BBRI"`.
        var mandate = Mandate(approved: true);
        var chain = DeskCalculator.ComputeNavChain(ChainInput(mandate));
        var inputs = new TradePlanInputDto("long", 1000m, 940m, 1300m, 0.15m, 0.25m, 0.05m, 50_000_000m, 100m, "AALI");
        var sizing = DeskCalculator.ComputeSizing(inputs, chain, mandate);
        var journalStats = DeskCalculator.ComputeJournalStats(new List<DeskJournalEntryDto>());

        var gate = DeskCalculator.EvaluateGate(new GateEvaluationInputDto(
            chain, sizing, inputs, mandate, journalStats, new List<DeskJournalEntryDto>(), new List<DeskPositionDto>(), new DateOnly(2026, 7, 30)));

        Assert.Contains(gate.Rows, r => r.Id == "add-to-loser" && r.State == "pass");
    }

    [Fact]
    public void EvaluateGate_AddToLoser_WinningLegAndLosingLeg_BlocksAndQuotesLosingLeg()
    {
        // Regression for the user's live ANTM case: Trading leg is winning, Sectoral Rotation leg
        // is losing. The winning leg is listed FIRST — a `First(p => p.Symbol == symbol)` lookup
        // (the pre-fix bug) would grab it and report a winning position as the block reason.
        var mandate = Mandate(approved: true);
        var chain = DeskCalculator.ComputeNavChain(ChainInput(mandate));
        var inputs = new TradePlanInputDto("long", 2900m, 2800m, 3100m, 0.15m, 0.25m, 0.05m, 50_000_000m, 100m, "ANTM");
        var sizing = DeskCalculator.ComputeSizing(inputs, chain, mandate);
        var journalStats = DeskCalculator.ComputeJournalStats(new List<DeskJournalEntryDto>());
        var positions = new List<DeskPositionDto>
        {
            Position("Stockbit", "ANTM", 11000, 110, 2854.27m, 2860, 31397025, 31460000, 62975, 0.20m, 3.21m, "Legacy / Unclassified", "stockbit_trading"),
            Position("Stockbit", "ANTM", 8300, 83, 3560.51m, 2870, 29552262, 23821000, -5731262, -19.39m, 2.44m, "Legacy / Unclassified", "stockbit_sectoral"),
        };

        var gate = DeskCalculator.EvaluateGate(new GateEvaluationInputDto(
            chain, sizing, inputs, mandate, journalStats, new List<DeskJournalEntryDto>(), positions, new DateOnly(2026, 7, 30)));

        var addToLoser = gate.Rows.Single(r => r.Id == "add-to-loser");
        Assert.Equal("blocked", addToLoser.State);
        Assert.Contains("-19.39", addToLoser.ReasonText);
        Assert.DoesNotContain("0.20", addToLoser.ReasonText);
    }

    [Fact]
    public void EvaluateGate_SingleSymbol_UsesAggregatedExposure()
    {
        // Feeding EvaluateGate the pre-aggregated exposure (what DeskService actually passes) —
        // the blended P&L, not either raw leg's, must be what the gate quotes.
        var mandate = Mandate(approved: true);
        var chain = DeskCalculator.ComputeNavChain(ChainInput(mandate));
        var inputs = new TradePlanInputDto("long", 2900m, 2800m, 3100m, 0.15m, 0.25m, 0.05m, 50_000_000m, 100m, "ANTM");
        var sizing = DeskCalculator.ComputeSizing(inputs, chain, mandate);
        var journalStats = DeskCalculator.ComputeJournalStats(new List<DeskJournalEntryDto>());
        var rawLegs = new List<DeskPositionDto>
        {
            Position("Stockbit", "ANTM", 11000, 110, 2854.27m, 2860, 31397025, 31460000, 62975, 0.20m, 3.21m, "Legacy / Unclassified", "stockbit_trading"),
            Position("Stockbit", "ANTM", 8300, 83, 3560.51m, 2870, 29552262, 23821000, -5731262, -19.39m, 2.44m, "Legacy / Unclassified", "stockbit_sectoral"),
        };
        var aggregated = DeskCalculator.AggregateBySymbol(rawLegs);
        var antm = aggregated.Single(p => p.Symbol == "ANTM");
        Assert.True(antm.PnlPct < 0); // net exposure is a loser even though one leg is winning

        var gate = DeskCalculator.EvaluateGate(new GateEvaluationInputDto(
            chain, sizing, inputs, mandate, journalStats, new List<DeskJournalEntryDto>(), aggregated, new DateOnly(2026, 7, 30)));

        var addToLoser = gate.Rows.Single(r => r.Id == "add-to-loser");
        Assert.Equal("blocked", addToLoser.State);
        Assert.Contains($"{antm.PnlPct:F2}%", addToLoser.ReasonText);
    }

    [Fact]
    public void EvaluateGate_MarginRuleWithLeverageEnabled_IsUnresolvedNotPass()
    {
        var mandate = Mandate(approved: true) with { LeverageEnabled = true };
        var chain = DeskCalculator.ComputeNavChain(ChainInput(mandate));
        var journalStats = DeskCalculator.ComputeJournalStats(new List<DeskJournalEntryDto>());

        var gate = DeskCalculator.EvaluateGate(new GateEvaluationInputDto(
            chain, null, null, mandate, journalStats, new List<DeskJournalEntryDto>(), new List<DeskPositionDto>(), new DateOnly(2026, 7, 30)));

        Assert.Contains(gate.Rows, r => r.Id == "margin" && r.State == "unresolved");
    }

    // ── ComputeJournalStats ─────────────────────────────────────────────────

    [Fact]
    public void ComputeJournalStats_ConsecutiveLosses_CountsBackFromMostRecentEntry()
    {
        var entries = new List<DeskJournalEntryDto>
        {
            Entry(1, 1.0m),
            Entry(2, -0.5m),
            Entry(3, -0.8m),
        };

        var stats = DeskCalculator.ComputeJournalStats(entries);

        Assert.Equal(2, stats.ConsecutiveLosses);
    }

    [Fact]
    public void ComputeJournalStats_MostRecentEntryIsWin_ConsecutiveLossesResetsToZero()
    {
        var entries = new List<DeskJournalEntryDto>
        {
            Entry(1, -0.5m),
            Entry(2, -0.8m),
            Entry(3, 1.0m),
        };

        var stats = DeskCalculator.ComputeJournalStats(entries);

        Assert.Equal(0, stats.ConsecutiveLosses);
    }

    private static DeskJournalEntryDto Entry(int day, decimal realizedR) => new(
        Guid.NewGuid(), new DateOnly(2026, 6, day), "TEST", "Stockbit", "Test",
        10, 10, 1000, realizedR > 0 ? 1100m : 900m, realizedR > 0 ? 10000m : -10000m, realizedR, true, new List<string>());
}
