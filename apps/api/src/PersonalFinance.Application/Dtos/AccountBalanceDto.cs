namespace PersonalFinance.Application.Dtos;

public record AccountBalanceDto(
    Guid AccountId,
    string AccountName,
    string InstitutionName,
    string Currency,
    decimal OpeningBalance,
    decimal CurrentBalance,
    DateTime AsOf
);
