using System.Globalization;

namespace PersonalFinance.Application.Quests;

public static class QuestCopy
{
    /// <summary>The line a completion toast or board row shows. Numbers come from rung constants or stored
    /// evidence, never from a points table (G2).</summary>
    public static string CompletionTitle(QuestDefinition q, int rung, IReadOnlyDictionary<string, object?> evidence)
    {
        if (q.Kind == QuestKind.Recognition)
            return new string('⭐', rung) + " " + StarRungs.RungCopy(q.Code.Replace("stars.", string.Empty), rung);

        return q.Code switch
        {
            "l2.fence_posts" => $"Fence post {rung} of {q.Rungs.Count}",
            "l1.full_picture" => $"{rung} of {TotalFrom(evidence, rung)} accounts covered",
            _ => q.Title,
        };
    }

    private static int TotalFrom(IReadOnlyDictionary<string, object?> evidence, int fallback)
    {
        if (!evidence.TryGetValue("total", out var value) || value is null) return fallback;
        return int.TryParse(Convert.ToString(value, CultureInfo.InvariantCulture), NumberStyles.Integer,
            CultureInfo.InvariantCulture, out var total) ? total : fallback;
    }
}
