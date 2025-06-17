using UglyToad.PdfPig;
using PersonalFinance.Domain.Entities;
using System.Globalization;
using System.Text.RegularExpressions;

public class NeoBankPdfParser : IBankStatementParser
{
    private static readonly Regex DateRegex = new(@"^\d{2} \w{3} \d{4}", RegexOptions.Compiled);

    public async Task<List<Transaction>> ParseAsync(Stream fileStream, string? password = null)
    {
        var transactions = new List<Transaction>();
        using var pdf = password == null
            ? PdfDocument.Open(fileStream)
            : PdfDocument.Open(fileStream, new ParsingOptions { Password = password });

        // Concatenate all text from all pages
        var fullText = string.Join(" ", pdf.GetPages().Select(p => p.Text.Replace("\n", " ")));

        // Split into transaction-like segments using the date pattern
        var transactionSegments = Regex.Split(fullText, @"(?=\d{2} \w{3} \d{4})")
            .Select(s => s.Trim())
            .Where(s => DateRegex.IsMatch(s))
            .ToList();

        // Regex to extract fields: date, optional time, description, mutation, balance
        var txnRegex = new Regex(
            @"^(?<date>\d{2} \w{3} \d{4})(?:\s+(?<time>\d{2}:\d{2}:\d{2}))?\s+(?<desc>.+?)\s+(?<mutation>-?[\d\.]+,\d{2})\s+(?<balance>-?[\d\.]+,\d{2})$",
            RegexOptions.Compiled);

        foreach (var segment in transactionSegments)
        {
            // Skip summary and non-transaction lines
            if (segment.Contains("Opening Balance", StringComparison.OrdinalIgnoreCase) ||
                segment.Contains("Credit Total", StringComparison.OrdinalIgnoreCase) ||
                segment.Contains("Debit Total", StringComparison.OrdinalIgnoreCase) ||
                segment.Contains("Closing Balance", StringComparison.OrdinalIgnoreCase) ||
                segment.StartsWith("Pages", StringComparison.OrdinalIgnoreCase))
                continue;

            var match = txnRegex.Match(segment);
            if (!match.Success)
                continue;

            var date = match.Groups["date"].Value;
            var time = match.Groups["time"].Success ? match.Groups["time"].Value : null;
            var desc = match.Groups["desc"].Value;
            var mutation = match.Groups["mutation"].Value;
            var balance = match.Groups["balance"].Value;

            AddTransaction(transactions, date, time, desc, mutation, balance);
        }

        return transactions;
    }

    private static void AddTransaction(List<Transaction> transactions, string date, string? time, string desc, string mutation, string balance)
    {
        var dateTimeStr = time != null ? $"{date} {time}" : date;
        if (!DateTime.TryParseExact(dateTimeStr, new[] { "dd MMM yyyy HH:mm:ss", "dd MMM yyyy" }, CultureInfo.InvariantCulture, DateTimeStyles.None, out var dateTime))
            return;

        if (!TryParseEuropeanDecimal(mutation, out var amount)) return;

        transactions.Add(new Transaction
        {
            Date = dateTime,
            Description = desc.Trim(),
            Remarks = "",
            Flow = amount > 0 ? "CR" : "DB",
            Type = amount > 0 ? "Income" : "Expense",
            Category = "Untracked Expense",
            Wallet = "NeoBank",
            AmountIdr = Math.Abs(amount),
            Currency = "IDR",
            ExchangeRate = null
        });
    }

    private static bool TryParseEuropeanDecimal(string input, out decimal value)
    {
        var normalized = input.Replace(".", "").Replace(",", ".");
        return decimal.TryParse(normalized, NumberStyles.Any, CultureInfo.InvariantCulture, out value);
    }
}