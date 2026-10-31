using FluentValidation;
using PersonalFinance.Application.Commands.Harvest;

namespace PersonalFinance.Application.Validation;

public class MarkHarvestSeenCommandValidator : AbstractValidator<MarkHarvestSeenCommand>
{
    public MarkHarvestSeenCommandValidator()
    {
        RuleFor(x => x.Ids).NotNull().WithMessage("Ids is required.");
        RuleFor(x => x.Ids).Must(ids => ids.Count <= 200).WithMessage("At most 200 ids per call.");
        RuleForEach(x => x.Ids).GreaterThan(0).WithMessage("Each id must be positive.");
        // The database function keys on the first of the month; the client sends "yyyy-MM".
        RuleFor(x => x.Month).Matches(@"^\d{4}-(0[1-9]|1[0-2])$")
            .When(x => x.Month is not null).WithMessage("Month must be yyyy-MM.");
    }
}
