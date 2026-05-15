using Supabase.Postgrest.Attributes;
using Supabase.Postgrest.Models;

namespace PersonalFinance.Domain.Entities;

[Table("fx_rates")]
public class FxRate : BaseModel
{
    [PrimaryKey("id", shouldInsert: false)]
    public Guid Id { get; set; }

    [Column("currency_from")]
    public string CurrencyFrom { get; set; } = string.Empty;

    [Column("currency_to")]
    public string CurrencyTo { get; set; } = "IDR";

    [Column("rate")]
    public decimal Rate { get; set; }

    [Column("source")]
    public string Source { get; set; } = "jisdor";

    [Column("rate_date")]
    public DateTime RateDate { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; }
}
