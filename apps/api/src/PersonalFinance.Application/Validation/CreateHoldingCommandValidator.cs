using FluentValidation;
using PersonalFinance.Application.Commands.Holdings;

public class CreateHoldingCommandValidator : AbstractValidator<CreateHoldingCommand>
{
    public CreateHoldingCommandValidator()
    {
        RuleFor(x => x.AccountId).NotEmpty().WithMessage("AccountId is required.");
        RuleFor(x => x.Ticker).NotEmpty().WithMessage("Ticker is required.");
        RuleFor(x => x.Quantity).GreaterThan(0).WithMessage("Quantity must be positive.");
        RuleFor(x => x.CostBasis).GreaterThanOrEqualTo(0);
        RuleFor(x => x.Currency).NotEmpty().Length(3).WithMessage("Currency must be a 3-letter ISO code.");
    }
}
