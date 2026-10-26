using System.Globalization;
using System.Text.RegularExpressions;

namespace PersonalFinance.Application.Services.Harvest;

/// <summary>
/// Every sentence the Harvest shows. Numbers come only from stored evidence or counts (G2).
/// A template whose evidence key is missing yields no line instead of an invented one.
/// </summary>
public static partial class HarvestCopy
{
    // Only said when at least one card was added. With nothing new the claim would be false.
    public const string Closing = "Harvested. Your garden grew.";
    public const string ClosingNothingNew = "Harvested.";
    public const string GardenTitle = "New in your garden";
    public const string BackfillLine = "Your garden starts with them.";

    public static string MonthTitle(DateOnly month) =>
        $"{month.ToString("MMMM", CultureInfo.InvariantCulture)} harvested";

    public static string Basis(int covered, int total) =>
        total <= 0 ? "Based on your uploaded transactions" : $"Based on {covered} of {total} accounts";

    public const string PartialQualifier = " in the accounts you uploaded";

    // A verdict on some of the accounts must say so (G10, FIN-04). Neutral already says what is missing.
    public static string ResultLine(string result, int covered, int total)
    {
        var partial = total > 0 && covered < total ? PartialQualifier : "";
        return result switch
        {
            HarvestSummaryBuilder.Green => "Spending stayed under income" + partial,
            HarvestSummaryBuilder.Red => "Spending ran above income" + partial,
            _ => "No income was recorded this month",
        };
    }

    public static string BackfillTitle(int count) =>
        count == 1 ? "You'd already completed 1 quest" : $"You'd already completed {count} quests";

    private sealed record Entry(string Glyph, string? Template);

    // A key in braces must be a number in the evidence the quest detectors store (PF-152 rules).
    private static readonly IReadOnlyDictionary<string, Entry> Registry = new Dictionary<string, Entry>
    {
        ["l1.meet_your_money"] = new("🌱", "Your first statement is in."),
        ["l1.sort_the_pile"] = new("🏷️", "Your five biggest expenses all have a category."),
        ["l1.full_picture"] = new("🧭", "Another account joins your picture."),
        ["l1.in_the_green"] = new("🌿", "A month where spending stayed under income."),
        ["l1.honest_harvest"] = new("🌧️", "A month that ran over, harvested anyway. Honest data keeps every score true."),
        ["l2.count_your_cushion"] = new("🪴", "You are covered for {months:0.0} months."),
        ["l2.map_your_debts"] = new("🪨", "Your debts are mapped."),
        ["l2.fence_posts"] = new("🪵", "{months:0.0} months of cover, one fence post higher."),
        ["l1.boss"] = new("🌳", "Every Foundations indicator has cleared its bar."),
        ["l2.boss"] = new("🛡️", "Every Defense indicator has cleared its bar."),
    };

    private static readonly Entry StarEntry = new("⭐", null);
    private static readonly Entry DefaultEntry = new("🌱", null);

    /// <summary>All fixed sentences, for the no-shame lint test.</summary>
    public static IEnumerable<string> AllFixedText() =>
        new[]
        {
            Closing, ClosingNothingNew, GardenTitle, BackfillLine, BackfillTitle(2),
            MonthTitle(new DateOnly(2026, 9, 1)), Basis(4, 5), Basis(0, 0),
            ResultLine(HarvestSummaryBuilder.Green, 5, 5), ResultLine(HarvestSummaryBuilder.Red, 5, 5),
            ResultLine(HarvestSummaryBuilder.Green, 4, 5), ResultLine(HarvestSummaryBuilder.Red, 4, 5),
            ResultLine(HarvestSummaryBuilder.Neutral, 4, 5),
        }.Concat(Registry.Values.Where(e => e.Template is not null).Select(e => e.Template!));

    public static IReadOnlyCollection<string> RegisteredCodes => Registry.Keys.ToList();

    public static (string Glyph, string? Line) Reveal(string code, IReadOnlyDictionary<string, object?> evidence)
    {
        var entry = Registry.TryGetValue(code, out var found) ? found
            : code.StartsWith("stars.", StringComparison.Ordinal) ? StarEntry
            : DefaultEntry;
        return (entry.Glyph, entry.Template is null ? null : Fill(entry.Template, evidence));
    }

    private static string? Fill(string template, IReadOnlyDictionary<string, object?> evidence)
    {
        var missing = false;
        var text = PlaceholderPattern().Replace(template, m =>
        {
            evidence.TryGetValue(m.Groups["key"].Value, out var value);
            switch (value)
            {
                // Newtonsoft returns long and double for JSON numbers; anything else is not a number.
                case sbyte or byte or short or ushort or int or uint or long or ulong or float or double or decimal:
                    var format = m.Groups["fmt"].Success ? m.Groups["fmt"].Value : "0.##";
                    return Convert.ToDecimal(value, CultureInfo.InvariantCulture)
                        .ToString(format, CultureInfo.InvariantCulture);
                default:
                    missing = true;
                    return "";
            }
        });
        return missing ? null : text;
    }

    [GeneratedRegex(@"\{(?<key>\w+)(?::(?<fmt>[^}]+))?\}")]
    private static partial Regex PlaceholderPattern();
}
