namespace PersonalFinance.Application.Dtos;

public sealed record QuestBoardDto(
    int CatalogVersion,
    string WorkingLevel,
    QuestCardDto? Focus,
    IReadOnlyList<QuestCardDto> Offers,          // Focus + Offers is at most 3 in total
    LevelGoalDto? LevelGoal,                      // what is left to clear the working level; null when every level is cleared
    HarvestDto? Harvest,                          // the Monthly Harvest to play, or null when nothing is unseen (STEP 5)
    RhythmDto Rhythm);                            // consecutive harvested months

/// <summary>The working level's clearing goal, so the board is never silent while a level is open.
/// Gaps name the live indicators below the clearing bar in the rung wording (no scores, no points).</summary>
public sealed record LevelGoalDto(
    string Level, string Title, bool NotEvaluated, IReadOnlyList<LevelGoalGapDto> Gaps);

public sealed record LevelGoalGapDto(string IndicatorCode, string Label, int Stars);

public sealed record QuestCardDto(
    string Code, string Kind, string Title, string Why, QuestProgressDto? Progress, string? Deeplink);

public sealed record QuestProgressDto(int Done, int Total, string Label);
