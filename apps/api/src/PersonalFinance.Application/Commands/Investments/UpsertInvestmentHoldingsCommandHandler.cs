using FluentValidation;
using MediatR;
using Microsoft.Extensions.Logging;
using PersonalFinance.Application.Dtos;
using PersonalFinance.Domain.Entities;
using static Supabase.Postgrest.Constants;

namespace PersonalFinance.Application.Commands.Investments;

public class UpsertInvestmentHoldingsCommandHandler(
    Supabase.Client supabase,
    IValidator<UpsertInvestmentHoldingsCommand> validator,
    ILogger<UpsertInvestmentHoldingsCommandHandler> logger
) : IRequestHandler<UpsertInvestmentHoldingsCommand, List<InvestmentHolding>>
{
    public async Task<List<InvestmentHolding>> Handle(UpsertInvestmentHoldingsCommand request, CancellationToken cancellationToken)
    {
        logger.LogDebug("Upserting holdings for setup: {SetupId}", request.SetupId);
        await validator.ValidateAndThrowAsync(request, cancellationToken);

        // RLS hides other owners' setups; never replace holdings of a setup the caller cannot see.
        var setup = await supabase.From<InvestmentSetup>()
            .Filter("id", Operator.Equals, request.SetupId.ToString())
            .Single();
        if (setup == null)
            throw new KeyNotFoundException($"Investment setup {request.SetupId} not found.");

        // Replace-all: delete existing then insert new
        await supabase.From<InvestmentHolding>()
            .Filter("setup_id", Operator.Equals, request.SetupId.ToString())
            .Delete();

        if (request.Holdings.Count == 0)
            return [];

        var entities = request.Holdings.Select(h => new InvestmentHolding
        {
            Id = Guid.NewGuid(),
            SetupId = request.SetupId,
            Ticker = h.Ticker,
            Name = h.Name,
            AssetClass = h.AssetClass,
            Sector = h.Sector,
            AllocationPct = h.AllocationPct,
            Quantity = h.Quantity,
            AvgBuyPrice = h.AvgBuyPrice,
            CreatedAt = DateTime.UtcNow,
        }).ToList();

        var result = await supabase.From<InvestmentHolding>().Insert(entities);
        logger.LogInformation("Upserted {Count} holdings for setup {SetupId}", result.Models.Count, request.SetupId);
        return result.Models;
    }
}
