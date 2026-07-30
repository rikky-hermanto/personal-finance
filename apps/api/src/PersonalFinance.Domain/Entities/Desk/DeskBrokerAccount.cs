using Supabase.Postgrest.Attributes;
using Supabase.Postgrest.Models;

namespace PersonalFinance.Domain.Entities.Desk;

[Table("desk_broker_accounts")]
public class DeskBrokerAccount : BaseModel
{
    [PrimaryKey("id", shouldInsert: false)]
    public Guid Id { get; set; }

    [Column("user_id")]
    public Guid UserId { get; set; }

    [Column("external_key")]
    public string ExternalKey { get; set; } = string.Empty;

    [Column("name")]
    public string Name { get; set; } = string.Empty;

    [Column("broker_key")]
    public string BrokerKey { get; set; } = string.Empty;

    [Column("portfolio_label")]
    public string? PortfolioLabel { get; set; }

    [Column("currency")]
    public string Currency { get; set; } = "IDR";

    [Column("reported_equity")]
    public decimal ReportedEquity { get; set; }

    [Column("reported_equity_native")]
    public decimal? ReportedEquityNative { get; set; }

    [Column("cash")]
    public decimal Cash { get; set; }

    [Column("cash_native")]
    public decimal? CashNative { get; set; }

    [Column("cash_currency_native")]
    public string? CashCurrencyNative { get; set; }

    [Column("buying_power")]
    public decimal? BuyingPower { get; set; }

    [Column("buying_power_currency")]
    public string? BuyingPowerCurrency { get; set; }

    [Column("status")]
    public string Status { get; set; } = "Needs reconciliation";

    [Column("created_at")]
    public DateTime CreatedAt { get; set; }

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; }
}
