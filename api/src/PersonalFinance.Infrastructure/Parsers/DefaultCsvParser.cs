using System.Globalization;
using PersonalFinance.Application.Dtos;
using CsvHelper;
using CsvHelper.Configuration;

public class DefaultCsvParser : IBankStatementParser
{
    private readonly ICategoryRuleService _categoryRuleService;

    public DefaultCsvParser(ICategoryRuleService categoryRuleService)
    {
        _categoryRuleService = categoryRuleService;
    }

    public async Task<List<TransactionDto>> ParseAsync(Stream fileStream, string? password = null)
    {
        var transactions = new List<TransactionDto>();

        using var reader = new StreamReader(fileStream);
        using var csv = new CsvReader(reader, new CsvConfiguration(CultureInfo.InvariantCulture)
        {
            HeaderValidated = null,
            MissingFieldFound = null,
            HasHeaderRecord = true
        });

        var records = csv.GetRecords<dynamic>().ToList();

        foreach (var record in records)
        {
            var recordDict = (IDictionary<string, object>)record;

            // Create a normalized header dictionary for easier lookup
            var normalizedDict = CreateNormalizedHeaderDict(recordDict);

            // Get the main description - prefer Item (merchant name) over Remarks (transaction details)
            var itemValue = GetFieldValue(normalizedDict, "Item");
            var remarksValue = GetFieldValue(normalizedDict, "Remarks");

            string description;
            string remarks;

            if (!string.IsNullOrWhiteSpace(itemValue))
            {
                description = itemValue;
                remarks = remarksValue ?? string.Empty;
            }
            else
            {
                description = remarksValue ?? string.Empty;
                remarks = string.Empty;
            }

            var transaction = new TransactionDto
            {
                Date = ParseDate(GetFieldValue(normalizedDict, "Date")),
                Description = description,
                Remarks = remarks,
                Flow = GetFieldValue(normalizedDict, "Flow") ?? "DB",
                Type = GetFieldValue(normalizedDict, "Type") ?? "Expense",
                Category = GetFieldValue(normalizedDict, "Category") ?? "Untracked Expense",
                Wallet = GetFieldValue(normalizedDict, "Wallet", "Bank", "Account") ?? "Standard",
                AmountIdr = ParseAmount(GetFieldValue(normalizedDict, "Amount(IDR)", "AmountIDR", "Amount")),
                Currency = GetFieldValue(normalizedDict, "Currency") ?? "IDR",
                ExchangeRate = ParseNullableDecimal(GetFieldValue(normalizedDict, "Exc.Rate", "ExchangeRate", "ExcRate")),
                Balance = ParseDecimal(GetFieldValue(normalizedDict, "Balance"))
            };

            // Apply category rules if category is still default
            if (transaction.Category == "Untracked Expense")
            {
                transaction.Category = await _categoryRuleService.CategorizeAsync(transaction.Description, transaction.Type);
            }

            transactions.Add(transaction);
        }

        return transactions;
    }

    private static Dictionary<string, object> CreateNormalizedHeaderDict(IDictionary<string, object> originalDict)
    {
        var normalizedDict = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);

        foreach (var kvp in originalDict)
        {
            var normalizedKey = NormalizeHeader(kvp.Key);
            normalizedDict[normalizedKey] = kvp.Value;
        }

        return normalizedDict;
    }

    private static string NormalizeHeader(string header)
    {
        if (string.IsNullOrEmpty(header))
            return string.Empty;

        // Remove all whitespace characters, parentheses, and dots for better matching
        return header
            .Replace("\n", "")
            .Replace("\r", "")
            .Replace("\t", "")
            .Replace(" ", "")
            .Replace("(", "")
            .Replace(")", "")
            .Replace(".", "")
            .Trim();
    }

    private static string? GetFieldValue(IDictionary<string, object> record, params string[] possibleHeaders)
    {
        foreach (var header in possibleHeaders)
        {
            var normalizedHeader = NormalizeHeader(header);
            if (record.TryGetValue(normalizedHeader, out var value))
            {
                return value?.ToString()?.Trim();
            }
        }
        return null;
    }

    private static DateTime ParseDate(string? dateString)
    {
        if (string.IsNullOrWhiteSpace(dateString))
            return DateTime.UtcNow;

        var formats = new[]
        {
            "M/d/yy H:mm", "M/d/yyyy H:mm", "M/d/yy", "M/d/yyyy",
            "dd/MM/yyyy", "MM/dd/yyyy", "yyyy-MM-dd", "dd-MM-yyyy",
            "dd/MM/yy", "MM/dd/yy", "yy-MM-dd", "dd-MM-yy",
            "dd MMM yyyy", "MMM dd yyyy", "yyyy MMM dd"
        };

        foreach (var format in formats)
        {
            if (DateTime.TryParseExact(dateString, format, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal, out var date))
            {
                return date;
            }
        }

        if (DateTime.TryParse(dateString, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal, out var parsedDate))
        {
            return parsedDate;
        }

        throw new FormatException($"Unable to parse date: {dateString}");
    }

    private static decimal ParseAmount(string? amountString)
    {
        if (string.IsNullOrWhiteSpace(amountString))
            return 0;

        // Remove currency symbols and formatting
        var cleaned = amountString
            .Replace("Rp", "")
            .Replace("$", "")
            .Replace("€", "")
            .Replace("£", "")
            .Replace(" ", "")
            .Trim();

        // Handle negative amounts in parentheses
        if (cleaned.StartsWith("(") && cleaned.EndsWith(")"))
        {
            cleaned = "-" + cleaned.Substring(1, cleaned.Length - 2);
        }

        // Handle comma as decimal separator
        if (cleaned.Contains(',') && cleaned.Contains('.'))
        {
            // European format: 1.234,56
            var lastCommaIndex = cleaned.LastIndexOf(',');
            var lastDotIndex = cleaned.LastIndexOf('.');

            if (lastCommaIndex > lastDotIndex)
            {
                cleaned = cleaned.Replace(".", "").Replace(",", ".");
            }
            else
            {
                cleaned = cleaned.Replace(",", "");
            }
        }
        else if (cleaned.Contains(','))
        {
            // Could be thousands separator or decimal separator
            var commaIndex = cleaned.LastIndexOf(',');
            if (cleaned.Length - commaIndex == 3) // Likely thousands separator
            {
                cleaned = cleaned.Replace(",", "");
            }
            else // Likely decimal separator
            {
                cleaned = cleaned.Replace(",", ".");
            }
        }

        if (decimal.TryParse(cleaned, NumberStyles.Any, CultureInfo.InvariantCulture, out var amount))
        {
            return Math.Abs(amount);
        }

        throw new FormatException($"Unable to parse amount: {amountString}");
    }

    private static decimal ParseDecimal(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
            return 0;

        try
        {
            return ParseAmount(value);
        }
        catch
        {
            return 0;
        }
    }

    private static decimal? ParseNullableDecimal(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
            return null;

        try
        {
            return ParseAmount(value);
        }
        catch
        {
            return null;
        }
    }
}
