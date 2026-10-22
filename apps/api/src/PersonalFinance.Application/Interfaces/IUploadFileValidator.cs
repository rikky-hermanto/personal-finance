namespace PersonalFinance.Application.Interfaces;

public interface IUploadFileValidator
{
    /// <summary>
    /// SEC-02: checks the file's leading bytes against the content type the client declared.
    /// The stream's position is restored on return.
    /// </summary>
    Task<bool> ValidateAsync(Stream stream, string declaredContentType, CancellationToken ct = default);
}
