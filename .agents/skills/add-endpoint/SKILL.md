---
name: add-endpoint
description: Add or extend a Personal Finance REST endpoint using the current .NET 10, MediatR, FluentValidation, and Supabase architecture, with contracts and behavior tests. Use for API endpoint implementation, not generic architecture discussion.
---

# Add an endpoint

Read [shared Codex workflow conventions](../../WORKFLOWS.md) before using this skill.

Read `apps/api/AGENTS.md` and the nearest existing controller, handler, validator,
service, DTO, and tests matching the requested behavior. Infer entity, operation,
fields, and acceptance criteria from the task; ask only for essential missing details.
Implement only requested operations, not an automatic full CRUD feature.

## Contract and persistence

- Define request/response shape, validation, error statuses, identity/authorization
  requirements, pagination where relevant, and financial units before implementation.
- Reuse existing entities when appropriate. For new persisted entities, match actual
  identifier types and PostgREST attributes in `apps/api/src/PersonalFinance.Domain/Entities/`;
  do not assume every key is an integer.
- Add timestamped SQL in root `supabase/migrations/` for schema changes, including
  appropriate indexes and access policies. Do not automatically push/reset a database.
- DTOs belong in `apps/api/src/PersonalFinance.Application/Dtos/`. No Persistence
  project, DbContext, EF migration, or Infrastructure-owned shared DTO is needed.

## Implementation

- Keep orchestration in Application commands/handlers/services and validation in
  `Application/Validation/`. Use the existing Supabase-backed service boundaries.
- Put interfaces in `Application/Interfaces/`; follow nearby implementations rather
  than imposing a new repository layer.
- Preserve required domain events after successful persistence. Handle failures using
  the existing middleware and logging conventions.
- Keep controllers thin and register dependencies at the established composition root.
- If requested behavior includes frontend integration, read frontend instructions and
  add typed plain-fetch functions under `apps/frontend/src/api/`; use React Query at
  the existing integration boundary.
- When the AI contract changes, update its producer, consumer mapping, schemas, and
  tests together. Read `services/ai-service/AGENTS.md` first.

## Verify and report

Add meaningful tests for success, invalid input, missing records, and relevant financial
or authorization boundaries. Use xUnit/Moq or pure logic, not EF InMemoryDatabase.
Run focused tests, then the appropriate build and broader checks for the changed
surfaces. Report route/method, observable behavior, tests, and unapplied migrations.
Update the shared plan/board when implementing a tracked task. Do not create a
commit merely because an endpoint was added.
