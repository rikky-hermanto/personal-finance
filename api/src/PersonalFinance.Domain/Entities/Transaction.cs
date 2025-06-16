namespace PersonalFinance.Domain.Entities
{
    public class Transaction
    {
        public int Id { get; set; }
        public DateTime Date { get; set; }
        public string Description { get; set; } = string.Empty;
        public string Remarks { get; set; } = string.Empty;
        public string Flow { get; set; } = "DB"; // "DB" = Debit, "CR" = Credit
        public string Type { get; set; } = "Expense"; // "Expense" or "Income"
        public string Category { get; set; } = "Untracked Expense";
        public string Wallet { get; set; } = string.Empty; // e.g., "BCA", "SeaBank"
        public decimal AmountIdr { get; set; }
        public string Currency { get; set; } = "IDR";
        public decimal? ExchangeRate { get; set; } // For foreign currencies
    }
}
