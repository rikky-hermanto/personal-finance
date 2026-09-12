using FluentValidation;
using Newtonsoft.Json.Linq;
using PersonalFinance.Application.Commands.MacroScenarios;

public class CreateMacroScenarioCommandValidator : AbstractValidator<CreateMacroScenarioCommand>
{
    public CreateMacroScenarioCommandValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(100).WithMessage("Name is required and must be 100 characters or fewer.");
        RuleFor(x => x.DriversJson).NotEmpty()
            .Must(BeValidJson).WithMessage("DriversJson must be a valid JSON object.");
    }

    private static bool BeValidJson(string json)
    {
        try
        {
            JToken.Parse(json);
            return true;
        }
        catch
        {
            return false;
        }
    }
}
