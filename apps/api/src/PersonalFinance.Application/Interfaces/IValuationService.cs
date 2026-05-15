using PersonalFinance.Domain.Entities;

namespace PersonalFinance.Application.Interfaces;

public interface IValuationService
{
    Task<Valuation?> GetLatestAsync(string subjectType, Guid subjectId, CancellationToken ct = default);
    Task<IReadOnlyList<Valuation>> GetHistoryAsync(string subjectType, Guid subjectId, CancellationToken ct = default);
}
