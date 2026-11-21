using MediatR;
using Microsoft.AspNetCore.Mvc;
using PersonalFinance.Application.Commands.Goals;
using PersonalFinance.Application.Dtos;

namespace PersonalFinance.Api.Controllers;

/// <summary>Goals (PF-154, Big Purchases first). Money crosses as JSON strings on every goal DTO (FIN-01).</summary>
[ApiController]
[Route("api/[controller]")]
public class GoalsController(IMediator mediator) : ControllerBase
{
    // PERF-02: default 50, max 200.
    private static (int Page, int PageSize) Clamp(int page, int pageSize) => (Math.Max(page, 1), Math.Clamp(pageSize, 1, 200));

    [HttpGet]
    public async Task<ActionResult<GoalPageDto>> List(
        [FromQuery] string? kind, [FromQuery] string? status, [FromQuery] int page = 1, [FromQuery] int pageSize = 50)
    {
        var (p, size) = Clamp(page, pageSize);
        return Ok(await mediator.Send(new GetGoalsQuery(kind, status, p, size)));
    }

    // Declared before the {id} routes; read-only, writes nothing.
    [HttpPost("preview")]
    public async Task<ActionResult<GoalPreviewDto>> Preview(PreviewGoalQuery query) =>
        Ok(await mediator.Send(query));

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<GoalDto>> Get(Guid id)
    {
        var goal = await mediator.Send(new GetGoalQuery(id));
        return goal is null ? NotFound() : Ok(goal);
    }

    [HttpPost]
    public async Task<ActionResult<GoalDto>> Create(CreateGoalCommand command) =>
        Ok(await mediator.Send(command));

    [HttpPut("{id:guid}")]
    public async Task<ActionResult<GoalDto>> Update(Guid id, UpdateGoalCommand command)
    {
        var goal = await mediator.Send(command with { Id = id });
        return goal is null ? NotFound() : Ok(goal);
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id) =>
        await mediator.Send(new DeleteGoalCommand(id)) ? NoContent() : NotFound();

    [HttpPut("{id:guid}/cost-items")]
    public async Task<ActionResult<GoalDto>> ReplaceCostItems(Guid id, ReplaceGoalCostItemsCommand command) =>
        Ok(await mediator.Send(command with { GoalId = id }));

    [HttpGet("{id:guid}/contributions")]
    public async Task<ActionResult<PagedResult<GoalContributionDto>>> Contributions(
        Guid id, [FromQuery] int page = 1, [FromQuery] int pageSize = 50)
    {
        var (p, size) = Clamp(page, pageSize);
        return Ok(await mediator.Send(new GetGoalContributionsQuery(id, p, size)));
    }

    [HttpPost("{id:guid}/contributions")]
    public async Task<ActionResult<GoalContributionDto>> AddContribution(Guid id, AddGoalContributionCommand command) =>
        Ok(await mediator.Send(command with { GoalId = id }));

    [HttpDelete("{id:guid}/contributions/{contributionId:guid}")]
    public async Task<IActionResult> DeleteContribution(Guid id, Guid contributionId) =>
        await mediator.Send(new DeleteGoalContributionCommand(id, contributionId)) ? NoContent() : NotFound();
}
