namespace PersonalFinance.Application.Dtos;

public record InstitutionDto(
    Guid Id,
    string Name,
    string Type,
    string Country,
    string? LogoUrl
);
