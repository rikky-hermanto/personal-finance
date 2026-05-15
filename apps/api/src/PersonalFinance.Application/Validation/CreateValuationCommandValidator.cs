using FluentValidation;
using PersonalFinance.Application.Commands.Valuations;

public class CreateValuationCommandValidator : AbstractValidator<CreateValuationCommand>
{
    private static readonly string[] ValidSubjectTypes = ["account", "asset", "holding"];
    private static readonly string[] ValidSources = ["manual", "price_feed", "computed"];

    public CreateValuationCommandValidator()
    {
        RuleFor(x => x.SubjectType).NotEmpty().Must(t => ValidSubjectTypes.Contains(t))
            .WithMessage("SubjectType must be one of: account, asset, holding.");
        RuleFor(x => x.SubjectId).NotEmpty().WithMessage("SubjectId is required.");
        RuleFor(x => x.ValueNative).GreaterThanOrEqualTo(0).WithMessage("ValueNative must be non-negative.");
        RuleFor(x => x.Currency).NotEmpty().Length(3).WithMessage("Currency must be a 3-letter ISO code.");
        RuleFor(x => x.Source).Must(s => ValidSources.Contains(s))
            .WithMessage("Source must be one of: manual, price_feed, computed.");
    }
}
