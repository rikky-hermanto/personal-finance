namespace PersonalFinance.Application.Dtos;

public record ValuationDto(
    Guid Id,
    string SubjectType,
    Guid SubjectId,
    decimal ValueNative,
    string Currency,
    decimal FxRateToIdr,
    decimal ValueIdr,
    string Source,
    string? Notes,
    DateTime ValuedAt
);
