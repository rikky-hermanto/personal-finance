using FluentValidation;
using MediatR;
using Microsoft.Extensions.Logging;
using PersonalFinance.Application.Dtos;
using PersonalFinance.Application.Goals;
using PersonalFinance.Application.Interfaces;

namespace PersonalFinance.Application.Commands.Goals;

/// <summary>Status is "open" (active, paused), "closed" (achieved, cancelled) or one status. Default "open".
/// Not IAffectsJourney: goal reads and writes never trigger a recalculation (PF-154 decision 6).</summary>
public record GetGoalsQuery(string? Kind, string? Status, int Page = 1, int PageSize = 50) : IRequest<GoalPageDto>;

public class GetGoalsQueryHandler(
    IGoalService goals,
    IFoundationCheckService foundation,
    ICurrentUser caller,
    TimeProvider time,
    IValidator<GetGoalsQuery> validator,
    ILogger<GetGoalsQueryHandler> logger
) : IRequestHandler<GetGoalsQuery, GoalPageDto>
{
    public async Task<GoalPageDto> Handle(GetGoalsQuery request, CancellationToken ct)
    {
        await validator.ValidateAndThrowAsync(request, ct);
        var today = GoalProjection.Today(time);
        var status = request.Status ?? "open";
        var statuses = StatusesFor(status);

        var (items, total) = await goals.ListAsync(request.Kind, statuses, request.Page, request.PageSize, ct);
        var ids = items.Select(g => g.Id).ToList();
        var contributions = await goals.ContributionsForAsync(ids, ct);  // one query for the whole page
        var costs = await goals.CostItemsForAsync(ids, ct);
        var check = await foundation.EvaluateAsync(caller.UserId, ct);  // one snapshot shared by every goal

        var dtos = items.Select(g => GoalProjection.ToDto(g, contributions, costs, check, today)).ToList();
        var page = new GoalPageDto
        {
            Items = dtos,
            Total = total,
            Page = request.Page,
            PageSize = request.PageSize,
            Foundation = GoalProjection.ToDto(check),
        };

        if (status == "open")
            page.Summary = GoalProjection.Summary(
                items.Count == total ? dtos : await LoadAllOpenAsync(request.Kind, total, today, ct));

        logger.LogDebug("Goals page {Page}: {Count} of {Total}, foundation {State}", request.Page, dtos.Count, total, check.Check.State);
        return page;
    }

    // The summary covers every open goal, not only this page: one unpaged load when the page is partial.
    private async Task<IReadOnlyList<GoalDto>> LoadAllOpenAsync(string? kind, int total, DateOnly today, CancellationToken ct)
    {
        var (all, _) = await goals.ListAsync(kind, GoalKinds.OpenStatuses.ToList(), 1, Math.Max(total, 1), ct);
        var contributions = await goals.ContributionsForAsync(all.Select(g => g.Id).ToList(), ct);
        return all.Select(g => GoalProjection.ToDto(g, contributions, [], null, today)).ToList();
    }

    internal static IReadOnlyCollection<string> StatusesFor(string status) => status switch
    {
        "open" => GoalKinds.OpenStatuses.ToList(),
        "closed" => GoalKinds.ClosedStatuses.ToList(),
        _ => [status],
    };
}
