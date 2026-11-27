using Microsoft.Extensions.Logging.Abstractions;
using PersonalFinance.Application.Commands;
using PersonalFinance.Infrastructure.Supabase;
using PersonalFinance.Tests.Support;
using Supabase.Postgrest.Exceptions;
using Supabase.Storage.Exceptions;
using static PersonalFinance.Tests.Cashflow.CashflowRows;

namespace PersonalFinance.Tests.Cashflow;

/// <summary>DeleteAllTransactionsCommandHandler and StorageService on the harness.</summary>
public sealed class CashflowWritePathTests
{
    // ── DeleteAllTransactionsCommandHandler ───────────────────────────────────

    [Fact]
    public async Task Handle_DeleteAll_DeletesOnlyCallersTransactionsAndFileHashes()
    {
        // Arrange
        await using var fake = await FakePostgrest.StartAsync();
        fake.On("DELETE", "transactions", "[]");
        fake.On("DELETE", "uploaded_files", "[]");
        var handler = new DeleteAllTransactionsCommandHandler(
            await fake.CreateClientAsync(), NullLogger<DeleteAllTransactionsCommandHandler>.Instance, new TestCaller());

        // Act
        var result = await handler.Handle(new DeleteAllTransactionsCommand(), CancellationToken.None);

        // Assert: both deletes are filtered to the caller (owner decision 1) and carry the caller's
        // token, so RLS and the filter agree; neither is an unfiltered table wipe.
        Assert.Equal(0, result);
        Assert.Equal(["transactions", "uploaded_files"], fake.Requests.Select(r => r.Table));
        Assert.All(fake.Requests, r =>
        {
            Assert.Equal("DELETE", r.Method);
            Assert.Equal($"Bearer {TestCaller.Token}", r.Headers["Authorization"]);
            Assert.Equal($"?user_id=eq.{TestCaller.Id}&id=gt.0", Query(r));
            Assert.Equal("", r.Body);
        });
    }

    [Fact]
    public async Task Handle_TransactionsDeleteFails_ThrowsAndKeepsFileHashes()
    {
        // Arrange
        await using var fake = await FakePostgrest.StartAsync();
        fake.On("DELETE", "transactions", """{"code":"42501","message":"permission denied for table transactions"}""", 403);
        var handler = new DeleteAllTransactionsCommandHandler(
            await fake.CreateClientAsync(), NullLogger<DeleteAllTransactionsCommandHandler>.Instance, new TestCaller());

        // Act
        await Assert.ThrowsAsync<PostgrestException>(() => handler.Handle(new DeleteAllTransactionsCommand(), CancellationToken.None));

        // Assert: the file-hash delete never ran, so a retry still sees the files as imported.
        Assert.Empty(fake.RequestsTo("DELETE", "uploaded_files"));
    }

    // ── StorageService ────────────────────────────────────────────────────────

    private const string ObjectPath = "storage/object/bank-statements/user-1/BCA/statement.csv";

    private static async Task<(FakePostgrest Fake, StorageService Service)> StartStorageAsync()
    {
        var fake = await FakePostgrest.StartAsync();
        return (fake, new StorageService(await fake.CreateClientAsync(), NullLogger<StorageService>.Instance));
    }

    [Fact]
    public async Task UploadAsync_File_PostsBytesToUserBankPathWithContentTypeAndUpsert()
    {
        // Arrange
        var (fake, service) = await StartStorageAsync();
        await using var _ = fake;
        fake.On("POST", ObjectPath, """{"Key":"bank-statements/user-1/BCA/statement.csv"}""");

        // Act
        var path = await service.UploadAsync("user-1", "BCA", "statement.csv",
            new MemoryStream("Tanggal,Jumlah\n01/05,85000"u8.ToArray()), "text/csv");

        // Assert
        Assert.Equal("user-1/BCA/statement.csv", path);
        var request = Assert.Single(fake.Requests);
        Assert.Equal("POST", request.Method);
        Assert.Equal(ObjectPath, request.Table);
        Assert.Equal("text/csv", request.Headers["Content-Type"]);
        Assert.Equal("true", request.Headers["x-upsert"]);
        Assert.Equal($"Bearer {TestCaller.Token}", request.Headers["Authorization"]);
        Assert.Equal("Tanggal,Jumlah\n01/05,85000", request.Body);
    }

    [Fact]
    public async Task UploadAsync_StorageRejects_Throws()
    {
        // Arrange
        var (fake, service) = await StartStorageAsync();
        await using var _ = fake;
        fake.On("POST", ObjectPath, """{"statusCode":"403","error":"Unauthorized","message":"new row violates row-level security policy"}""", 403);

        // Act + Assert
        await Assert.ThrowsAsync<SupabaseStorageException>(() => service.UploadAsync(
            "user-1", "BCA", "statement.csv", new MemoryStream([1, 2, 3]), "text/csv"));
    }

    [Fact]
    public async Task DownloadAsync_ExistingFile_ReturnsItsBytes()
    {
        // Arrange
        var (fake, service) = await StartStorageAsync();
        await using var _ = fake;
        fake.On("GET", ObjectPath, "Tanggal,Jumlah");

        // Act
        await using var stream = await service.DownloadAsync("user-1/BCA/statement.csv");

        // Assert
        Assert.NotNull(stream);
        Assert.Equal("Tanggal,Jumlah", await new StreamReader(stream).ReadToEndAsync());
        Assert.Equal($"Bearer {TestCaller.Token}", Assert.Single(fake.Requests).Headers["Authorization"]);
    }

    [Fact]
    public async Task DownloadAsync_EmptyFile_ReturnsNull()
    {
        // Arrange
        var (fake, service) = await StartStorageAsync();
        await using var _ = fake;
        fake.On("GET", ObjectPath, "");

        // Act
        var stream = await service.DownloadAsync("user-1/BCA/statement.csv");

        // Assert
        Assert.Null(stream);
    }

    [Fact]
    public async Task DeleteAsync_Path_RemovesThatPrefixFromBucket()
    {
        // Arrange
        var (fake, service) = await StartStorageAsync();
        await using var _ = fake;
        fake.On("DELETE", "storage/object/bank-statements", """[{"name":"user-1/BCA/statement.csv"}]""");

        // Act
        var deleted = await service.DeleteAsync("user-1/BCA/statement.csv");

        // Assert
        Assert.True(deleted);
        var request = Assert.Single(fake.Requests);
        Assert.Equal("""{"prefixes":["user-1/BCA/statement.csv"]}""", request.Body);
        Assert.Equal($"Bearer {TestCaller.Token}", request.Headers["Authorization"]);
    }
}
