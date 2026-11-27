using System.Text;
using System.Text.Json;
using MediatR;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Moq;
using PersonalFinance.Api.Controllers;
using PersonalFinance.Api.Models;
using PersonalFinance.Application.Commands;
using PersonalFinance.Application.Dtos;
using PersonalFinance.Application.Interfaces;
using PersonalFinance.Application.Services;
using PersonalFinance.Tests.Support;
using static PersonalFinance.Tests.Cashflow.CashflowRows;

namespace PersonalFinance.Tests.Cashflow;

/// <summary>
/// TransactionsController with mocked IMediator and services, and the Supabase client it still
/// reads directly pointed at FakePostgrest. Upload error mapping is covered by
/// Controllers/TransactionsUploadErrorTests; these cover each action's success path, the PERF-02
/// paging bounds and the ERR-03 status mapping of the checked cashflow functions.
/// </summary>
public sealed class TransactionsControllerTests : IAsyncLifetime
{
    private static readonly Guid AccountA = Guid.Parse("aaaaaaaa-0000-0000-0000-000000000001");
    private static readonly Guid AccountB = Guid.Parse("bbbbbbbb-0000-0000-0000-000000000002");
    private static readonly Guid InstitutionX = Guid.Parse("cccccccc-0000-0000-0000-000000000003");
    private static readonly byte[] CsvBytes = Encoding.UTF8.GetBytes("Tanggal,Keterangan,Jumlah\n01/05/2026,GOFOOD,85000\n");
    private static readonly byte[] PdfBytes = Encoding.ASCII.GetBytes("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n");
    private static readonly byte[] PngBytes = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D];

    private FakePostgrest _fake = null!;
    private Supabase.Client _client = null!;

    private readonly Mock<IStatementImportService> _import = new();
    private readonly Mock<IBankIdentifier> _identifier = new();
    private readonly Mock<ITransactionService> _transactions = new();
    private readonly Mock<IDashboardService> _dashboard = new();
    private readonly Mock<ILlmExtractionClient> _llm = new();
    private readonly Mock<IMediator> _mediator = new();
    private readonly Mock<IFileStorageService> _storage = new();
    private readonly Mock<ITransactionPipelineService> _pipeline = new();
    private readonly Mock<ICashflowMutationService> _mutations = new();
    private readonly Mock<ILlmSearchClient> _search = new();
    private readonly Dictionary<string, string?> _settings = [];

    public async Task InitializeAsync()
    {
        _fake = await FakePostgrest.StartAsync();
        _client = await _fake.CreateClientAsync();
        _transactions.Setup(t => t.IsFileProcessedAsync(It.IsAny<string>())).ReturnsAsync(false);
        _transactions.Setup(t => t.ResolveAliasesBatchAsync(It.IsAny<IEnumerable<string>>()))
            .ReturnsAsync(new Dictionary<string, Guid>(StringComparer.OrdinalIgnoreCase));
        _transactions.Setup(t => t.IdentifyDuplicatesAsync(It.IsAny<IEnumerable<TransactionDto>>()))
            .ReturnsAsync((IEnumerable<TransactionDto> rows) => rows.ToList());
        _identifier.Setup(i => i.IdentifyAsync(It.IsAny<Stream>(), It.IsAny<string>(), It.IsAny<string?>())).ReturnsAsync("BCA");
    }

    public async Task DisposeAsync() => await _fake.DisposeAsync();

    private TransactionsController Build()
    {
        var controller = new TransactionsController(
            NullLogger<TransactionsController>.Instance, _import.Object, _identifier.Object, _transactions.Object,
            Mock.Of<ICategoryRuleService>(), _dashboard.Object, _llm.Object, _mediator.Object, _storage.Object,
            _pipeline.Object, _client, new TestCaller(), _mutations.Object, _search.Object,
            new ConfigurationBuilder().AddInMemoryCollection(_settings).Build(),
            new UploadFileValidator(NullLogger<UploadFileValidator>.Instance), Options.Create(new UploadOptions()));
        controller.ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() };
        return controller;
    }

    private static IFormFile File(byte[] bytes, string name, string contentType) =>
        new FormFile(new MemoryStream(bytes), 0, bytes.Length, "file", name) { Headers = new HeaderDictionary(), ContentType = contentType };

    private static (int Status, JsonElement Body) Read(IActionResult result)
    {
        var objectResult = Assert.IsAssignableFrom<ObjectResult>(result);
        var json = JsonSerializer.Serialize(objectResult.Value, JsonSerializerOptions.Web);
        return (objectResult.StatusCode ?? 200, JsonDocument.Parse(json).RootElement.Clone());
    }

    private static TransactionDto Dto(string accountName = "", Guid? accountId = null, decimal amount = 85_000m, string type = "Expense",
        DateTime? date = null) => new()
    {
        Date = date ?? DateTime.UtcNow.AddDays(-3), Description = "GOFOOD", Flow = type == "Income" ? "CR" : "DB", Type = type,
        Category = "Food", AccountName = accountName, AccountId = accountId, AmountIdr = amount, Currency = "IDR",
    };

    // ── Simple actions ────────────────────────────────────────────────────────

    [Fact]
    public void HealthCheck_Always_ReturnsHealthy()
    {
        var (status, body) = Read(Build().HealthCheck());
        Assert.Equal(200, status);
        Assert.Equal("Healthy", body.GetProperty("status").GetString());
    }

    [Fact]
    public void GetSupportedTypes_Always_ListsEachBankWithItsTypes()
    {
        var (_, body) = Read(Build().GetSupportedTypes());
        Assert.Equal(["BCA", "NeoBank", "Superbank", "Wise", "BankJago", "Standard"],
            body.EnumerateArray().Select(b => b.GetProperty("bank").GetString()));
    }

    [Fact]
    public async Task CategorizePreview_NoDescriptions_ReturnsBadRequestWithoutSending()
    {
        var result = await Build().CategorizePreview(new TransactionsController.CategorizePreviewRequest([], null));
        Assert.Equal(400, Read(result).Status);
        _mediator.Verify(m => m.Send(It.IsAny<CategorizePreviewCommand>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task CategorizePreview_Descriptions_SendsCommandAndReturnsResults()
    {
        // Arrange
        _mediator.Setup(m => m.Send(It.IsAny<CategorizePreviewCommand>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync([new CategorizePreviewResult("GOFOOD", "Food", 0.9)]);

        // Act
        var result = await Build().CategorizePreview(new TransactionsController.CategorizePreviewRequest(["GOFOOD"], null));

        // Assert
        var (status, body) = Read(result);
        Assert.Equal(200, status);
        Assert.Equal("Food", body.GetProperty("results")[0].GetProperty("category").GetString());
        _mediator.Verify(m => m.Send(It.Is<CategorizePreviewCommand>(c =>
            c.Descriptions.SequenceEqual(new[] { "GOFOOD" }) && c.AvailableCategories.Count == 0), It.IsAny<CancellationToken>()), Times.Once);
    }

    // ── GetTransactions (PERF-02) ─────────────────────────────────────────────

    [Theory]
    [InlineData(1, 50, 1, 50)]       // defaults
    [InlineData(3, 500, 3, 200)]     // page size capped at 200
    [InlineData(0, 0, 1, 1)]         // page and size floored at 1
    [InlineData(-4, -10, 1, 1)]
    public async Task GetTransactions_PageAndSize_AreClampedBeforeQuery(int page, int pageSize, int expectedPage, int expectedSize)
    {
        // Arrange
        _transactions.Setup(t => t.GetTransactionPageAsync(It.IsAny<int>(), It.IsAny<int>(), It.IsAny<Guid?>(), It.IsAny<string?>(),
                It.IsAny<string?>(), It.IsAny<string?>(), It.IsAny<string>()))
            .ReturnsAsync(new PagedResult<TransactionDto> { Page = expectedPage, PageSize = expectedSize });

        // Act
        var result = await Build().GetTransactions(AccountA, "Food", "Expense", "kopi", "asc", page, pageSize);

        // Assert
        Assert.Equal(200, Read(result).Status);
        _transactions.Verify(t => t.GetTransactionPageAsync(expectedPage, expectedSize, AccountA, "kopi", "Food", "Expense", "asc"), Times.Once);
    }

    [Fact]
    public async Task GetTransactionById_Found_ReturnsOkAndMissing_ReturnsNotFound()
    {
        // Arrange
        _transactions.Setup(t => t.GetTransactionByIdAsync(1)).ReturnsAsync(new TransactionDto { Id = 1, AmountIdr = 10m });
        _transactions.Setup(t => t.GetTransactionByIdAsync(2)).ReturnsAsync((TransactionDto?)null);
        var controller = Build();

        // Act + Assert
        Assert.Equal(1, Read(await controller.GetTransactionById(1)).Body.GetProperty("id").GetInt32());
        Assert.IsType<NotFoundResult>(await controller.GetTransactionById(2));
    }

    [Fact]
    public async Task GetDashboardData_Query_PassesThroughToService()
    {
        // Arrange
        var dto = new DashboardDto(new DashboardSummaryDto(1m, 0m, 1m, 1), new DashboardCurrentMonthDto("March 2026", 1m, 0m, 1m, 0m, 0m, 0m),
            [], [], DateTime.UtcNow, "March 2026");
        _dashboard.Setup(d => d.GetDashboardDataAsync(AccountA, 2026, 3, 1)).ReturnsAsync(dto);

        // Act
        var result = Assert.IsType<OkObjectResult>(await Build().GetDashboardData(AccountA, 2026, 3, 1));

        // Assert
        Assert.Same(dto, result.Value);
    }

    [Fact]
    public async Task GetCashflowStatement_Query_PassesThroughToService()
    {
        // Arrange
        var dto = new CashflowStatementDto([], [], []);
        _dashboard.Setup(d => d.GetCashflowStatementAsync(12, AccountA, "monthly")).ReturnsAsync(dto);

        // Act
        var result = Assert.IsType<OkObjectResult>(await Build().GetCashflowStatement(12, AccountA, "monthly"));

        // Assert
        Assert.Same(dto, result.Value);
    }

    // ── Account summaries ─────────────────────────────────────────────────────

    [Fact]
    public async Task GetAccountSummaries_Fixture_SumsInAndOutPerIncludedAccount()
    {
        // Arrange
        // Account A: income 5,000,000; expenses 1,200,000 + 300,000 = 1,500,000; net 3,500,000; 3 rows.
        // A row from 13 months ago and a row with no account are left out. Account B has no rows.
        _fake.On("GET", "accounts", Json(Account(AccountA, "BCA Utama", InstitutionX), Account(AccountB, "Jago")));
        _fake.On("GET", "institutions", $$"""[{"id":"{{InstitutionX}}","name":"Bank Central Asia","type":"bank","country":"ID"}]""");
        _transactions.Setup(t => t.GetTransactionsWithBalanceAsync(null, null, null, null)).ReturnsAsync(
        [
            Dto(accountId: AccountA, amount: 5_000_000m, type: "Income"),
            Dto(accountId: AccountA, amount: 1_200_000m),
            Dto(accountId: AccountA, amount: 300_000m),
            Dto(accountId: AccountA, amount: 9_999m, type: "Income", date: DateTime.UtcNow.AddMonths(-13)),
            Dto(accountId: null, amount: 7_777m),
        ]);

        // Act
        var (status, body) = Read(await Build().GetAccountSummaries());

        // Assert
        Assert.Equal(200, status);
        var summary = Assert.Single(body.EnumerateArray());
        Assert.Equal(AccountA, summary.GetProperty("accountId").GetGuid());
        Assert.Equal("Bank Central Asia", summary.GetProperty("institutionName").GetString());
        Assert.Equal(5_000_000m, summary.GetProperty("totalIn").GetDecimal());
        Assert.Equal(1_500_000m, summary.GetProperty("totalOut").GetDecimal());
        Assert.Equal(3_500_000m, summary.GetProperty("netPosition").GetDecimal());
        Assert.Equal(3, summary.GetProperty("transactionCount").GetInt32());
        var accounts = Query(Assert.Single(_fake.RequestsTo("GET", "accounts")));
        Assert.Contains($"user_id=eq.{TestCaller.Id}", accounts);
        Assert.Contains("include_in_cashflow=eq.true", accounts);
        Assert.Contains($"user_id=eq.{TestCaller.Id}", Query(Assert.Single(_fake.RequestsTo("GET", "institutions"))));
    }

    // ── Resolve alias ─────────────────────────────────────────────────────────

    [Fact]
    public async Task ResolveAlias_Blank_ReturnsBadRequest()
    {
        Assert.IsType<BadRequestResult>(await Build().ResolveAlias(" "));
    }

    [Fact]
    public async Task ResolveAlias_NoAlias_ReturnsNotFound()
    {
        _transactions.Setup(t => t.ResolveAliasAsync("BCA")).ReturnsAsync((Guid?)null);
        Assert.IsType<NotFoundResult>(await Build().ResolveAlias("BCA"));
    }

    [Fact]
    public async Task ResolveAlias_AccountGone_ReturnsNotFound()
    {
        // Arrange
        _transactions.Setup(t => t.ResolveAliasAsync("BCA")).ReturnsAsync(AccountA);
        _fake.On("GET", "accounts", """{"code":"PGRST116","message":"no rows"}""", 406);

        // Act + Assert
        Assert.IsType<NotFoundResult>(await Build().ResolveAlias("BCA"));
    }

    [Fact]
    public async Task ResolveAlias_AccountWithInstitution_ReturnsNames()
    {
        // Arrange
        _transactions.Setup(t => t.ResolveAliasAsync("BCA")).ReturnsAsync(AccountA);
        _fake.On("GET", "accounts", JsonSerializer.Serialize(Account(AccountA, "BCA Utama", InstitutionX)));
        _fake.On("GET", "institutions", $$"""{"id":"{{InstitutionX}}","name":"Bank Central Asia","type":"bank","country":"ID"}""");

        // Act
        var (status, body) = Read(await Build().ResolveAlias("BCA"));

        // Assert
        Assert.Equal(200, status);
        Assert.Equal("BCA Utama", body.GetProperty("accountName").GetString());
        Assert.Equal("Bank Central Asia", body.GetProperty("institutionName").GetString());
        var accountQuery = Query(Assert.Single(_fake.RequestsTo("GET", "accounts")));
        Assert.Contains($"user_id=eq.{TestCaller.Id}", accountQuery);
        Assert.Contains($"id=eq.{AccountA}", accountQuery);
    }

    [Fact]
    public async Task ResolveAlias_AccountWithoutInstitution_ReturnsEmptyInstitutionName()
    {
        // Arrange
        _transactions.Setup(t => t.ResolveAliasAsync("Jago")).ReturnsAsync(AccountB);
        _fake.On("GET", "accounts", JsonSerializer.Serialize(Account(AccountB, "Jago")));

        // Act
        var (_, body) = Read(await Build().ResolveAlias("Jago"));

        // Assert
        Assert.Equal("", body.GetProperty("institutionName").GetString());
        Assert.Empty(_fake.RequestsTo("GET", "institutions"));
    }

    // ── Export ────────────────────────────────────────────────────────────────

    [Fact]
    public async Task ExportCsv_DateRange_WritesOnlyRowsInsideItWithExactAmounts()
    {
        // Arrange
        _transactions.Setup(t => t.GetTransactionsWithBalanceAsync(AccountA, null, null, null)).ReturnsAsync(
        [
            new TransactionDto { Date = new DateTime(2026, 3, 10, 9, 5, 0), Description = "GOFOOD, kopi", Remarks = "", Flow = "DB",
                Type = "Expense", Category = "Food", AccountId = AccountA, AmountIdr = 1_600_000.50m, ExchangeRate = 16_000.005m, Currency = "USD" },
            new TransactionDto { Date = new DateTime(2026, 2, 1), Description = "OLD", AmountIdr = 1m, AccountId = AccountA },
            new TransactionDto { Date = new DateTime(2026, 4, 1), Description = "LATE", AmountIdr = 1m, AccountId = AccountA },
        ]);

        // Act
        var result = Assert.IsType<FileStreamResult>(await Build().ExportCsv(AccountA, new DateTime(2026, 3, 1), new DateTime(2026, 3, 31)));

        // Assert
        Assert.Equal("text/csv", result.ContentType);
        Assert.Matches(@"^transactions-\d{4}-\d{2}-\d{2}\.csv$", result.FileDownloadName);
        var lines = (await new StreamReader(result.FileStream).ReadToEndAsync()).Split("\r\n", StringSplitOptions.RemoveEmptyEntries);
        Assert.Equal("Date,Item,Remarks,Flow,Type,Category,Bank Account,Amount,Exc. Rate,Amount (IDR),Currency", lines[0]);
        Assert.Equal($"3/10/26 9:05,\"GOFOOD, kopi\",,DB,Expense,Food,{AccountA},1600000.50,16000.005,1600000.50,USD", lines[1]);
        Assert.Equal(2, lines.Length);
    }

    // ── Upload preview success paths ──────────────────────────────────────────

    [Fact]
    public async Task UploadPreview_Csv_ParsesResolvesAccountsAndTagsDuplicates()
    {
        // Arrange: "BCA" fuzzy-matches the account "BCA Utama"; "Mystery" matches nothing.
        _import.Setup(i => i.ImportAsync(It.IsAny<Stream>(), "BCA", null, null))
            .ReturnsAsync([Dto("BCA"), Dto("Mystery"), Dto("", AccountB)]);
        _fake.On("GET", "accounts", Json(Account(AccountA, "BCA Utama", InstitutionX)));
        _fake.On("GET", "institutions", $$"""[{"id":"{{InstitutionX}}","name":"Bank Central Asia","type":"bank","country":"ID"}]""");

        // Act
        var (status, body) = Read(await Build().UploadPreview(File(CsvBytes, "bca.csv", "text/csv")));

        // Assert
        Assert.Equal(200, status);
        var rows = body.GetProperty("transactions").EnumerateArray().ToList();
        Assert.Equal(AccountA, rows[0].GetProperty("accountId").GetGuid());
        Assert.Equal(JsonValueKind.Null, rows[1].GetProperty("accountId").ValueKind);
        Assert.Equal(AccountB, rows[2].GetProperty("accountId").GetGuid()); // already linked: untouched
        Assert.Equal(64, body.GetProperty("hash").GetString()!.Length);  // SHA-256 hex
        _transactions.Verify(t => t.IdentifyDuplicatesAsync(It.IsAny<IEnumerable<TransactionDto>>()), Times.Once);
    }

    [Fact]
    public async Task UploadPreview_AliasCached_UsesAliasWithoutFuzzyMatch()
    {
        // Arrange
        _import.Setup(i => i.ImportAsync(It.IsAny<Stream>(), "BCA", null, null)).ReturnsAsync([Dto("Payroll Card")]);
        _transactions.Setup(t => t.ResolveAliasesBatchAsync(It.IsAny<IEnumerable<string>>()))
            .ReturnsAsync(new Dictionary<string, Guid>(StringComparer.OrdinalIgnoreCase) { ["Payroll Card"] = AccountB });
        _fake.On("GET", "accounts", Json(Account(AccountA, "BCA Utama")));
        _fake.On("GET", "institutions", "[]");

        // Act
        var (_, body) = Read(await Build().UploadPreview(File(CsvBytes, "bca.csv", "text/csv")));

        // Assert
        Assert.Equal(AccountB, body.GetProperty("transactions")[0].GetProperty("accountId").GetGuid());
    }

    [Fact]
    public async Task UploadPreview_Screenshot_GoesToImageParser()
    {
        // Arrange
        _llm.Setup(l => l.ParseImageAsync(It.IsAny<Stream>(), "jago.png", "image/png", "jago", It.IsAny<CancellationToken>()))
            .ReturnsAsync([Dto(accountId: AccountB)]);

        // Act
        var (status, _) = Read(await Build().UploadPreview(File(PngBytes, "jago.png", "image/png"), bankHint: "jago"));

        // Assert
        Assert.Equal(200, status);
        _identifier.Verify(i => i.IdentifyAsync(It.IsAny<Stream>(), It.IsAny<string>(), It.IsAny<string?>()), Times.Never);
    }

    [Fact]
    public async Task UploadPreview_EmptyFile_ReturnsBadRequest()
    {
        Assert.Equal(400, Read(await Build().UploadPreview(File([], "x.csv", "text/csv"))).Status);
    }

    [Fact]
    public async Task UploadPreview_UnsupportedType_ReturnsBadRequest()
    {
        Assert.Equal(400, Read(await Build().UploadPreview(File(CsvBytes, "x.xlsx", "application/vnd.ms-excel"))).Status);
    }

    [Fact]
    public async Task UploadPreview_AlreadyProcessed_ReturnsConflictWithHash()
    {
        // Arrange
        _transactions.Setup(t => t.IsFileProcessedAsync(It.IsAny<string>())).ReturnsAsync(true);

        // Act
        var (status, body) = Read(await Build().UploadPreview(File(CsvBytes, "bca.csv", "text/csv")));

        // Assert
        Assert.Equal(409, status);
        Assert.Equal(64, body.GetProperty("hash").GetString()!.Length);
        _import.Verify(i => i.ImportAsync(It.IsAny<Stream>(), It.IsAny<string>(), It.IsAny<string?>(), It.IsAny<string?>()), Times.Never);
    }

    [Fact]
    public async Task UploadPreview_UnknownBank_ReturnsBadRequest()
    {
        // Arrange
        _identifier.Setup(i => i.IdentifyAsync(It.IsAny<Stream>(), It.IsAny<string>(), It.IsAny<string?>())).ReturnsAsync((string?)null);

        // Act + Assert
        Assert.Equal(400, Read(await Build().UploadPreview(File(PdfBytes, "x.pdf", "application/pdf"))).Status);
    }

    [Fact]
    public async Task UploadPreviewNew_Pdf_StoresAndReturnsAccepted()
    {
        // Arrange
        _storage.Setup(s => s.UploadAsync("default-user", "superbank", It.IsAny<string>(), It.IsAny<Stream>(), "application/pdf"))
            .ReturnsAsync("default-user/superbank/x.pdf");

        // Act
        var result = await Build().UploadPreviewNEW(File(PdfBytes, "x.pdf", "application/pdf"), bankHint: "superbank");

        // Assert
        var (status, body) = Read(result);
        Assert.Equal(202, status);
        Assert.Equal("default-user/superbank/x.pdf", body.GetProperty("processing_id").GetString());
        _storage.Verify(s => s.DownloadAsync(It.IsAny<string>()), Times.Never);
    }

    [Fact]
    public async Task UploadPreviewNew_Csv_RoundTripsThroughStorageAndPipeline()
    {
        // Arrange
        _storage.Setup(s => s.UploadAsync("default-user", "BCA", It.IsAny<string>(), It.IsAny<Stream>(), "text/csv"))
            .ReturnsAsync("default-user/BCA/x.csv");
        _storage.Setup(s => s.DownloadAsync("default-user/BCA/x.csv")).ReturnsAsync(() => new MemoryStream(CsvBytes));
        _import.Setup(i => i.ImportAsync(It.IsAny<Stream>(), "BCA", null, null)).ReturnsAsync([Dto(accountId: AccountA)]);
        _pipeline.Setup(p => p.ProcessAsync(It.IsAny<List<TransactionDto>>()))
            .ReturnsAsync((List<TransactionDto> rows) => rows);

        // Act
        var result = Assert.IsType<OkObjectResult>(await Build().UploadPreviewNEW(File(CsvBytes, "x.csv", "text/csv")));

        // Assert
        Assert.Single(Assert.IsType<List<TransactionDto>>(result.Value));
        _pipeline.Verify(p => p.ProcessAsync(It.IsAny<List<TransactionDto>>()), Times.Once);
    }

    [Fact]
    public async Task UploadPreviewNew_DownloadMissing_Returns500()
    {
        // Arrange
        _storage.Setup(s => s.UploadAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<Stream>(), It.IsAny<string>()))
            .ReturnsAsync("default-user/BCA/x.csv");
        _storage.Setup(s => s.DownloadAsync(It.IsAny<string>())).ReturnsAsync((Stream?)null);

        // Act + Assert
        Assert.Equal(500, Read(await Build().UploadPreviewNEW(File(CsvBytes, "x.csv", "text/csv"))).Status);
    }

    [Theory]
    [InlineData(0, "text/csv")]
    [InlineData(10, "application/zip")]
    public async Task UploadPreviewNew_EmptyOrUnsupported_ReturnsBadRequest(int size, string contentType)
    {
        Assert.Equal(400, Read(await Build().UploadPreviewNEW(File(CsvBytes[..size], "x", contentType))).Status);
    }

    [Fact]
    public async Task UploadPreviewNew_UnknownCsvBank_ReturnsBadRequest()
    {
        // Arrange
        _identifier.Setup(i => i.IdentifyAsync(It.IsAny<Stream>(), It.IsAny<string>(), It.IsAny<string?>())).ReturnsAsync((string?)null);

        // Act + Assert
        Assert.Equal(400, Read(await Build().UploadPreviewNEW(File(CsvBytes, "x.csv", "text/csv"))).Status);
    }

    // ── Submit and reset (ERR-03 mapping of checked functions) ────────────────

    [Theory]
    [InlineData(true, 1)]
    [InlineData(false, 0)]
    [InlineData(false, 5001)]
    public async Task SubmitTransactions_InvalidRequest_ReturnsBadRequestWithoutCalling(bool emptyId, int rows)
    {
        // Act
        var result = await Build().SubmitTransactions(new TransactionsController.SubmitTransactionsRequest
        {
            RequestId = emptyId ? Guid.Empty : Guid.NewGuid(),
            Transactions = Enumerable.Range(0, rows).Select(_ => Dto()).ToList(),
        });

        // Assert
        var (status, body) = Read(result);
        Assert.Equal(400, status);
        Assert.Equal("invalid_import", body.GetProperty("code").GetString());
        _mutations.VerifyNoOtherCalls();
    }

    public static TheoryData<CashflowMutationFailure, int, string> FailureMap => new()
    {
        { CashflowMutationFailure.InvalidInput, 400, "invalid_import" },
        { CashflowMutationFailure.AccountUnavailable, 404, "account_unavailable" },
        { CashflowMutationFailure.IdempotencyConflict, 409, "idempotency_conflict" },
        { CashflowMutationFailure.FileAlreadyProcessed, 409, "file_already_processed" },
        { CashflowMutationFailure.ConstraintConflict, 409, "import_constraint_conflict" },
        { CashflowMutationFailure.Retryable, 503, "retry_import" },
        { CashflowMutationFailure.BackendFailure, 500, "cashflow_unavailable" },
        { CashflowMutationFailure.RuleExists, 500, "cashflow_unavailable" },
    };

    [Theory]
    [MemberData(nameof(FailureMap))]
    public async Task SubmitTransactions_MutationFails_MapsToStatusAndCode(CashflowMutationFailure failure, int status, string code)
    {
        // Arrange
        _mutations.Setup(m => m.SubmitAsync(It.IsAny<Guid>(), It.IsAny<IReadOnlyList<TransactionDto>>(), It.IsAny<string?>(),
                It.IsAny<string?>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new CashflowMutationException(failure));

        // Act
        var result = await Build().SubmitTransactions(new TransactionsController.SubmitTransactionsRequest
        {
            RequestId = Guid.NewGuid(), Transactions = [Dto()],
        });

        // Assert
        var (actualStatus, body) = Read(result);
        Assert.Equal(status, actualStatus);
        Assert.Equal(code, body.GetProperty("code").GetString());
        Assert.DoesNotContain("Cashflow mutation failed", body.ToString()); // no exception text (ERR-01)
    }

    [Theory]
    [MemberData(nameof(FailureMap))]
    public async Task ResetAllTransactions_MutationFails_MapsToStatusAndCode(CashflowMutationFailure failure, int status, string code)
    {
        // Arrange
        _mutations.Setup(m => m.ResetAsync(It.IsAny<CancellationToken>())).ThrowsAsync(new CashflowMutationException(failure));

        // Act
        var (actualStatus, body) = Read(await Build().ResetAllTransactions());

        // Assert
        Assert.Equal(status, actualStatus);
        Assert.Equal(code, body.GetProperty("code").GetString());
    }

    [Fact]
    public async Task ResetAllTransactions_Success_ReturnsDeletedCount()
    {
        // Arrange
        _mutations.Setup(m => m.ResetAsync(It.IsAny<CancellationToken>())).ReturnsAsync(42);

        // Act
        var (status, body) = Read(await Build().ResetAllTransactions());

        // Assert
        Assert.Equal(200, status);
        Assert.Equal(42, body.GetProperty("deleted").GetInt32());
    }

    [Fact]
    public async Task SubmitTransactions_ChatEnabled_EmbedsInsertedRowsForCallerOnly()
    {
        // Arrange
        _settings["AiChat:Enabled"] = "true";
        _mutations.Setup(m => m.SubmitAsync(It.IsAny<Guid>(), It.IsAny<IReadOnlyList<TransactionDto>>(), It.IsAny<string?>(),
                It.IsAny<string?>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new CashflowImportResult([41, 42], 2, 0));
        _fake.On("GET", "transactions", Json(
            Tx(41, new DateTime(2026, 3, 10), "Expense", "Food", 45_000m, "GOFOOD", accountId: AccountA),
            Tx(42, new DateTime(2026, 3, 11), "Expense", "Transport", 20_000m, "GRAB")));
        _fake.On("GET", "accounts", Json(Account(AccountA, "BCA Utama")));
        var embedded = new TaskCompletionSource<(IReadOnlyList<EmbedItemRequest> Items, Guid Owner)>();
        _search.Setup(s => s.EmbedTransactionsAsync(It.IsAny<IReadOnlyList<EmbedItemRequest>>(), It.IsAny<Guid>(), It.IsAny<CancellationToken>()))
            .Callback((IReadOnlyList<EmbedItemRequest> items, Guid owner, CancellationToken _) => embedded.TrySetResult((items, owner)))
            .Returns(Task.CompletedTask);

        // Act
        var result = await Build().SubmitTransactions(new TransactionsController.SubmitTransactionsRequest
        {
            RequestId = Guid.NewGuid(), Transactions = [Dto(), Dto()],
        });

        // Assert
        Assert.Equal(200, Read(result).Status);
        var (items, owner) = await embedded.Task.WaitAsync(TimeSpan.FromSeconds(5));
        Assert.Equal(TestCaller.Id, owner);
        Assert.Equal([new EmbedItemRequest(41, "GOFOOD", "", "Food", "BCA Utama"), new EmbedItemRequest(42, "GRAB", "", "Transport", "")], items);
        var rows = Query(Assert.Single(_fake.RequestsTo("GET", "transactions")));
        Assert.Contains($"user_id=eq.{TestCaller.Id}", rows);
        Assert.Matches(@"[?&]id=in\.\(""?41""?,""?42""?\)", rows);
        _mediator.Verify(m => m.Publish(It.Is<TransactionsSubmittedEvent>(e => e.InsertedCount == 2), It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task SubmitTransactions_EmbeddingLookupFails_StillSucceeds()
    {
        // Arrange
        _settings["AiChat:Enabled"] = "true";
        _mutations.Setup(m => m.SubmitAsync(It.IsAny<Guid>(), It.IsAny<IReadOnlyList<TransactionDto>>(), It.IsAny<string?>(),
                It.IsAny<string?>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new CashflowImportResult([41], 1, 0));
        _fake.On("GET", "transactions", ServerError, 500);

        // Act
        var result = await Build().SubmitTransactions(new TransactionsController.SubmitTransactionsRequest
        {
            RequestId = Guid.NewGuid(), Transactions = [Dto()],
        });

        // Assert
        Assert.Equal(200, Read(result).Status);
        _search.Verify(s => s.EmbedTransactionsAsync(It.IsAny<IReadOnlyList<EmbedItemRequest>>(), It.IsAny<Guid>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task SubmitTransactions_ChatDisabled_DoesNotReadRowsForEmbedding()
    {
        // Arrange
        _mutations.Setup(m => m.SubmitAsync(It.IsAny<Guid>(), It.IsAny<IReadOnlyList<TransactionDto>>(), It.IsAny<string?>(),
                It.IsAny<string?>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new CashflowImportResult([41], 1, 0));

        // Act
        await Build().SubmitTransactions(new TransactionsController.SubmitTransactionsRequest { RequestId = Guid.NewGuid(), Transactions = [Dto()] });

        // Assert
        Assert.Empty(_fake.Requests);
    }
}
