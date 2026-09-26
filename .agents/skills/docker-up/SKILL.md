---
name: docker-up
description: "Start or rebuild the requested Personal Finance Docker/Supabase development services and check health while preserving local data and unrelated running services."
---

# docker-up

Read [shared Codex workflow conventions](../../WORKFLOWS.md) before using this skill.

Read Docker rules, current compose/Supabase config, and root package scripts.
Inspect Docker availability, docker compose ps, and existing service health first.
Determine whether the task needs only API/AI, monitoring, Supabase, or the full stack.

Start the minimum requested services with docker compose V2 or Supabase CLI as
appropriate; use --build when source changes require rebuilding. Do not automatically
run down before up. Reuse working services and avoid container-name/port conflicts
through diagnosis rather than deletion. Full npm start also launches non-container
processes; explain what will run when selecting it.

Check configured health endpoints/logs and frontend/API connectivity. Use bounded
log output and redact secrets. Do not claim readiness based only on a process ID.
If a service fails, identify the first relevant error and smallest correction;
do not repeatedly restart an unchanged failure.

Never use down -v, prune, volume deletion, or database reset as routine startup.
Report what was started/reused, URLs from actual configuration, health, and blockers.
