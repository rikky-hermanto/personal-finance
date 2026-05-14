using Supabase.Postgrest.Attributes;
using Supabase.Postgrest.Models;

namespace PersonalFinance.Domain.Entities;

[Table("category_presets")]
public class CategoryPreset : BaseModel
{
    [PrimaryKey("id", shouldInsert: false)]
    public int Id { get; set; }

    [Column("keyword")]
    public string Keyword { get; set; } = string.Empty;

    [Column("category")]
    public string Category { get; set; } = string.Empty;

    [Column("type")]
    public string Type { get; set; } = string.Empty;

    [Column("flow")]
    public string? Flow { get; set; }

    [Column("keyword_length")]
    public int KeywordLength
    {
        get => Keyword?.Length ?? 0;
        set { /* computed — DB value ignored */ }
    }

    [Column("version")]
    public int Version { get; set; } = 1;
}
