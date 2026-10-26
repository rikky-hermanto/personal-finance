namespace PersonalFinance.Application.Dtos;

public sealed record QuestBoardDto(
    int CatalogVersion,
    string WorkingLevel,
    QuestCardDto? Focus,
    IReadOnlyList<QuestCardDto> Offers,          // Focus + Offers is at most 3 in total
    IReadOnlyList<UnseenCompletionDto> Unseen,
    LevelGoalDto? LevelGoal);                    // what is left to clear the working level; null when every level is cleared

/// <summary>The working level's clearing goal, so the board is never silent while a level is open.
/// Gaps name the live indicators below the clearing bar in the rung wording (no scores, no points).</summary>
public sealed record LevelGoalDto(
    string Level, string Title, bool NotEvaluated, IReadOnlyList<LevelGoalGapDto> Gaps);

public sealed record LevelGoalGapDto(string IndicatorCode, string Label, int Stars);

public sealed record QuestCardDto(
    string Code, string Kind, string Title, string Why, QuestProgressDto? Progress, string? Deeplink);

public sealed record QuestProgressDto(int Done, int Total, string Label);

/// <summary>One toast. A normal completion has one id; a first-run backfill folds many ids into one item.</summary>
public sealed record UnseenCompletionDto(
    IReadOnlyList<long> Ids, string? Code, int Rung, string Title, DateTime CompletedAt, bool IsBackfill, int Count);
