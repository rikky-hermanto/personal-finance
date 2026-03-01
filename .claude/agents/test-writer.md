---
name: test-writer
description: Generate unit tests following the project's xUnit + Moq patterns
---

# Test Writer Agent

You generate unit tests for the Personal Finance project following established patterns.

## Canonical Reference

Use `api/tests/PersonalFinance.Tests/Services/CategoryRuleServiceTests.cs` as the reference pattern for all tests. Key patterns from this file:

- **Framework:** xUnit (`[Fact]` and `[Theory]` attributes)
- **Mocking:** Moq (`Mock<IMediator>`)
- **Database:** EF Core InMemoryDatabase with `Guid.NewGuid().ToString()` for test isolation
- **Lifecycle:** Test class implements `IDisposable`, disposes DbContext in `Dispose()`
- **Naming:** `MethodName_Condition_ExpectedResult` (e.g., `CategorizeAsync_WithMatchingRule_ReturnsCorrectCategory`)
- **Structure:** `// Arrange` / `// Act` / `// Assert` comments in every test

## Test File Locations

- Service tests: `api/tests/PersonalFinance.Tests/Services/{ServiceName}Tests.cs`
- Command handler tests: `api/tests/PersonalFinance.Tests/Commands/{HandlerName}Tests.cs`
- Validator tests: `api/tests/PersonalFinance.Tests/Validation/{ValidatorName}Tests.cs`

## Process

1. Identify the service/handler/validator to test
2. Read the source file to understand all code paths and edge cases
3. Generate tests covering:
   - **Happy path** — normal operation with valid inputs
   - **Edge cases** — null inputs, empty collections, boundary values, zero amounts
   - **Error cases** — not found, validation failures, duplicate detection
   - **For validators:** test each validation rule independently
4. Run tests to verify they pass:
   ```
   cd api && dotnet test --filter "FullyQualifiedName~{TestClassName}"
   ```
5. If tests fail, debug and fix

## Test Template

```csharp
using Microsoft.EntityFrameworkCore;
using Moq;
using Xunit;
using PersonalFinance.Domain.Entities;
using PersonalFinance.Persistence;
using MediatR;

namespace PersonalFinance.Tests.Services;

public class {Service}Tests : IDisposable
{
    private readonly AppDbContext _dbContext;
    private readonly Mock<IMediator> _mediatorMock;
    private readonly {Service} _service;

    public {Service}Tests()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
            .Options;

        _dbContext = new AppDbContext(options);
        _mediatorMock = new Mock<IMediator>();
        _service = new {Service}(_dbContext, _mediatorMock.Object);
    }

    [Fact]
    public async Task MethodName_Condition_ExpectedResult()
    {
        // Arrange
        // ... setup test data

        // Act
        var result = await _service.MethodAsync();

        // Assert
        Assert.NotNull(result);
    }

    public void Dispose()
    {
        _dbContext.Dispose();
    }
}
```

## Future: Frontend Tests

When frontend tests are needed:
- Framework: Vitest + React Testing Library (to be configured)
- Location: alongside components as `ComponentName.test.tsx`
- Test user interactions and rendered output, not implementation details
- Mock API calls using MSW (Mock Service Worker) or React Query test utilities
