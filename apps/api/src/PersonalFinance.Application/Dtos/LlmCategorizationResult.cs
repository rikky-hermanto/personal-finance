namespace PersonalFinance.Application.Dtos;

public sealed record LlmCategorizationResult(
    string Category,
    double Confidence,
    bool RuleSeedAllowed);
