namespace PersonalFinance.Application.Dtos;

public record HoldingDto(
    Guid Id,
    Guid AccountId,
    string Ticker,
    decimal Quantity,
    decimal CostBasis,
    string Currency
);
