using MediatR;
using Microsoft.AspNetCore.Mvc;
using PersonalFinance.Application.Dtos;
using PersonalFinance.Application.Interfaces;

namespace PersonalFinance.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class JourneyController(
    IMediator mediator,
    IJourneyScoringService scoringService,
    IJourneyAdvisorClient advisorClient)
    : ControllerBase
{
    // TODO PF-S08: replace with User.FindFirst("sub")?.Value
    private static readonly Guid PlaceholderUserId = Guid.Parse("00000000-0000-0000-0000-000000000001");

    [HttpGet("state")]
    public async Task<ActionResult<JourneyStateDto>> GetState(CancellationToken ct)
    {
        var state = await scoringService.GetStateAsync(PlaceholderUserId, ct);
        return Ok(state);
    }

    [HttpPost("recalculate")]
    public async Task<ActionResult<JourneyStateDto>> Recalculate(CancellationToken ct)
    {
        var state = await mediator.Send(new RecalculateJourneyCommand(PlaceholderUserId), ct);
        return Ok(state);
    }

    [HttpGet("quests")]
    public async Task<ActionResult<List<JourneyQuestDto>>> GetQuests(CancellationToken ct)
    {
        var state = await scoringService.GetStateAsync(PlaceholderUserId, ct);
        var quests = await advisorClient.GenerateQuestsAsync(state, ct);
        return Ok(quests);
    }
}
