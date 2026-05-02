namespace PersonalFinance.Application.Interfaces;

public interface IFileStorageService
{
    Task<string> UploadAsync(string userId, string bank, string filename, Stream fileStream, string contentType);
    Task<Stream?> DownloadAsync(string path);
    Task<bool> DeleteAsync(string path);
}
