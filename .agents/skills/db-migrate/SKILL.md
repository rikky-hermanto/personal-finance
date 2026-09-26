---
name: db-migrate
description: "Create and verify Supabase SQL schema migrations for Personal Finance. Use for database schema changes or an explicitly requested migration application, not EF Core migration scaffolding."
---

# db-migrate

Read [shared Codex workflow conventions](../../WORKFLOWS.md) before using this skill.

Read backend and Docker rules, current Supabase config, existing migrations, entity
mappings, policies, and consumers. Identify intended environment before any database
command. Current persistence is Supabase/PostgREST; no EF migration or DbContext.

Create a unique timestamped SQL file in supabase/migrations/ with the smallest schema
change, constraints/indexes, backfill ordering, and appropriate RLS/grants. Coordinate
DTO/entity/client changes and consider existing data, locks, precision, nullability,
and compatibility during rollout. Do not edit an already-applied migration to rewrite
history. State rollback limitations, particularly destructive data changes.

Use Supabase CLI commands only after checking installed help/current project config.
Writing a migration does not authorize applying it remotely, resetting local data,
or dropping objects. Apply only to the environment authorized by the user; confirm
the resolved target when ambiguous. Never expose credentials in output.

Validate SQL and affected contracts with available local tools/tests. If no database
is available, report that execution remains unverified; do not claim schema success
from a generated file. Report migration path, intended effect, application status,
checks, and material rollout risks.
