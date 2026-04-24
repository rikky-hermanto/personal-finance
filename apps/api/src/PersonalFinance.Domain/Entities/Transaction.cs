using Supabase.Postgrest.Attributes;
using Supabase.Postgrest.Models;

namespace PersonalFinance.Domain.Entities;

[Table("transactions")]
public class Transaction : BaseModel
{
    [PrimaryKey("id", shouldInsert: false)]
    public int Id { get; set; }

    [Column("date")]
    public DateTime Date { get; set; }

    [Column("description")]
    public string Description { get; set; } = string.Empty;

    [Column("remarks")]
    public string Remarks { get; set; } = string.Empty;

    [Column("flow")]
    public string Flow { get; set; } = "DB";

    [Column("type")]
    public string Type { get; set; } = "Expense";

    [Column("category")]
    public string Category { get; set; } = "Untracked Category";

    [Column("wallet")]
    public string Wallet { get; set; } = string.Empty;

    [Column("amount_idr")]
    public decimal AmountIdr { get; set; }

    [Column("currency")]
    public string Currency { get; set; } = "IDR";

    [Column("exchange_rate")]
    public decimal? ExchangeRate { get; set; }
}
