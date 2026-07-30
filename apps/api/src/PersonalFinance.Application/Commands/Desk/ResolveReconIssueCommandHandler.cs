using FluentValidation;
using MediatR;
using Microsoft.Extensions.Logging;
using PersonalFinance.Application.Dtos.Desk;
using PersonalFinance.Application.Interfaces;

namespace PersonalFinance.Application.Commands.Desk;

public class ResolveReconIssueCommandHandler(
    IDeskService deskService,
    IValidator<ResolveReconIssueCommand> validator,
    ILogger<ResolveReconIssueCommandHandler> logger
) : IRequestHandler<ResolveReconIssueCommand, DeskReconIssueDto>
{
    public async Task<DeskReconIssueDto> Handle(ResolveReconIssueCommand request, CancellationToken cancellationToken)
    {
        await validator.ValidateAndThrowAsync(request, cancellationToken);
        logger.LogInformation("Resolving desk recon issue {IssueId}", request.IssueId);
        return await deskService.ResolveReconIssueAsync(request.IssueId, request.Resolution);
    }
}
