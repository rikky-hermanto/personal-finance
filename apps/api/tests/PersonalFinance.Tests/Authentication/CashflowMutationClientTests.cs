using System.Net;
using System.Text.Json;
using PersonalFinance.Application.Dtos;
using PersonalFinance.Application.Interfaces;
using PersonalFinance.Infrastructure.Supabase;

namespace PersonalFinance.Tests.Authentication;

public sealed class CashflowMutationClientTests
{
    [Fact]
    public async Task SubmitAsync_UsesVerifiedCallerJwtWithoutSendingOwner()
    {
        string? authorization = null;
        string? apiKey = null;
        string? body = null;
        using var http = new HttpClient(new StubHandler(async request =>
        {
            authorization = request.Headers.Authorization?.ToString();
            apiKey = request.Headers.GetValues("apikey").Single();
            body = await request.Content!.ReadAsStringAsync();
            return new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent("{\"insertedIds\":[42],\"insertedCount\":1,\"duplicateCount\":0}")
            };
        }));
        var service = CreateService(http);

        var result = await service.SubmitAsync(Guid.NewGuid(), [new TransactionDto
        {
            Date = new DateTime(2026, 10, 9, 1, 2, 3, DateTimeKind.Utc),
            Description = "salary", Flow = "CR", Type = "Income", Category = "Income",
            AmountIdr = 100.005m, Currency = "IDR"
        }], null, null);

        Assert.Equal("Bearer verified-user-token", authorization);
        Assert.Equal("public-anon-key", apiKey);
        Assert.Equal([42], result.InsertedIds);
        using var parsed = JsonDocument.Parse(body!);
        Assert.False(parsed.RootElement.TryGetProperty("user_id", out _));
        var row = parsed.RootElement.GetProperty("p_rows")[0];
        Assert.False(row.TryGetProperty("user_id", out _));
        Assert.Equal(100.005m, row.GetProperty("amount_idr").GetDecimal());
    }

    [Fact]
    public async Task SubmitAsync_ChangedRequestIdPayload_MapsSafeConflict()
    {
        using var http = new HttpClient(new StubHandler(_ => Task.FromResult(
            new HttpResponseMessage(HttpStatusCode.BadRequest)
            {
                Content = new StringContent("{\"code\":\"P0001\",\"message\":\"idempotency_conflict\"}")
            })));
        var service = CreateService(http);

        var exception = await Assert.ThrowsAsync<CashflowMutationException>(() =>
            service.SubmitAsync(Guid.NewGuid(), [new TransactionDto()], null, null));

        Assert.Equal(CashflowMutationFailure.IdempotencyConflict, exception.Failure);
        Assert.DoesNotContain("P0001", exception.Message);
    }

    private static SupabaseCashflowMutationService CreateService(HttpClient http) => new(
        http,
        new SupabaseSettings { Url = "http://127.0.0.1:55421", AnonKey = "public-anon-key" },
        new StubCurrentUser());

    private sealed class StubCurrentUser : ICurrentUser
    {
        public Guid UserId { get; } = Guid.NewGuid();
        public string AccessToken => "verified-user-token";
    }

    private sealed class StubHandler(Func<HttpRequestMessage, Task<HttpResponseMessage>> send)
        : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request, CancellationToken cancellationToken) => send(request);
    }
}
