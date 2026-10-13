using FluentValidation;
using MediatR;
using Microsoft.Extensions.Logging;
using PersonalFinance.Application.Commands.Institutions;
using PersonalFinance.Domain.Entities;
using PersonalFinance.Application.Interfaces;
using static Supabase.Postgrest.Constants;
using PersonalFinance.Application.Dtos;

public class CreateInstitutionCommandHandler(
    Supabase.Client supabase,
    IValidator<CreateInstitutionCommand> validator,
    ILogger<CreateInstitutionCommandHandler> logger,
    ICurrentUser caller,
    ICashflowMutationService mutations
) : IRequestHandler<CreateInstitutionCommand, Institution>
{
    public async Task<Institution> Handle(CreateInstitutionCommand request, CancellationToken cancellationToken)
    {
        logger.LogDebug("Creating institution: {Name}", request.Name);
        await validator.ValidateAndThrowAsync(request, cancellationToken);

        var id = await mutations.CreateInstitutionAsync(request, cancellationToken);
        var inserted = await supabase.From<Institution>()
            .Filter("user_id", Operator.Equals, caller.UserId.ToString())
            .Filter("id", Operator.Equals, id.ToString())
            .Single() ?? throw new CashflowMutationException(CashflowMutationFailure.BackendFailure);
        logger.LogInformation("Institution created with ID: {Id}", inserted.Id);
        return inserted;
    }
}
