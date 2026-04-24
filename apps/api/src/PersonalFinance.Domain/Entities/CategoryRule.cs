using Supabase.Postgrest.Attributes;
using Supabase.Postgrest.Models;

namespace PersonalFinance.Domain.Entities;

[Table("category_rules")]
public class CategoryRule : BaseModel
{
    [PrimaryKey("id", shouldInsert: false)]
    public int Id { get; set; }

    [Column("keyword")]
    public string Keyword { get; set; } = string.Empty;

    [Column("type")]
    public string Type { get; set; } = string.Empty;

    [Column("category")]
    public string Category { get; set; } = string.Empty;

    [Column("keyword_length")]
    public int KeywordLength
    {
        get => string.IsNullOrEmpty(Keyword) ? 0 : Keyword.Length;
        set { /* DB value ignored — computed from Keyword; getter used on INSERT/UPDATE */ }
    }
}
