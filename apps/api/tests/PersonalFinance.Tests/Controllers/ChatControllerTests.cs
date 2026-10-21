using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.Tokens;
using PersonalFinance.Application.Dtos;
using PersonalFinance.Application.Interfaces;

namespace PersonalFinance.Tests.Controllers;

/// <summary>PF-S15: /api/chat through the real auth pipeline, with the AI client faked.</summary>
public sealed class ChatControllerTests
{
    private const string Secret = "local-test-signing-secret-32-bytes-minimum"; // commit-skill:allow (fake key for the in-process test server)
    private const string Issuer = "http://127.0.0.1:54321/auth/v1";
    private static readonly Guid UserA = Guid.Parse("11111111-1111-1111-1111-111111111111");

    private sealed class FakeChatClient : IAiChatClient
    {
        public AskChatRequest? LastAsk { get; private set; }
        public bool Throw { get; init; }
        public bool Reject { get; init; }

        public async Task StreamAskAsync(AskChatRequest request, Stream destination, CancellationToken ct)
        {
            if (Throw) throw new AiChatUnavailableException();
            if (Reject) throw new AiChatInputRejectedException();
            LastAsk = request;
            await destination.WriteAsync(Encoding.UTF8.GetBytes("event: done\ndata: {}\n\n"), ct);
        }

        public Task<IReadOnlyList<string>> FollowUpsAsync(FollowUpChatRequest request, CancellationToken ct) =>
            Task.FromResult<IReadOnlyList<string>>(["Berapa total makan bulan lalu?"]);

        public AdvisorChatRequest? LastAdvisor { get; private set; }

        public Task<AdvisorChatResponse> AdvisorAsync(AdvisorChatRequest request, CancellationToken ct)
        {
            LastAdvisor = request;
            return Task.FromResult(new AdvisorChatResponse("Fokus ke dana darurat.", "s-1", 2));
        }
    }

