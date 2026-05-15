namespace PersonalFinance.Application.Dtos;

public record AccountDto(
    Guid Id,
    Guid? InstitutionId,
    string Name,
    string AccountType,
    string Currency,
    decimal OpeningBalance,
    DateOnly OpeningDate,
    bool IsActive,
    string? Color,
    string? Icon
);
