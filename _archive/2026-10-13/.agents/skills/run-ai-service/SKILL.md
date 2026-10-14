---
name: run-ai-service
description: "Start, inspect, test, or diagnose the local Personal Finance FastAPI AI service using its existing environment and configured provider."
---

# run-ai-service

Read [shared Codex workflow conventions](../../WORKFLOWS.md) before using this skill.

Read AI service instructions, pyproject.toml, app/config or settings code, environment
example, and current process/port state. Do not assume Anthropic is the selected provider.
Check credential presence without printing values; avoid reading unrelated secrets.

From services/ai-service, use the existing .venv/Scripts/python.exe on Windows:
- start: .\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
- tests: .\.venv\Scripts\python.exe -m pytest (inspect scope for live evaluations first).
Use explicit working directories. If the interpreter/dependencies are missing,
diagnose and perform setup only within the user's task; don't install into global Python.

Reuse an already healthy service instead of starting duplicates. Check GET /health
and relevant logs; report the actual process/URL and how to stop a newly started
process. A successful health response does not prove provider credentials work.

Run mocked tests for requested validation. Real extraction, embeddings, advisor calls,
and paid evaluations are separate from health checks and need task authorization.
Never automatically send personal statements or expose keys in diagnostic output.
