using System.Globalization;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Logging;
using PersonalFinance.Application.Dtos;
using PersonalFinance.Application.Interfaces;

namespace PersonalFinance.Infrastructure.Supabase;

/// <summary>Reads and writes the harvest ledger with the caller's own JWT, so owner RLS applies.</summary>
public sealed class SupabaseHarvestLedger(
    HttpClient http, SupabaseSettings settings, ICurrentUser caller, ILogger<SupabaseHarvestLedger> logger)
    : IHarvestLedger
{
    private const string DateFormat = "yyyy-MM-dd";

    public async Task UpsertMonthsAsync(
        IReadOnlyList<HarvestMonthRecord> months, bool insertedAsSeen = false, CancellationToken ct = default)
    {
        if (months.Count == 0) return;
        var rows = months.Select(m => new
        {
            month = m.Month.ToString(DateFormat, CultureInfo.InvariantCulture),
            income_idr = m.IncomeIdr,
            expense_idr = m.ExpenseIdr,
            result = m.Result,
            accounts_covered = m.AccountsCovered,
            accounts_total = m.AccountsTotal,
        }).ToArray();
        using var _ = await SendAsync(HttpMethod.Post, "rpc/upsert_harvest_months", new { p_rows = rows, p_seen = insertedAsSeen }, ct);
    }

    public async Task<IReadOnlyList<HarvestLedgerRow>> ListAsync(CancellationToken ct = default)
    {
        using var response = await SendAsync(HttpMethod.Get,
            "harvest_months?select=month,income_idr,expense_idr,result,accounts_covered,accounts_total,seen_at"
            + "&order=month.desc&limit=120", null, ct);
        var rows = await response.Content.ReadFromJsonAsync<List<LedgerRowJson>>(ct) ?? [];
        return rows.Select(r => new HarvestLedgerRow(
            new HarvestMonthRecord(
                DateOnly.ParseExact(r.Month, DateFormat, CultureInfo.InvariantCulture),
                r.IncomeIdr, r.ExpenseIdr, r.Result, r.AccountsCovered, r.AccountsTotal),
            r.SeenAt is not null)).ToList();
    }

    public async Task MarkSeenAsync(
        IReadOnlyList<long> completionIds, DateOnly? throughMonth, CancellationToken ct = default)
    {
        using var _ = await SendAsync(HttpMethod.Post, "rpc/mark_harvest_seen", new
        {
            p_completion_ids = completionIds,
            p_through_month = throughMonth?.ToString(DateFormat, CultureInfo.InvariantCulture),
        }, ct);
    }

    private async Task<HttpResponseMessage> SendAsync(
        HttpMethod method, string path, object? payload, CancellationToken ct)
    {
        _ = caller.UserId; // fails fast when the request has no verified user
        using var request = new HttpRequestMessage(method, $"{settings.Url.TrimEnd('/')}/rest/v1/{path}");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", caller.AccessToken);
        request.Headers.Add("apikey", settings.AnonKey);
        if (payload is not null) request.Content = JsonContent.Create(payload);

        var response = await http.SendAsync(request, ct);
        if (response.IsSuccessStatusCode) return response;

        var status = (int)response.StatusCode;
        response.Dispose();
        logger.LogError("Harvest ledger call {Path} failed with HTTP {Status}", path.Split('?')[0], status);
        throw new HarvestLedgerException(status);
    }

    private sealed record LedgerRowJson(
        [property: JsonPropertyName("month")] string Month,
        [property: JsonPropertyName("income_idr")] decimal IncomeIdr,
        [property: JsonPropertyName("expense_idr")] decimal ExpenseIdr,
        [property: JsonPropertyName("result")] string Result,
        [property: JsonPropertyName("accounts_covered")] int AccountsCovered,
        [property: JsonPropertyName("accounts_total")] int AccountsTotal,
        [property: JsonPropertyName("seen_at")] DateTimeOffset? SeenAt);
}

/// <summary>A harvest ledger call failed. The message carries only the HTTP status (ERR-01).</summary>
public sealed class HarvestLedgerException(int status)
    : Exception($"Harvest ledger request failed with HTTP {status}.");
