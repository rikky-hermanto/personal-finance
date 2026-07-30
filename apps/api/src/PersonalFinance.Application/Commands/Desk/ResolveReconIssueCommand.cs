using MediatR;
using PersonalFinance.Application.Dtos.Desk;

namespace PersonalFinance.Application.Commands.Desk;

public record ResolveReconIssueCommand(
    Guid IssueId,
    string Resolution
) : IRequest<DeskReconIssueDto>;
