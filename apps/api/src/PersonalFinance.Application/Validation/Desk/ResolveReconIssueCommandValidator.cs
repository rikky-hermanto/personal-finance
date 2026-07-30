using FluentValidation;
using PersonalFinance.Application.Commands.Desk;

namespace PersonalFinance.Application.Validation.Desk;

public class ResolveReconIssueCommandValidator : AbstractValidator<ResolveReconIssueCommand>
{
    public ResolveReconIssueCommandValidator()
    {
        RuleFor(x => x.IssueId).NotEmpty();
        RuleFor(x => x.Resolution).NotEmpty();
    }
}
