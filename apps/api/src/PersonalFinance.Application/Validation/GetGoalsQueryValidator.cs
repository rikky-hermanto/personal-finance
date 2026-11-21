using FluentValidation;
using PersonalFinance.Application.Commands.Goals;
using PersonalFinance.Application.Dtos;
using PersonalFinance.Application.Goals;

namespace PersonalFinance.Application.Validation;

public class GetGoalsQueryValidator : AbstractValidator<GetGoalsQuery>
{
    public GetGoalsQueryValidator()
    {
        RuleFor(x => x.Status)
            .Must(s => s is null or "open" or "closed" || GoalKinds.Statuses.Contains(s))
            .WithMessage("Status must be open, closed, active, paused, achieved or cancelled.");
        RuleFor(x => x.Page).GreaterThanOrEqualTo(1);
        RuleFor(x => x.PageSize).InclusiveBetween(1, 200);
    }
}
