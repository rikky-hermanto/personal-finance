using Supabase.Postgrest.Attributes;
using Supabase.Postgrest.Models;

namespace PersonalFinance.Domain.Entities;

[Table("accounts")]
public class Account : BaseModel
{
    [PrimaryKey("id", shouldInsert: false)]
    public Guid Id { get; set; }

    [Column("user_id")]
    public Guid UserId { get; set; }

    [Column("institution_id")]
    public Guid? InstitutionId { get; set; }

    [Column("name")]
    public string Name { get; set; } = string.Empty;

    [Column("account_type")]
    public string AccountType { get; set; } = string.Empty;

    [Column("currency")]
    public string Currency { get; set; } = "IDR";

    [Column("opening_balance")]
    public decimal OpeningBalance { get; set; }

    [Column("opening_date")]
    public DateTime OpeningDate { get; set; }

    [Column("is_active")]
    public bool IsActive { get; set; } = true;

    [Column("color")]
    public string? Color { get; set; }

    [Column("icon")]
    public string? Icon { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; }

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; }
}
