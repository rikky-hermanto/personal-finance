using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using PersonalFinance.Application.Interfaces;

namespace PersonalFinance.Infrastructure.Supabase;

public static class DependencyInjection
{
    public static IServiceCollection AddSupabase(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddSingleton(provider => configuration.GetSection("Supabase").Get<SupabaseSettings>()
            ?? throw new InvalidOperationException("Supabase configuration missing."));
        services.AddScoped(provider =>
        {
            var settings = provider.GetRequiredService<SupabaseSettings>();
            var caller = provider.GetRequiredService<ICurrentUser>();
            // Capture the already-validated token in this request's client. Never mutate a shared session.
            var token = caller.AccessToken;
            var options = new global::Supabase.SupabaseOptions
            {
                AutoRefreshToken = false,
                AutoConnectRealtime = false,
                Headers = new Dictionary<string, string>
                {
                    ["Authorization"] = $"Bearer {token}"
                }
            };
            var client = new global::Supabase.Client(settings.Url, settings.AnonKey, options);
            client.InitializeAsync().GetAwaiter().GetResult();
            return client;
        });

        services.AddScoped<PersonalFinance.Application.Interfaces.IFileStorageService, StorageService>();

        return services;
    }
}
