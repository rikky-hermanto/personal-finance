using Supabase.Postgrest.Attributes;
using Supabase.Postgrest.Models;

namespace PersonalFinance.Domain.Entities.Buckets;

[Table("bucket_category_overrides")]
public class BucketCategoryOverride : BaseModel
{
    [PrimaryKey("id", shouldInsert: false)]
    public Guid Id { get; set; }

    [Column("user_id")]
    public Guid UserId { get; set; }

    // Normalized commitment key (see BucketCalculator.NormalizeDescription) the user demoted out of
    // Committed via "Not committed" in the sheet — doubles as a categorization correction signal.
    [Column("item_key")]
    public string ItemKey { get; set; } = string.Empty;

    [Column("bucket")]
    public string Bucket { get; set; } = "free";

    [Column("created_at")]
    public DateTime CreatedAt { get; set; }
}
