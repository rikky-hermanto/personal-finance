using MediatR;
using PersonalFinance.Domain.Entities;

namespace PersonalFinance.Application.Commands.Investments;

public record RunPortfolioReviewCommand(
    Guid SetupId,
    string Label,
    decimal? TotalValue = null,
    string Currency = "IDR",
    string? Provider = null,
    string? Model = null
) : IRequest<InvestmentSnapshot>;
