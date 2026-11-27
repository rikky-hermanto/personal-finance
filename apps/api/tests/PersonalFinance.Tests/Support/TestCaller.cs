using PersonalFinance.Application.Interfaces;

namespace PersonalFinance.Tests.Support;

/// <summary>The signed-in owner every harness test runs as.</summary>
public sealed class TestCaller : ICurrentUser
{
    public const string Token = "verified-user-token"; // commit-skill:allow (made-up test value)

    public static readonly Guid Id = Guid.Parse("11111111-1111-1111-1111-111111111111");

    public Guid UserId => Id;
    public string AccessToken => Token;
}
