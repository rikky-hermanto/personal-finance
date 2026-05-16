public record SafeToSpendDto(
    decimal Amount,
    string Status,
    int DaysRemaining,
    decimal IncomeBaseline,
    decimal CommittedBillsRemaining,
    decimal SavingsGoal,
    decimal AlreadySpent
);

public record VarianceDriverDto(
    string Category,
    decimal CurrentMonthSpend,
    decimal TrailingAvg,
    decimal Delta,
    bool IsOneOff
);

public record VarianceExplainerDto(
    decimal CurrentMonthTotal,
    decimal TrailingAvgTotal,
    decimal Delta,
    decimal DeltaPct,
    List<VarianceDriverDto> Drivers
);
