using PersonalFinance.Application.Dtos;

public interface ISpendingAnalysisService
{
    Task<SafeToSpendDto> GetSafeToSpendAsync(Guid? accountId = null);
    Task<VarianceExplainerDto> GetVarianceExplainerAsync(Guid? accountId = null);
}
