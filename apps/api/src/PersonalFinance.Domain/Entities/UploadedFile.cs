using Supabase.Postgrest.Attributes;
using Supabase.Postgrest.Models;

namespace PersonalFinance.Domain.Entities;

[Table("uploaded_files")]
public class UploadedFile : BaseModel
{
    [PrimaryKey("id", shouldInsert: false)]
    public int Id { get; set; }

    [Column("file_hash")]
    public string FileHash { get; set; } = string.Empty;

    [Column("file_name")]
    public string FileName { get; set; } = string.Empty;

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
