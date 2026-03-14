namespace PersonalFinance.Application.Dtos;

public class TransactionDto
{
    public int Id { get; set; }
    public DateTime Date { get; set; }
    public string Description { get; set; } = string.Empty;
    public string Remarks { get; set; } = string.Empty;
    public string Flow { get; set; } = "DB";
    public string Type { get; set; } = "Expense";
    public string Category { get; set; } = "Untracked Expense";
    public string Wallet { get; set; } = string.Empty;
    public decimal AmountIdr { get; set; }
    public string Currency { get; set; } = "IDR";
    public decimal? ExchangeRate { get; set; }
    public decimal Balance { get; set; } // Calculated on the fly

    // Optional: Used when user wants to create a new category rule from this transaction
    public CategoryRuleDto? CategoryRuleDto { get; set; }
}
