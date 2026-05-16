using FluentValidation;

namespace PersonalFinance.Application.Commands.Investments;

public class RunPortfolioReviewCommandValidator : AbstractValidator<RunPortfolioReviewCommand>
{
    public RunPortfolioReviewCommandValidator()
    {
        RuleFor(x => x.SetupId).NotEmpty();
        RuleFor(x => x.Label).NotEmpty().MaximumLength(200);
        RuleFor(x => x.Currency).NotEmpty().Length(3);
        RuleFor(x => x.TotalValue).GreaterThan(0).When(x => x.TotalValue.HasValue);
    }
}
