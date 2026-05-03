using System.Collections.Generic;

namespace PersonalFinance.Application.Dtos;

public record CashflowStatementCategoryDto(
    string Category,
    Dictionary<string, decimal> Values
);

public record StatementSubsectionDto(
    string Id,
    string Label,
    List<CashflowStatementCategoryDto> Categories,
    Dictionary<string, decimal> Totals
);

public record StatementSectionDto(
    string Id,
    string Label,
    List<StatementSubsectionDto> Subsections,
    Dictionary<string, decimal> Totals
);

public record CashflowStatementDto(
    List<string> Periods,
    List<StatementSectionDto> Sections,
    Dictionary<string, decimal> GrandTotals
);
