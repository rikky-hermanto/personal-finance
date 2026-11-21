using FluentValidation;
using PersonalFinance.Application.Commands.Goals;
using PersonalFinance.Application.Dtos;
using PersonalFinance.Application.Goals;

namespace PersonalFinance.Application.Validation;

public class AddGoalContributionCommandValidator : AbstractValidator<AddGoalContributionCommand>
{
    public AddGoalContributionCommandValidator(TimeProvider time)
    {
        RuleFor(x => x.Amount).NotEqual(0m).WithMessage("Amount cannot be zero.");
        RuleFor(x => x.Amount).Must(a => Math.Abs(a) < GoalRules.MaxAmount).WithMessage("Amount is too large.");
        RuleFor(x => x.ContributedOn).Must(d => d <= GoalProjection.Today(time))
            .WithMessage("Date cannot be in the future.");
        RuleFor(x => x.Note).Must(n => n is null || n.Length <= GoalRules.ContributionNoteMaxLength)
            .WithMessage("Note must be at most 280 characters.");
    }
}
