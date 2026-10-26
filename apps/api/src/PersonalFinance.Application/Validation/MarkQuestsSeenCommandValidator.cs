using FluentValidation;
using PersonalFinance.Application.Commands.Quests;

public class MarkQuestsSeenCommandValidator : AbstractValidator<MarkQuestsSeenCommand>
{
    public MarkQuestsSeenCommandValidator()
    {
        RuleFor(x => x.Ids).NotEmpty().WithMessage("Ids is required.");
        RuleFor(x => x.Ids).Must(ids => ids.Count <= 100).WithMessage("At most 100 ids per call.");
        RuleForEach(x => x.Ids).GreaterThan(0).WithMessage("Each id must be positive.");
    }
}
