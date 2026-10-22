using System.Text;
using System.Text.Json;
using MediatR;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Moq;
using PersonalFinance.Api.Controllers;
using PersonalFinance.Api.Models;
using PersonalFinance.Application.Dtos;
using PersonalFinance.Application.Interfaces;
using PersonalFinance.Application.Services;
using PersonalFinance.Infrastructure.External;

namespace PersonalFinance.Tests.Controllers;

/// <summary>
/// PF-144 (ERR-01, ERR-04): upload failures return a fixed message and a correlation ID,
/// never exception text, and every failure is logged with the exception.
/// </summary>
public class TransactionsUploadErrorTests
{
    private const string Marker = "LEAK-MARKER-9c41e2 secret path C:\\internal\\parser.cs";

    private static readonly byte[] PdfBytes = Encoding.ASCII.GetBytes("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n");
    private static readonly byte[] PngBytes = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D];
    private static readonly byte[] CsvBytes = Encoding.UTF8.GetBytes("Tanggal,Keterangan,Jumlah\n01/05/2026,GOFOOD,85000\n");

    private sealed class CapturingLogger<T> : ILogger<T>
    {
        public List<(LogLevel Level, Exception? Exception, string Message)> Entries { get; } = [];

        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
        public bool IsEnabled(LogLevel logLevel) => true;

        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception,
            Func<TState, Exception?, string> formatter) =>
            Entries.Add((logLevel, exception, formatter(state, exception)));
    }

    private sealed class Harness
    {
        public Mock<IStatementImportService> Import { get; } = new();
        public Mock<IBankIdentifier> Identifier { get; } = new();
        public Mock<ITransactionService> Transactions { get; } = new();
        public Mock<ILlmExtractionClient> Llm { get; } = new();
        public Mock<IFileStorageService> Storage { get; } = new();
        public Mock<ITransactionPipelineService> Pipeline { get; } = new();
        public CapturingLogger<TransactionsController> Logger { get; } = new();
        public Dictionary<string, string?> Settings { get; } = [];
        public UploadOptions Upload { get; } = new();

        public Harness()
        {
            Transactions.Setup(t => t.IsFileProcessedAsync(It.IsAny<string>())).ReturnsAsync(false);
            Identifier.Setup(i => i.IdentifyAsync(It.IsAny<Stream>(), It.IsAny<string>(), It.IsAny<string?>()))
                .ReturnsAsync("BCA");
            Storage.Setup(s => s.UploadAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(),
                    It.IsAny<Stream>(), It.IsAny<string>()))
                .ReturnsAsync("default-user/BCA/file.csv");
            Storage.Setup(s => s.DownloadAsync(It.IsAny<string>()))
                .ReturnsAsync(() => new MemoryStream(CsvBytes));
        }

        public TransactionsController Build()
        {
            var configuration = new ConfigurationBuilder().AddInMemoryCollection(Settings).Build();
            var controller = new TransactionsController(
                Logger,
                Import.Object,
                Identifier.Object,
                Transactions.Object,
                Mock.Of<ICategoryRuleService>(),
                Mock.Of<IDashboardService>(),
                Llm.Object,
                Mock.Of<IMediator>(),
                Storage.Object,
                Pipeline.Object,
                new Supabase.Client("http://127.0.0.1:54321", "test-anon-key"),
                Mock.Of<ICurrentUser>(),
                Mock.Of<ICashflowMutationService>(),
                Mock.Of<ILlmSearchClient>(),
                configuration,
                new UploadFileValidator(NullLogger<UploadFileValidator>.Instance),
                Options.Create(Upload));
            controller.ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() };
            return controller;
        }
    }

    private static IFormFile File(byte[] bytes, string fileName, string contentType) =>
        new FormFile(new MemoryStream(bytes), 0, bytes.Length, "file", fileName)
        {
            Headers = new HeaderDictionary(),
            ContentType = contentType,
        };

    private static Exception Throwable(string kind) => kind switch
    {
        "not-supported" => new NotSupportedException(Marker),
        "llm" => new LlmExtractionException(Marker),
        "llm-transient" => new LlmExtractionException(Marker, isTransient: true),
        _ => new InvalidOperationException(Marker, new IOException(Marker + " inner")),
    };

    private static int ExpectedStatus(string kind) => kind switch
    {
        "not-supported" => 400,
        "llm" => 422,
        "llm-transient" => 503,
        _ => 500,
    };

    private static (int Status, string Body) Read(IActionResult result)
    {
        var objectResult = Assert.IsAssignableFrom<ObjectResult>(result);
        return (objectResult.StatusCode ?? 200, JsonSerializer.Serialize(objectResult.Value, JsonSerializerOptions.Web));
    }

    private static void AssertSanitized(TransactionsController controller, Harness harness, IActionResult result,
        int expectedStatus)
    {
        var (status, body) = Read(result);
        Assert.Equal(expectedStatus, status);
        Assert.DoesNotContain("LEAK-MARKER", body);
        Assert.DoesNotContain("parser.cs", body);
        Assert.DoesNotContain("\"detail\"", body, StringComparison.OrdinalIgnoreCase);
        Assert.Contains($"\"correlationId\":\"{controller.HttpContext.TraceIdentifier}\"", body);
        Assert.Contains(harness.Logger.Entries, e =>
            e.Level == LogLevel.Error && e.Exception?.Message == Marker);
    }

    [Theory]
    [InlineData("not-supported")]
    [InlineData("llm")]
    [InlineData("llm-transient")]
    [InlineData("unexpected")]
    public async Task UploadPreview_ImportThrows_ReturnsGenericBodyAndLogs(string kind)
    {
        // Arrange
        var harness = new Harness();
        harness.Import.Setup(i => i.ImportAsync(It.IsAny<Stream>(), It.IsAny<string>(), It.IsAny<string?>(), It.IsAny<string?>()))
            .ThrowsAsync(Throwable(kind));
        var controller = harness.Build();

        // Act
        var result = await controller.UploadPreview(File(CsvBytes, "bca.csv", "text/csv"));

        // Assert
        AssertSanitized(controller, harness, result, ExpectedStatus(kind));
    }

    [Fact]
    public async Task UploadPreview_IdentifierThrows_ReturnsGenericBodyAndLogs()
    {
        // Arrange
        var harness = new Harness();
        harness.Identifier.Setup(i => i.IdentifyAsync(It.IsAny<Stream>(), It.IsAny<string>(), It.IsAny<string?>()))
            .ThrowsAsync(Throwable("unexpected"));
        var controller = harness.Build();

        // Act
        var result = await controller.UploadPreview(File(PdfBytes, "statement.pdf", "application/pdf"));

        // Assert
        AssertSanitized(controller, harness, result, 500);
    }

    [Theory]
    [InlineData("llm")]
    [InlineData("llm-transient")]
    [InlineData("unexpected")]
    public async Task UploadPreview_LlmClientThrows_ReturnsGenericBodyAndLogs(string kind)
    {
        // Arrange
        var harness = new Harness();
        harness.Llm.Setup(l => l.ParseImageAsync(It.IsAny<Stream>(), It.IsAny<string>(), It.IsAny<string>(),
                It.IsAny<string?>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(Throwable(kind));
        var controller = harness.Build();

        // Act
        var result = await controller.UploadPreview(File(PngBytes, "jago.png", "image/png"));

        // Assert
        AssertSanitized(controller, harness, result, ExpectedStatus(kind));
    }

    [Fact]
    public async Task UploadPreview_TransientLlmFailure_KeepsRetryAfterHeader()
    {
        // Arrange
        var harness = new Harness();
        harness.Llm.Setup(l => l.ParseImageAsync(It.IsAny<Stream>(), It.IsAny<string>(), It.IsAny<string>(),
                It.IsAny<string?>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(Throwable("llm-transient"));
        var controller = harness.Build();

        // Act
        await controller.UploadPreview(File(PngBytes, "jago.png", "image/png"));

        // Assert
        Assert.Equal("30", controller.Response.Headers.RetryAfter.ToString());
    }

    [Theory]
    [InlineData("not-supported")]
    [InlineData("llm")]
    [InlineData("llm-transient")]
    [InlineData("unexpected")]
    public async Task UploadPreviewNew_ImportThrows_ReturnsGenericBodyAndLogs(string kind)
    {
        // Arrange
        var harness = new Harness();
        harness.Import.Setup(i => i.ImportAsync(It.IsAny<Stream>(), It.IsAny<string>(), It.IsAny<string?>(), It.IsAny<string?>()))
            .ThrowsAsync(Throwable(kind));
        var controller = harness.Build();

        // Act
        var result = await controller.UploadPreviewNEW(File(CsvBytes, "bca.csv", "text/csv"));

        // Assert
        AssertSanitized(controller, harness, result, ExpectedStatus(kind));
    }

    [Theory]
    [InlineData("application/pdf", "statement.pdf")]
    [InlineData("image/png", "jago.png")]
    [InlineData("text/csv", "bca.csv")]
    public async Task UploadPreview_ContentDoesNotMatchType_ReturnsBadRequestBeforeParsing(string contentType, string fileName)
    {
        // Arrange: a JPEG body behind each claimed type; for CSV, binary with NUL bytes
        var harness = new Harness();
        byte[] body = contentType == "text/csv"
            ? [0x50, 0x4B, 0x03, 0x04, 0x00, 0x00, 0x08, 0x00]
            : [0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01];
        var controller = harness.Build();

        // Act
        var result = await controller.UploadPreview(File(body, fileName, contentType));

        // Assert
        var (status, json) = Read(result);
        Assert.Equal(400, status);
        Assert.Contains("does not match its type", json);
        harness.Identifier.Verify(i => i.IdentifyAsync(It.IsAny<Stream>(), It.IsAny<string>(), It.IsAny<string?>()), Times.Never);
        harness.Llm.Verify(l => l.ParseImageAsync(It.IsAny<Stream>(), It.IsAny<string>(), It.IsAny<string>(),
            It.IsAny<string?>(), It.IsAny<CancellationToken>()), Times.Never);
        harness.Transactions.Verify(t => t.IsFileProcessedAsync(It.IsAny<string>()), Times.Never);
    }

    [Fact]
    public async Task UploadPreviewNew_ContentDoesNotMatchType_ReturnsBadRequestBeforeStorage()
    {
        // Arrange
        var harness = new Harness();
        var controller = harness.Build();

        // Act
        var result = await controller.UploadPreviewNEW(File(PngBytes, "statement.pdf", "application/pdf"));

        // Assert
        Assert.Equal(400, Read(result).Status);
        harness.Storage.Verify(s => s.UploadAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(),
            It.IsAny<Stream>(), It.IsAny<string>()), Times.Never);
    }

    [Fact]
    public async Task UploadPreview_ImportExceedsTimeout_ReturnsGeneric422AndLogs()
    {
        // Arrange: the import never finishes
        var harness = new Harness();
        harness.Upload.ParseTimeoutSeconds = 1;
        harness.Import.Setup(i => i.ImportAsync(It.IsAny<Stream>(), It.IsAny<string>(), It.IsAny<string?>(), It.IsAny<string?>()))
            .Returns(new TaskCompletionSource<List<TransactionDto>>().Task);
        var controller = harness.Build();

        // Act
        var result = await controller.UploadPreview(File(PdfBytes, "statement.pdf", "application/pdf"));

        // Assert
        var (status, body) = Read(result);
        Assert.Equal(422, status);
        Assert.Contains("took too long", body);
        Assert.Contains($"\"correlationId\":\"{controller.HttpContext.TraceIdentifier}\"", body);
        Assert.Contains(harness.Logger.Entries, e => e.Level == LogLevel.Error && e.Exception is TimeoutException);
    }

    [Fact]
    public async Task UploadPreview_SynchronousIdentificationExceedsTimeout_ReturnsGeneric422()
    {
        // Arrange: identification blocks its thread (CPU-bound PDF parsing) instead of awaiting
        var harness = new Harness();
        harness.Upload.ParseTimeoutSeconds = 1;
        using var release = new ManualResetEventSlim();
        harness.Identifier.Setup(i => i.IdentifyAsync(It.IsAny<Stream>(), It.IsAny<string>(), It.IsAny<string?>()))
            .Returns(() =>
            {
                release.Wait(TimeSpan.FromSeconds(10));
                return Task.FromResult<string?>("BCA");
            });
        var controller = harness.Build();

        // Act
        var stopwatch = System.Diagnostics.Stopwatch.StartNew();
        var result = await controller.UploadPreview(File(PdfBytes, "statement.pdf", "application/pdf"));
        stopwatch.Stop();
        release.Set();

        // Assert
        Assert.Equal(422, Read(result).Status);
        Assert.True(stopwatch.Elapsed < TimeSpan.FromSeconds(5), $"waited {stopwatch.Elapsed}");
    }

    [Fact]
    public async Task UploadPreviewNew_IdentifierThrows_ReturnsGenericBodyAndLogs()
    {
        // Arrange
        var harness = new Harness();
        harness.Identifier.Setup(i => i.IdentifyAsync(It.IsAny<Stream>(), It.IsAny<string>(), It.IsAny<string?>()))
            .ThrowsAsync(Throwable("unexpected"));
        var controller = harness.Build();

        // Act
        var result = await controller.UploadPreviewNEW(File(CsvBytes, "bca.csv", "text/csv"));

        // Assert
        AssertSanitized(controller, harness, result, 500);
    }
}
