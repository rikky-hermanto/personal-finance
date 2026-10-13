using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Http.Headers;
using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.IdentityModel.Tokens;

namespace PersonalFinance.Tests.Authentication;

public sealed class CashflowPilotBoundaryTests
{
    private const string Secret = "local-test-signing-secret-32-bytes-minimum";
    private const string Issuer = "http://127.0.0.1:54321/auth/v1";

    private static WebApplicationFactory<PersonalFinance.Api.Program> CreateFactory(
        bool pilotEnabled = true, bool checkedMutationsEnabled = false) =>
        new WebApplicationFactory<PersonalFinance.Api.Program>().WithWebHostBuilder(builder =>
            builder.ConfigureAppConfiguration((_, config) => config.AddInMemoryCollection(
                new Dictionary<string, string?>
                {
                    ["Supabase:Url"] = "http://127.0.0.1:54321",
                    ["Supabase:AnonKey"] = "test-anon-key",
                    ["Supabase:ServiceRoleKey"] = "test-service-key",
                    ["Supabase:JwtSecret"] = Secret,
                    ["Supabase:JwtValidationMode"] = "LegacySecret",
                    ["Supabase:JwtIssuer"] = Issuer,
                    ["Supabase:JwtAudience"] = "authenticated",
                    ["AiService:InternalApiKey"] = "test-internal-key",
                    ["CashflowPilot:Enabled"] = pilotEnabled.ToString(),
                    ["CashflowPilot:CheckedMutationsEnabled"] = checkedMutationsEnabled.ToString()
                })));

    private static string Token(
        string subject,
        string issuer = Issuer,
        string audience = "authenticated",
        string role = "authenticated",
        DateTime? expires = null,
        string secret = Secret)
    {
        var jwt = new JwtSecurityToken(
            issuer: issuer,
            audience: audience,
            claims: [new Claim("sub", subject), new Claim("role", role)],
            notBefore: DateTime.UtcNow.AddMinutes(-10),
            expires: expires ?? DateTime.UtcNow.AddMinutes(10),
            signingCredentials: new SigningCredentials(
                new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secret)), SecurityAlgorithms.HmacSha256));
        return new JwtSecurityTokenHandler().WriteToken(jwt);
    }

    [Fact]
    public async Task Cashflow_MissingToken_ReturnsUnauthorized()
    {
        using var factory = CreateFactory();
        var response = await factory.CreateClient().GetAsync("/api/transactions");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Theory]
    [InlineData("wrong-signature")]
    [InlineData("wrong-issuer")]
    [InlineData("wrong-audience")]
    [InlineData("expired")]
    [InlineData("non-uuid-subject")]
    [InlineData("service-role")]
    public async Task Cashflow_InvalidIdentity_ReturnsUnauthorized(string scenario)
    {
        using var factory = CreateFactory();
        var client = factory.CreateClient();
        var token = scenario switch
        {
            "wrong-signature" => Token(Guid.NewGuid().ToString(), secret: "a-different-32-byte-signing-secret-for-test"),
            "wrong-issuer" => Token(Guid.NewGuid().ToString(), issuer: "https://wrong.example/auth/v1"),
            "wrong-audience" => Token(Guid.NewGuid().ToString(), audience: "other"),
            "expired" => Token(Guid.NewGuid().ToString(), expires: DateTime.UtcNow.AddMinutes(-1)),
            "non-uuid-subject" => Token("not-a-uuid"),
            "service-role" => Token(Guid.NewGuid().ToString(), role: "service_role"),
            _ => throw new ArgumentOutOfRangeException(nameof(scenario))
        };
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        var response = await client.GetAsync("/api/transactions");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Journey_WhenPilotEnabled_ReturnsNotFound()
    {
        using var factory = CreateFactory();
        var response = await factory.CreateClient().GetAsync("/api/journey/state");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Cashflow_WhenPilotDisabled_ReturnsNotFound()
    {
        using var factory = CreateFactory(pilotEnabled: false);
        var response = await factory.CreateClient().GetAsync("/api/transactions");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Cashflow_WriteStaysClosed_WhenReadPilotEnabled()
    {
        using var factory = CreateFactory();
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue(
            "Bearer", Token(Guid.NewGuid().ToString()));
        var response = await client.PostAsync("/api/transactions/submit", new StringContent("{}"));
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task CheckedSubmit_MissingToken_ReturnsUnauthorized()
    {
        using var factory = CreateFactory(checkedMutationsEnabled: true);
        var response = await factory.CreateClient().PostAsync("/api/transactions/submit",
            new StringContent("{}", Encoding.UTF8, "application/json"));
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task CheckedSubmit_MissingRequestId_ReturnsBadRequest()
    {
        using var factory = CreateFactory(checkedMutationsEnabled: true);
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue(
            "Bearer", Token(Guid.NewGuid().ToString()));
        var response = await client.PostAsync("/api/transactions/submit",
            new StringContent("{}", Encoding.UTF8, "application/json"));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }
}
