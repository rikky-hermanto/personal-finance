using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using PersonalFinance.Application.Dtos;
using PersonalFinance.Application.Interfaces;
using Microsoft.Extensions.Logging;
using PersonalFinance.Infrastructure.Parsers;
using CsvHelper;
using CsvHelper.Configuration;

public class BcaCsvParser : IBankStatementParser
{
    private readonly ICategoryRuleService _categoryRuleService;
    private readonly ILogger<BcaCsvParser> _logger;

    public BcaCsvParser(ICategoryRuleService categoryRuleService, ILogger<BcaCsvParser> logger)
    {
        _categoryRuleService = categoryRuleService;
        _logger = logger;
    }

    public async Task<List<TransactionDto>> ParseAsync(Stream fileStream, string? password = null, string? dateFormat = null)
    {
        _logger.LogInformation("Starting BCA CSV parsing.");
        var transactions = new List<TransactionDto>();
        using var reader = new StreamReader(fileStream, leaveOpen: true);

        // 1. Scan until header found via token-set
        string? headerLine = null;
        var headerTokens = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        int scannedLines = 0;

        while ((headerLine = await reader.ReadLineAsync()) != null && scannedLines < 15)
        {
            scannedLines++;
            headerTokens = CsvTokenizer.Tokenize(headerLine);
            if (headerTokens.Contains("TANGGAL") && 
                headerTokens.Contains("KETERANGAN") && 
                headerTokens.Contains("JUMLAH") && 
                headerTokens.Contains("SALDO"))
            {
                break;
            }
            headerLine = null;
        }

        if (headerLine == null)
        {
            _logger.LogWarning("BCA CSV header not found within the first 15 lines.");
            throw new InvalidDataException("BCA CSV header not found");
        }

        // 2. Detect delimiter
        char delimiter = DetectDelimiter(headerLine);
        
        // 3. Build column-index map by normalized header name
        var headerParts = SplitLine(headerLine, delimiter);
        int dateIdx = -1, descIdx = -1, amountIdx = -1, balanceIdx = -1;

        for (int i = 0; i < headerParts.Length; i++)
        {
            var token = headerParts[i].Trim('\"', ' ', '\'').ToUpperInvariant();
            if (token == "TANGGAL") dateIdx = i;
            else if (token == "KETERANGAN") descIdx = i;
            else if (token == "JUMLAH") amountIdx = i;
            else if (token == "SALDO") balanceIdx = i;
        }

        if (dateIdx == -1 || descIdx == -1 || amountIdx == -1 || balanceIdx == -1)
        {
            throw new InvalidDataException("Missing required BCA CSV headers");
        }

        int flowIdx = amountIdx + 1; // BCA exports flow without header next to amount

        var config = new CsvConfiguration(CultureInfo.InvariantCulture)
        {
            Delimiter = delimiter.ToString(),
            HasHeaderRecord = false,
            BadDataFound = null,
            MissingFieldFound = null,
        };

        using var csv = new CsvReader(reader, config);

        // 4. Per-row parsing
        while (await csv.ReadAsync())
        {
            var row = csv.Parser.Record;
            if (row == null || row.Length == 0) continue;

            string firstCol = row[0].Trim('\"', ' ', '\'');
            
            // Terminate when first column starts with "Saldo " or row is blank
            if (string.IsNullOrWhiteSpace(firstCol) || firstCol.StartsWith("Saldo ", StringComparison.OrdinalIgnoreCase))
                break;

            if (row.Length <= Math.Max(flowIdx, Math.Max(dateIdx, Math.Max(descIdx, Math.Max(amountIdx, balanceIdx)))))
                continue;

            var dateStr = row[dateIdx];
            var descStr = row[descIdx].Trim('\'', ' ', '"');
            var amountStr = row[amountIdx];
            var flowStr = row[flowIdx].Trim().ToUpperInvariant();
            var balanceStr = row[balanceIdx];

            var date = ParseBcaDate(dateStr);
            
            if (!CsvAmountParser.TryParse(amountStr, out var amount))
                continue; // Skip invalid amounts

            decimal? balance = null;
            if (CsvAmountParser.TryParse(balanceStr, out var parsedBalance))
                balance = parsedBalance;

            var transaction = new TransactionDto
            {
                Date = date,
                Description = descStr,
                Remarks = "",
                Flow = flowStr,
                Type = TransactionTypeClassifier.Classify(descStr, flowStr),
                Category = "Uncategorized",
                Wallet = "BCA",
                AmountIdr = amount,
                Currency = "IDR",
                ExchangeRate = null,
                StatementBalance = balance,
                Balance = balance ?? 0
            };

            transactions.Add(transaction);
        }

        await _categoryRuleService.CategorizeBatchAsync(transactions);

        _logger.LogInformation("BCA CSV parsing complete. Parsed {Count} transactions.", transactions.Count);
        return transactions;
    }

    private char DetectDelimiter(string line)
    {
        int commaCount = line.Count(c => c == ',');
        int semicolonCount = line.Count(c => c == ';');
        int tabCount = line.Count(c => c == '\t');

        if (tabCount > commaCount && tabCount > semicolonCount) return '\t';
        if (semicolonCount > commaCount) return ';';
        return ','; // default
    }

    private string[] SplitLine(string line, char delimiter)
    {
        var result = new List<string>();
        bool inQuotes = false;
        int start = 0;
        for (int i = 0; i < line.Length; i++)
        {
            if (line[i] == '"') inQuotes = !inQuotes;
            else if (line[i] == delimiter && !inQuotes)
            {
                result.Add(line.Substring(start, i - start));
                start = i + 1;
            }
        }
        result.Add(line.Substring(start));
        return result.ToArray();
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
}