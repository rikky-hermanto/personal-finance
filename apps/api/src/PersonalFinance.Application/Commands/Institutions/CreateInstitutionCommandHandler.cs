using FluentValidation;
using MediatR;
using Microsoft.Extensions.Logging;
using PersonalFinance.Application.Commands.Institutions;
using PersonalFinance.Domain.Entities;

public class CreateInstitutionCommandHandler(
    Supabase.Client supabase,
    IValidator<CreateInstitutionCommand> validator,
    ILogger<CreateInstitutionCommandHandler> logger
) : IRequestHandler<CreateInstitutionCommand, Institution>
{
    public async Task<Institution> Handle(CreateInstitutionCommand request, CancellationToken cancellationToken)
    {
        logger.LogDebug("Creating institution: {Name}", request.Name);
        await validator.ValidateAndThrowAsync(request, cancellationToken);

        var entity = new Institution
        {
            Id = Guid.NewGuid(),
            UserId = Guid.Empty, // PF-S08 will replace with JWT user_id
            Name = request.Name,
            Type = request.Type,
            Country = request.Country,
            LogoUrl = request.LogoUrl,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        var result = await supabase.From<Institution>().Insert(entity);
        var inserted = result.Models.First();
        logger.LogInformation("Institution created with ID: {Id}", inserted.Id);
        return inserted;
    }
}
