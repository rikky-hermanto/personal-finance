using System.Globalization;
using System.Net;
using System.Text.Json;
using Microsoft.Extensions.Logging.Abstractions;
using PersonalFinance.Infrastructure.Services;
using PersonalFinance.Infrastructure.Supabase;
using PersonalFinance.Tests.Support;
using static PersonalFinance.Tests.Cashflow.CashflowRows;

namespace PersonalFinance.Tests.Cashflow;

/// <summary>
/// JisdorFxRateService: Bank Indonesia's HTTP source is stubbed with a handler; the fx_rates cache
/// (user client for reads, service-role client for writes) runs on FakePostgrest. An FX error
/// multiplies through every foreign-currency row, so each rate is checked exactly.
/// </summary>
public sealed class JisdorFxRateServiceTests
{
    private const string ServiceKey = "service-role-test-key"; // commit-skill:allow (made-up test value)
    private static readonly DateOnly RateDate = new(2026, 3, 10);

    private sealed class StubHandler(Func<HttpRequestMessage, HttpResponseMessage> send) : HttpMessageHandler
    {
        public List<Uri> Calls { get; } = [];

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Calls.Add(request.RequestUri!);
            return Task.FromResult(send(request));
        }
    }

    private static HttpResponseMessage Jisdor(string rate) =>
        new(HttpStatusCode.OK) { Content = new StringContent($$$"""{"data":{"rate":"{{{rate}}}"}}""") };

    private static string CachedRow(decimal rate, string date = "2026-03-10") => JsonSerializer.Serialize(new
    {
        id = Guid.NewGuid(), currency_from = "USD", currency_to = "IDR", rate, source = "jisdor",
        rate_date = $"{date}T00:00:00+00:00", created_at = "2026-03-10T01:00:00+00:00",
    });

    private const string NoRow = """{"code":"PGRST116","message":"JSON object requested, multiple (or no) rows returned"}""";

    private static async Task<(FakePostgrest Fake, StubHandler Http, JisdorFxRateService Service)> StartAsync(
        Func<HttpRequestMessage, HttpResponseMessage> bankIndonesia, string? serviceKey = ServiceKey)
    {
        var fake = await FakePostgrest.StartAsync();
        var handler = new StubHandler(bankIndonesia);
        var service = new JisdorFxRateService(
            new HttpClient(handler), await fake.CreateClientAsync(),
            new SupabaseSettings { Url = fake.Url, AnonKey = "anon-key", ServiceRoleKey = serviceKey ?? "" },
            NullLogger<JisdorFxRateService>.Instance);
        return (fake, handler, service);
    }

    /// <summary>Exact-date cache lookups filter on rate_date; the stale fallback orders by it instead.</summary>
    private static bool IsExactDateLookup(RecordedRequest r) => Query(r).Contains("rate_date=eq.");

    [Fact]
    public async Task GetRateToIdrAsync_Idr_ReturnsOneWithoutAnyCall()
    {
        // Arrange
        var (fake, http, service) = await StartAsync(_ => throw new InvalidOperationException("no call expected"));
        await using var _ = fake;

        // Act
        var rate = await service.GetRateToIdrAsync("idr");

        // Assert
        Assert.Equal(1m, rate);
        Assert.Empty(fake.Requests);
        Assert.Empty(http.Calls);
    }

    [Fact]
    public async Task GetRateToIdrAsync_CacheHit_ReturnsCachedRateWithoutCallingBankIndonesia()
    {
        // Arrange
        var (fake, http, service) = await StartAsync(_ => throw new InvalidOperationException("no call expected"));
        await using var _ = fake;
        fake.On("GET", "fx_rates", CachedRow(16_450.25m));

        // Act
        var rate = await service.GetRateToIdrAsync("usd", RateDate);

        // Assert
        Assert.Equal(16_450.25m, rate);
        Assert.Empty(http.Calls);
        var request = Assert.Single(fake.Requests);
        Assert.Equal("?currency_from=eq.USD&currency_to=eq.IDR&rate_date=eq.2026-03-10", Query(request));
        Assert.Equal("application/vnd.pgrst.object+json", request.Headers["Accept"]);
        Assert.Equal($"Bearer {TestCaller.Token}", request.Headers["Authorization"]);
    }

    [Fact]
    public async Task GetRateToIdrAsync_CacheMiss_FetchesJisdorAndCachesWithServiceRoleClient()
    {
        // Arrange
        var (fake, http, service) = await StartAsync(_ => Jisdor("16450.00"));
        await using var _ = fake;
        fake.On("GET", "fx_rates", NoRow, 406);
        fake.On("POST", "fx_rates", "[" + CachedRow(16_450.00m) + "]", 201);

        // Act
        var rate = await service.GetRateToIdrAsync("USD", RateDate);

        // Assert
        Assert.Equal(16_450.00m, rate);
        Assert.Equal("https://api.bi.go.id/v1/jisdor/rates?date=2026-03-10&currency=USD", Assert.Single(http.Calls).ToString());
        var insert = Assert.Single(fake.RequestsTo("POST", "fx_rates"));
        Assert.Equal($"Bearer {ServiceKey}", insert.Headers["Authorization"]); // the cache writer, not the user
        using var body = JsonDocument.Parse(insert.Body);
        Assert.Equal("USD", body.RootElement.GetProperty("currency_from").GetString());
        Assert.Equal("IDR", body.RootElement.GetProperty("currency_to").GetString());
        Assert.Equal(16_450.00m, body.RootElement.GetProperty("rate").GetDecimal());
        Assert.Equal("jisdor", body.RootElement.GetProperty("source").GetString());
        Assert.StartsWith("2026-03-10T00:00:00", body.RootElement.GetProperty("rate_date").GetString());
    }

    [Fact]
    public async Task GetRateToIdrAsync_IndonesianCulture_ParsesBankIndonesiaRateExactly()
    {
        // Arrange: BI sends "16450.00" (a dot decimal). On a host whose culture is id-ID, where "." is
        // the thousands separator, the rate must still be 16,450.00, not 1,645,000.
        var (fake, _, service) = await StartAsync(_ => Jisdor("16450.00"), serviceKey: null);
        await using var __ = fake;
        fake.On("GET", "fx_rates", NoRow, 406);
        var original = CultureInfo.CurrentCulture;

        decimal rate;
        try
        {
            CultureInfo.CurrentCulture = new CultureInfo("id-ID");

            // Act
            rate = await service.GetRateToIdrAsync("USD", RateDate);
        }
        finally
        {
            CultureInfo.CurrentCulture = original;
        }

        // Assert
        Assert.Equal(16_450.00m, rate);
    }

    [Fact]
    public async Task GetRateToIdrAsync_NoServiceRoleKey_ReturnsRateWithoutCaching()
    {
        // Arrange
        var (fake, _, service) = await StartAsync(_ => Jisdor("10820.50"), serviceKey: null);
        await using var __ = fake;
        fake.On("GET", "fx_rates", NoRow, 406);

        // Act
        var rate = await service.GetRateToIdrAsync("SGD", RateDate);

        // Assert
        Assert.Equal(10_820.50m, rate);
        Assert.Empty(fake.RequestsTo("POST", "fx_rates"));
    }

    [Fact]
    public async Task GetRateToIdrAsync_CacheInsertConflicts_StillReturnsFetchedRate()
    {
        // Arrange: another request cached the same day first (unique violation).
        var (fake, _, service) = await StartAsync(_ => Jisdor("16450.00"));
        await using var __ = fake;
        fake.On("GET", "fx_rates", NoRow, 406);
        fake.On("POST", "fx_rates", """{"code":"23505","message":"duplicate key value"}""", 409);

        // Act
        var rate = await service.GetRateToIdrAsync("USD", RateDate);

        // Assert
        Assert.Equal(16_450.00m, rate);
        Assert.Single(fake.RequestsTo("POST", "fx_rates"));
    }

    [Theory]
    [InlineData(HttpStatusCode.ServiceUnavailable, "")]
    [InlineData(HttpStatusCode.OK, """{"unexpected":true}""")]
    public async Task GetRateToIdrAsync_BankIndonesiaFails_FallsBackToLatestCachedRate(HttpStatusCode status, string body)
    {
        // Arrange
        var (fake, _, service) = await StartAsync(_ => new HttpResponseMessage(status) { Content = new StringContent(body) });
        await using var __ = fake;
        fake.On("GET", "fx_rates", r => IsExactDateLookup(r)
            ? new FakeResponse(NoRow, 406)
            : new FakeResponse(CachedRow(16_390.75m, "2026-03-06")));

        // Act
        var rate = await service.GetRateToIdrAsync("USD", RateDate);

        // Assert
        Assert.Equal(16_390.75m, rate);
        var fallback = fake.RequestsTo("GET", "fx_rates").Last();
        Assert.Equal("?currency_from=eq.USD&currency_to=eq.IDR&order=rate_date.desc.nullsfirst&limit=1", Query(fallback));
        Assert.Empty(fake.RequestsTo("POST", "fx_rates"));
    }

    [Fact]
    public async Task GetRateToIdrAsync_NoSourceAndNoCache_ThrowsWithoutInventingRate()
    {
        // Arrange
        var (fake, _, service) = await StartAsync(_ => new HttpResponseMessage(HttpStatusCode.BadGateway));
        await using var __ = fake;
        fake.On("GET", "fx_rates", NoRow, 406);

        // Act
        var exception = await Assert.ThrowsAsync<InvalidOperationException>(() => service.GetRateToIdrAsync("EUR", RateDate));

        // Assert
        Assert.Contains("EUR/IDR", exception.Message);
    }

    [Fact]
    public async Task RefreshDailyRatesAsync_OneCurrencyFails_CachesTheOtherSix()
    {
        // Arrange
        var (fake, http, service) = await StartAsync(request =>
            request.RequestUri!.Query.Contains("currency=JPY")
                ? new HttpResponseMessage(HttpStatusCode.InternalServerError)
                : Jisdor("1000.00"));
        await using var __ = fake;
        fake.On("POST", "fx_rates", "[]", 201);

        // Act
        await service.RefreshDailyRatesAsync();

        // Assert
        Assert.Equal(7, http.Calls.Count);
        var cached = fake.RequestsTo("POST", "fx_rates")
            .Select(r => JsonDocument.Parse(r.Body).RootElement.GetProperty("currency_from").GetString())
            .ToList();
        Assert.Equal(["USD", "EUR", "SGD", "AUD", "GBP", "MYR"], cached);
    }
}
