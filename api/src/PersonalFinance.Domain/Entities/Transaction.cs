namespace PersonalFinance.Domain.Entities
{
    public class Transaction
    {
        public int Id { get; set; }

        public DateTime Date { get; set; }
        public string Description { get; set; } = string.Empty;

        public string Remarks { get; set; } = string.Empty;

        public string Flow { get; set; } = "DB"; // DB = Debit, CR = Credit

        public string Type { get; set; } = "Expense"; // Expense or Income

        public string Category { get; set; } = "Untracked Expense";

        public string Wallet { get; set; } = string.Empty; // Bank source (e.g., BCA, SeaBank)

        public decimal AmountIdr { get; set; } // Amount in IDR

        public string Currency { get; set; } = "IDR"; // Optionally infer from format

        public decimal? Balance { get; set; } // Balance after transaction (optional)

        public decimal? ExchangeRate { get; set; } // Optional, for foreign currencies
    }
}
