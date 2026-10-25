using MediatR;
using Microsoft.AspNetCore.Mvc;
using PersonalFinance.Application.Commands.Journey;
using PersonalFinance.Application.Dtos;
using PersonalFinance.Application.Interfaces;

namespace PersonalFinance.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class JourneyController(
    IMediator mediator,
    IJourneyScoringService scoringService,
    IJourneyAdvisorClient advisorClient,
    IJourneyConfirmationService confirmation,
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

    [HttpGet("no-debts")]
    public async Task<ActionResult<NoDebtsConfirmationDto>> GetNoDebts(CancellationToken ct)
    {
        var confirmedAt = await confirmation.GetNoDebtsConfirmedAtAsync(caller.UserId, ct);
        return Ok(new NoDebtsConfirmationDto(confirmedAt));
    }

    [HttpPut("no-debts")]
    public async Task<ActionResult<NoDebtsConfirmationDto>> ConfirmNoDebts(CancellationToken ct)
    {
        var result = await mediator.Send(new SetNoDebtsConfirmationCommand(caller.UserId, true), ct);
        return Ok(result);
    }

    [HttpDelete("no-debts")]
    public async Task<ActionResult<NoDebtsConfirmationDto>> ClearNoDebts(CancellationToken ct)
    {
        var result = await mediator.Send(new SetNoDebtsConfirmationCommand(caller.UserId, false), ct);
        return Ok(result);
    }
}
