using System.Security.Claims;
using PersonalFinance.Application.Interfaces;

namespace PersonalFinance.Api.Authentication;

public sealed class HttpCurrentUser(IHttpContextAccessor accessor) : ICurrentUser
{
    private HttpContext Context => accessor.HttpContext
        ?? throw new UnauthorizedAccessException("A verified caller is required.");

    public Guid UserId
    {
        get
        {
            var principal = Context.User;
            var subject = principal.FindFirstValue("sub");
            if (principal.Identity?.IsAuthenticated != true ||
                principal.FindFirstValue("role") != "authenticated" ||
                !Guid.TryParse(subject, out var id) || id == Guid.Empty)
                throw new UnauthorizedAccessException("A verified caller is required.");
            return id;
        }
    }

    public string AccessToken
    {
        get
        {
            _ = UserId;
            var authorization = Context.Request.Headers.Authorization.ToString();
            if (!authorization.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
                throw new UnauthorizedAccessException("A verified caller is required.");
            var token = authorization[7..].Trim();
            if (token.Length == 0)
                throw new UnauthorizedAccessException("A verified caller is required.");
            return token;
        }
    }
}
