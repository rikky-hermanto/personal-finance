using CsvHelper;
using CsvHelper.Configuration;
using PersonalFinance.Domain.Entities;
using System.Formats.Asn1;
using System.Globalization;

namespace PersonalFinance.Infrastructure.Parsers;

public class CsvTransactionParser
{
    public async Task<List<Transaction>> ParseAsync(Stream fileStream)
    {
        using var reader = new StreamReader(fileStream);
        using var csv = new CsvReader(reader, new CsvConfiguration(CultureInfo.InvariantCulture)
        {
            HeaderValidated = null,
            MissingFieldFound = null
        });

        var transactions = new List<Transaction>();

        await foreach (var record in csv.GetRecordsAsync<dynamic>())
        {
            var t = new Transaction();

            t.Date = DateTime.Parse(record.Date ?? record["Date"]);
            t.Remarks = record.Remarks ?? "";
            t.Description = record.Description ?? "";
            t.Flow = record.Flow ?? "DB";
            t.Type = record.Type ?? (t.Flow == "CR" ? "Income" : "Expense");
            t.Category = record.Category ?? "Untracked Expense";
            t.Wallet = record.Wallet ?? "";
            t.AmountIdr = ParseCurrency(record["Amount (IDR)"]);
            t.Currency = "IDR"; // assuming fixed
            t.ExchangeRate = null; // not in your sample

            transactions.Add(t);
        }

        return transactions;
    }

    private decimal ParseCurrency(string input)
    {
        return decimal.Parse(
            input.Replace("Rp", "").Replace(",", "").Trim(),
            NumberStyles.Any,
            CultureInfo.InvariantCulture
        );
    }

    private decimal? ParseCurrencyNullable(string input)
    {
        if (string.IsNullOrWhiteSpace(input)) return null;
        return ParseCurrency(input);
    }
}
