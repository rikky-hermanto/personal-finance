using FluentValidation;
using PersonalFinance.Application.Commands.Desk;

namespace PersonalFinance.Application.Validation.Desk;

public class SetPositionSleeveCommandValidator : AbstractValidator<SetPositionSleeveCommand>
{
    public SetPositionSleeveCommandValidator()
    {
        RuleFor(x => x.PositionId).NotEmpty();
        RuleFor(x => x.Sleeve).NotEmpty();
    }
}
