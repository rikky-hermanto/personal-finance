using FluentValidation;
using PersonalFinance.Application.Commands.Desk;

namespace PersonalFinance.Application.Validation.Desk;

public class SaveMandateDraftCommandValidator : AbstractValidator<SaveMandateDraftCommand>
{
    private static readonly string[] ValidModes = ["absolute", "pctOfReconciled"];

    public SaveMandateDraftCommandValidator()
    {
        RuleFor(x => x.Params).NotNull();
        RuleFor(x => x.Params.ActiveTradingNav).GreaterThanOrEqualTo(0)
            .When(x => x.Params is not null)
            .WithMessage("Active Trading NAV must not be negative.");
        RuleFor(x => x.Params.ActiveTradingNavMode).Must(m => ValidModes.Contains(m))
            .When(x => x.Params is not null)
            .WithMessage("ActiveTradingNavMode must be 'absolute' or 'pctOfReconciled'.");
        RuleFor(x => x.Params.RiskPerTradePct).InclusiveBetween(0, 100)
            .When(x => x.Params is not null);
        RuleFor(x => x.Params.MaxSingleStockPct).InclusiveBetween(0, 100)
            .When(x => x.Params is not null);
        RuleFor(x => x.Params.ConsecutiveLossStop).GreaterThan(0)
            .When(x => x.Params is not null);
    }
}
