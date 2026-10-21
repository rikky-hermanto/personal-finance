using System.Net;
using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Logging.Abstractions;
using PersonalFinance.Application.Dtos;
using PersonalFinance.Application.Interfaces;
using PersonalFinance.Infrastructure.External;

namespace PersonalFinance.Tests.Infrastructure;

/// <summary>PF-S15: owner token signing, the chat proxy and the search client's owner header.</summary>
public class AiChatClientTests
{
    private sealed record TestCaller(Guid UserId, string AccessToken) : ICurrentUser;

    private const string FixtureSecret = "pf-s15-fixture-secret"; // commit-skill:allow (test fixture)
    private static readonly Guid UserA = Guid.Parse("11111111-1111-1111-1111-111111111111");

    // Shared with services/ai-service/tests/test_owner_scope.py (FIXTURE_TOKEN): the
    // Python verifier accepts exactly what this signer produces.
    private const string FixtureToken =
        "11111111-1111-1111-1111-111111111111.1700000000." +
        "4aa59c656e15ddc2e63799a0ce43e596c95e82be0c2d301c0865461573326887";

    private static OwnerTokenSigner Signer(string? secret = FixtureSecret) => new(secret, TimeProvider.System);

    private static AiChatClient BuildClient(FakeHttpHandler handler) =>
        new(new HttpClient(handler) { BaseAddress = new Uri("http://ai-service:8000") },
            new TestCaller(UserA, "token"), Signer(), NullLogger<AiChatClient>.Instance);

    [Fact]
    public void Sign_SharedFixture_MatchesPythonVerifierToken()
    {
        // Act
        var token = Signer().Sign(UserA, unixSeconds: 1700000000);

        // Assert
        Assert.Equal(FixtureToken, token);
    }

    [Fact]
    public void Sign_MissingSecret_Throws()
    {
        Assert.Throws<InvalidOperationException>(() => Signer(secret: "").Sign(UserA));
    }

    [Fact]
    public void Sign_EmptyUser_Throws()
    {
        Assert.Throws<UnauthorizedAccessException>(() => Signer().Sign(Guid.Empty));
    }

    [Fact]
    public async Task StreamAskAsync_SetsVerifiableOwnerTokenFromCurrentUser_AndCopiesStream()
    {
        // Arrange
        var handler = new FakeHttpHandler(HttpStatusCode.OK, "event: token\ndata: Halo\n\n");
        var client = BuildClient(handler);
        using var destination = new MemoryStream();

        // Act
        await client.StreamAskAsync(new AskChatRequest("makan maret"), destination, CancellationToken.None);

        // Assert
        Assert.Equal("/ask/stream", handler.LastRequest!.RequestUri!.AbsolutePath);
        var token = handler.LastRequest.Headers.GetValues(OwnerTokenSigner.HeaderName).Single();
        var parts = token.Split('.');
        Assert.Equal(UserA.ToString(), parts[0]);
        var expected = Convert.ToHexStringLower(HMACSHA256.HashData(
            Encoding.UTF8.GetBytes(FixtureSecret), Encoding.UTF8.GetBytes($"{parts[0]}.{parts[1]}")));
        Assert.Equal(expected, parts[2]);
        Assert.Equal("{\"query\":\"makan maret\"}", handler.LastRequestBody);
        Assert.Equal("event: token\ndata: Halo\n\n", Encoding.UTF8.GetString(destination.ToArray()));
    }

    [Fact]
    public async Task StreamAskAsync_UpstreamError_ThrowsGenericExceptionWithoutBody()
    {
        // Arrange
        var handler = new FakeHttpHandler(HttpStatusCode.BadGateway, "{\"detail\":\"secret upstream detail\"}");
        var client = BuildClient(handler);

        // Act
        var ex = await Assert.ThrowsAsync<AiChatUnavailableException>(() =>
            client.StreamAskAsync(new AskChatRequest("q"), new MemoryStream(), CancellationToken.None));

        // Assert
        Assert.DoesNotContain("secret upstream detail", ex.Message);
    }

    [Fact]
    public async Task StreamAskAsync_BadRequestInputFlagged_ThrowsInputRejectedException()
    {
        // Arrange
        var client = BuildClient(new FakeHttpHandler(HttpStatusCode.BadRequest, "{\"detail\":\"input_flagged\"}"));

        // Act
        var ex = await Assert.ThrowsAsync<AiChatInputRejectedException>(() =>
            client.StreamAskAsync(new AskChatRequest("q"), new MemoryStream(), CancellationToken.None));

        // Assert
        Assert.DoesNotContain("input_flagged", ex.Message);
    }

