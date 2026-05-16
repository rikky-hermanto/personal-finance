using System.Text.Json;
using FluentValidation;
using MediatR;
using Microsoft.Extensions.Logging;
using PersonalFinance.Application.Dtos;
using PersonalFinance.Application.Interfaces;
using PersonalFinance.Application.Investments;
using PersonalFinance.Domain.Entities;
using static Supabase.Postgrest.Constants;

namespace PersonalFinance.Application.Commands.Investments;

public class RunPortfolioReviewCommandHandler(
    Supabase.Client supabase,
    IPortfolioReviewClient reviewClient,
    IValidator<RunPortfolioReviewCommand> validator,
    ILogger<RunPortfolioReviewCommandHandler> logger
) : IRequestHandler<RunPortfolioReviewCommand, InvestmentSnapshot>
{
    private static readonly JsonSerializerOptions JsonOpts = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };

    public async Task<InvestmentSnapshot> Handle(RunPortfolioReviewCommand request, CancellationToken cancellationToken)
    {
        logger.LogDebug("Running portfolio review for setup: {SetupId}", request.SetupId);
        await validator.ValidateAndThrowAsync(request, cancellationToken);

        // 1. Fetch setup
        var setupResult = await supabase.From<InvestmentSetup>()
            .Filter("id", Operator.Equals, request.SetupId.ToString())
            .Get();
        var setup = setupResult.Models.FirstOrDefault()
            ?? throw new KeyNotFoundException($"Investment setup {request.SetupId} not found.");

        // 2. Fetch holdings
        var holdingsResult = await supabase.From<InvestmentHolding>()
            .Filter("setup_id", Operator.Equals, request.SetupId.ToString())
            .Get();

        var holdingDtos = holdingsResult.Models.Select(h => new InvestmentHoldingDto(
            h.Id, h.SetupId, h.Ticker, h.Name, h.AssetClass, h.Sector,
            h.AllocationPct, h.Quantity, h.AvgBuyPrice)).ToList();

        // 3. Resolve archetype
        var archetype = ArchetypeCatalog.All.TryGetValue(setup.ArchetypeId, out var a) ? a : null;

        // 4. Build request DTO and call review client
        var reviewReq = new PortfolioReviewRequestDto(
            SetupName: setup.Name,
            Archetype: archetype ?? (object)setup.ArchetypeId,
            SnapshotLabel: request.Label,
            TotalValue: request.TotalValue,
            Currency: request.Currency,
            Holdings: holdingDtos,
            Provider: request.Provider,
            Model: request.Model
        );

        var reviewResponse = await reviewClient.ReviewAsync(reviewReq, cancellationToken);

        // 5. Serialize response → snapshot
        var analysisJson = JsonSerializer.Serialize(reviewResponse, JsonOpts);

        var snapshot = new InvestmentSnapshot
        {
            Id = Guid.NewGuid(),
            SetupId = request.SetupId,
            Label = request.Label,
            SnapshotDate = DateOnly.FromDateTime(DateTime.UtcNow),
            TotalValue = request.TotalValue,
            Currency = request.Currency,
            AiProvider = request.Provider ?? "gemini",
            AiModel = request.Model ?? "gemini-2.5-flash",
            AnalysisJson = analysisJson,
            CreatedAt = DateTime.UtcNow,
        };

        var insertResult = await supabase.From<InvestmentSnapshot>().Insert(snapshot);
        var inserted = insertResult.Models.First();
        logger.LogInformation("Portfolio review snapshot created: {SnapshotId}", inserted.Id);
        return inserted;
    }
}
