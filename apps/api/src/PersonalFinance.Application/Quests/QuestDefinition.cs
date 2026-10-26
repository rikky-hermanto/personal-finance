namespace PersonalFinance.Application.Quests;

public enum QuestKind { Discovery, Ladder, Recognition, Boss }

public sealed record QuestDefinition(
    string Code,                    // "l2.fence_posts"
    string Level,                   // "L1".."L5"
    QuestKind Kind,
    QuestRule Rule,
    IReadOnlyList<decimal> Rungs,   // thresholds, ascending; empty = single step (rung 0)
    bool MovesMoney,                // G7: offered only at the working level
    string Title,
    string Why,
    string? Deeplink);
