namespace PersonalFinance.Application.Dtos;

public record PortfolioReviewRequestDto(
    string SetupName,
    object Archetype,
    string SnapshotLabel,
    decimal? TotalValue,
    string Currency,
    List<InvestmentHoldingDto> Holdings
);
