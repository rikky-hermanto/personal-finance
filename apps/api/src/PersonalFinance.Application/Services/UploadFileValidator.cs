using System.Text;
using Microsoft.Extensions.Logging;
using PersonalFinance.Application.Interfaces;

namespace PersonalFinance.Application.Services;

/// <summary>
/// SEC-02: the client-sent content type is attacker-controlled, so the upload is only
/// trusted when its magic bytes agree with it. CSV has no signature; it must be text.
/// </summary>
public sealed class UploadFileValidator : IUploadFileValidator
{
    private const int SignatureProbeBytes = 12;
    private const int TextProbeBytes = 8 * 1024;

    private static readonly byte[] PdfSignature = "%PDF-"u8.ToArray();
    private static readonly byte[] PngSignature = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
    private static readonly byte[] JpegSignature = [0xFF, 0xD8, 0xFF];
    private static readonly byte[] RiffSignature = "RIFF"u8.ToArray();
    private static readonly byte[] WebpSignature = "WEBP"u8.ToArray();

    private static readonly Encoding StrictUtf8 = new UTF8Encoding(false, throwOnInvalidBytes: true);
    private static readonly Encoding StrictWindows1252;

    private readonly ILogger<UploadFileValidator> _logger;

    static UploadFileValidator()
    {
        Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);
        StrictWindows1252 = Encoding.GetEncoding(1252, EncoderFallback.ExceptionFallback, DecoderFallback.ExceptionFallback);
    }

    public UploadFileValidator(ILogger<UploadFileValidator> logger) => _logger = logger;

    public async Task<bool> ValidateAsync(Stream stream, string declaredContentType, CancellationToken ct = default)
    {
        var isText = declaredContentType == "text/csv";
        var buffer = new byte[isText ? TextProbeBytes : SignatureProbeBytes];
        var start = stream.CanSeek ? stream.Position : 0;
        int read;
        try
        {
            read = await stream.ReadAtLeastAsync(buffer, buffer.Length, throwOnEndOfStream: false, ct);
        }
        finally
        {
            if (stream.CanSeek) stream.Position = start;
        }

        var valid = Matches(buffer.AsSpan(0, read), declaredContentType, truncated: read == buffer.Length);
        if (!valid)
            _logger.LogWarning("Upload rejected: content does not match declared type {ContentType}", declaredContentType);
        return valid;
    }

    private static bool Matches(ReadOnlySpan<byte> head, string declaredContentType, bool truncated) =>
        declaredContentType switch
        {
            "application/pdf" => head.StartsWith(PdfSignature),
            "image/png" => head.StartsWith(PngSignature),
            "image/jpeg" => head.StartsWith(JpegSignature),
            "image/webp" => head.Length >= 12 && head[..4].SequenceEqual(RiffSignature) && head[8..12].SequenceEqual(WebpSignature),
            "text/csv" => IsText(head, truncated),
            _ => false,
        };

    private static bool IsText(ReadOnlySpan<byte> head, bool truncated)
    {
        if (head.IsEmpty || head.Contains((byte)0)) return false;
        return Decodes(StrictUtf8, head, truncated) || Decodes(StrictWindows1252, head, truncated);
    }

    // flush: false when the probe cut the file, so a multi-byte character split at the
    // 8 KB boundary is not mistaken for invalid UTF-8.
    private static bool Decodes(Encoding encoding, ReadOnlySpan<byte> bytes, bool truncated)
    {
        try
        {
            encoding.GetDecoder().GetCharCount(bytes, flush: !truncated);
            return true;
        }
        catch (DecoderFallbackException)
        {
            return false;
        }
    }
}
