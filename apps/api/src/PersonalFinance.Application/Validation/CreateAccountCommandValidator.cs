using FluentValidation;
using PersonalFinance.Application.Commands.Accounts;

public class CreateAccountCommandValidator : AbstractValidator<CreateAccountCommand>
{
    private static readonly string[] ValidTypes =
        ["checking", "savings", "credit_card", "brokerage", "wallet", "loan"];

    public CreateAccountCommandValidator()
    {
        RuleFor(x => x.Name).NotEmpty().WithMessage("Name is required.");
        RuleFor(x => x.AccountType).NotEmpty().Must(t => ValidTypes.Contains(t))
            .WithMessage("AccountType must be one of: checking, savings, credit_card, brokerage, wallet, loan.");
        RuleFor(x => x.Currency).NotEmpty().Length(3).WithMessage("Currency must be a 3-letter ISO code.");
        RuleFor(x => x.OpeningBalance).GreaterThanOrEqualTo(0);
    }
}
