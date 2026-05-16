using PersonalFinance.Application.Dtos;

namespace PersonalFinance.Application.Interfaces;

public interface IPortfolioReviewClient
{
    Task<PortfolioReviewResponseDto> ReviewAsync(PortfolioReviewRequestDto request, CancellationToken ct = default);
}
