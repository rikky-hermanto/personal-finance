namespace PersonalFinance.Application.Interfaces;

public interface IFxRateService
{
    Task<decimal> GetRateToIdrAsync(string currencyFrom, DateOnly? date = null, CancellationToken ct = default);
    Task RefreshDailyRatesAsync(CancellationToken ct = default);
}
