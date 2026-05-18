using Supabase.Postgrest.Attributes;
using Supabase.Postgrest.Models;

namespace PersonalFinance.Domain.Entities;

[Table("wallet_account_aliases")]
public class WalletAccountAlias : BaseModel
{
    [PrimaryKey("id", shouldInsert: false)]
    public Guid Id { get; set; }

    [Column("alias_text")]
    public string AliasText { get; set; } = string.Empty;

    [Column("account_id")]
    public Guid AccountId { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; }
}
