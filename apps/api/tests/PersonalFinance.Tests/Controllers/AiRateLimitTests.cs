using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.Tokens;
using PersonalFinance.Api.Extensions;
using PersonalFinance.Application.Dtos;
using PersonalFinance.Application.Interfaces;

namespace PersonalFinance.Tests.Controllers;

/// <summary>PF-157: per-user limits on the routes that spend LLM quota.</summary>
public sealed class AiRateLimitTests
{
    private const string Secret = "local-test-signing-secret-32-bytes-minimum"; // commit-skill:allow (fake key for the in-process test server)
    private const string Issuer = "http://127.0.0.1:54321/auth/v1";
    private static readonly Guid UserA = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid UserB = Guid.Parse("22222222-2222-2222-2222-222222222222");

    private sealed class FakeChatClient : IAiChatClient
    {
        public TaskCompletionSource Started { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public TaskCompletionSource? Gate { get; init; }

        public async Task StreamAskAsync(AskChatRequest request, Stream destination, CancellationToken ct)
        {
            Started.TrySetResult();
            if (Gate is not null) await Gate.Task;
            await destination.WriteAsync(Encoding.UTF8.GetBytes("event: done\ndata: {}\n\n"), ct);
        }

        public Task<IReadOnlyList<string>> FollowUpsAsync(FollowUpChatRequest request, CancellationToken ct) =>
            Task.FromResult<IReadOnlyList<string>>([]);

        public Task<AdvisorChatResponse> AdvisorAsync(AdvisorChatRequest request, CancellationToken ct) =>
            Task.FromResult(new AdvisorChatResponse("ok", "s-1", 0));
    }

    private static WebApplicationFactory<PersonalFinance.Api.Program> CreateFactory(
        FakeChatClient fake, int perMinute = 20, int maxConcurrent = 3) =>
        new WebApplicationFactory<PersonalFinance.Api.Program>().WithWebHostBuilder(builder =>
        {
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
                    ["CashflowPilot:Enabled"] = "true",
                    ["AiChat:Enabled"] = "true",
                    ["AiChat:OwnerSigningSecret"] = "test-owner-secret",
                    ["AiRateLimit:PerMinute"] = perMinute.ToString(),
                    ["AiRateLimit:MaxConcurrent"] = maxConcurrent.ToString(),
                }));
            builder.ConfigureTestServices(services => services.AddSingleton<IAiChatClient>(fake));
        });

    private static string Token(Guid subject)
    {
        var jwt = new JwtSecurityToken(
            issuer: Issuer, audience: "authenticated",
            claims: [new Claim("sub", subject.ToString()), new Claim("role", "authenticated")],
            notBefore: DateTime.UtcNow.AddMinutes(-10), expires: DateTime.UtcNow.AddMinutes(10),
            signingCredentials: new SigningCredentials(
                new SymmetricSecurityKey(Encoding.UTF8.GetBytes(Secret)), SecurityAlgorithms.HmacSha256));
        return new JwtSecurityTokenHandler().WriteToken(jwt);
    }

    private static HttpClient ClientFor(WebApplicationFactory<PersonalFinance.Api.Program> factory, Guid user)
    {
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", Token(user));
        return client;
    }

    [Fact]
    public async Task ChatRoute_OverPerMinuteLimit_ReturnsTooManyRequestsWithRetryAfter()
    {
        // Arrange
        using var factory = CreateFactory(new FakeChatClient(), perMinute: 2);
        var client = ClientFor(factory, UserA);

        // Act
        var first = await client.PostAsJsonAsync("/api/chat/ask/stream", new { query = "q" });
        var second = await client.PostAsJsonAsync("/api/chat/ask/stream", new { query = "q" });
        var third = await client.PostAsJsonAsync("/api/chat/ask/stream", new { query = "q" });

        // Assert
        Assert.Equal(HttpStatusCode.OK, first.StatusCode);
        Assert.Equal(HttpStatusCode.OK, second.StatusCode);
        Assert.Equal(HttpStatusCode.TooManyRequests, third.StatusCode);
        Assert.True(third.Headers.TryGetValues("Retry-After", out var retryAfter) && int.Parse(retryAfter.Single()) >= 1);
        Assert.Equal("{\"code\":\"rate_limited\"}", await third.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task ChatRoute_LimitIsPerUser_OtherUserIsNotAffected()
    {
        // Arrange
        using var factory = CreateFactory(new FakeChatClient(), perMinute: 1);
        var userA = ClientFor(factory, UserA);
        var userB = ClientFor(factory, UserB);
        await userA.PostAsJsonAsync("/api/chat/ask/stream", new { query = "q" });

        // Act
        var aAgain = await userA.PostAsJsonAsync("/api/chat/ask/stream", new { query = "q" });
        var bFirst = await userB.PostAsJsonAsync("/api/chat/ask/stream", new { query = "q" });

        // Assert
        Assert.Equal(HttpStatusCode.TooManyRequests, aAgain.StatusCode);
        Assert.Equal(HttpStatusCode.OK, bFirst.StatusCode);
    }

    [Fact]
    public async Task NonAiRoute_IsNeverLimited()
    {
        // Arrange
        using var factory = CreateFactory(new FakeChatClient(), perMinute: 1);
        var client = factory.CreateClient();

        // Act
        var statuses = new List<HttpStatusCode>();
        for (var i = 0; i < 4; i++) statuses.Add((await client.GetAsync("/health")).StatusCode);

        // Assert
        Assert.DoesNotContain(HttpStatusCode.TooManyRequests, statuses);
    }

    [Fact]
    public async Task ChatRoute_OverConcurrentLimit_ReturnsTooManyRequests()
    {
        // Arrange
        var gate = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var fake = new FakeChatClient { Gate = gate };
        using var factory = CreateFactory(fake, maxConcurrent: 1);
        var client = ClientFor(factory, UserA);
        var held = client.PostAsJsonAsync("/api/chat/ask/stream", new { query = "q" });
        await fake.Started.Task;

        // Act
        var rejected = await client.PostAsJsonAsync("/api/chat/followups", new { question = "q", answer = "a" });
        gate.SetResult();
        var finished = await held;

        // Assert
        Assert.Equal(HttpStatusCode.TooManyRequests, rejected.StatusCode);
        Assert.Equal(HttpStatusCode.OK, finished.StatusCode);
    }

    [Theory]
    [InlineData("POST", "/api/chat/ask/stream", true)]
    [InlineData("POST", "/api/chat/advisor", true)]
    [InlineData("POST", "/api/investments/setups/abc/review", true)]
    [InlineData("GET", "/api/investments/setups/abc/review", false)]
    [InlineData("GET", "/api/transactions", false)]
    [InlineData("POST", "/api/transactions/submit", false)]
    public void IsAiSpendingRoute_MatchesChatAndReviewOnly(string method, string path, bool expected)
    {
        // Arrange
        var context = new DefaultHttpContext();
        context.Request.Method = method;
        context.Request.Path = path;

        // Act
        var actual = AiRateLimiting.IsAiSpendingRoute(context.Request);

        // Assert
        Assert.Equal(expected, actual);
    }
}
