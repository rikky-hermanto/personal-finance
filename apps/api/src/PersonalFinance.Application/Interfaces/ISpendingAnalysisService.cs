using PersonalFinance.Application.Dtos;

public interface ISpendingAnalysisService
{
    Task<SafeToSpendDto> GetSafeToSpendAsync(string? wallet = null);
    Task<VarianceExplainerDto> GetVarianceExplainerAsync(string? wallet = null);
}
