using MediatR;
using Microsoft.Extensions.Logging;
using PersonalFinance.Application.Commands.Liabilities;
using PersonalFinance.Domain.Entities;
using static Supabase.Postgrest.Constants;

public class UpdateLiabilityCommandHandler(
    Supabase.Client supabase,
    ILogger<UpdateLiabilityCommandHandler> logger
) : IRequestHandler<UpdateLiabilityCommand, Liability?>
{
    public async Task<Liability?> Handle(UpdateLiabilityCommand request, CancellationToken cancellationToken)
    {
        logger.LogInformation("Updating liability: {Id}", request.Id);

        var existing = await supabase.From<Liability>()
            .Filter("id", Operator.Equals, request.Id.ToString())
            .Single();

        if (existing == null)
        {
            logger.LogWarning("Liability {Id} not found", request.Id);
            return null;
        }

        await supabase.From<Liability>()
            .Filter("id", Operator.Equals, request.Id.ToString())
            .Set(x => x.Name, request.Name)
            .Set(x => x.LiabilityType, request.LiabilityType)
            .Set(x => x.Principal, request.Principal)
            .Set(x => x.InterestRate, request.InterestRate)
            .Set(x => x.EndDate, request.EndDate.HasValue
                ? request.EndDate.Value.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc)
                : (DateTime?)null)
            .Set(x => x.MonthlyPayment, request.MonthlyPayment)
            .Set(x => x.UpdatedAt, DateTime.UtcNow)
            .Update();

        existing.Name = request.Name;
        existing.LiabilityType = request.LiabilityType;
        existing.Principal = request.Principal;
        existing.InterestRate = request.InterestRate;
        existing.MonthlyPayment = request.MonthlyPayment;
        return existing;
    }
}
