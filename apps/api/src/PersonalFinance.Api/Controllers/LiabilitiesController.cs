using MediatR;
using Microsoft.AspNetCore.Mvc;
using PersonalFinance.Application.Commands.Liabilities;
using PersonalFinance.Application.Dtos;
using PersonalFinance.Application.Interfaces;
using PersonalFinance.Domain.Entities;
using static Supabase.Postgrest.Constants;

namespace PersonalFinance.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class LiabilitiesController(
    IMediator mediator,
    Supabase.Client supabase,
    IValuationService valuationService
) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var result = await supabase.From<Liability>().Order("name", Ordering.Ascending).Get();

        var dtos = new List<LiabilityDto>();
        foreach (var l in result.Models)
        {
            decimal? ltv = null;
            if (l.AssetId.HasValue)
            {
                var latest = await valuationService.GetLatestAsync("asset", l.AssetId.Value);
                if (latest != null && latest.ValueIdr > 0)
                    ltv = l.Principal / latest.ValueIdr;
            }

            dtos.Add(ToDto(l, ltv));
        }

        return Ok(dtos);
    }

    [HttpPost]
    public async Task<IActionResult> Create(CreateLiabilityCommand command)
    {
        var created = await mediator.Send(command);
        return Ok(ToDto(created, null));
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, UpdateLiabilityCommand command)
    {
        var updated = await mediator.Send(command with { Id = id });
        if (updated == null) return NotFound();
        return Ok(ToDto(updated, null));
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var deleted = await mediator.Send(new DeleteLiabilityCommand(id));
        if (!deleted) return NotFound();
        return Ok();
    }

    private static LiabilityDto ToDto(Liability l, decimal? ltv) => new(
        l.Id, l.Name, l.LiabilityType, l.AccountId, l.AssetId,
        l.Principal, l.InterestRate,
        DateOnly.FromDateTime(l.StartDate),
        l.EndDate.HasValue ? DateOnly.FromDateTime(l.EndDate.Value) : null,
        l.MonthlyPayment, ltv
    );
}
