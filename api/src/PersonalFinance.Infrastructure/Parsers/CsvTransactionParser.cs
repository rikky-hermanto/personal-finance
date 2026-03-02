using CsvHelper;
using CsvHelper.Configuration;
using PersonalFinance.Application.Dtos;
using PersonalFinance.Application.Interfaces;
using System.Globalization;

namespace PersonalFinance.Infrastructure.Parsers;

public class CsvTransactionParser : IBankStatementParser
{
    public async Task<List<TransactionDto>> ParseAsync(Stream fileStream, string? password = null)
    {
        using var reader = new StreamReader(fileStream);
        using var csv = new CsvReader(reader, new CsvConfiguration(CultureInfo.InvariantCulture)
        {
            HeaderValidated = null,
            MissingFieldFound = null
        });

        var transactions = new List<TransactionDto>();

        await foreach (var record in csv.GetRecordsAsync<dynamic>())
        {
            var t = new TransactionDto
            {
                Date = DateTime.Parse(record.Date ?? record["Date"]),
                Remarks = record.Remarks ?? "",
                Description = record.Description ?? "",
                Flow = record.Flow ?? "DB",
                Type = record.Type ?? (record.Flow == "CR" ? "Income" : "Expense"),
                Category = record.Category ?? "Untracked Expense",
                Wallet = record.Wallet ?? "",
                AmountIdr = ParseCurrency(record["Amount (IDR)"]),
                Currency = "IDR", // assuming fixed
                ExchangeRate = null, // not in your sample
                Balance = 0
            };

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
