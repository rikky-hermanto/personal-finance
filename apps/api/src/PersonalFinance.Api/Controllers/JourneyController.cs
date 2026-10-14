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
    IJourneyAdvisorClient advisorClient,
    ICurrentUser caller)
    : ControllerBase
{

    [HttpGet("state")]
    public async Task<ActionResult<JourneyStateDto>> GetState(CancellationToken ct)
    {
        var state = await scoringService.GetStateAsync(caller.UserId, ct);
        return Ok(state);
    }

    [HttpPost("recalculate")]
    public async Task<ActionResult<JourneyStateDto>> Recalculate(CancellationToken ct)
    {
        var state = await mediator.Send(new RecalculateJourneyCommand(caller.UserId), ct);
        return Ok(state);
    }

    [HttpGet("quests")]
    public async Task<ActionResult<List<JourneyQuestDto>>> GetQuests(CancellationToken ct)
    {
        var state = await scoringService.GetStateAsync(caller.UserId, ct);
        var quests = await advisorClient.GenerateQuestsAsync(state, ct);
        return Ok(quests);
    }
}
