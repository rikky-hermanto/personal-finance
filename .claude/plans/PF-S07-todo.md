# PF-S07 — Delete PersonalFinance.Persistence — Eliminate EF Core

> **GitHub Issue:** [#70](https://github.com/rikky-hermanto/personal-finance/issues/70)
> **Status:** Not Started
> **Phase:** Supabase Migration Phase 2 (step 7/13)
> **Depends on:** PF-S06 (handlers/services rewritten to supabase-csharp — ✅ done)

## Objective

Delete the `PersonalFinance.Persistence` project and all EF Core references from the solution. PF-S06 rewrote every handler and service to use supabase-csharp directly — `AppDbContext` is no longer called anywhere outside the Persistence project itself, making it safe to remove. This resolves ARCH-01 (Application → Persistence layer violation) and removes ~5 EF Core packages that have no remaining use. It also removes the stale `Microsoft.EntityFrameworkCore.Design` reference from the Api project (ARCH-06) and leaves the `PdfPig` reference only in Infrastructure where it belongs.

## Acceptance Criteria

- [ ] `src/PersonalFinance.Persistence/` directory fully deleted (all files including `obj/`, `bin/`)
- [ ] Persistence project removed from `PersonalFinance.slnx`
- [ ] `Application.csproj` no longer references Persistence (ARCH-01 resolved)
- [ ] `Api.csproj` no longer references EF Core Design or PdfPig (ARCH-06 resolved)
- [ ] `Tests.csproj` no longer references Persistence project or EF Core packages
- [ ] `dotnet build PersonalFinance.slnx` passes with 0 errors, 0 warnings
- [ ] `dotnet test` passes (all existing tests green)

## Approach

Remove all references first (`.csproj` edits + `.slnx` edit), then delete the physical directory. Build order matters: fix `.csproj` files before deleting the directory so the SDK doesn't error on a missing project reference before we've cleaned the consuming projects. PdfPig is removed from `Api.csproj` in the same pass — it's already in `Infrastructure.csproj` where it's used; the Api reference is a leftover ARCH-06 violation.

Out of scope: writing new tests, adding integration test harness (tracked in PF-034), any changes to handler or service code.

## Affected Files

| File | Change |
|------|--------|
| `apps/api/PersonalFinance.slnx` | Remove `<Project Path="src/PersonalFinance.Persistence/...">` entry |
| `apps/api/src/PersonalFinance.Application/PersonalFinance.Application.csproj` | Remove `<ProjectReference>` to Persistence |
| `apps/api/src/PersonalFinance.Api/PersonalFinance.Api.csproj` | Remove `Microsoft.EntityFrameworkCore.Design` + `PdfPig` package references |
| `apps/api/tests/PersonalFinance.Tests/PersonalFinance.Tests.csproj` | Remove Persistence `<ProjectReference>` + remove EF Core + InMemory packages |
| `apps/api/src/PersonalFinance.Persistence/` | Delete entire directory (physical delete) |

---

## TODO

### [ ] STEP 1 — Remove Persistence from the solution file

Edit `apps/api/PersonalFinance.slnx`: delete the line referencing the Persistence project inside the `/src/` folder:

```xml
<!-- Remove this line from PersonalFinance.slnx -->
<Project Path="src/PersonalFinance.Persistence/PersonalFinance.Persistence.csproj" />
```

> **Why:** The `.slnx` is the MSBuild solution entry point. If the project still appears here, `dotnet build` will try to build it and fail once the directory is gone. Remove it first so the solution reflects reality before the directory delete in STEP 5.

---

### [ ] STEP 2 — Remove Persistence reference from Application.csproj

Edit `apps/api/src/PersonalFinance.Application/PersonalFinance.Application.csproj`: remove the `<ProjectReference>` to Persistence:

```xml
<!-- Remove this entire element -->
<ProjectReference Include="..\PersonalFinance.Persistence\PersonalFinance.Persistence.csproj" />
```

> **Why:** This is the ARCH-01 violation — Application (inner layer) must not reference Persistence (outer layer). PF-S06 removed the last `using` statements that needed it (`AppDbContext` injection). Removing this reference makes the architecture conformant.

---

### [ ] STEP 3 — Remove EF Core Design and PdfPig from Api.csproj

Edit `apps/api/src/PersonalFinance.Api/PersonalFinance.Api.csproj`: remove these two `<PackageReference>` entries:

```xml
<!-- Remove these two elements -->
<PackageReference Include="Microsoft.EntityFrameworkCore.Design" Version="10.0.1">
  <PrivateAssets>all</PrivateAssets>
  <IncludeAssets>runtime; build; native; contentfiles; analyzers; buildtransitive</IncludeAssets>
</PackageReference>
<PackageReference Include="PdfPig" Version="0.1.11-alpha-20250602-89abf" />
```

> **Why:** `EF Core Design` was only needed to run `dotnet ef migrations` from the Api startup project — that workflow is gone. `PdfPig` is already declared in `Infrastructure.csproj` (where the parsers that use it live); having it in Api as well is ARCH-06 (outer-layer package in the wrong project). Both are safe to remove because no Api source file imports either package directly.

---

### [ ] STEP 4 — Remove Persistence reference and EF packages from Tests.csproj

Edit `apps/api/tests/PersonalFinance.Tests/PersonalFinance.Tests.csproj`:

```xml
<!-- Remove the project reference -->
<ProjectReference Include="..\..\src\PersonalFinance.Persistence\PersonalFinance.Persistence.csproj" />

<!-- Remove these two package references -->
<PackageReference Include="Microsoft.EntityFrameworkCore" Version="10.0.1" />
<PackageReference Include="Microsoft.EntityFrameworkCore.InMemory" Version="10.0.1" />
```

> **Why:** `CategoryRuleServiceTests` was already rewritten in PF-S06 to use `null!` for the Supabase client and `Mock<IMediator>` — it no longer uses `InMemoryDatabase` or `AppDbContext`. Keeping the EF packages would leave the test project with an implicit dependency on a project that no longer exists, causing a build error once STEP 5 deletes the directory.

---

### [ ] STEP 5 — Delete the Persistence project directory

```bash
rm -rf apps/api/src/PersonalFinance.Persistence
```

> **Why:** The directory contains `AppDbContext.cs`, `DependencyInjection.cs`, all EF migrations, and generated `obj/` + `bin/` artifacts. All are obsolete — schema is now managed via `supabase/migrations/` SQL files applied with `supabase db push`. Deleting the directory is the final physical proof that EF Core is gone.

---

### [ ] STEP 6 — Build and verify zero errors

```bash
cd apps/api && dotnet build PersonalFinance.slnx
```

Expected: `Build succeeded. 0 Error(s) 0 Warning(s)` (or only pre-existing warnings unrelated to this change).

> **Why:** This is the gate. A clean build confirms every reference was removed before the delete happened. If any `using PersonalFinance.Persistence` or `AppDbContext` reference was missed, it surfaces here with a precise error and line number — fix it before proceeding.

---

### [ ] STEP 7 — Run tests and confirm all pass

```bash
cd apps/api && dotnet test
```

Expected: all tests pass. The skipped tests (`[Fact(Skip = "...")]`) in `CategoryRuleServiceTests` are expected to remain skipped — that is correct behaviour until PF-034 adds an integration harness.

> **Why:** Tests verify that the handler and service code, which still runs against Supabase, wasn't accidentally broken by the project restructure. A green test run confirms the dependency graph is coherent end-to-end.

---

## Notes

- `AppDbContext` is declared in `Persistence/AppDbContext.cs` — after PF-S06 no handler or service injects it. The grep `grep -rn "AppDbContext" apps/api/src --include="*.cs"` returning only Persistence files confirmed this before writing the plan.
- The `obj/` and `bin/` subdirectories inside Persistence contain generated files — `rm -rf` removes them in one shot. No need to manually clean them first.
- ARCH-06 (PdfPig in Api.csproj) is fixed opportunistically here because this pass touches Api.csproj anyway. It is a one-line removal.
- The test project's `Microsoft.EntityFrameworkCore.InMemory` was only useful when tests created `AppDbContext` with `UseInMemoryDatabase`. The rewritten tests use Moq — the package has no remaining use.
- After this task, the only EF-related artefact remaining is the old migrations folder that was deleted. Schema history is now in `supabase/migrations/`.
