---
name: docker-up
description: Start the local stack (or just one service, e.g. the Python AI service) and verify it is healthy. Use for "start everything", "run the app", "start the AI service", "is the stack up?".
---

# Docker Up

Start what the task needs — the full stack or a single service — and verify health. Reuse anything already healthy; don't start duplicates.

## Arguments

```
/docker-up               # full stack (default)
/docker-up ai-service    # just the Python AI service (formerly /run-ai-service)
/docker-up api           # just the .NET API
```

## Step 1 — Check what is already running

```
docker compose ps
npx supabase status
curl -sf http://localhost:7208/health      # API
curl -sf http://localhost:8000/health      # AI service
```

## Step 2 — Start

**Full stack** (recommended): from repo root, `npm start`. It runs `prestart.ps1`, starts Supabase (CLI, not compose), the monitoring containers (`db alloy prometheus loki tempo grafana`), then the API, frontend, and AI service as local processes via `concurrently`. `npm run start:no-api` does the same without the .NET API.

**Containers only:** `docker compose up --build -d <services>`. Use `--build` only when source changed. Never `down -v`, prune, or delete volumes as routine startup — that destroys data.

**AI service only** (from `services/ai-service/`):
```
.venv/Scripts/python.exe -m uvicorn app.main:app --reload --port 8000
```
Missing deps → `.venv/Scripts/python.exe -m pip install -e .` (never into global Python). The provider comes from `AI_PROVIDER` (default `gemini`) — check the key is set without printing it.

## Step 3 — Verify

| Service | Check | Expected |
|---|---|---|
| API | `curl -sf http://localhost:7208/health` | 200, `Healthy` |
| AI service | `curl -sf http://localhost:8000/health` | 200 |
| Frontend | `curl -s -o /dev/null -w "%{http_code}" http://localhost:8080` | 200 |
| Supabase Studio | http://localhost:54323 | loads |
| Grafana | http://localhost:3000 | loads |

A healthy `/health` does not prove LLM credentials work. Real extraction calls cost money — only run them when the task asks.

## Step 4 — If something fails

Read the first real error, fix the smallest thing, and don't restart an unchanged failure in a loop.

| Symptom | Likely cause |
|---|---|
| Port 5432 / 54322 in use | Another Postgres is running |
| API connection refused | Supabase not up yet — check `npx supabase status` |
| AI `ModuleNotFoundError` | Run the `pip install -e .` above inside the venv |
| Port 8000 in use | An old uvicorn is still running — stop it, or reuse it if healthy |
| Frontend 502 | API not running — check its console output |

Report what was started vs reused, the URLs, health results, and any blockers.
