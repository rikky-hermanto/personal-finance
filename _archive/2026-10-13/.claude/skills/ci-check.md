# Skill: ci-check

Run all 5 CI gate commands locally before pushing. Maps to governance rule CI-01.

Use this before every `git push` or pull request. All 5 gates must pass.

## Gates

### Gate 1 — Backend build

```bash
cd apps/api && dotnet build PersonalFinance.slnx
```

Expected: `Build succeeded.` with 0 errors, 0 warnings (warnings are errors via CI-02).

### Gate 2 — Backend tests

```bash
cd apps/api && dotnet test PersonalFinance.slnx
```

Expected: All tests pass. No skipped tests without justification.

### Gate 3 — Frontend lint

```bash
cd apps/frontend && npm run lint
```

Expected: No ESLint errors. Warnings are acceptable but should be noted.

### Gate 4 — TypeScript type check

```bash
cd apps/frontend && npx tsc --noEmit
```

Expected: No output (zero type errors). Any error is a blocker.

Note: TypeScript strict mode is currently disabled (CODE-04 violation, PF-052). Once enabled, this gate will be stricter.

### Gate 5 — AI service tests

```bash
cd services/ai-service
source .venv/Scripts/activate   # Windows Git Bash
pytest
```

Expected: All tests pass. No real Anthropic API calls (all mocked per ai-service.md rules).

Skip this gate only if `services/ai-service/` has no code yet (pre-PF-011).

## Quick run (all gates, sequential)

```bash
cd apps/api && dotnet build PersonalFinance.slnx && dotnet test PersonalFinance.slnx && cd ../../apps/frontend && npm run lint && npx tsc --noEmit
```

## What this replaces

This skill supersedes `test-all.md`, which only ran 2 of these 5 gates. Keep `test-all.md` for quick iteration; use `ci-check` before any push.

## If a gate fails

| Gate | Common cause | Fix |
|------|-------------|-----|
| dotnet build | Missing package reference | `dotnet restore PersonalFinance.slnx` |
| dotnet test | New code broke existing test | Fix the code, not the test (THINK-04) |
| npm run lint | ESLint error | Fix the linting issue; never disable rules inline |
| tsc --noEmit | Type error | Add proper types; never use `any` or `// @ts-ignore` |
| pytest | Mock not set up | Ensure all Anthropic calls are mocked (ai-service.md) |

## Related

- Rules: `.claude/rules/governance.md` (CI-01 through CI-03)
- Run AI service: `/run-ai-service`
- Backend tests only: `cd apps/api && dotnet test`
