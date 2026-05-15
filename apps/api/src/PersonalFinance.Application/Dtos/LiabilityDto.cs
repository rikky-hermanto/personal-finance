namespace PersonalFinance.Application.Dtos;

public record LiabilityDto(
    Guid Id,
    string Name,
    string LiabilityType,
    Guid? AccountId,
    Guid? AssetId,
    decimal Principal,
    decimal? InterestRate,
    DateOnly StartDate,
    DateOnly? EndDate,
    decimal? MonthlyPayment,
    decimal? Ltv
);
