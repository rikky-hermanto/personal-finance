using FluentValidation;
using PersonalFinance.Application.Commands.Goals;
using PersonalFinance.Application.Dtos;
using PersonalFinance.Application.Goals;

namespace PersonalFinance.Application.Validation;

/// <summary>Same bounds as create, except the target date may be in the past (the edit form previews existing goals).</summary>
public class PreviewGoalQueryValidator : AbstractValidator<PreviewGoalQuery>
{
    public PreviewGoalQueryValidator()
    {
        RuleFor(x => x.Category).Must(c => c is null || GoalKinds.BigPurchaseCategories.Contains(c))
            .WithMessage("Category is not recognised.");
        RuleFor(x => x.TargetAmount).Must(t => t is null || (t > 0m && t < GoalRules.MaxAmount))
            .WithMessage("Target amount must be above zero.");
        RuleFor(x => x.PriceGrowthRate).Must(g => g is null || (g >= 0m && g <= 1m))
            .WithMessage("Price growth must be between 0% and 100% a year.");
        RuleFor(x => x.ContributionAmount).Must(a => a is null || Math.Abs(a.Value) < GoalRules.MaxAmount)
            .WithMessage("Amount is too large.");
        RuleFor(x => x.CostItems).Must(i => i is null || i.Count <= GoalRules.MaxCostItems)
            .WithMessage("At most 20 cost lines.");
        RuleForEach(x => x.CostItems).SetValidator(new GoalCostItemInputValidator());
    }
}
