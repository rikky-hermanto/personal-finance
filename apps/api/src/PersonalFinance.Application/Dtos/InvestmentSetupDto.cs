namespace PersonalFinance.Application.Dtos;

public record InvestmentSetupDto(
    Guid Id,
    string Name,
    string ArchetypeId,
    string BaseCurrency,
    DateTime CreatedAt,
    DateTime UpdatedAt
);
