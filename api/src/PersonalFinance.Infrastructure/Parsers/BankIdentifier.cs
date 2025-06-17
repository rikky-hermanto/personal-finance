using System.Text;
using UglyToad.PdfPig;
 
public class BankIdentifier : IBankIdentifier
{
    public async Task<string?> IdentifyAsync(Stream stream, string contentType, string? pdfPassword = null)
    {
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
                    return "BCA";
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
                    return "NEOBANK";
                }
            }
            catch (UglyToad.PdfPig.Exceptions.PdfDocumentEncryptedException)
            {
                // Handle encrypted PDF without password
                return null;
            }
            stream.Position = 0;
        }
        return null;
    }
}   