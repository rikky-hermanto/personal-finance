using FluentValidation;
using PersonalFinance.Application.Investments;

namespace PersonalFinance.Application.Commands.Investments;

public class UpdateInvestmentSetupCommandValidator : AbstractValidator<UpdateInvestmentSetupCommand>
{
    public UpdateInvestmentSetupCommandValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
        RuleFor(x => x.Name).NotEmpty().MaximumLength(200);
        RuleFor(x => x.ArchetypeId).NotEmpty()
            .Must(id => ArchetypeCatalog.All.ContainsKey(id))
            .WithMessage("Unknown archetype id.");
        RuleFor(x => x.BaseCurrency).NotEmpty().Length(3);
    }
}
