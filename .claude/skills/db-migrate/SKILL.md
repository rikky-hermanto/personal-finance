---
name: db-migrate
description: Create and apply EF Core database migrations
---

# Database Migration

Create or apply Entity Framework Core migrations for the PersonalFinance database.

**Important:** All migration commands MUST include both `--project` and `--startup-project` flags.

## Create a New Migration

1. Ask the user for a migration name (PascalCase, descriptive, e.g., `AddBudgetTable`)

2. Generate migration:
   ```
   cd api && dotnet ef migrations add {MigrationName} --project src/PersonalFinance.Persistence --startup-project src/PersonalFinance.Api
   ```

3. Review the generated migration in `api/src/PersonalFinance.Persistence/Migrations/`:
   - Verify `Up()` creates expected schema changes
   - Verify `Down()` correctly reverses changes
   - NEVER edit `Designer.cs` or `Snapshot.cs` files

4. Apply the migration:
   ```
   cd api && dotnet ef database update --project src/PersonalFinance.Persistence --startup-project src/PersonalFinance.Api
   ```

## Apply Pending Migrations Only

```
cd api && dotnet ef database update --project src/PersonalFinance.Persistence --startup-project src/PersonalFinance.Api
```

## List All Migrations

```
cd api && dotnet ef migrations list --project src/PersonalFinance.Persistence --startup-project src/PersonalFinance.Api
```

## Remove Last Migration (if not applied)

```
cd api && dotnet ef migrations remove --project src/PersonalFinance.Persistence --startup-project src/PersonalFinance.Api
```

## Notes

- The API auto-applies pending migrations on startup (see `Program.cs`), so Docker users get migrations automatically
- When running locally, ensure PostgreSQL is running on port 5432
- Connection string is in `appsettings.Development.json`
- Snake_case naming is applied globally via `UseSnakeCaseNamingConvention()`
