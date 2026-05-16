namespace PersonalFinance.Application.Dtos;

public record JourneyQuestDto(
    string Title,
    string Description,
    string TargetIndicator,
    decimal EstimatedScoreGain,
    string Difficulty,          // "easy" | "medium" | "hard"
    string? ActionDeeplink);
