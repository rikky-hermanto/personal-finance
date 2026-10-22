using System.Text;
using Microsoft.Extensions.Logging.Abstractions;
using PersonalFinance.Application.Services;

namespace PersonalFinance.Tests.Services;

/// <summary>PF-144 (SEC-02): the declared content type must agree with the file's leading bytes.</summary>
public class UploadFileValidatorTests
{
    private static readonly byte[] Pdf = Encoding.ASCII.GetBytes("%PDF-1.4\n%âãÏÓ\n");
    private static readonly byte[] Png = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D];
    private static readonly byte[] Jpeg = [0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01];
    private static readonly byte[] Webp = Encoding.ASCII.GetBytes("RIFF\x24\x00\x00\x00WEBPVP8 ");

    private static UploadFileValidator Validator() => new(NullLogger<UploadFileValidator>.Instance);

    private static Task<bool> ValidateAsync(byte[] bytes, string contentType) =>
        Validator().ValidateAsync(new MemoryStream(bytes), contentType);

    public static TheoryData<string, byte[]> MatchingFiles => new()
    {
        { "application/pdf", Pdf },
        { "image/png", Png },
        { "image/jpeg", Jpeg },
        { "image/webp", Webp },
        { "text/csv", Encoding.UTF8.GetBytes("Tanggal,Keterangan,Jumlah\n01/05/2026,GOFOOD,\"85.000,00\"\n") },
    };

    [Theory]
    [MemberData(nameof(MatchingFiles))]
    public async Task ValidateAsync_SignatureMatchesDeclaredType_ReturnsTrue(string contentType, byte[] bytes)
    {
        // Act
        var valid = await ValidateAsync(bytes, contentType);

        // Assert
        Assert.True(valid);
    }

    public static TheoryData<string, byte[]> MismatchedFiles => new()
    {
        { "application/pdf", Png },
        { "application/pdf", Encoding.UTF8.GetBytes("Tanggal,Keterangan\n") },
        { "image/png", Jpeg },
        { "image/jpeg", Pdf },
        { "image/webp", Encoding.ASCII.GetBytes("RIFF\x24\x00\x00\x00WAVEfmt ") },
        { "text/csv", Png },
        { "text/csv", Encoding.Unicode.GetBytes("Tanggal,Keterangan\n") },
    };

    [Theory]
    [MemberData(nameof(MismatchedFiles))]
    public async Task ValidateAsync_SignatureDoesNotMatchDeclaredType_ReturnsFalse(string contentType, byte[] bytes)
    {
        // Act
        var valid = await ValidateAsync(bytes, contentType);

        // Assert
        Assert.False(valid);
    }

    [Theory]
    [InlineData("application/octet-stream")]
    [InlineData("text/html")]
    [InlineData("")]
    public async Task ValidateAsync_UnsupportedDeclaredType_ReturnsFalse(string contentType)
    {
        // Act
        var valid = await ValidateAsync(Pdf, contentType);

        // Assert
        Assert.False(valid);
    }

    [Fact]
    public async Task ValidateAsync_FileShorterThanSignature_ReturnsFalse()
    {
        // Act
        var valid = await ValidateAsync([0x89, 0x50], "image/png");

        // Assert
        Assert.False(valid);
    }

    [Fact]
    public async Task ValidateAsync_Windows1252Csv_ReturnsTrue()
    {
        // Arrange: "Café" in Windows-1252 is not valid UTF-8
        var bytes = new byte[] { 0x43, 0x61, 0x66, 0xE9, 0x2C, 0x31, 0x0A };

        // Act
        var valid = await ValidateAsync(bytes, "text/csv");

        // Assert
        Assert.True(valid);
    }

    [Fact]
    public async Task ValidateAsync_Utf8CharacterSplitAtProbeBoundary_ReturnsTrue()
    {
        // Arrange: a 2-byte UTF-8 character straddles the 8 KB probe boundary
        var bytes = new byte[9000];
        Array.Fill(bytes, (byte)'a');
        bytes[8191] = 0xC3;
        bytes[8192] = 0xA9;

        // Act
        var valid = await ValidateAsync(bytes, "text/csv");

        // Assert
        Assert.True(valid);
    }

    [Fact]
    public async Task ValidateAsync_NulByteAfterProbeWindow_ReturnsTrue()
    {
        // Arrange: only the first 8 KB is inspected
        var bytes = new byte[9000];
        Array.Fill(bytes, (byte)'a');
        bytes[8500] = 0x00;

        // Act
        var valid = await ValidateAsync(bytes, "text/csv");

        // Assert
        Assert.True(valid);
    }

    [Fact]
    public async Task ValidateAsync_AnyResult_RestoresStreamPosition()
    {
        // Arrange
        var stream = new MemoryStream([0x00, .. Pdf]) { Position = 1 };

        // Act
        await Validator().ValidateAsync(stream, "application/pdf");

        // Assert
        Assert.Equal(1, stream.Position);
    }
}
