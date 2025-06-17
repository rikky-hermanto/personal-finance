using System.Globalization;
using PersonalFinance.Domain.Entities;

public class BcaCsvParser : IBankStatementParser
{
    public async Task<List<Transaction>> ParseAsync(Stream fileStream, string? password = null)
    {
        var transactions = new List<Transaction>();
        using var reader = new StreamReader(fileStream);

        // Dynamically skip lines until the header is found
        string? header = null;
        while ((header = await reader.ReadLineAsync()) != null)
        {
            if (header.Trim().StartsWith("Tanggal,Keterangan,Cabang,Jumlah,,Saldo", StringComparison.OrdinalIgnoreCase))
                break;
        }
        if (header == null)
            throw new InvalidDataException("BCA CSV header not found");

        string? line;
        while ((line = await reader.ReadLineAsync()) != null)
        {
            // Stop at summary/footer
            if (line.StartsWith("Saldo Awal") || string.IsNullOrWhiteSpace(line))
                break;

            var parts = SplitCsvLine(line);
            if (parts.Length < 6) continue;

            // Parse fields
            var date = ParseBcaDate(parts[0]);
            var description = parts[1].Trim('\'', ' ', '"');

            decimal amount = 0;
            if (!string.IsNullOrWhiteSpace(parts[3]))
            {
                if (!decimal.TryParse(parts[3], NumberStyles.Any, CultureInfo.InvariantCulture, out amount))
                    throw new FormatException($"Invalid amount format: '{parts[3]}'");
            }
            else
            {
                // Optionally skip or handle empty amount fields
                continue;
            }
                var flow = parts[4].Trim();

            decimal? balance = null;
            if (!string.IsNullOrWhiteSpace(parts[5]))
            {
                if (!decimal.TryParse(parts[5], NumberStyles.Any, CultureInfo.InvariantCulture, out var parsedBalance))
                    balance = null; // or throw, depending on requirements
                else
                    balance = parsedBalance;
            }

            transactions.Add(new Transaction
            {
                Date = date,
                Description = description,
                Remarks = "",
                Flow = flow,
                Type = flow == "CR" ? "Income" : "Expense",
                Category = "Untracked Expense",
                Wallet = "BCA",
                AmountIdr = amount,
                Currency = "IDR",
                ExchangeRate = null
            });
        }

        return transactions;
    }

    private DateTime ParseBcaDate(string input)
    {
        var now = DateTime.UtcNow;
        var trimmed = input.Trim('\'', ' ', '"');
        DateTime date;

        if (DateTime.TryParseExact(trimmed, new[] { "dd/MM/yyyy", "d/M/yyyy", "d/M/yy", "dd/MM/yy" }, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal, out date))
        {
            return date;
        }
        if (DateTime.TryParseExact(trimmed, new[] { "dd/MM", "d/M" }, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal, out date))
        {
            return new DateTime(now.Year, date.Month, date.Day, 0, 0, 0, DateTimeKind.Utc);
        }
        if (DateTime.TryParse(trimmed, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal, out date))
        {
            return date;
        }
        throw new FormatException($"Invalid BCA date format: '{input}'");
    }

    private static string[] SplitCsvLine(string line)
    {
        var result = new List<string>();
        bool inQuotes = false;
        int start = 0;
        for (int i = 0; i < line.Length; i++)
        {
            if (line[i] == '"') inQuotes = !inQuotes;
            else if (line[i] == ',' && !inQuotes)
            {
                result.Add(line.Substring(start, i - start));
                start = i + 1;
            }
        }
        result.Add(line.Substring(start));
        return result.ToArray();
    }
}