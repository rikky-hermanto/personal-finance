namespace PersonalFinance.Application.Dtos;

public record InsightDto(
    string Id,           // deterministic hash: "{Type}-{Category}-{Period}"
    string Type,         // statement_gap | habit_break | large_transaction | over_budget | under_budget
    string Severity,     // info | win | warning | alert | streak_break
    string Title,
    string Body,
    string? MetricLabel,
    decimal? MetricValue,
    string? Category,
    string? ActionType,  // navigate | null
    string? ActionTarget,
    DateTime ValidUntil
);
