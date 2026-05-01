using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Logging;
using PersonalFinance.Application.Dtos;
using PersonalFinance.Application.Interfaces;

namespace PersonalFinance.Infrastructure.External;

public class LlmExtractionClient : ILlmExtractionClient
{
    private readonly HttpClient _http;
    private readonly ILogger<LlmExtractionClient> _logger;

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    public LlmExtractionClient(HttpClient http, ILogger<LlmExtractionClient> logger)
    {
        _http = http;
        _logger = logger;
    }

    public async Task<List<TransactionDto>> ParsePdfAsync(
        Stream pdf, string fileName, string? bankHint, string? password,
        CancellationToken ct = default)
    {
        using var content = new MultipartFormDataContent();
        var fileContent = new StreamContent(pdf);
        fileContent.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue("application/pdf");
        content.Add(fileContent, "file", fileName);
        if (bankHint is not null)
            content.Add(new StringContent(bankHint), "bank_hint");
        if (password is not null)
            content.Add(new StringContent(password), "password");

        _logger.LogInformation("Forwarding PDF to AI service | file={FileName} | bankHint={BankHint}", fileName, bankHint ?? "null");

        var response = await _http.PostAsync("/parse-pdf", content, ct);

        if (response.StatusCode == System.Net.HttpStatusCode.UnprocessableEntity)
            throw new NotSupportedException("AI service: invalid PDF format or unsupported file.");

        if (!response.IsSuccessStatusCode)
        {
            var body = await response.Content.ReadAsStringAsync(ct);
            _logger.LogError("AI service returned {StatusCode}: {Body}", (int)response.StatusCode, body);

            string detail;
            try
            {
                using var doc = JsonDocument.Parse(body);
                detail = doc.RootElement.TryGetProperty("detail", out var d) ? d.GetString() ?? body : body;
            }
            catch
            {
                detail = body;
            }

            if (detail.Contains("UNAVAILABLE", StringComparison.OrdinalIgnoreCase) ||
                detail.Contains("high demand", StringComparison.OrdinalIgnoreCase) ||
                detail.Contains("503", StringComparison.Ordinal))
            {
                throw new LlmExtractionException(
                    "The AI reading service is temporarily busy. Please wait a moment and try again.",
                    isTransient: true);
            }

            throw new LlmExtractionException($"AI service error: {detail}");
        }

        var parsed = await response.Content.ReadFromJsonAsync<PdfParseResponse>(JsonOptions, ct)
            ?? throw new LlmExtractionException("AI service returned an empty response.");

        _logger.LogInformation("AI service parsed {Count} transactions, skipped {Skipped}, pages {Pages}",
            parsed.TotalParsed, parsed.SkippedRows, parsed.PagesProcessed);

        return parsed.Transactions.Select(MapToDto).ToList();
    }

    private static TransactionDto MapToDto(TransactionResult r) => new()
    {
        Date = DateTime.Parse(r.Date, null,
            System.Globalization.DateTimeStyles.AssumeUniversal |
            System.Globalization.DateTimeStyles.AdjustToUniversal),
        Description = r.Description,
        Remarks = r.Remarks,
        Flow = r.Flow,
        Type = r.Type,
        Category = r.Category,
        Wallet = r.Wallet,
        AmountIdr = (decimal)r.AmountIdr,
        Currency = r.Currency,
        ExchangeRate = r.ExchangeRate.HasValue ? (decimal?)r.ExchangeRate.Value : null,
        Balance = 0,
    };

    // ── Response models (mirror Python PdfParseResponse) ────────────────────

    private sealed class PdfParseResponse
    {
        public List<TransactionResult> Transactions { get; set; } = [];
        public int TotalParsed { get; set; }
        public int SkippedRows { get; set; }
        public int PagesProcessed { get; set; }
    }

    private sealed class TransactionResult
    {
        public string Date { get; set; } = string.Empty;
        public string Description { get; set; } = string.Empty;
        public string Remarks { get; set; } = string.Empty;
        public string Flow { get; set; } = "DB";
        public string Type { get; set; } = "Expense";
        public double AmountIdr { get; set; }
        public string Currency { get; set; } = "IDR";
        public double? ExchangeRate { get; set; }
        public string Wallet { get; set; } = string.Empty;
        public string Category { get; set; } = "Untracked Expense";
    }
}
