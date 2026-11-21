using FluentValidation;
using PersonalFinance.Application.Commands.Goals;
using PersonalFinance.Application.Dtos;
using PersonalFinance.Application.Goals;

namespace PersonalFinance.Application.Validation;

public class ReplaceGoalCostItemsCommandValidator : AbstractValidator<ReplaceGoalCostItemsCommand>
{
    public ReplaceGoalCostItemsCommandValidator()
    {
        RuleFor(x => x.Items).NotNull().Must(i => i is null || i.Count <= GoalRules.MaxCostItems)
            .WithMessage("At most 20 cost lines.");
        RuleForEach(x => x.Items).SetValidator(new GoalCostItemInputValidator());
    }
}

public class GoalCostItemInputValidator : AbstractValidator<GoalCostItemInput>
{
    public GoalCostItemInputValidator()
    {
        RuleFor(x => x.ItemType).Must(t => t is not null && GoalKinds.CostItemTypes.Contains(t))
            .WithMessage("Cost type is not recognised.");
        RuleFor(x => x.Label).Must(l => l is not null && l.Trim().Length is >= 1 and <= GoalRules.CostLabelMaxLength)
            .WithMessage("Cost label must be 1 to 80 characters.");
        RuleFor(x => x.Amount).GreaterThanOrEqualTo(0m).LessThan(GoalRules.MaxAmount)
            .WithMessage("Cost amount cannot be negative.");
    }
}
