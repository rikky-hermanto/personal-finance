using System.Text.Json;
using PersonalFinance.Application.Constants;
using PersonalFinance.Application.Dtos.Desk;
using PersonalFinance.Domain.Entities.Desk;

namespace PersonalFinance.Application.Services.Desk;

/// <summary>
/// Entity → DTO mapping for the desk module. Jsonb columns (params/options/tags) are stored as
/// raw JSON strings on the entity (supabase-csharp maps jsonb most predictably as string) and
/// deserialized here, in the service layer, never in Domain.
/// </summary>
public static class DeskMappers
{
    private static readonly JsonSerializerOptions JsonOpts = new() { PropertyNameCaseInsensitive = true };

    public static DeskBrokerAccountDto ToDto(DeskBrokerAccount a) => new(
        a.Id, a.ExternalKey, a.Name, a.Currency, a.ReportedEquity, a.ReportedEquityNative,
        a.Cash, a.CashNative, a.CashCurrencyNative, a.BuyingPower, a.BuyingPowerCurrency, a.Status);

    public static DeskPositionDto ToDto(DeskPosition p) => new(
        p.Id, p.Broker, p.Symbol, p.AssetClass, p.Qty, p.QtyShares, p.QtyLots,
        p.AvgPrice, p.AvgPriceNative, p.LastPrice, p.LastPriceNative,
        p.CostIdr, p.MvIdr, p.PnlIdr, p.PnlPct, p.Weight, p.Sleeve, p.StopPrice, p.Unconfirmed, p.EstimatedCostBasis);

    public static DeskReconIssueDto ToDto(DeskReconIssue r) => new(
        r.Id, r.ExternalKey, r.Label, r.Account, r.Amount, r.Currency, r.Resolution,
        JsonSerializer.Deserialize<List<List<string>>>(r.Options, JsonOpts) ?? new(), r.ResolvedAt);

    public static DeskJournalEntryDto ToDto(DeskJournalEntry j) => new(
        j.Id, DateOnly.FromDateTime(j.TradeDate), j.Symbol, j.Broker, j.Strategy,
        j.PlannedQty, j.ActualQty, j.EntryPrice, j.ExitPrice, j.NetPnl, j.RealizedR, j.Compliant,
        JsonSerializer.Deserialize<List<string>>(j.Tags, JsonOpts) ?? new());

    public static DeskMandateVersionDto ToDto(DeskMandateVersion m) => new(
        m.Id, m.Version, m.Status, m.Preset,
        JsonSerializer.Deserialize<MandateParamsDto>(m.Params, JsonOpts) ?? DeskDefaults.MandateDefault,
        m.EffectiveDate.HasValue ? DateOnly.FromDateTime(m.EffectiveDate.Value) : null,
        m.ChangeReason, m.ApprovedAt, m.CreatedAt);
}
