using MediatR;
using Microsoft.AspNetCore.Mvc;
using PersonalFinance.Application.Commands.Investments;
using PersonalFinance.Application.Dtos;
using PersonalFinance.Application.Investments;
using PersonalFinance.Domain.Entities;
using static Supabase.Postgrest.Constants;

namespace PersonalFinance.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class InvestmentsController(IMediator mediator, Supabase.Client supabase) : ControllerBase
{
    // ── Archetypes ─────────────────────────────────────────────────────────────

    [HttpGet("archetypes")]
    public IActionResult GetArchetypes() => Ok(ArchetypeCatalog.All.Values);

    // ── Setups ─────────────────────────────────────────────────────────────────

    [HttpGet("setups")]
    public async Task<IActionResult> GetSetups()
    {
        var result = await supabase.From<InvestmentSetup>().Order("created_at", Ordering.Descending).Get();
        return Ok(result.Models.Select(ToSetupDto));
    }

    [HttpGet("setups/{id:guid}")]
    public async Task<IActionResult> GetSetup(Guid id)
    {
        var setupResult = await supabase.From<InvestmentSetup>()
            .Filter("id", Operator.Equals, id.ToString()).Get();
        var setup = setupResult.Models.FirstOrDefault();
        if (setup is null) return NotFound();

        var holdingsResult = await supabase.From<InvestmentHolding>()
            .Filter("setup_id", Operator.Equals, id.ToString()).Get();

        return Ok(new
        {
            Setup = ToSetupDto(setup),
            Holdings = holdingsResult.Models.Select(ToHoldingDto),
        });
    }

    [HttpPost("setups")]
    public async Task<IActionResult> CreateSetup(CreateInvestmentSetupCommand command)
    {
        var created = await mediator.Send(command);
        return Ok(ToSetupDto(created));
    }

    [HttpPut("setups/{id:guid}")]
    public async Task<IActionResult> UpdateSetup(Guid id, UpdateInvestmentSetupCommand command)
    {
        var updated = await mediator.Send(command with { Id = id });
        if (updated is null) return NotFound();
        return Ok(ToSetupDto(updated));
    }

    [HttpDelete("setups/{id:guid}")]
    public async Task<IActionResult> DeleteSetup(Guid id)
    {
        await mediator.Send(new DeleteInvestmentSetupCommand(id));
        return Ok();
    }

    // ── Holdings ──────────────────────────────────────────────────────────────

    [HttpPut("setups/{id:guid}/holdings")]
    public async Task<IActionResult> UpsertHoldings(Guid id, [FromBody] UpsertHoldingsRequest body)
    {
        var holdings = await mediator.Send(new UpsertInvestmentHoldingsCommand(id, body.Holdings));
        return Ok(holdings.Select(ToHoldingDto));
    }

    // ── Review ────────────────────────────────────────────────────────────────

    [HttpPost("setups/{id:guid}/review")]
    public async Task<IActionResult> RunReview(Guid id, [FromBody] RunReviewRequest body)
    {
        var snapshot = await mediator.Send(new RunPortfolioReviewCommand(
            id, body.Label, body.TotalValue, body.Currency ?? "IDR",
            body.Provider, body.Model));
        return Ok(ToSnapshotDto(snapshot));
    }

    // ── Snapshots ─────────────────────────────────────────────────────────────

    [HttpGet("setups/{id:guid}/snapshots/{snapshotId:guid}")]
    public async Task<IActionResult> GetSnapshot(Guid id, Guid snapshotId)
    {
        var result = await supabase.From<InvestmentSnapshot>()
            .Filter("id", Operator.Equals, snapshotId.ToString())
            .Filter("setup_id", Operator.Equals, id.ToString())
            .Get();
        var snapshot = result.Models.FirstOrDefault();
        if (snapshot is null) return NotFound();
        return Ok(ToSnapshotDto(snapshot));
    }

    // ── Mappers ───────────────────────────────────────────────────────────────

    private static InvestmentSetupDto ToSetupDto(InvestmentSetup s) =>
        new(s.Id, s.Name, s.ArchetypeId, s.BaseCurrency, s.CreatedAt, s.UpdatedAt);

    private static InvestmentHoldingDto ToHoldingDto(InvestmentHolding h) =>
        new(h.Id, h.SetupId, h.Ticker, h.Name, h.AssetClass, h.Sector,
            h.AllocationPct, h.Quantity, h.AvgBuyPrice);

    private static InvestmentSnapshotDto ToSnapshotDto(InvestmentSnapshot s) =>
        new(s.Id, s.SetupId, s.Label, s.SnapshotDate, s.TotalValue, s.Currency,
            s.AiProvider, s.AiModel, s.AnalysisJson, s.CreatedAt);
}

// ── Request body types ────────────────────────────────────────────────────────

public record UpsertHoldingsRequest(List<InvestmentHoldingDto> Holdings);

public record RunReviewRequest(
    string Label,
    decimal? TotalValue = null,
    string? Currency = "IDR",
    string? Provider = null,
    string? Model = null
);
