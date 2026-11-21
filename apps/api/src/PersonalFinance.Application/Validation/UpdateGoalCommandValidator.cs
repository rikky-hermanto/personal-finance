using FluentValidation;
using PersonalFinance.Application.Commands.Goals;
using PersonalFinance.Application.Dtos;
using PersonalFinance.Application.Goals;

namespace PersonalFinance.Application.Validation;

/// <summary>As create, except an existing goal may keep a past target date, and status is required.</summary>
public class UpdateGoalCommandValidator : AbstractValidator<UpdateGoalCommand>
{
    public UpdateGoalCommandValidator()
    {
        GoalFieldRules.Apply(this, x => x.Category, x => x.Name, x => x.Notes, x => x.Priority,
            x => x.TargetAmount, x => x.PriceGrowthRate, x => x.PlannedMonthlyInstalment);
        RuleFor(x => x.Status).Must(s => s is not null && GoalKinds.Statuses.Contains(s))
            .WithMessage("Status must be active, paused, achieved or cancelled.");
    }
}
