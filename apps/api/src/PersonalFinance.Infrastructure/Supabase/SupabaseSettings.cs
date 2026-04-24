namespace PersonalFinance.Infrastructure.Supabase;

public record SupabaseSettings
{
    public string Url { get; init; } = string.Empty;
    public string AnonKey { get; init; } = string.Empty;
    public string ServiceRoleKey { get; init; } = string.Empty;
}
