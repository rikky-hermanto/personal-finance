using FluentValidation;
using PersonalFinance.Application.Commands;

public class CreateCategoryRuleCommandValidator : AbstractValidator<CreateCategoryRuleCommand>
{
    public CreateCategoryRuleCommandValidator()
    {
        RuleFor(x => x.CategoryRule).NotNull();
        When(x => x.CategoryRule != null, () =>
        {
            RuleFor(x => x.CategoryRule.Keyword)
                .NotEmpty().WithMessage("Keyword is required.");
            RuleFor(x => x.CategoryRule.Type)
                .NotEmpty().WithMessage("Type is required.");
            RuleFor(x => x.CategoryRule.Category)
                .NotEmpty().WithMessage("Category is required.");
        });
    }
   }