using FluentValidation;
using PersonalFinance.Application.Commands.Goals;
using PersonalFinance.Application.Dtos;
using PersonalFinance.Application.Goals;

namespace PersonalFinance.Application.Validation;

public class CreateGoalCommandValidator : AbstractValidator<CreateGoalCommand>
{
    public CreateGoalCommandValidator(TimeProvider time)
    {
        GoalFieldRules.Apply(this, x => x.Category, x => x.Name, x => x.Notes, x => x.Priority,
            x => x.TargetAmount, x => x.PriceGrowthRate, x => x.PlannedMonthlyInstalment);
        RuleFor(x => x.TargetDate).Must(d => d is null || d.Value >= GoalProjection.Today(time))
            .WithMessage("Target date cannot be in the past.");
    }
}
