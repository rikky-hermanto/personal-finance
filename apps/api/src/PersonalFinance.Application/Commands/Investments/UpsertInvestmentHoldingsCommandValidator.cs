using FluentValidation;

namespace PersonalFinance.Application.Commands.Investments;

public class UpsertInvestmentHoldingsCommandValidator : AbstractValidator<UpsertInvestmentHoldingsCommand>
{
    public UpsertInvestmentHoldingsCommandValidator()
    {
        RuleFor(x => x.SetupId).NotEmpty();
        RuleForEach(x => x.Holdings).ChildRules(h =>
        {
            h.RuleFor(x => x.Name).NotEmpty().MaximumLength(200);
            h.RuleFor(x => x.AssetClass).NotEmpty();
            h.RuleFor(x => x.AllocationPct)
                .InclusiveBetween(0, 100)
                .When(x => x.AllocationPct.HasValue);
        });
    }
}
