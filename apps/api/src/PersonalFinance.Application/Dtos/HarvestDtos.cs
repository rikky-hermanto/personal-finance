namespace PersonalFinance.Application.Dtos;

public sealed record HarvestMonthRecord(
    DateOnly Month, decimal IncomeIdr, decimal ExpenseIdr, string Result,
    int AccountsCovered, int AccountsTotal);

public sealed record HarvestLedgerRow(HarvestMonthRecord Record, bool Seen);

public sealed record HarvestItemDto(
    string Code, string Glyph, string Title, string? Line, int Count,
    IReadOnlyList<long> CompletionIds, bool IsBackfill);

public sealed record HarvestDto(
    string? Month, string Title, string? Basis, int? AccountsCovered, int? AccountsTotal,
    string? Result, string? ResultLine, string? Closing,
    int GardenBefore, int GardenAfter, IReadOnlyList<HarvestItemDto> Items);

public sealed record RhythmDto(int Current, int Longest);
