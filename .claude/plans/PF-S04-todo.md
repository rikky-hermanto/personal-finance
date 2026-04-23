# PF-S04 — Add supabase-csharp SDK — DI setup and SupabaseSettings

> **GitHub Issue:** [#67](https://github.com/rikky-hermanto/personal-finance/issues/67)
> **Status:** Ready
> **Phase:** 2 — Replace EF Core with supabase-csharp (first task)

## Current state

| Artifact | State |
|----------|-------|
| `Supabase` NuGet | ❌ Not installed anywhere |
| `Infrastructure/Supabase/` folder | ❌ Does not exist |
| `Program.cs` persistence wiring | `AddPersistence(connectionString)` — EF Core |
| EF Core migration auto-run block | Present (Program.cs lines 67–71) |
| `.env.example` | Has VITE/Postgres vars, no Supabase vars |
| `appsettings.Development.json` | Has `ConnectionStrings:Default`, no Supabase section |

**What this task does:** Installs the SDK and wires the `Supabase.Client` singleton into DI.
Handlers still compile and reference `AppDbContext` — that's expected and intentional until PF-S06.

---

## TODO

### STEP 1 — Add `Supabase` NuGet to Infrastructure

Edit `apps/api/src/PersonalFinance.Infrastructure/PersonalFinance.Infrastructure.csproj`:

```xml
<ItemGroup>
  <PackageReference Include="CsvHelper" Version="33.1.0" />
  <PackageReference Include="PdfPig" Version="0.1.11-alpha-20250602-89abf" />
  <PackageReference Include="Supabase" Version="1.1.1" />   <!-- add this line -->
</ItemGroup>
```

---

### STEP 2 — Create `SupabaseSettings.cs`

Create file: `apps/api/src/PersonalFinance.Infrastructure/Supabase/SupabaseSettings.cs`

```csharp
namespace PersonalFinance.Infrastructure.Supabase;

public record SupabaseSettings
{
    public string Url { get; init; } = string.Empty;
    public string AnonKey { get; init; } = string.Empty;
    public string ServiceRoleKey { get; init; } = string.Empty;
}
```

---

### STEP 3 — Create `DependencyInjection.cs`

Create file: `apps/api/src/PersonalFinance.Infrastructure/Supabase/DependencyInjection.cs`

```csharp
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
```

> **Why `global::` prefix?** Avoids namespace collision between `PersonalFinance.Infrastructure.Supabase` and the `Supabase` NuGet namespace.

> **Why `ServiceRoleKey` for the singleton?** All server-side operations bypass RLS. When Auth is added in PF-S08, user-context calls will pass the user JWT per-request; the singleton is exclusively for service-role operations.

> **Why `AutoConnectRealtime = false`?** Realtime subscriptions are wired in PF-S12. Connecting at startup wastes a WebSocket until then.

---

### STEP 4 — Update `Program.cs`

File: `apps/api/src/PersonalFinance.Api/Program.cs`

**Remove** the EF Core wiring (3 changes):

```csharp
// Remove this using at the top:
using PersonalFinance.Persistence;

// Remove this line in the services block:
builder.Services.AddPersistence(builder.Configuration.GetConnectionString("Default")!);

// Remove this entire block before app.MapOpenApi():
using (var scope = app.Services.CreateScope())
{
    var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    dbContext.Database.Migrate();
}
```

**Add** Supabase wiring in the services block (after the existing parser registrations):

```csharp
using PersonalFinance.Infrastructure.Supabase;   // add at top

builder.Services.AddSupabase(builder.Configuration);  // add in services block
```

> **Compile note:** Handlers that inject `AppDbContext` still compile — Application.csproj still references Persistence.csproj. They fail at DI resolution when a request hits them. This is expected; PF-S06 fixes it.

---

### STEP 5 — Update `appsettings.Development.json`

File: `apps/api/src/PersonalFinance.Api/appsettings.Development.json`

Add the Supabase section alongside the existing `ConnectionStrings` block:

```json
{
  "ConnectionStrings": {
    "Default": "Host=localhost;Port=5432;Database=personal_finance;Username=postgres;Password=YOUR_SECURE_PASSWORD"
  },
  "Supabase": {
    "Url": "http://localhost:54321",
    "AnonKey": "",
    "ServiceRoleKey": ""
  },
  "Logging": {
    "LogLevel": {
      "Default": "Information",
      "Microsoft.AspNetCore": "Warning"
    }
  }
}
```

> **Local dev values:** `Url` is the local Supabase API. `AnonKey` and `ServiceRoleKey` are shown in `supabase status` output — set them via environment variables (`Supabase__AnonKey`, `Supabase__ServiceRoleKey`), not hardcoded here.

---

### STEP 6 — Update `.env.example`

File: `.env.example`

Add below the existing vars:

```
# Supabase (backend — server-side operations)
Supabase__Url=https://your-project-ref.supabase.co
Supabase__AnonKey=your-anon-key-here
Supabase__ServiceRoleKey=your-service-role-key-here
```

> **`__` double-underscore:** ASP.NET Core maps `Supabase__Url` env var → `"Supabase": { "Url": "..." }` in config. Local dev values come from `supabase status`.

---

### STEP 7 — Build verification

```bash
cd apps/api && dotnet build PersonalFinance.slnx
```

Expected: **0 errors**. EF Core packages remain in Persistence.csproj so no missing-package warnings. The `AddPersistence` using is removed so no Persistence namespace leaking into Api.

---

## Affected files

| File | Change |
|------|--------|
| `apps/api/src/PersonalFinance.Infrastructure/PersonalFinance.Infrastructure.csproj` | Add `Supabase` v1.1.1 package |
| `apps/api/src/PersonalFinance.Infrastructure/Supabase/SupabaseSettings.cs` | **Create** |
| `apps/api/src/PersonalFinance.Infrastructure/Supabase/DependencyInjection.cs` | **Create** |
| `apps/api/src/PersonalFinance.Api/Program.cs` | Remove `AddPersistence`, migration block; add `AddSupabase` |
| `apps/api/src/PersonalFinance.Api/appsettings.Development.json` | Add `Supabase` config section |
| `.env.example` | Add Supabase env var documentation |

## What this unblocks

- **PF-S05** — Annotate Domain entities for PostgREST (needs the package installed first)
- **PF-S06** — Rewrite CQRS handlers (needs `Supabase.Client` in DI)
