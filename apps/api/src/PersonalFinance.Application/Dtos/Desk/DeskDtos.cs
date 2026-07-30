namespace PersonalFinance.Application.Dtos.Desk;

public record RegimeDto(string Name, decimal DrawdownPct, decimal Multiplier);

public record NavChainDto(
    decimal TentativeNav,
    decimal StockbitAmt,
    bool Included,
    decimal ReconciledNav,
    decimal LegacyMv,
    decimal Reserve,
    decimal ActiveTradingNav,
    RegimeDto Regime,
    decimal AdjustedRiskBudget,
    decimal OpenRisk,
    decimal Heat,
    decimal DailyLossLimit,
    decimal DailyHeadroom
);

public record SizingCapDto(string Key, string Label, decimal Qty);

public record SizingDto(
    bool Valid,
    string? Reason,
    decimal? UnitRisk,
    List<SizingCapDto>? Caps,
    string? Binding,
    decimal? RiskSizedQty,
    decimal? ExposureCappedQty,
    decimal? CashCappedQty,
    decimal? FinalQty,
    decimal? FinalLots,
    decimal? PlannedLoss,
    decimal? PlannedReward,
    decimal? Rr,
    decimal? ExposurePct,
    decimal? HeatAfter
);

public record GateRuleDto(
    string Id,
    string Name,
    string State, // pass | warning | blocked | unresolved
    string Value,
    string Limit,
    string Headroom,
    string? ReasonText,
    string Why,
    bool NotImplemented
);

public record GateResultDto(
    List<GateRuleDto> Rows,
    string Overall, // BLOCKED | WARNING | PASS
    List<string> BlockingReasons
);

public record JournalStatsDto(
    int Closed,
    decimal WinRate,
    decimal AvgWinR,
    decimal AvgLossR,
    decimal ExpectancyR,
    decimal? ProfitFactor,
    decimal ComplianceRate,
    int ConsecutiveLosses,
    int CompliantCount
);

public record MandateParamsDto(
    string Preset,
    decimal ActiveTradingNav,
    string ActiveTradingNavMode, // absolute | pctOfReconciled
    decimal? ActiveTradingNavPct,
    bool ActiveTradingNavApproved,
    decimal RiskPerTradePct,
    decimal HardCeilingPct,
    decimal DailyLossLimitPct,
    decimal WeeklyLossLimitPct,
    decimal MonthlyLossLimitPct,
    decimal NormalHeatPct,
    decimal HardHeatPct,
    decimal ClusterHeatPct,
    decimal MaxSingleStockPct,
    decimal MaxCryptoSymbolPct,
    decimal MaxAltcoinPct,
    decimal MinRR,
    int ConsecutiveLossStop,
    int ReviewAt,
    bool LeverageEnabled,
    bool AveragingDownEnabled
);

public record TradePlanInputDto(
    string? Side, // long | short
    decimal? Entry,
    decimal? Stop,
    decimal? Target,
    decimal BuyFeePct,
    decimal SellFeePct,
    decimal SlippagePct,
    decimal AvailableCash,
    decimal QtyStep,
    string? Symbol
);

public record DeskStateDto(
    List<Dtos.Desk.DeskBrokerAccountDto> Accounts,
    List<Dtos.Desk.DeskPositionDto> Positions,
    List<Dtos.Desk.DeskReconIssueDto> ReconIssues,
    List<Dtos.Desk.DeskJournalEntryDto> Journal,
    List<Dtos.Desk.DeskMandateVersionDto> MandateVersions,
    Dtos.Desk.DeskMandateVersionDto? ActiveMandate,
    NavChainDto NavChain,
    GateResultDto Gate,
    JournalStatsDto JournalStats,
    string DrawdownRegime,
    string StockbitResolution
);

public record DeskBrokerAccountDto(
    Guid Id, string ExternalKey, string Name, string Currency,
    decimal ReportedEquity, decimal? ReportedEquityNative,
    decimal Cash, decimal? CashNative, string? CashCurrencyNative,
    decimal? BuyingPower, string? BuyingPowerCurrency, string Status
);

public record DeskPositionDto(
    Guid Id, string Broker, string Symbol, string AssetClass,
    decimal? Qty, decimal? QtyShares, decimal? QtyLots,
    decimal? AvgPrice, decimal? AvgPriceNative, decimal? LastPrice, decimal? LastPriceNative,
    decimal CostIdr, decimal MvIdr, decimal PnlIdr, decimal PnlPct, decimal Weight,
    string Sleeve, decimal? StopPrice, bool Unconfirmed, bool EstimatedCostBasis
);

public record DeskReconIssueDto(
    Guid Id, string ExternalKey, string Label, string Account,
    decimal? Amount, string? Currency, string Resolution,
    List<List<string>> Options, DateTime? ResolvedAt
);

public record DeskJournalEntryDto(
    Guid Id, DateOnly TradeDate, string Symbol, string Broker, string? Strategy,
    decimal? PlannedQty, decimal? ActualQty, decimal? EntryPrice, decimal? ExitPrice,
    decimal NetPnl, decimal? RealizedR, bool Compliant, List<string> Tags
);

public record DeskMandateVersionDto(
    Guid Id, int Version, string Status, string? Preset, MandateParamsDto Params,
    DateOnly? EffectiveDate, string? ChangeReason, DateTime? ApprovedAt, DateTime CreatedAt
);
