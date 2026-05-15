using FluentValidation;
using MediatR;
using Microsoft.Extensions.Logging;
using PersonalFinance.Application.Commands.Liabilities;
using PersonalFinance.Domain.Entities;

public class CreateLiabilityCommandHandler(
    Supabase.Client supabase,
    IValidator<CreateLiabilityCommand> validator,
    ILogger<CreateLiabilityCommandHandler> logger
) : IRequestHandler<CreateLiabilityCommand, Liability>
{
    public async Task<Liability> Handle(CreateLiabilityCommand request, CancellationToken cancellationToken)
    {
        logger.LogDebug("Creating liability: {Name}", request.Name);
        await validator.ValidateAndThrowAsync(request, cancellationToken);

        var entity = new Liability
        {
            Id = Guid.NewGuid(),
            UserId = Guid.Empty, // PF-S08 will replace with JWT user_id
            Name = request.Name,
            LiabilityType = request.LiabilityType,
            AccountId = request.AccountId,
            AssetId = request.AssetId,
            Principal = request.Principal,
            InterestRate = request.InterestRate,
            StartDate = request.StartDate.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc),
            EndDate = request.EndDate.HasValue
                ? request.EndDate.Value.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc)
                : null,
            MonthlyPayment = request.MonthlyPayment,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        var result = await supabase.From<Liability>().Insert(entity);
        var inserted = result.Models.First();
        logger.LogInformation("Liability created with ID: {Id}", inserted.Id);
        return inserted;
    }
}
