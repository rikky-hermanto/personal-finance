namespace PersonalFinance.Application.Dtos;

public record AssetDto(
    Guid Id,
    string Name,
    string AssetClass,
    Guid? AccountId,
    DateOnly? AcquiredDate,
    decimal? AcquisitionCost,
    string Currency,
    string ValuationStrategy,
    string? Metadata
);
