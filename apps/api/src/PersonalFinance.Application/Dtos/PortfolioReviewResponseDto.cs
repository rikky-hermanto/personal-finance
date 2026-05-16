using System.Text.Json.Nodes;

namespace PersonalFinance.Application.Dtos;

// Top-level 7-section response — deserialized from Python PortfolioReviewResponse.
// Each section is kept as a raw JsonObject to avoid tight coupling to the AI schema.
public record PortfolioReviewResponseDto(
    JsonObject? Diagnostics,
    JsonObject? HoldingsEvaluation,
    JsonObject? MacroMap,
    JsonObject? Scenarios,
    JsonObject? ResilienceTest,
    JsonObject? DecisionTree,
    JsonObject? RecommendedPortfolio
);
