using MediatR;
using PersonalFinance.Application.Dtos;
using PersonalFinance.Application.Goals;
using PersonalFinance.Application.Interfaces;

namespace PersonalFinance.Application.Commands.Goals;

public record GetGoalQuery(Guid Id) : IRequest<GoalDto?>;

public class GetGoalQueryHandler(
    IGoalService goals,
    IFoundationCheckService foundation,
    ICurrentUser caller,
    TimeProvider time
) : IRequestHandler<GetGoalQuery, GoalDto?>
{
    public async Task<GoalDto?> Handle(GetGoalQuery request, CancellationToken ct)
    {
        var goal = await goals.GetAsync(request.Id, ct);
        return goal is null
            ? null
            : await GoalProjection.LoadOneAsync(goal, goals, foundation, caller.UserId, GoalProjection.Today(time), ct);
    }
}
