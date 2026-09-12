namespace PersonalFinance.Application.Dtos;

public record MacroScenarioDto(
    Guid Id,
    string Name,
    string DriversJson,
    DateTime CreatedAt,
    DateTime UpdatedAt
);
