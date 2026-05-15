namespace PersonalFinance.Application.Interfaces;

public interface INetWorthService
{
    Task<decimal> GetCurrentNetWorthIdrAsync(CancellationToken ct = default);
    Task<IReadOnlyDictionary<string, decimal>> GetAllocationByClassAsync(CancellationToken ct = default);
    Task<IReadOnlyList<(DateTime Date, decimal ValueIdr)>> GetHistoryAsync(DateTime from, DateTime to, CancellationToken ct = default);
}
