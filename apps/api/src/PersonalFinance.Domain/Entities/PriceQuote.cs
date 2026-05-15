using Supabase.Postgrest.Attributes;
using Supabase.Postgrest.Models;

namespace PersonalFinance.Domain.Entities;

[Table("price_quotes")]
public class PriceQuote : BaseModel
{
    [PrimaryKey("id", shouldInsert: false)]
    public Guid Id { get; set; }

    [Column("ticker")]
    public string Ticker { get; set; } = string.Empty;

    [Column("price")]
    public decimal Price { get; set; }

    [Column("currency")]
    public string Currency { get; set; } = "IDR";

    [Column("source")]
    public string Source { get; set; } = string.Empty;

    [Column("quoted_at")]
    public DateTime QuotedAt { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; }
}
