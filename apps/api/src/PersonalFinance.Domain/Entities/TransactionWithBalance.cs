using Supabase.Postgrest.Attributes;
using Supabase.Postgrest.Models;

namespace PersonalFinance.Domain.Entities;

[Table("v_transactions_with_balance")]
public class TransactionWithBalance : Transaction
{
    [Column("running_balance")]
    public decimal? RunningBalance { get; set; }
}
