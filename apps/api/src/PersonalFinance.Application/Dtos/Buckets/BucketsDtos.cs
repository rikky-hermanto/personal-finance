namespace PersonalFinance.Application.Dtos.Buckets;

public record CommittedItemDto(
    string Key,
    string Name,
    decimal Amount,
    string Due,
    string Source,
    bool Certain,
    bool Paid,
    string? Note
);

public record WaterfallTierResultDto(string Kind, string Name, decimal Want, decimal Got, decimal Short);

public record WaterfallResultDto(List<WaterfallTierResultDto> Tiers, string? StoppedAtTier, decimal ShortBy);

public record EmergencyFundProgressDto(decimal Now, decimal Target, int TargetMonths);

public record BucketsResponseDto(
    int MonthsAvailable,
    bool NeedsSetup,
    decimal Income,
    decimal Committed,
    decimal FuturePlanned,
    decimal MedianFree,
    decimal SoftFloor,
    decimal FreeBudget,
    decimal FreeSpent,
    decimal Last7DayFreeSpend,
    int Day,
    int DaysInMonth,
    decimal IncomeArrivedThisMonth,
    bool VariableIncome,
    decimal IncomeVariancePct,
    List<CommittedItemDto> Items,
    EmergencyFundProgressDto EmergencyFund,
    WaterfallResultDto? Shortfall,
    string? IncomeArrivedDate,
    string? BiggestDriverCategory,
    decimal BiggestDriverAmount,
    decimal BiggestDriverUsual,
    List<string> WatchCategories
);

public record TransferDto(string Date, string From, string To, decimal Amount);

public record MonthCloseDto(
    string MonthLabel,
    int CommittedStreakMonths,
    bool AllCommittedPaid,
    decimal FuturePlanned,
    decimal FutureActual,
    List<TransferDto> Transfers,
    decimal FreeBudget,
    decimal FreeSpent,
    decimal FreeOverBy,
    string? BiggestDriverCategory,
    decimal BiggestDriverAmount,
    decimal BiggestDriverUsual,
    decimal SuggestedNextFuture
);

public record SetFuturePlanRequestDto(decimal FutureMonthlyAmount);

public record DemoteCommittedItemRequestDto(string ItemKey);
