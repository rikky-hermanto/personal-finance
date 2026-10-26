using MediatR;
using Microsoft.AspNetCore.Mvc;
using PersonalFinance.Application.Commands.Journey;
using PersonalFinance.Application.Commands.Quests;
using PersonalFinance.Application.Dtos;
using PersonalFinance.Application.Interfaces;

namespace PersonalFinance.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class JourneyController(
    IMediator mediator,
    IJourneyScoringService scoringService,
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
    public async Task<ActionResult<QuestBoardDto>> GetQuests(CancellationToken ct)
        => Ok(await mediator.Send(new GetQuestBoardQuery(caller.UserId), ct));

    [HttpPost("quests/{code}/focus")]
    public async Task<ActionResult<QuestBoardDto>> SetFocus(string code, CancellationToken ct)
        => Ok(await mediator.Send(new SetQuestFocusCommand(caller.UserId, code), ct));

    [HttpPost("quests/{code}/snooze")]
    public async Task<ActionResult<QuestBoardDto>> Snooze(string code, CancellationToken ct)
        => Ok(await mediator.Send(new SnoozeQuestCommand(caller.UserId, code), ct));

    [HttpPost("quests/seen")]
    public async Task<IActionResult> MarkSeen([FromBody] MarkQuestsSeenRequest body, CancellationToken ct)
    {
        await mediator.Send(new MarkQuestsSeenCommand(caller.UserId, body.Ids), ct);
        return NoContent();
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

public sealed record MarkQuestsSeenRequest(IReadOnlyList<long> Ids);
