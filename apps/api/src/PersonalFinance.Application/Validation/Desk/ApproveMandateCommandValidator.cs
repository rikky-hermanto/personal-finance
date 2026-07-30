using FluentValidation;
using PersonalFinance.Application.Commands.Desk;

namespace PersonalFinance.Application.Validation.Desk;

public class ApproveMandateCommandValidator : AbstractValidator<ApproveMandateCommand>
{
    public ApproveMandateCommandValidator()
    {
        RuleFor(x => x.VersionId).NotEmpty();
        RuleFor(x => x.ChangeReason).NotEmpty()
            .WithMessage("A change reason is required to approve a mandate version.");
        RuleFor(x => x.Reviewed).Equal(true)
            .WithMessage("The reviewer confirmation ('I have reviewed') must be checked to approve a mandate version.");
    }
}
