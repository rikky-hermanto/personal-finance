using Microsoft.Extensions.Logging;
using PersonalFinance.Application.Interfaces;
using PersonalFinance.Domain.Entities;
using System.Text.Json;
using static global::Supabase.Postgrest.Constants;

namespace PersonalFinance.Infrastructure.Services;

public class JisdorFxRateService(
    HttpClient http,
    global::Supabase.Client supabase,
    ILogger<JisdorFxRateService> logger
) : IFxRateService
{
    // JISDOR public endpoint (Bank Indonesia daily exchange rates)
    // Returns IDR per 1 foreign currency unit
    private const string JisdorBaseUrl = "https://www.bi.go.id/biwebservice/wskursbi.asmx";

    public async Task<decimal> GetRateToIdrAsync(string currencyFrom, DateOnly? date = null, CancellationToken ct = default)
    {
        if (string.Equals(currencyFrom, "IDR", StringComparison.OrdinalIgnoreCase))
            return 1m;

        var targetDate = date ?? DateOnly.FromDateTime(DateTime.UtcNow);

        // 1. Try cache first
        var cached = await supabase.From<FxRate>()
            .Filter("currency_from", Operator.Equals, currencyFrom.ToUpperInvariant())
            .Filter("currency_to", Operator.Equals, "IDR")
            .Filter("rate_date", Operator.Equals, targetDate.ToString("yyyy-MM-dd"))
            .Single();

        if (cached != null)
        {
            logger.LogDebug("FX cache hit: {CurrencyFrom}/IDR on {Date} = {Rate}", currencyFrom, targetDate, cached.Rate);
            return cached.Rate;
        }

        // 2. Fetch from JISDOR via Bank Indonesia API
        try
        {
            var rate = await FetchFromJisdorAsync(currencyFrom, targetDate, ct);
            await CacheRateAsync(currencyFrom, "IDR", rate, targetDate, "jisdor", ct);
            return rate;
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "JISDOR fetch failed for {Currency}, trying fallback", currencyFrom);
        }

        // 3. Fallback: use latest cached rate for this currency (any date)
        var fallback = await supabase.From<FxRate>()
            .Filter("currency_from", Operator.Equals, currencyFrom.ToUpperInvariant())
            .Filter("currency_to", Operator.Equals, "IDR")
            .Order("rate_date", Ordering.Descending)
            .Limit(1)
            .Single();

        if (fallback != null)
        {
            logger.LogWarning("Using stale FX rate for {Currency}: {Rate} from {Date}", currencyFrom, fallback.Rate, fallback.RateDate);
            return fallback.Rate;
        }

        throw new InvalidOperationException(
            $"No FX rate available for {currencyFrom}/IDR on {targetDate} and no cached fallback found.");
    }

    public async Task RefreshDailyRatesAsync(CancellationToken ct = default)
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var majors = new[] { "USD", "EUR", "SGD", "AUD", "GBP", "JPY", "MYR" };

        foreach (var currency in majors)
        {
            try
            {
                var rate = await FetchFromJisdorAsync(currency, today, ct);
                await CacheRateAsync(currency, "IDR", rate, today, "jisdor", ct);
                logger.LogInformation("Refreshed FX rate {Currency}/IDR = {Rate}", currency, rate);
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Failed to refresh FX rate for {Currency}", currency);
            }
        }
    }

    private async Task<decimal> FetchFromJisdorAsync(string currencyFrom, DateOnly date, CancellationToken ct)
    {
        // BI JISDOR API: GET https://api.bi.go.id/v1/jisdor/rates
        // Note: BI API URL may change — this uses the documented v1 endpoint
        var dateStr = date.ToString("yyyy-MM-dd");
        var url = $"https://api.bi.go.id/v1/jisdor/rates?date={dateStr}&currency={currencyFrom.ToUpperInvariant()}";

        var response = await http.GetAsync(url, ct);
        response.EnsureSuccessStatusCode();

        var json = await response.Content.ReadAsStringAsync(ct);
        var doc = JsonDocument.Parse(json);

        // BI API response structure: { "data": { "rate": "16450.00" } }
        if (doc.RootElement.TryGetProperty("data", out var data) &&
            data.TryGetProperty("rate", out var rateElement))
        {
            return decimal.Parse(rateElement.GetString() ?? "0");
        }

        throw new InvalidOperationException($"Unexpected JISDOR response format for {currencyFrom}: {json}");
    }

    private async Task CacheRateAsync(string from, string to, decimal rate, DateOnly rateDate, string source, CancellationToken ct)
    {
        var entity = new FxRate
        {
            Id = Guid.NewGuid(),
            CurrencyFrom = from.ToUpperInvariant(),
            CurrencyTo = to.ToUpperInvariant(),
            Rate = rate,
            Source = source,
            RateDate = rateDate.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc),
            CreatedAt = DateTime.UtcNow
        };

        try
        {
            await supabase.From<FxRate>().Insert(entity);
        }
        catch (Exception ex)
        {
            // Unique constraint violation is expected on duplicate inserts — not an error
            logger.LogDebug(ex, "FX rate cache insert skipped (likely duplicate): {From}/{To} {Date}", from, to, rateDate);
        }
    }
}
