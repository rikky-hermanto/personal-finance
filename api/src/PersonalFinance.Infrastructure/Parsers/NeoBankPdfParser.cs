using UglyToad.PdfPig;
using PersonalFinance.Application.Dtos;
using System.Globalization;
using System.Text.RegularExpressions;

public class NeoBankPdfParser : IBankStatementParser
{
    private static readonly Regex DateRegex = new(@"^\d{2} \w{3} \d{4}", RegexOptions.Compiled);
    private static readonly Regex EntryStartRegex = new(@"(?=\d{2} \w{3} \d{4})", RegexOptions.Compiled);
    private static readonly Regex DateTimeRegex = new(@"^(?<date>\d{2} \w{3} \d{4})(?:\s+(?<time>\d{2}:\d{2}:\d{2}))?", RegexOptions.Compiled);
    private static readonly Regex AmountRegex = new(@"-?[\d.]+,\d{2}", RegexOptions.Compiled);

    private readonly ICategoryRuleService _categoryRuleService;

    public NeoBankPdfParser(ICategoryRuleService categoryRuleService)
    {
        _categoryRuleService = categoryRuleService;
    }

    public async Task<List<TransactionDto>> ParseAsync(Stream fileStream, string? password = null)
    {
        var transactions = new List<TransactionDto>();
        using var pdf = password == null
            ? PdfDocument.Open(fileStream)
            : PdfDocument.Open(fileStream, new ParsingOptions { Password = password });

        // Read all text lines from all pages
        var lines = new List<string>();
        foreach (var page in pdf.GetPages())
        {
            var text = page.Text;
            if (!string.IsNullOrWhiteSpace(text))
            {
                lines.AddRange(text.Split('\n').Select(l => l.Trim()));
            }
        }

        // After extracting all text from all pages:
        var allText = string.Join(" ", lines); // Combine all lines into one string

        // Split at each date (but keep the delimiter)
        var entries = EntryStartRegex.Split(allText)
            .Select(s => s.Trim())
            .Where(s => DateRegex.IsMatch(s))
            .ToList();

        foreach (var entry in entries)
        {
            // This regex matches:
            // 1. Date: 01 Apr 2025
            // 2. Optional time: 03:09:22
            // 3. Description: everything up to the last two numbers
            // 4. Mutation: the second last number
            // 5. Balance: the last number
            try
            {
                // Try a fallback: find the last two numbers in the string
                var dateTimeMatch = DateTimeRegex.Match(entry);
                if (!dateTimeMatch.Success) { LogSkip(entry, "Invalid date/time format."); continue; }

                // Try to extract numbers from the end
                var dateStr = dateTimeMatch.Groups["date"].Value;
                var timeStr = dateTimeMatch.Groups["time"].Success ? dateTimeMatch.Groups["time"].Value : null;
                var dateTimeStr = timeStr != null ? $"{dateStr} {timeStr}" : dateStr;
                if (!DateTime.TryParseExact(dateTimeStr, new[] { "dd MMM yyyy HH:mm:ss", "dd MMM yyyy" },
                    CultureInfo.InvariantCulture, DateTimeStyles.None, out var dateTime))
                {
                    LogSkip(entry, "Unparsable DateTime.");
                    // Description is everything between time (if present) or date and the first number
                    continue;
                }

                dateTime = DateTime.SpecifyKind(dateTime, DateTimeKind.Utc);

                var numberMatches = AmountRegex.Matches(entry);
                if (numberMatches.Count < 2)
                {
                    LogSkip(entry, "Not enough numeric values.");
                    continue;
                }

                var mutation = numberMatches[^2].Value;
                var balance = numberMatches[^1].Value;

                var descStart = dateTimeMatch.Length;
                var descEnd = entry.LastIndexOf(mutation);  
                if (descEnd <= descStart) { LogSkip(entry, "Description extraction failed."); continue; }

                var desc = entry.Substring(descStart, descEnd - descStart).Trim();

                if (!TryParseEuropeanDecimal(mutation, out var amount)) { LogSkip(entry, "Mutation parse fail."); continue; }

                var transaction = new TransactionDto
                {
                    Date = dateTime,
                    Description = desc,
                    Remarks = "",
                    Flow = amount > 0 ? "CR" : "DB",
                    Type = amount > 0 ? "Income" : "Expense",
                    Category = "Untracked Expense",
                    Wallet = "NeoBank",
                    AmountIdr = Math.Abs(amount),
                    Currency = "IDR",
                    ExchangeRate = null
                };

                transaction.Category = await _categoryRuleService.CategorizeAsync(transaction.Description, transaction.Type);

                transactions.Add(transaction);
            }
            catch (Exception ex)
            {
                LogSkip(entry, $"Exception: {ex.Message}");
            }
        }

        return transactions;
    }

    private static bool TryParseEuropeanDecimal(string input, out decimal value)
    {
        var normalized = input.Replace(".", "").Replace(",", ".");
        return decimal.TryParse(normalized, NumberStyles.Any, CultureInfo.InvariantCulture, out value);
    }

    private static void LogSkip(string rawEntry, string reason)
    {
        Console.WriteLine($"[NeoBankPdfParser] Skipped Entry: {reason}\n? {rawEntry.Substring(0, Math.Min(100, rawEntry.Length))}\n");
    }
}