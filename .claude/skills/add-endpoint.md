---
name: add-endpoint
description: Scaffold a new REST API endpoint following Clean Architecture CQRS pattern
---

# Add Endpoint

Scaffold a complete new API endpoint following the project's Clean Architecture + CQRS pattern.

Ask the user for:
- **Entity name** (e.g., "Budget", "Account")
- **Operations needed**: Create, Read, Update, Delete, or Custom
- **Properties/fields** for the entity

## Steps (for a new entity with full CRUD)

### 1. Domain Entity
Create `api/src/PersonalFinance.Domain/Entities/{Entity}.cs`
- Follow pattern from `Transaction.cs` or `CategoryRule.cs`
- Properties with sensible defaults, `int Id` as primary key

### 2. Domain Event
Create `api/src/PersonalFinance.Domain/Events/{Entity}CreatedEvent.cs`
```csharp
using MediatR;
public record {Entity}CreatedEvent({Entity} {Entity}) : INotification;
```

### 3. DTO
Create `api/src/PersonalFinance.Infrastructure/Dtos/{Entity}Dto.cs`
- Mirror entity properties, add any computed fields

### 4. DbContext Update
Update `api/src/PersonalFinance.Persistence/AppDbContext.cs`
- Add `public DbSet<{Entity}> {Entities} { get; set; }` property
- Add entity configuration in `OnModelCreating` (snake_case table name)

### 5. Migration
```
cd api && dotnet ef migrations add Add{Entity} --project src/PersonalFinance.Persistence --startup-project src/PersonalFinance.Api
```

### 6. Commands + Handlers
Create in `api/src/PersonalFinance.Application/Commands/`:
- `Create{Entity}Command.cs` — `public record Create{Entity}Command({Entity} {Entity}) : IRequest<{Entity}>;`
- `Create{Entity}CommandHandler.cs` — validate, persist, publish event
- Repeat for Update and Delete if needed

### 7. Validator
Create `api/src/PersonalFinance.Application/Validation/Create{Entity}CommandValidator.cs`
- Follow `CreateTransactionCommandValidator.cs` pattern
- Use FluentValidation rules for each property

### 8. Service
- Interface: `api/src/PersonalFinance.Application/Interfaces/I{Entity}Service.cs`
- Implementation: `api/src/PersonalFinance.Application/Services/{Entity}Service.cs`
- Methods: `GetAllAsync()`, `GetByIdAsync(int id)`, `AddAsync(dto)`, `UpdateAsync(id, dto)`, `DeleteAsync(id)`

### 9. Controller
Create `api/src/PersonalFinance.Api/Controllers/{Entity}Controller.cs`
- `[ApiController]` + `[Route("api/[controller]")]`
- Inject service via constructor
- Return appropriate HTTP status codes (200, 201, 400, 404)

### 10. DI Registration
Update `api/src/PersonalFinance.Api/Program.cs`:
```csharp
builder.Services.AddScoped<I{Entity}Service, {Entity}Service>();
```

### 11. Frontend API Client
Create `src/api/{entity}Api.ts`
- Follow pattern from `transactionsApi.ts`
- Use plain `fetch()`, return typed responses

### 12. Tests
Create `api/tests/PersonalFinance.Tests/Services/{Entity}ServiceTests.cs`
- Follow `CategoryRuleServiceTests.cs` pattern (xUnit + Moq + InMemoryDatabase)

### 13. Verify
```
cd api && dotnet test
npm run lint
```
