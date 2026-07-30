using MediatR;
using Microsoft.AspNetCore.Mvc;
using PersonalFinance.Application.Commands.Desk;
using PersonalFinance.Application.Interfaces;

namespace PersonalFinance.Api.Controllers;

[ApiController]
[Route("api/desk")]
public class DeskController(IMediator mediator, IDeskService deskService, IDeskMandateService mandateService) : ControllerBase
{
    [HttpGet("state")]
    public async Task<IActionResult> GetState()
    {
        var state = await deskService.GetStateAsync();
        return Ok(state);
    }

    [HttpGet("mandate/versions")]
    public async Task<IActionResult> GetMandateVersions()
    {
        var versions = await mandateService.GetVersionsAsync();
        return Ok(versions);
    }

    [HttpPost("mandate/draft")]
    public async Task<IActionResult> SaveMandateDraft(SaveMandateDraftCommand command)
    {
        var draft = await mediator.Send(command);
        return Ok(draft);
    }

    [HttpPost("mandate/approve")]
    public async Task<IActionResult> ApproveMandate(ApproveMandateCommand command)
    {
        var approved = await mediator.Send(command);
        return Ok(approved);
    }

    [HttpPost("recon/{id:guid}/resolve")]
    public async Task<IActionResult> ResolveReconIssue(Guid id, [FromBody] ResolveReconIssueRequest request)
    {
        var resolved = await mediator.Send(new ResolveReconIssueCommand(id, request.Resolution));
        return Ok(resolved);
    }

    [HttpPut("positions/{id:guid}/sleeve")]
    public async Task<IActionResult> SetPositionSleeve(Guid id, [FromBody] SetPositionSleeveRequest request)
    {
        var updated = await mediator.Send(new SetPositionSleeveCommand(id, request.Sleeve));
        return Ok(updated);
    }
}

public record ResolveReconIssueRequest(string Resolution);
public record SetPositionSleeveRequest(string Sleeve);
