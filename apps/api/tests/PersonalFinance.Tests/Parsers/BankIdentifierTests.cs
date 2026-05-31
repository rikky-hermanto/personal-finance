using System.IO;
using System.Text;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;
using Moq;
using PersonalFinance.Infrastructure.Parsers;
using PersonalFinance.Infrastructure.Parsers.Signatures;
using Xunit;

namespace PersonalFinance.Tests.Parsers;

public class BankIdentifierTests
{
    private readonly BankIdentifier _identifier;

    public BankIdentifierTests()
    {
        var loggerMock = new Mock<ILogger<BankIdentifier>>();
        IBankSignature[] signatures =
        [
            new BcaCsvSignature(),
            new StandardCsvSignature(),
            new NeoBankPdfSignature(),
            new SuperbankPdfSignature(),
        ];
        _identifier = new BankIdentifier(signatures, loggerMock.Object);
    }

    [Theory]
    [InlineData("sample_bca_working.csv", "BCA")]
    [InlineData("sample_bca_notworking.csv", "BCA")]
    public async Task IdentifyAsync_BcaFixtures_ReturnsBca(string fixture, string expected)
    {
        var path = Path.Combine("Fixtures", "Bca", fixture);
        using var stream = File.OpenRead(path);
        
        var result = await _identifier.IdentifyAsync(stream, "text/csv");
        
        Assert.Equal(expected, result);
    }

    [Fact]
    public async Task IdentifyAsync_StandardCsv_ReturnsStandard()
    {
        var csv = "Date,Description,Amount\n01/01/2026,Test,100\n";
        using var stream = new MemoryStream(Encoding.UTF8.GetBytes(csv));
        
        var result = await _identifier.IdentifyAsync(stream, "text/csv");
        
        Assert.Equal("STANDARD", result);
    }

    [Fact]
    public async Task IdentifyAsync_GibberishCsv_ReturnsNull()
    {
        var csv = "A,B,C,D,E\n1,2,3,4,5\n";
        using var stream = new MemoryStream(Encoding.UTF8.GetBytes(csv));
        
        var result = await _identifier.IdentifyAsync(stream, "text/csv");
        
        Assert.Null(result);
    }

    [Fact]
    public async Task IdentifyAsync_TanggalSemicolonNoRekening_ReturnsNull()
    {
        // Over-match guard: Has BCA tokens but missing NO. REKENING reinforcement
        var csv = "TANGGAL;KETERANGAN;JUMLAH;SALDO\n01/01/2026;Test;100;1000\n";
        using var stream = new MemoryStream(Encoding.UTF8.GetBytes(csv));
        
        var result = await _identifier.IdentifyAsync(stream, "text/csv");
        
        Assert.Null(result);
    }
}
