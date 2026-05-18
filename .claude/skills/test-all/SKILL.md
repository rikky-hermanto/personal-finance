---
name: test-all
description: Run all backend tests and frontend lint checks, report results
---

# Test All

Run the complete test and lint suite for the project.

## Steps

1. **Backend tests** — run from project root:
   ```
   cd api && dotnet test --verbosity normal
   ```

2. **Frontend lint** — run from project root:
   ```
   npm run lint
   ```

3. **Analyze failures:**
   - For backend test failures: check FluentValidation rule changes, DbContext model changes, MediatR handler changes
   - For lint errors: check TypeScript type errors, unused imports, React hook violations

4. **Report summary:**
   - Number of backend tests passed/failed/skipped
   - Number of lint errors/warnings
   - If all pass, confirm with a green summary
   - If any fail, suggest specific fixes based on the error output
