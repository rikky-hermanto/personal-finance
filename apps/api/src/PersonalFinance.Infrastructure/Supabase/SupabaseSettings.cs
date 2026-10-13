namespace PersonalFinance.Infrastructure.Supabase;

public record SupabaseSettings
{
    public string Url { get; init; } = string.Empty;
    public string AnonKey { get; init; } = string.Empty;
    public string ServiceRoleKey { get; init; } = string.Empty;
    public string JwtSecret { get; init; } = string.Empty;
    public string JwtValidationMode { get; init; } = "Jwks";
    public string JwtIssuer { get; init; } = string.Empty;
    public string JwtAudience { get; init; } = "authenticated";
}
