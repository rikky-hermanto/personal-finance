using FluentValidation;
using PersonalFinance.Application.Commands.Liabilities;

public class CreateLiabilityCommandValidator : AbstractValidator<CreateLiabilityCommand>
{
    private static readonly string[] ValidTypes = ["revolving", "installment", "personal"];

    public CreateLiabilityCommandValidator()
    {
        RuleFor(x => x.Name).NotEmpty().WithMessage("Name is required.");
        RuleFor(x => x.LiabilityType).NotEmpty().Must(t => ValidTypes.Contains(t))
            .WithMessage("LiabilityType must be one of: revolving, installment, personal.");
        RuleFor(x => x.Principal).GreaterThan(0).WithMessage("Principal must be positive.");
        RuleFor(x => x).Must(x => !(x.AccountId.HasValue && x.AssetId.HasValue))
            .WithMessage("A liability cannot link to both an account and an asset simultaneously.");
    }
}