    [Theory]
    [InlineData("{\"detail\":\"something_else\"}")]
    [InlineData("not json at all")]
    [InlineData("[]")]
    public async Task StreamAskAsync_BadRequestOtherBody_ThrowsUnavailableException(string body)
    {
        // Arrange
        var client = BuildClient(new FakeHttpHandler(HttpStatusCode.BadRequest, body));

        // Act + Assert
        await Assert.ThrowsAsync<AiChatUnavailableException>(() =>
            client.StreamAskAsync(new AskChatRequest("q"), new MemoryStream(), CancellationToken.None));
    }

    [Fact]
    public async Task FollowUpsAsync_UpstreamError_ReturnsEmptyList()
    {
        // Arrange
        var client = BuildClient(new FakeHttpHandler(HttpStatusCode.Unauthorized, "{}"));

        // Act
        var questions = await client.FollowUpsAsync(new FollowUpChatRequest("q", "a"), CancellationToken.None);

        // Assert
        Assert.Empty(questions);
    }

    [Fact]
    public async Task FollowUpsAsync_Success_ReturnsQuestions()
    {
        // Arrange
        var client = BuildClient(new FakeHttpHandler(HttpStatusCode.OK, "{\"questions\":[\"a?\",\"b?\"]}"));

        // Act
        var questions = await client.FollowUpsAsync(new FollowUpChatRequest("q", "a"), CancellationToken.None);

        // Assert
        Assert.Equal(["a?", "b?"], questions);
    }

    [Fact]
    public async Task AdvisorAsync_SendsOwnerTokenAndTheCallersOwnBearer()
    {
        // Arrange
        var handler = new FakeHttpHandler(HttpStatusCode.OK,
            "{\"answer\":\"Halo\",\"session_id\":\"s-1\",\"steps_taken\":1}");
        var client = BuildClient(handler);

        // Act
        var result = await client.AdvisorAsync(new AdvisorChatRequest("q", "s-1"), CancellationToken.None);

        // Assert
        Assert.Equal("/advisor", handler.LastRequest!.RequestUri!.AbsolutePath);
        Assert.Equal("token", handler.LastRequest.Headers.GetValues(AiChatClient.UserTokenHeader).Single());
        var ownerToken = handler.LastRequest.Headers.GetValues(OwnerTokenSigner.HeaderName).Single();
        Assert.Equal(Signer().Sign(UserA, long.Parse(ownerToken.Split('.')[1])), ownerToken);
        Assert.Equal("{\"query\":\"q\",\"session_id\":\"s-1\"}", handler.LastRequestBody);
        Assert.Equal(new AdvisorChatResponse("Halo", "s-1", 1), result);
    }

    [Fact]
    public async Task AdvisorAsync_UpstreamError_ThrowsGenericExceptionWithoutBody()
    {
        // Arrange
        var client = BuildClient(new FakeHttpHandler(HttpStatusCode.BadGateway, "{\"detail\":\"secret upstream detail\"}"));

        // Act
        var ex = await Assert.ThrowsAsync<AiChatUnavailableException>(() =>
            client.AdvisorAsync(new AdvisorChatRequest("q"), CancellationToken.None));

        // Assert
        Assert.DoesNotContain("secret upstream detail", ex.Message);
    }

    [Fact]
    public async Task EmbedTransactionsAsync_SignsTheExplicitOwner()
    {
        // Arrange
        var handler = new FakeHttpHandler(HttpStatusCode.OK, "{\"embedded\":1,\"skipped\":0,\"model\":\"m\"}");
        var ownerB = Guid.Parse("22222222-2222-2222-2222-222222222222");
        var client = new LlmSearchClient(
            new HttpClient(handler) { BaseAddress = new Uri("http://ai-service:8000") },
            Signer(), NullLogger<LlmSearchClient>.Instance);

        // Act
        await client.EmbedTransactionsAsync([new EmbedItemRequest(7, "GOFOOD")], ownerB);

        // Assert
        Assert.Equal("/embed-transactions", handler.LastRequest!.RequestUri!.AbsolutePath);
        var token = handler.LastRequest.Headers.GetValues(OwnerTokenSigner.HeaderName).Single();
        var parts = token.Split('.');
        Assert.Equal(Signer().Sign(ownerB, long.Parse(parts[1])), token);
        Assert.Contains("\"transaction_id\":7", handler.LastRequestBody);
    }

    private sealed class FakeHttpHandler(HttpStatusCode status, string body) : HttpMessageHandler
    {
        public HttpRequestMessage? LastRequest { get; private set; }
        public string? LastRequestBody { get; private set; }

        protected override async Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request, CancellationToken cancellationToken)
        {
            LastRequest = request;
            LastRequestBody = request.Content is null ? null : await request.Content.ReadAsStringAsync(cancellationToken);
            return new HttpResponseMessage(status) { Content = new StringContent(body, Encoding.UTF8, "application/json") };
        }
    }
}
