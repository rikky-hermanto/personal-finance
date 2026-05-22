namespace PersonalFinance.Application.Dtos;

public class TransactionDto
{
    public int Id { get; set; }
    public DateTime Date { get; set; }
    public string Description { get; set; } = string.Empty;
    public string Remarks { get; set; } = string.Empty;
    public string Flow { get; set; } = "DB";
    public string Type { get; set; } = "Expense";
    public string Category { get; set; } = "Uncategorized";
    public string Wallet { get; set; } = string.Empty; // transient — from AI service, never written to DB
    public Guid? AccountId { get; set; }
    public decimal AmountIdr { get; set; }
    public string Currency { get; set; } = "IDR";
    public decimal? ExchangeRate { get; set; }
    public decimal? StatementBalance { get; set; }
    public decimal Balance { get; set; }

    // Flag to indicate if this transaction is already in the database
    public bool IsDuplicate { get; set; }

    // Optional: Used when user wants to create a new category rule from this transaction
    public CategoryRuleDto? CategoryRuleDto { get; set; }
}
