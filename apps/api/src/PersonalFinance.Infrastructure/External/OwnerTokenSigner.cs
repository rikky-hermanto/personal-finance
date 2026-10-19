using System.Globalization;
using System.Security.Cryptography;
using System.Text;

namespace PersonalFinance.Infrastructure.External;

/// <summary>
/// Signs the owner the AI service should act as (PF-S15). Token format:
/// <c>&lt;user-uuid&gt;.&lt;unix-seconds&gt;.&lt;hex HMAC-SHA256 of "&lt;user-uuid&gt;.&lt;unix-seconds&gt;"&gt;</c>.
/// The AI service accepts it for 60 seconds (app/owner.py), so the internal key alone
/// can't choose which user to act as.
/// </summary>
public sealed class OwnerTokenSigner
{
    public const string HeaderName = "X-Pf-Owner-Token";

    private readonly byte[] _secret;
    private readonly TimeProvider _time;

    public OwnerTokenSigner(string? secret, TimeProvider time)
    {
        // An empty secret only fails when a token is actually needed, so services that
        // merely inject a search client still construct while AI chat is off.
        _secret = Encoding.UTF8.GetBytes(secret ?? "");
        _time = time;
    }

    public string Sign(Guid userId) => Sign(userId, _time.GetUtcNow().ToUnixTimeSeconds());

    public string Sign(Guid userId, long unixSeconds)
    {
        if (_secret.Length == 0)
            throw new InvalidOperationException("AiChat:OwnerSigningSecret is required to call owner-scoped AI routes.");
        if (userId == Guid.Empty)
            throw new UnauthorizedAccessException("A verified caller is required.");
        var prefix = $"{userId:D}.{unixSeconds.ToString(CultureInfo.InvariantCulture)}";
        var signature = HMACSHA256.HashData(_secret, Encoding.UTF8.GetBytes(prefix));
        return $"{prefix}.{Convert.ToHexStringLower(signature)}";
    }
}
