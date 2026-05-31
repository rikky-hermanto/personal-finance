using Microsoft.Extensions.Logging;
using PersonalFinance.Application.Interfaces;
using UglyToad.PdfPig.Exceptions;

namespace PersonalFinance.Infrastructure.Parsers;

public sealed class BankIdentifier(
    IEnumerable<IBankSignature> signatures,
    ILogger<BankIdentifier> logger) : IBankIdentifier
{
    public async Task<string?> IdentifyAsync(Stream stream, string contentType, string? pdfPassword = null)
    {
        logger.LogInformation("Identifying bank from stream with Content-Type: {ContentType}", contentType);

        if (string.IsNullOrEmpty(contentType))
            return null;

        try
        {
            var ctx = await BankProbeContextFactory.CreateAsync(stream, contentType, pdfPassword);

            foreach (var sig in signatures.Where(s => s.AppliesTo(contentType)))
            {
                if (sig.Matches(ctx))
                {
                    logger.LogDebug("Bank identified as {BankKey}.", sig.BankKey);
                    return sig.BankKey;
                }
            }

            if (ctx.IsPdf)
            {
                logger.LogDebug("PDF bank unrecognized — routing to LLM extractor.");
                return BankKeys.LlmPdf;
            }

            logger.LogDebug("Bank could not be identified.");
            return null;
        }
        catch (PdfDocumentEncryptedException ex)
        {
            logger.LogWarning(ex, "PDF is encrypted and requires a password.");
            return null;
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Error during bank identification.");
            return null;
        }
        finally
        {
            stream.Position = 0;
        }
    }
}
