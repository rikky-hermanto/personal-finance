using MediatR;
using Microsoft.AspNetCore.Mvc;
using PersonalFinance.Application.Commands.Assets;
using PersonalFinance.Application.Commands.Holdings;
using PersonalFinance.Application.Commands.Valuations;
using PersonalFinance.Application.Dtos;
using PersonalFinance.Application.Interfaces;
using PersonalFinance.Domain.Entities;
using static Supabase.Postgrest.Constants;

namespace PersonalFinance.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AssetsController(
    IMediator mediator,
    Supabase.Client supabase,
    IValuationService valuationService
) : ControllerBase
{
    // ── Assets ────────────────────────────────────────────────────────────────

    [HttpGet]
    public async Task<IActionResult> GetAssets()
    {
        var result = await supabase.From<Asset>().Order("name", Ordering.Ascending).Get();
        var dtos = result.Models.Select(a => ToAssetDto(a));
        return Ok(dtos);
    }

    [HttpPost]
    public async Task<IActionResult> CreateAsset(CreateAssetCommand command)
    {
        var created = await mediator.Send(command);
        return Ok(ToAssetDto(created));
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> UpdateAsset(Guid id, UpdateAssetCommand command)
    {
        var updated = await mediator.Send(command with { Id = id });
        if (updated == null) return NotFound();
        return Ok(ToAssetDto(updated));
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> DeleteAsset(Guid id)
    {
        var deleted = await mediator.Send(new DeleteAssetCommand(id));
        if (!deleted) return NotFound();
        return Ok();
    }

    // ── Holdings ──────────────────────────────────────────────────────────────

    [HttpGet("holdings")]
    public async Task<IActionResult> GetHoldings([FromQuery] Guid? accountId = null)
    {
        var query = supabase.From<Holding>();
        if (accountId.HasValue)
            query.Filter("account_id", Operator.Equals, accountId.Value.ToString());

        var result = await query.Order("ticker", Ordering.Ascending).Get();
        var dtos = result.Models.Select(h => new HoldingDto(h.Id, h.AccountId, h.Ticker, h.Quantity, h.CostBasis, h.Currency));
        return Ok(dtos);
    }

    [HttpPost("holdings")]
    public async Task<IActionResult> CreateHolding(CreateHoldingCommand command)
    {
        var created = await mediator.Send(command);
        return Ok(new HoldingDto(created.Id, created.AccountId, created.Ticker, created.Quantity, created.CostBasis, created.Currency));
    }

    [HttpPut("holdings/{id:guid}")]
    public async Task<IActionResult> UpdateHolding(Guid id, UpdateHoldingCommand command)
    {
        var updated = await mediator.Send(command with { Id = id });
        if (updated == null) return NotFound();
        return Ok(new HoldingDto(updated.Id, updated.AccountId, updated.Ticker, updated.Quantity, updated.CostBasis, updated.Currency));
    }

    [HttpDelete("holdings/{id:guid}")]
    public async Task<IActionResult> DeleteHolding(Guid id)
    {
        var deleted = await mediator.Send(new DeleteHoldingCommand(id));
        if (!deleted) return NotFound();
        return Ok();
    }

    // ── Valuations ────────────────────────────────────────────────────────────

    [HttpGet("valuations/{subjectType}/{subjectId:guid}")]
    public async Task<IActionResult> GetValuations(string subjectType, Guid subjectId)
    {
        var history = await valuationService.GetHistoryAsync(subjectType, subjectId);
        var dtos = history.Select(v => ToValuationDto(v));
        return Ok(dtos);
    }

    [HttpPost("valuations")]
    public async Task<IActionResult> CreateValuation(CreateValuationCommand command)
    {
        var created = await mediator.Send(command);
        return Ok(ToValuationDto(created));
    }

    [HttpDelete("valuations/{id:guid}")]
    public async Task<IActionResult> DeleteValuation(Guid id)
    {
        var deleted = await mediator.Send(new DeleteValuationCommand(id));
        if (!deleted) return NotFound();
        return Ok();
    }

    private static AssetDto ToAssetDto(Asset a) => new(
        a.Id, a.Name, a.AssetClass, a.AccountId,
        a.AcquiredDate.HasValue ? DateOnly.FromDateTime(a.AcquiredDate.Value) : null,
        a.AcquisitionCost, a.Currency, a.ValuationStrategy, a.Metadata
    );

    private static ValuationDto ToValuationDto(Valuation v) => new(
        v.Id, v.SubjectType, v.SubjectId, v.ValueNative, v.Currency,
        v.FxRateToIdr, v.ValueIdr, v.Source, v.Notes, v.ValuedAt
    );
}
