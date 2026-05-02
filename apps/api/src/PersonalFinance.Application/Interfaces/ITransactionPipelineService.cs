using PersonalFinance.Application.Dtos;

namespace PersonalFinance.Application.Interfaces;

public interface ITransactionPipelineService
{
    Task<List<TransactionDto>> ProcessAsync(List<TransactionDto> transactions);
}
