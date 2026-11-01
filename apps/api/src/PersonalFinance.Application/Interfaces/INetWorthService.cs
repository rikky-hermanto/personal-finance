using PersonalFinance.Application.Dtos;

namespace PersonalFinance.Application.Interfaces;

public interface INetWorthService
{
    Task<NetWorthSummaryDto> GetCurrentAsync(CancellationToken ct = default);
    Task<IReadOnlyDictionary<string, decimal>> GetAllocationByClassAsync(CancellationToken ct = default);
    Task<IReadOnlyList<NetWorthPointDto>> GetHistoryAsync(DateTime from, DateTime to, CancellationToken ct = default);
}