    private static WebApplicationFactory<PersonalFinance.Api.Program> CreateFactory(
        bool chatEnabled, FakeChatClient fake, bool agentsEnabled = false) =>
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
                    ["AiChat:Enabled"] = chatEnabled.ToString(),
                    ["AiChat:AgentsEnabled"] = agentsEnabled.ToString(),
                    ["AiChat:OwnerSigningSecret"] = "test-owner-secret",
                }));
            builder.ConfigureTestServices(services => services.AddSingleton<IAiChatClient>(fake));
        });

    private static string Token(Guid subject)
    {
        var jwt = new JwtSecurityToken(
            issuer: Issuer,
            audience: "authenticated",
            claims: [new Claim("sub", subject.ToString()), new Claim("role", "authenticated")],
            notBefore: DateTime.UtcNow.AddMinutes(-10),
            expires: DateTime.UtcNow.AddMinutes(10),
            signingCredentials: new SigningCredentials(
                new SymmetricSecurityKey(Encoding.UTF8.GetBytes(Secret)), SecurityAlgorithms.HmacSha256));
        return new JwtSecurityTokenHandler().WriteToken(jwt);
    }

    private static HttpClient Client(WebApplicationFactory<PersonalFinance.Api.Program> factory, bool signedIn)
    {
        var client = factory.CreateClient();
        if (signedIn)
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", Token(UserA));
        return client;
    }

    [Theory]
    [InlineData("/api/chat/ask/stream")]
    [InlineData("/api/chat/followups")]
    [InlineData("/api/chat/advisor")]
    public async Task ChatRoutes_WithoutToken_ReturnUnauthorized(string path)
    {
        // Arrange
        using var factory = CreateFactory(chatEnabled: true, new FakeChatClient(), agentsEnabled: true);

        // Act
        var response = await Client(factory, signedIn: false)
            .PostAsJsonAsync(path, new { query = "q", question = "q", answer = "a" });

        // Assert
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Theory]
    [InlineData("/api/chat/ask/stream")]
    [InlineData("/api/chat/followups")]
    public async Task ChatRoutes_FlagOff_ReturnNotFound(string path)
    {
        // Arrange
        var fake = new FakeChatClient();
        using var factory = CreateFactory(chatEnabled: false, fake);

        // Act
        var response = await Client(factory, signedIn: true)
            .PostAsJsonAsync(path, new { query = "q", question = "q", answer = "a" });

        // Assert
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Null(fake.LastAsk);
    }

    [Fact]
    public async Task AskStream_FlagOn_StreamsEventStreamAndForwardsSnakeCaseBody()
    {
        // Arrange
        var fake = new FakeChatClient();
        using var factory = CreateFactory(chatEnabled: true, fake);

        // Act
        var response = await Client(factory, signedIn: true).PostAsJsonAsync("/api/chat/ask/stream",
            new { query = "makan maret", date_from = "2026-03-01", top_k = 3 });

        // Assert
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("text/event-stream", response.Content.Headers.ContentType?.MediaType);
        Assert.Equal("no-cache", response.Headers.CacheControl?.ToString());
        Assert.Contains("event: done", await response.Content.ReadAsStringAsync());
        Assert.Equal(new AskChatRequest("makan maret", TopK: 3, DateFrom: "2026-03-01"), fake.LastAsk);
    }

    [Fact]
    public async Task AskStream_UpstreamFails_ReturnsBadGatewayWithoutDetail()
    {
        // Arrange
        using var factory = CreateFactory(chatEnabled: true, new FakeChatClient { Throw = true });

        // Act
        var response = await Client(factory, signedIn: true)
            .PostAsJsonAsync("/api/chat/ask/stream", new { query = "q" });

        // Assert
        Assert.Equal(HttpStatusCode.BadGateway, response.StatusCode);
        Assert.Equal("{\"Code\":\"ai_unavailable\"}", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task AskStream_InputFlagged_ReturnsBadRequestWithCode()
    {
        // Arrange
        using var factory = CreateFactory(chatEnabled: true, new FakeChatClient { Reject = true });

        // Act
        var response = await Client(factory, signedIn: true)
            .PostAsJsonAsync("/api/chat/ask/stream", new { query = "q" });

        // Assert
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("{\"code\":\"input_flagged\"}", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task FollowUps_FlagOn_ReturnsQuestions()
    {
        // Arrange
        using var factory = CreateFactory(chatEnabled: true, new FakeChatClient());

        // Act
        var response = await Client(factory, signedIn: true)
            .PostAsJsonAsync("/api/chat/followups", new { question = "q", answer = "a" });

        // Assert
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Contains("Berapa total makan bulan lalu?", await response.Content.ReadAsStringAsync());
    }

    [Theory]
    [InlineData(false, false)]
    [InlineData(true, false)]
    [InlineData(false, true)]
    public async Task Advisor_AnyFlagOff_ReturnsNotFound(bool chatEnabled, bool agentsEnabled)
    {
        // Arrange
        var fake = new FakeChatClient();
        using var factory = CreateFactory(chatEnabled, fake, agentsEnabled);

        // Act
        var response = await Client(factory, signedIn: true)
            .PostAsJsonAsync("/api/chat/advisor", new { query = "Apa langkah berikutnya?" });

        // Assert
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Null(fake.LastAdvisor);
    }

    [Fact]
    public async Task Advisor_FlagsOn_ForwardsSnakeCaseBodyAndReturnsAnswer()
    {
        // Arrange
        var fake = new FakeChatClient();
        using var factory = CreateFactory(chatEnabled: true, fake, agentsEnabled: true);

        // Act
        var response = await Client(factory, signedIn: true).PostAsJsonAsync("/api/chat/advisor",
            new { query = "Apa langkah berikutnya?", session_id = "s-1", date_from = "2026-01-01" });

        // Assert
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(new AdvisorChatRequest("Apa langkah berikutnya?", "s-1", "2026-01-01"), fake.LastAdvisor);
        var body = await response.Content.ReadAsStringAsync();
        Assert.Contains("\"session_id\":\"s-1\"", body);
        Assert.Contains("Fokus ke dana darurat.", body);
    }
}
