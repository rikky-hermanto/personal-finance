using PersonalFinance.Domain.Entities;

public interface ITransactionService
{
    Task AddTransactionsAsync(IEnumerable<Transaction> transactions);
}