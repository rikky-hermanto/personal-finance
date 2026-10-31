using System.Net;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Logging.Abstractions;
using PersonalFinance.Application.Dtos;
using PersonalFinance.Application.Interfaces;
using PersonalFinance.Infrastructure.Supabase;

namespace PersonalFinance.Tests.Infrastructure;

public sealed class SupabaseHarvestLedgerTests
{
    private static HarvestMonthRecord September() =>
        new(new DateOnly(2026, 9, 1), 10_000_000m, 8_000_000m, "green", 4, 5);

    [Fact]
    public async Task UpsertMonthsAsync_OneMonth_PostsRpcWithCallerJwtAndNoUserId()
    {
        // Arrange
        string? path = null, authorization = null, apiKey = null, body = null;
        using var http = new HttpClient(new StubHandler(async request =>
        {
            path = request.RequestUri!.AbsolutePath;
            authorization = request.Headers.Authorization?.ToString();
            apiKey = request.Headers.GetValues("apikey").Single();
            body = await request.Content!.ReadAsStringAsync();
            return new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent("1") };
        }));

        // Act
        await CreateLedger(http).UpsertMonthsAsync([September()]);

        // Assert
        Assert.Equal("/rest/v1/rpc/upsert_harvest_months", path);
        Assert.Equal("Bearer verified-user-token", authorization);
        Assert.Equal("public-anon-key", apiKey);
        using var parsed = JsonDocument.Parse(body!);
        Assert.False(parsed.RootElement.TryGetProperty("user_id", out _));
        var row = parsed.RootElement.GetProperty("p_rows")[0];
        Assert.False(row.TryGetProperty("user_id", out _));
        Assert.Equal("2026-09-01", row.GetProperty("month").GetString());
        Assert.Equal(4, row.GetProperty("accounts_covered").GetInt32());
        Assert.Equal(8_000_000m, row.GetProperty("expense_idr").GetDecimal());
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task UpsertMonthsAsync_InsertedAsSeen_IsSentAsPSeen(bool insertedAsSeen)
    {
        // Arrange
        string? body = null;
        using var http = new HttpClient(new StubHandler(async request =>
        {
            body = await request.Content!.ReadAsStringAsync();
            return new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent("1") };
        }));

        // Act
        await CreateLedger(http).UpsertMonthsAsync([September()], insertedAsSeen);

        // Assert
        using var parsed = JsonDocument.Parse(body!);
        Assert.Equal(insertedAsSeen, parsed.RootElement.GetProperty("p_seen").GetBoolean());
    }

    [Fact]
    public async Task ListAsync_PostgrestRows_MapsMonthResultAndSeenFlag()
    {
        // Arrange
        const string json = """
            [{"month":"2026-09-01","income_idr":10000000.00,"expense_idr":8000000.00,"result":"green","accounts_covered":4,"accounts_total":5,"seen_at":null},
             {"month":"2026-08-01","income_idr":9000000.00,"expense_idr":9500000.00,"result":"red","accounts_covered":5,"accounts_total":5,"seen_at":"2026-10-04T01:02:03+00:00"}]
            """;
        using var http = new HttpClient(new StubHandler(_ => Task.FromResult(
            new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(json, Encoding.UTF8, "application/json")
            })));

        // Act
        var rows = await CreateLedger(http).ListAsync();

        // Assert
        Assert.Equal(2, rows.Count);
        Assert.Equal(new DateOnly(2026, 9, 1), rows[0].Record.Month);
        Assert.Equal(4, rows[0].Record.AccountsCovered);
        Assert.False(rows[0].Seen);
        Assert.Equal("red", rows[1].Record.Result);
        Assert.True(rows[1].Seen);
    }

    [Fact]
    public async Task MarkSeenAsync_IdsAndMonth_PostsBothArguments()
    {
        // Arrange
        string? path = null, body = null;
        using var http = new HttpClient(new StubHandler(async request =>
        {
            path = request.RequestUri!.AbsolutePath;
            body = await request.Content!.ReadAsStringAsync();
            return new HttpResponseMessage(HttpStatusCode.NoContent);
        }));

        // Act
        await CreateLedger(http).MarkSeenAsync([41, 42], new DateOnly(2026, 9, 1));

        // Assert
        Assert.Equal("/rest/v1/rpc/mark_harvest_seen", path);
        using var parsed = JsonDocument.Parse(body!);
        Assert.Equal([41L, 42L],
            parsed.RootElement.GetProperty("p_completion_ids").EnumerateArray().Select(e => e.GetInt64()).ToArray());
        Assert.Equal("2026-09-01", parsed.RootElement.GetProperty("p_through_month").GetString());
    }

    [Fact]
    public async Task MarkSeenAsync_NoMonth_SendsJsonNull()
    {
        // Arrange
        string? body = null;
        using var http = new HttpClient(new StubHandler(async request =>
        {
            body = await request.Content!.ReadAsStringAsync();
            return new HttpResponseMessage(HttpStatusCode.NoContent);
        }));

        // Act
        await CreateLedger(http).MarkSeenAsync([7], null);

        // Assert
        using var parsed = JsonDocument.Parse(body!);
        Assert.Equal(JsonValueKind.Null, parsed.RootElement.GetProperty("p_through_month").ValueKind);
    }

    [Fact]
    public async Task UpsertMonthsAsync_ServerRefuses_ThrowsWithoutLeakingTheBody()
    {
        // Arrange
        using var http = new HttpClient(new StubHandler(_ => Task.FromResult(
            new HttpResponseMessage(HttpStatusCode.Forbidden) { Content = new StringContent("secret-detail") })));

        // Act
        var exception = await Assert.ThrowsAsync<HarvestLedgerException>(
            () => CreateLedger(http).UpsertMonthsAsync([September()]));

        // Assert
        Assert.Contains("403", exception.Message);
        Assert.DoesNotContain("secret-detail", exception.Message);
    }

    private static SupabaseHarvestLedger CreateLedger(HttpClient http) => new(
        http,
        new SupabaseSettings { Url = "http://127.0.0.1:55421", AnonKey = "public-anon-key" },
        new StubCurrentUser(),
        NullLogger<SupabaseHarvestLedger>.Instance);

    private sealed class StubCurrentUser : ICurrentUser
    {
        public Guid UserId { get; } = Guid.NewGuid();
        public string AccessToken => "verified-user-token";
    }

    private sealed class StubHandler(Func<HttpRequestMessage, Task<HttpResponseMessage>> send) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request, CancellationToken cancellationToken) => send(request);
    }
}
