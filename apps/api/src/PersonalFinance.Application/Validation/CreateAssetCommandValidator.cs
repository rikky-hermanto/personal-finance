using FluentValidation;
using PersonalFinance.Application.Commands.Assets;

public class CreateAssetCommandValidator : AbstractValidator<CreateAssetCommand>
{
    private static readonly string[] ValidClasses =
        ["cash", "investments", "fixed_income", "crypto", "real_estate", "tangibles", "vehicles", "receivables", "retirement"];

    private static readonly string[] ValidStrategies = ["RealTime", "Algorithmic", "Amortized", "Manual"];

    public CreateAssetCommandValidator()
    {
        RuleFor(x => x.Name).NotEmpty().WithMessage("Name is required.");
        RuleFor(x => x.AssetClass).NotEmpty().Must(c => ValidClasses.Contains(c))
            .WithMessage("AssetClass must be a valid asset class.");
        RuleFor(x => x.Currency).NotEmpty().Length(3).WithMessage("Currency must be a 3-letter ISO code.");
        RuleFor(x => x.ValuationStrategy).Must(s => ValidStrategies.Contains(s))
            .WithMessage("ValuationStrategy must be one of: RealTime, Algorithmic, Amortized, Manual.");
    }
}
