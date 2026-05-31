using System.Text;
using UglyToad.PdfPig;

namespace PersonalFinance.Infrastructure.Parsers;

internal static class BankProbeContextFactory
{
    /// <summary>
    /// Must match BcaCsvParser's header scan depth so a BCA file with a long preamble
    /// is not misidentified as unrecognized (review smell #2).
    /// </summary>
    internal const int CsvScanLines = 15;

    internal static async Task<BankProbeContext> CreateAsync(
        Stream stream, string contentType, string? pdfPassword)
    {
        if (contentType.StartsWith("text/csv", StringComparison.OrdinalIgnoreCase))
        {
            stream.Position = 0;
            using var reader = new StreamReader(stream, Encoding.UTF8,
                detectEncodingFromByteOrderMarks: true, bufferSize: 1024, leaveOpen: true);

            var lines = new List<HashSet<string>>();
            for (int i = 0; i < CsvScanLines; i++)
            {
                var line = await reader.ReadLineAsync();
                if (line == null) break;
                lines.Add(CsvTokenizer.Tokenize(line));
            }
            return new BankProbeContext(lines, string.Empty, IsPdf: false);
        }

        if (contentType.StartsWith("application/pdf", StringComparison.OrdinalIgnoreCase))
        {
            using var ms = new MemoryStream();
            stream.Position = 0;
            await stream.CopyToAsync(ms);
            ms.Position = 0;

            using var pdf = string.IsNullOrEmpty(pdfPassword)
                ? PdfDocument.Open(ms)
                : PdfDocument.Open(ms, new ParsingOptions { Password = pdfPassword });

            var text = pdf.NumberOfPages > 0 ? pdf.GetPage(1).Text : string.Empty;
            return new BankProbeContext([], text, IsPdf: true);
        }

        return new BankProbeContext([], string.Empty, IsPdf: false);
    }
}
