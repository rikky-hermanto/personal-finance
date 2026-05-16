namespace PersonalFinance.Application.Dtos;

public record InvestmentSnapshotDto(
    Guid Id,
    Guid SetupId,
    string Label,
    DateOnly SnapshotDate,
    decimal? TotalValue,
    string Currency,
    string AiProvider,
    string AiModel,
    string? AnalysisJson,
    DateTime CreatedAt
);
