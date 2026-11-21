using FluentValidation;
using PersonalFinance.Application.Commands.Goals;
using PersonalFinance.Application.Dtos;
using PersonalFinance.Application.Goals;

namespace PersonalFinance.Application.Validation;

/// <summary>The field rules create and update share (PF-154 STEP 10). Bounds mirror the migration's CHECKs.</summary>
internal static class GoalFieldRules
{
    public static void Apply<T>(AbstractValidator<T> v,
        Func<T, string> category, Func<T, string> name, Func<T, string?> notes, Func<T, short> priority,
        Func<T, decimal> target, Func<T, decimal?> growth, Func<T, decimal?> instalment)
    {
        v.RuleFor(x => category(x)).Must(c => GoalKinds.BigPurchaseCategories.Contains(c))
            .WithMessage("Category must be house_land, vehicle, education, wedding or other.");
        v.RuleFor(x => name(x)).Must(n => n is not null && n.Trim().Length is >= 1 and <= GoalRules.NameMaxLength)
            .WithMessage("Name must be 1 to 120 characters.");
        v.RuleFor(x => notes(x)).Must(n => n is null || n.Length <= GoalRules.NotesMaxLength)
            .WithMessage("Notes must be at most 2000 characters.");
        v.RuleFor(x => priority(x)).InclusiveBetween((short)1, (short)4).WithMessage("Priority must be 1 to 4.");
        v.RuleFor(x => target(x)).GreaterThan(0m).LessThan(GoalRules.MaxAmount)
            .WithMessage("Target amount must be above zero.");
        v.RuleFor(x => growth(x)).Must(g => g is null || (g >= 0m && g <= 1m))
            .WithMessage("Price growth must be between 0% and 100% a year.");
        v.RuleFor(x => instalment(x)).Must(i => i is null || (i >= 0m && i < GoalRules.MaxAmount))
            .WithMessage("Planned instalment cannot be negative.");
    }
}
