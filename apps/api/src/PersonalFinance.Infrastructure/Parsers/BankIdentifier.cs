using System.Text;
using UglyToad.PdfPig;
using Microsoft.Extensions.Logging;

namespace PersonalFinance.Infrastructure.Parsers;

public class BankIdentifier : IBankIdentifier
{
    private readonly ILogger<BankIdentifier> _logger;

    public BankIdentifier(ILogger<BankIdentifier> logger)
    {
        _logger = logger;
    }

    public async Task<string?> IdentifyAsync(Stream stream, string contentType, string? pdfPassword = null)
    {
        _logger.LogInformation("Identifying bank from stream with Content-Type: {ContentType}", contentType);
        if (contentType.StartsWith("text/csv", StringComparison.OrdinalIgnoreCase))
        {
            stream.Position = 0;
            using var reader = new StreamReader(stream, Encoding.UTF8, detectEncodingFromByteOrderMarks: true, bufferSize: 1024, leaveOpen: true);
            var firstFiveLines = new List<string>();
            var tokenizedLines = new List<HashSet<string>>();
            for (int i = 0; i < 5; i++)
            {
                var line = await reader.ReadLineAsync();
                if (line == null) break;
                firstFiveLines.Add(line);
                var tokens = CsvTokenizer.Tokenize(line);
                tokenizedLines.Add(tokens);

                if (tokens.Contains("TANGGAL") &&
                    tokens.Contains("KETERANGAN") &&
                    tokens.Contains("JUMLAH") &&
                    tokens.Contains("SALDO"))
                {
                    // Reinforcement: also require NO. REKENING or REKENING token in first 5 lines (mitigates over-match)
                    bool hasAccountToken = tokenizedLines.Any(t =>
                        t.Contains("NO. REKENING") || t.Contains("REKENING") || t.Contains("NO.REKENING"));

                    if (hasAccountToken)
                    {
                        stream.Position = 0;
                        _logger.LogDebug("Bank identified as BCA.");
                        return BankKeys.Bca;
                    }
                }

                // Check for standard CSV headers
                if (tokens.Contains("DATE") &&
                    (tokens.Contains("ITEM") || tokens.Contains("DESCRIPTION")) &&
                    tokens.Contains("AMOUNT"))
                {
                    stream.Position = 0;
                    _logger.LogDebug("Bank identified as STANDARD.");
                    return BankKeys.Standard;
                }
            }
            stream.Position = 0;
        }
        else if (contentType.StartsWith("application/pdf", StringComparison.OrdinalIgnoreCase))
        {
            stream.Position = 0;
            try
            {
                // Create a copy to prevent the original stream from being closed by PdfDocument.Open
                using var ms = new MemoryStream();
                stream.Position = 0;
                await stream.CopyToAsync(ms);
                ms.Position = 0;

                using var pdf = string.IsNullOrEmpty(pdfPassword)
                    ? PdfDocument.Open(ms)
                    : PdfDocument.Open(ms, new ParsingOptions() { Password = pdfPassword });

                var firstPageText = pdf.NumberOfPages > 0 ? pdf.GetPage(1).Text : string.Empty;

                // Look for NeoBank-specific markers: NOW Savings
                if (firstPageText.Contains("NOW Savings", StringComparison.OrdinalIgnoreCase))
                {
                    _logger.LogDebug("Bank identified as NEOBANK.");
                    stream.Position = 0;
                    return BankKeys.NeoBank;
                }
                else if (firstPageText.Contains("Superbank", StringComparison.OrdinalIgnoreCase))
                {
                    _logger.LogDebug("Bank identified as Superbank.");
                    stream.Position = 0;
                    return BankKeys.Superbank;
                }
            }
            catch (UglyToad.PdfPig.Exceptions.PdfDocumentEncryptedException ex)
            {
                _logger.LogWarning(ex, "PDF Document is encrypted and requires a password.");
                stream.Position = 0;
                return null;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Error during PDF bank identification.");
                stream.Position = 0;
                return null;  // unreadable — reject, don't burn an LLM call
            }

            // Fallback: route any unrecognized PDF to the LLM extractor
            _logger.LogDebug("PDF bank unrecognized — routing to LLM extractor.");
            stream.Position = 0;
            return BankKeys.LlmPdf;
        }
        _logger.LogDebug("Bank could not be identified.");
        stream.Position = 0;
        return null;
    }
}
