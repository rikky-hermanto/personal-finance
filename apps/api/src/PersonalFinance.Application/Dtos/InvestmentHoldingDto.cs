namespace PersonalFinance.Application.Dtos;

public record InvestmentHoldingDto(
    Guid Id,
    Guid SetupId,
    string? Ticker,
    string Name,
    string AssetClass,
    string? Sector,
    decimal? AllocationPct,
    decimal? Quantity,
    decimal? AvgBuyPrice
);
