using PersonalFinance.Application.Interfaces;
using Microsoft.Extensions.Logging;

namespace PersonalFinance.Infrastructure.Supabase;

public class StorageService : IFileStorageService
{
    private const string BucketName = "bank-statements";
    private readonly global::Supabase.Client _supabase;
    private readonly ILogger<StorageService> _logger;

    public StorageService(global::Supabase.Client supabase, ILogger<StorageService> logger)
    {
        _supabase = supabase;
        _logger = logger;
    }

    public async Task<string> UploadAsync(string userId, string bank, string filename, Stream fileStream, string contentType)
    {
        var path = $"{userId}/{bank}/{filename}";
        _logger.LogInformation("Uploading file to {Path} in bucket {Bucket}", path, BucketName);

        using var memoryStream = new MemoryStream();
        await fileStream.CopyToAsync(memoryStream);
        var fileBytes = memoryStream.ToArray();

        var options = new global::Supabase.Storage.FileOptions
        {
            ContentType = contentType,
            Upsert = true
        };

        var bucket = _supabase.Storage.From(BucketName);
        await bucket.Upload(fileBytes, path, options);

        return path;
    }

    public async Task<Stream?> DownloadAsync(string path)
    {
        _logger.LogInformation("Downloading file from {Path} in bucket {Bucket}", path, BucketName);
        
        var bucket = _supabase.Storage.From(BucketName);
        var fileBytes = await bucket.Download(path, null);

        if (fileBytes == null || fileBytes.Length == 0)
        {
            return null;
        }

        return new MemoryStream(fileBytes);
    }

    public async Task<bool> DeleteAsync(string path)
    {
        _logger.LogInformation("Deleting file from {Path} in bucket {Bucket}", path, BucketName);
        
        var bucket = _supabase.Storage.From(BucketName);
        await bucket.Remove(new List<string> { path });

        return true;
    }
}
