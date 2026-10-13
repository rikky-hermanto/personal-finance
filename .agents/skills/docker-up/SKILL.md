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

## AI service only (formerly the run-ai-service skill)

Read AI service instructions, pyproject.toml, config code, and the environment example.
Do not assume Anthropic is the selected provider. Check credential presence without
printing values. From services/ai-service, use the existing .venv/Scripts/python.exe:
- start: .\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
- tests: .\.venv\Scripts\python.exe -m pytest (inspect scope for live evaluations first).
If dependencies are missing, set up only within the task; never install into global
Python. Check GET /health; a healthy response does not prove provider credentials work.
Real extraction, embeddings, advisor calls, and paid evaluations need task authorization.
Never send personal statements or expose keys in diagnostic output.
