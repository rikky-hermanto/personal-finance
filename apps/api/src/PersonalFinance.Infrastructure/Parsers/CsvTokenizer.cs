using System.Text.RegularExpressions;

namespace PersonalFinance.Infrastructure.Parsers;

internal static class CsvTokenizer
{
    private static readonly Regex Delimiter = new(@"[,;\t]", RegexOptions.Compiled);

    public static HashSet<string> Tokenize(string line)
    {
        var result = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        if (string.IsNullOrWhiteSpace(line)) return result;
        foreach (var part in Delimiter.Split(line))
        {
            var token = part.Trim('"', ' ', '\'').ToUpperInvariant();
            if (!string.IsNullOrEmpty(token)) result.Add(token);
        }
        return result;
    }
}
