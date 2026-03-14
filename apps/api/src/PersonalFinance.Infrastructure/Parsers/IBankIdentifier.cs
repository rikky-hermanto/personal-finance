public interface IBankIdentifier
{
    /// <summary>
    /// Identifies the bank code from the file stream and content type.
    /// </summary>
    /// <param name="stream">The file stream (will be reset to position 0).</param>
    /// <param name="contentType">The file content type.</param>
    /// <returns>The bank code (e.g., "BCA") or null if not recognized.</returns>
    Task<string?> IdentifyAsync(Stream stream, string contentType, string? pdfPassword = null);
}