using FluentValidation;
using PersonalFinance.Application.Commands.Institutions;

public class CreateInstitutionCommandValidator : AbstractValidator<CreateInstitutionCommand>
{
    private static readonly string[] ValidTypes = ["bank", "broker", "crypto_exchange", "insurer", "other"];

    public CreateInstitutionCommandValidator()
    {
        RuleFor(x => x.Name).NotEmpty().WithMessage("Name is required.");
        RuleFor(x => x.Type).NotEmpty().Must(t => ValidTypes.Contains(t))
            .WithMessage("Type must be one of: bank, broker, crypto_exchange, insurer, other.");
        RuleFor(x => x.Country).NotEmpty();
    }
}
