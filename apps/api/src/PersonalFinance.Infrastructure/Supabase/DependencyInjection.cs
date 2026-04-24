using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace PersonalFinance.Infrastructure.Supabase;

public static class DependencyInjection
{
    public static IServiceCollection AddSupabase(this IServiceCollection services, IConfiguration configuration)
    {
        var settings = configuration.GetSection("Supabase").Get<SupabaseSettings>()
            ?? throw new InvalidOperationException(
                "Supabase configuration missing. Set Supabase__Url, Supabase__AnonKey, Supabase__ServiceRoleKey.");

        services.AddSingleton(settings);
        services.AddSingleton(_ =>
        {
            var options = new global::Supabase.SupabaseOptions
            {
                AutoRefreshToken = false,
                AutoConnectRealtime = false
            };
            var client = new global::Supabase.Client(settings.Url, settings.ServiceRoleKey, options);
            client.InitializeAsync().GetAwaiter().GetResult();
            return client;
        });

        return services;
    }
}
