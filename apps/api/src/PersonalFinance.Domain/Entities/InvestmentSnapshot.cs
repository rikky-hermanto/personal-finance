using Supabase.Postgrest.Attributes;
using Supabase.Postgrest.Models;

namespace PersonalFinance.Domain.Entities;

[Table("investment_snapshots")]
public class InvestmentSnapshot : BaseModel
{
    [PrimaryKey("id", shouldInsert: false)]
    public Guid Id { get; set; }

    [Column("setup_id")]
    public Guid SetupId { get; set; }

    [Column("label")]
    public string Label { get; set; } = string.Empty;

    [Column("snapshot_date")]
    public DateOnly SnapshotDate { get; set; }

    [Column("total_value")]
    public decimal? TotalValue { get; set; }

    [Column("currency")]
    public string Currency { get; set; } = "IDR";

    [Column("ai_provider")]
    public string AiProvider { get; set; } = string.Empty;

    [Column("ai_model")]
    public string AiModel { get; set; } = string.Empty;

    [Column("analysis_json")]
    public string? AnalysisJson { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; }
}
