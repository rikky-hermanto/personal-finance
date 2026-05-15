using MediatR;
using Microsoft.Extensions.Logging;
using PersonalFinance.Application.Commands.Institutions;
using PersonalFinance.Domain.Entities;
using static Supabase.Postgrest.Constants;

public class UpdateInstitutionCommandHandler(
    Supabase.Client supabase,
    ILogger<UpdateInstitutionCommandHandler> logger
) : IRequestHandler<UpdateInstitutionCommand, Institution?>
{
    public async Task<Institution?> Handle(UpdateInstitutionCommand request, CancellationToken cancellationToken)
    {
        logger.LogInformation("Updating institution: {Id}", request.Id);

        var existing = await supabase.From<Institution>()
            .Filter("id", Operator.Equals, request.Id.ToString())
            .Single();

        if (existing == null)
        {
            logger.LogWarning("Institution {Id} not found", request.Id);
            return null;
        }

        await supabase.From<Institution>()
            .Filter("id", Operator.Equals, request.Id.ToString())
            .Set(x => x.Name, request.Name)
            .Set(x => x.Type, request.Type)
            .Set(x => x.Country, request.Country)
            .Set(x => x.LogoUrl, request.LogoUrl)
            .Set(x => x.UpdatedAt, DateTime.UtcNow)
            .Update();

        existing.Name = request.Name;
        existing.Type = request.Type;
        existing.Country = request.Country;
        existing.LogoUrl = request.LogoUrl;
        return existing;
    }
}
