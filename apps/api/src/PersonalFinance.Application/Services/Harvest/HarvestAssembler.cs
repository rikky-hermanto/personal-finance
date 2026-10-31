using System.Globalization;
using PersonalFinance.Application.Dtos;

namespace PersonalFinance.Application.Services.Harvest;

/// <summary>A quest completion the owner has not seen yet, in the shape the Harvest needs.</summary>
public sealed record HarvestInputItem(
    long Id, string Code, string Title, IReadOnlyDictionary<string, object?> Evidence,
    bool IsBackfill, DateTime CompletedAt);

public static class HarvestAssembler
{
    // Rows of one engine pass share the same completed_at, so the story order is explicit:
    // quests first, then stars, and the level-cleared moment last.
    private static int RevealOrder(string code) =>
        code.EndsWith(".boss", StringComparison.Ordinal) ? 2
        : code.StartsWith("stars.", StringComparison.Ordinal) ? 1
        : 0;

    /// <summary>True for a completion the engine flagged as part of the first-run batch (PF-152).</summary>
    public static bool IsBackfillEvidence(IReadOnlyDictionary<string, object?> evidence) =>
        evidence.TryGetValue("backfill", out var flag) && flag is true;

    /// <summary>Null when there is nothing to reveal, which is how a seen harvest never replays.</summary>
    public static HarvestDto? Build(
        IReadOnlyList<HarvestInputItem> unseen,
        IReadOnlyList<HarvestMonthRecord> unseenMonths,
        int gardenTotal)
    {
        if (unseen.Count == 0 && unseenMonths.Count == 0) return null;

        HarvestMonthRecord? month = unseenMonths.Count == 0 ? null : unseenMonths.MaxBy(m => m.Month);

        var items = new List<HarvestItemDto>();
        var backfill = unseen.Where(i => i.IsBackfill).OrderBy(i => i.Id).ToList();
        if (backfill.Count > 0)
        {
            items.Add(new HarvestItemDto(
                "backfill", "🌳", HarvestCopy.BackfillTitle(backfill.Count), HarvestCopy.BackfillLine,
                backfill.Count, backfill.Select(b => b.Id).ToList(), true));
        }
        foreach (var row in unseen.Where(i => !i.IsBackfill)
                     .OrderBy(i => i.CompletedAt).ThenBy(i => RevealOrder(i.Code)).ThenBy(i => i.Id))
        {
            var (glyph, line) = HarvestCopy.Reveal(row.Code, row.Evidence);
            items.Add(new HarvestItemDto(row.Code, glyph, row.Title, line, 1, [row.Id], false));
        }

        var added = items.Sum(i => i.Count);
        return new HarvestDto(
            Month: month?.Month.ToString("yyyy-MM", CultureInfo.InvariantCulture),
            Title: month is null ? HarvestCopy.GardenTitle : HarvestCopy.MonthTitle(month.Month),
            Basis: month is null ? null : HarvestCopy.Basis(month.AccountsCovered, month.AccountsTotal),
            AccountsCovered: month?.AccountsCovered,
            AccountsTotal: month?.AccountsTotal,
            Result: month?.Result,
            ResultLine: month is null
                ? null
                : HarvestCopy.ResultLine(month.Result, month.AccountsCovered, month.AccountsTotal),
            Closing: month is null ? null
                : items.Count > 0 ? HarvestCopy.Closing : HarvestCopy.ClosingNothingNew,
            GardenBefore: Math.Max(0, gardenTotal - added),
            GardenAfter: gardenTotal,
            Items: items);
    }
}
