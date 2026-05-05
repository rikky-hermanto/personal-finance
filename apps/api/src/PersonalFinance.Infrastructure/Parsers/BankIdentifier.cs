using System.Text;
using UglyToad.PdfPig;
using Microsoft.Extensions.Logging;
 
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
        if (contentType == "text/csv")
        {
            stream.Position = 0;
            using var reader = new StreamReader(stream, Encoding.UTF8, detectEncodingFromByteOrderMarks: true, bufferSize: 1024, leaveOpen: true);
            for (int i = 0; i < 5; i++)
            {
                var line = await reader.ReadLineAsync();
                if (line == null) break;
                if (line.Contains("Tanggal,Keterangan,Cabang,Jumlah,,Saldo", StringComparison.OrdinalIgnoreCase))
                {
                    stream.Position = 0;
                    _logger.LogDebug("Bank identified as BCA.");
                    return "BCA";
                }

                // Check for standard CSV headers
                if (line.Contains("Date", StringComparison.OrdinalIgnoreCase) &&
                    (line.Contains("Item", StringComparison.OrdinalIgnoreCase) ||
                     line.Contains("Description", StringComparison.OrdinalIgnoreCase)) &&
                    line.Contains("Amount", StringComparison.OrdinalIgnoreCase))
                {
                    stream.Position = 0;
                    _logger.LogDebug("Bank identified as STANDARD.");
                    return "STANDARD";
                }
            }
            stream.Position = 0;
        }
        else if (contentType == "application/pdf")
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

                var firstPageText = pdf.GetPages().FirstOrDefault()?.Text ?? string.Empty;

                // Look for NeoBank-specific markers: NOW Savings
                if (firstPageText.Contains("NOW Savings", StringComparison.OrdinalIgnoreCase))
                {
                    _logger.LogDebug("Bank identified as NEOBANK.");
                    stream.Position = 0;
                    return "NEOBANK";
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
            }

            // Fallback: route any unrecognized PDF to the LLM extractor
            _logger.LogDebug("PDF bank unrecognized — routing to LLM extractor.");
            stream.Position = 0;
            return "LLM_PDF";
        }
        _logger.LogDebug("Bank could not be identified.");
        stream.Position = 0;
        return null;
    }
}   