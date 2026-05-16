namespace PersonalFinance.Application.Dtos;

public record JourneyStateDto(
    int CurrentLevel,
    decimal TotalScore,
    Dictionary<string, decimal> LevelScores,
    List<IndicatorScoreDto> Indicators,
    List<AchievementDto> Achievements,
    DateTime LastComputedAt);

public record IndicatorScoreDto(
    string Code,
    string Level,
    decimal Score,
    decimal? RawValue,
    string Status,          // "achieved" | "in_progress" | "not_started" | "no_data"
    string DisplayName,
    string Description);

public record AchievementDto(
    string Code,
    string Name,
    DateTime UnlockedAt);
