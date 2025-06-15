using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace PersonalFinance.Persistence
{
    public static class DependencyInjection
    {
        public static IServiceCollection AddPersistence(this IServiceCollection services, string connectionString)
        {
            services.AddDbContext<AppDbContext>(options =>
               options.UseNpgsql(connectionString)
                      .UseSnakeCaseNamingConvention());
            return services;
        }
    }
}

// Note: The code block provided is a command to install a NuGet package, not a code change to be incorporated into the file.
