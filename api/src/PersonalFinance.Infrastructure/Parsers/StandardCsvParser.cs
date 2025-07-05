using System.Globalization;
using PersonalFinance.Application.Dtos;
using CsvHelper;
using CsvHelper.Configuration;

namespace PersonalFinance.Infrastructure.Parsers
{
    public class StandardCsvParser : IBankStatementParser
    {
        private readonly ICategoryRuleService _categoryRuleService;

        public StandardCsvParser(ICategoryRuleService categoryRuleService)
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
                
                var transaction = new TransactionDto
                {
                    Date = ParseDate(GetFieldValue(recordDict, "Date")),
                    Description = GetFieldValue(recordDict, "Item", "Description", "Transaction") ?? string.Empty,
                    Remarks = GetFieldValue(recordDict, "Remarks", "Notes", "Memo") ?? string.Empty,
                    Flow = DetermineFlow(recordDict),
                    Type = DetermineType(recordDict),
                    Category = GetFieldValue(recordDict, "Category") ?? "Untracked Expense",
                    Wallet = GetFieldValue(recordDict, "Wallet", "Bank", "Account") ?? "Standard",
                    AmountIdr = ParseAmount(GetFieldValue(recordDict, "Amount", "Amount (IDR)", "Amount IDR")),
                    Currency = GetFieldValue(recordDict, "Currency") ?? "IDR",
                    ExchangeRate = ParseNullableDecimal(GetFieldValue(recordDict, "Exc. Rate", "Exchange Rate", "ExchangeRate")),
                    Balance = ParseDecimal(GetFieldValue(recordDict, "Balance"))
                };

                // Apply category rules
                transaction.Category = await _categoryRuleService.CategorizeAsync(transaction.Description, transaction.Type);
                
                transactions.Add(transaction);
            }

            return transactions;
        }

        private static string? GetFieldValue(IDictionary<string, object> record, params string[] possibleHeaders)
        {
            foreach (var header in possibleHeaders)
            {
                if (record.TryGetValue(header, out var value))
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

        private static string DetermineFlow(IDictionary<string, object> record)
        {
            // Check for explicit Flow column
            var flowValue = GetFieldValue(record, "Flow", "Type", "Dr/Cr", "Debit/Credit");
            if (!string.IsNullOrEmpty(flowValue))
            {
                var flow = flowValue.ToUpperInvariant();
                if (flow.Contains("CR") || flow.Contains("CREDIT") || flow.Contains("IN"))
                    return "CR";
                if (flow.Contains("DB") || flow.Contains("DEBIT") || flow.Contains("OUT"))
                    return "DB";
            }

            // Check amount for negative values
            var amountValue = GetFieldValue(record, "Amount", "Amount (IDR)", "Amount IDR");
            if (!string.IsNullOrEmpty(amountValue))
            {
                var cleaned = amountValue.Replace("Rp", "").Replace(",", "").Replace(" ", "").Trim();
                if (cleaned.StartsWith("-") || (cleaned.StartsWith("(") && cleaned.EndsWith(")")))
                {
                    return "DB";
                }
            }

            // Default to debit
            return "DB";
        }

        private static string DetermineType(IDictionary<string, object> record)
        {
            var typeValue = GetFieldValue(record, "Type", "Category", "Transaction Type");
            if (!string.IsNullOrEmpty(typeValue))
            {
                var type = typeValue.ToLowerInvariant();
                if (type.Contains("income") || type.Contains("credit") || type.Contains("deposit"))
                    return "Income";
                if (type.Contains("expense") || type.Contains("debit") || type.Contains("withdrawal"))
                    return "Expense";
            }

            // Determine from flow
            var flow = DetermineFlow(record);
            return flow == "CR" ? "Income" : "Expense";
        }
    }
}