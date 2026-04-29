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
            using var reader = new StreamReader(stream, Encoding.UTF8, detectEncodingFromByteOrderMarks: true, bufferSize: 1024);
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
                using var pdf = string.IsNullOrEmpty(pdfPassword)
                    ? PdfDocument.Open(stream)
                    : PdfDocument.Open(stream, new ParsingOptions() { Password = pdfPassword });

                var firstPageText = pdf.GetPages().FirstOrDefault()?.Text ?? string.Empty;

                // Look for NeoBank-specific markers: NOW Savings
                if (firstPageText.Contains("NOW Savings", StringComparison.OrdinalIgnoreCase))
                {
                    stream.Position = 0;
                    _logger.LogDebug("Bank identified as NEOBANK.");
                    return "NEOBANK";
                }
            }
            catch (UglyToad.PdfPig.Exceptions.PdfDocumentEncryptedException ex)
            {
                _logger.LogWarning(ex, "PDF Document is encrypted and requires a password.");
                // Handle encrypted PDF without password
                return null;
            }
            stream.Position = 0;
        }
        _logger.LogDebug("Bank could not be identified.");
        return null;
    }
}   