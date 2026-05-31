using PersonalFinance.Infrastructure.Parsers;
using PersonalFinance.Infrastructure.Parsers.Signatures;

namespace PersonalFinance.Tests.Parsers;

public class BcaCsvSignatureTests
{
    private static BankProbeContext CsvCtx(params string[] rawLines)
    {
        var tokenized = rawLines.Select(CsvTokenizer.Tokenize).ToList();
        return new BankProbeContext(tokenized, string.Empty, IsPdf: false);
    }

    [Fact]
    public void Matches_WithFullBcaFile_ReturnsTrue()
    {
        // Dummy data — mirrors real BCA export structure: 4-line preamble + column header
        var sig = new BcaCsvSignature();
        var ctx = CsvCtx(
            "No. Rekening;=;'1234567890;;;",
            "Nama;=;BUDI SANTOSO        ;;;",
            "Mata Uang;=;IDR;;;",
            ";;;;;",
            "Tanggal;Keterangan;Cabang; Jumlah ;;Saldo");
        Assert.True(sig.Matches(ctx));
    }

    [Fact]
    public void Matches_WithStrippedPreamble_ReturnsTrue()
    {
        // User opened CSV in Excel and lost metadata rows — must still identify correctly
        var sig = new BcaCsvSignature();
        var ctx = CsvCtx("Tanggal;Keterangan;Cabang; Jumlah ;;Saldo");
        Assert.True(sig.Matches(ctx));
    }

    [Fact]
    public void Matches_WithHeaderAtLine11_ReturnsTrue()
    {
        // Proves CsvScanLines=15 covers deep preambles (header at line 11)
        var sig = new BcaCsvSignature();
        var deepLines = Enumerable.Repeat("metadata;line", 10)
            .Append("Tanggal;Keterangan;Cabang; Jumlah ;;Saldo")
            .ToArray();
        Assert.True(sig.Matches(CsvCtx(deepLines)));
    }

    [Fact]
    public void Matches_WithoutCabang_ReturnsFalse()
    {
        // Generic Indonesian CSV without CABANG column must not be mistaken for BCA
        var sig = new BcaCsvSignature();
        var ctx = CsvCtx("Tanggal;Keterangan;Jumlah;Saldo");
        Assert.False(sig.Matches(ctx));
    }

    [Fact]
    public void AppliesTo_Csv_ReturnsTrue() =>
        Assert.True(new BcaCsvSignature().AppliesTo("text/csv"));

    [Fact]
    public void AppliesTo_Pdf_ReturnsFalse() =>
        Assert.False(new BcaCsvSignature().AppliesTo("application/pdf"));
}

public class StandardCsvSignatureTests
{
    private static BankProbeContext CsvCtx(params string[] rawLines)
    {
        var tokenized = rawLines.Select(CsvTokenizer.Tokenize).ToList();
        return new BankProbeContext(tokenized, string.Empty, IsPdf: false);
    }

    [Fact]
    public void Matches_WithDateItemAmount_ReturnsTrue()
    {
        var sig = new StandardCsvSignature();
        Assert.True(sig.Matches(CsvCtx("DATE,ITEM,AMOUNT")));
    }

    [Fact]
    public void Matches_WithDateDescriptionAmount_ReturnsTrue()
    {
        var sig = new StandardCsvSignature();
        Assert.True(sig.Matches(CsvCtx("DATE,DESCRIPTION,AMOUNT")));
    }

    [Fact]
    public void Matches_WithoutAmountColumn_ReturnsFalse()
    {
        var sig = new StandardCsvSignature();
        Assert.False(sig.Matches(CsvCtx("DATE,DESCRIPTION,BALANCE")));
    }
}

public class NeoBankPdfSignatureTests
{
    private static BankProbeContext PdfCtx(string text) =>
        new([], text, IsPdf: true);

    [Fact]
    public void Matches_WithNowSavingsText_ReturnsTrue() =>
        Assert.True(new NeoBankPdfSignature().Matches(PdfCtx("Welcome to NOW Savings Account")));

    [Fact]
    public void Matches_WithoutMarker_ReturnsFalse() =>
        Assert.False(new NeoBankPdfSignature().Matches(PdfCtx("Superbank statement page 1")));

    [Fact]
    public void AppliesTo_Pdf_ReturnsTrue() =>
        Assert.True(new NeoBankPdfSignature().AppliesTo("application/pdf"));

    [Fact]
    public void AppliesTo_Csv_ReturnsFalse() =>
        Assert.False(new NeoBankPdfSignature().AppliesTo("text/csv"));
}

public class SuperbankPdfSignatureTests
{
    private static BankProbeContext PdfCtx(string text) =>
        new([], text, IsPdf: true);

    [Fact]
    public void Matches_WithSuperbankText_ReturnsTrue() =>
        Assert.True(new SuperbankPdfSignature().Matches(PdfCtx("Superbank Monthly Statement")));

    [Fact]
    public void Matches_WithoutMarker_ReturnsFalse() =>
        Assert.False(new SuperbankPdfSignature().Matches(PdfCtx("NOW Savings Statement")));
}
