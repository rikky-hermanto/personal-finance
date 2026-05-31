namespace PersonalFinance.Application.Interfaces;

public interface IBankIdentifier
{
    /// <summary>
    /// Identifies the bank code from the file stream and content type.
    /// Stream is guaranteed to be reset to position 0 on return.
    /// </summary>
    Task<string?> IdentifyAsync(Stream stream, string contentType, string? pdfPassword = null);
}
