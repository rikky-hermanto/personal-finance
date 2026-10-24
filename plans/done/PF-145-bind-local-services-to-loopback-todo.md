---
id: PF-145
epic: E-001
flags: []
---

# PF-145 — Bind local services to 127.0.0.1 and require a Grafana login

> **GitHub Issue:** _(create when scheduling)_
> **Status:** Done
> **Started:** 2026-10-23 (accepted 2026-10-24)
> **Epic:** E-001 (slice 3 of 8)
> **Sensitive:** security (network exposure, credentials). Never print or commit a real password.
> **Planned from branch:** main

## Objective

`docker-compose.yml` publishes the monitoring stack, Postgres and the AI service on every network interface, and Grafana lets anyone in as admin with the login form disabled. Anyone on the same Wi-Fi can read logs and traces that contain request data, or reach the legacy Postgres with its default password. This ticket makes every supporting service reachable only from this machine and gives Grafana a real login.

## Acceptance Criteria

- [x] In `docker-compose.yml`, the host side of every published port for `db` (5432), `ai-service` (8000), `alloy` (4317, 4318, 12345), `prometheus` (9090), `loki` (3100), `tempo` (3200, 4319) and `grafana` (3000) is `127.0.0.1`, for example `"127.0.0.1:3000:3000"`.
  > Verification note: `docker compose config` shows `host_ip: 127.0.0.1` on all eight services' published ports; `api` (7208) and `frontend` (8080) remain bare.
- [x] Grafana no longer sets `GF_AUTH_ANONYMOUS_ENABLED`, `GF_AUTH_ANONYMOUS_ORG_ROLE` or `GF_AUTH_DISABLE_LOGIN_FORM`. The admin password comes from an environment variable (`GRAFANA_ADMIN_PASSWORD`), and compose fails with a clear message if it is unset instead of falling back to a default.
  > Verification note: the three `GF_AUTH_*` lines are gone; `GF_SECURITY_ADMIN_PASSWORD=${GRAFANA_ADMIN_PASSWORD:?set GRAFANA_ADMIN_PASSWORD in .env}`. `docker compose config` with no env set exits 1 with "required variable ... is missing a value".
- [x] `.env.example` lists `GRAFANA_ADMIN_PASSWORD` with a placeholder, and no real value is committed (gitleaks stays clean).
  > Verification note: `GRAFANA_ADMIN_PASSWORD=change-me` added; `gitleaks detect` → "no leaks found" (1188 commits scanned).
- [x] The Postgres default password `postgres_password_here` is no longer used as a fallback in compose; the value comes from an environment variable like the other secrets, and `.env.example` documents it.
  > Verification note: both compose usages (db env + api ConnectionStrings) now use `${POSTGRES_PASSWORD:?set POSTGRES_PASSWORD in .env}`; `.env.example` documents it with a comment. (Note: a hardcoded `postgres_password_here` health-check fallback still exists in `apps/api/src/PersonalFinance.Api/Program.cs:107` — app source, outside this plan's Affected Files and the "in compose" AC scope. Flagged for a follow-up; see Owner Review Checklist.)
- [x] `docker compose config` shows no `0.0.0.0` bindings or bare `"port:port"` entries for those services, and `docker compose up -d` still brings the stack up healthy locally (Grafana reachable at `http://localhost:3000` after logging in; API, AI service `/health` and Supabase Studio still work).
  > Verification note (static half, verified here): `docker compose config` shows `host_ip: 127.0.0.1` on every published port for `ai-service`, `alloy`, `db`, `grafana`, `loki`, `prometheus` and `tempo`, with no `0.0.0.0` host binding and no bare `port:port` for those services; the only `0.0.0.0` is Alloy's in-container `--server.http.listen-addr=0.0.0.0:12345` command arg, not a host binding. `api` (7208) and `frontend` (8080) stay bare, as intended.
  > Live half (run 2026-10-24 from the worktree with `docker compose -p personal-finance up -d db alloy prometheus loki tempo grafana ai-service`, throwaway passwords in the shell only): all seven services came up (`db` healthy), each published on `127.0.0.1` only. `/login` 200; `/api/org` anonymous 401, with the admin password 200; AI service `/health` healthy. From the LAN address 192.168.110.184, ports 9090, 5432, 8000 and 3100 were unreachable. Port 3000 answered on the LAN, but from an unrelated `node.exe` (PID 36584, a Next.js app listening on 0.0.0.0:3000), not Grafana, whose only listener is 127.0.0.1:3000. The stack was stopped afterwards (not `down`, no volumes touched) so no throwaway password stays live.
- [x] The docs that list ports and Grafana access (`docs/SETUP.md` and the Grafana line in CLAUDE.md's key ports) say the services are loopback-only and Grafana needs a login.
  > Verification note: `docs/SETUP.md` ports table + a loopback/login paragraph updated; CLAUDE.md key-ports line updated.
- [x] `api` (7208) and `frontend` (8080) are left as they are; see Notes.
  > Verification note: `config` shows both still published without `host_ip`.

## Approach

Change only the published-port strings and the Grafana environment in `docker-compose.yml`, plus the matching `.env.example` and docs lines. Containers still reach each other over the compose network, so binding the host side to loopback does not affect Alloy, Prometheus or Grafana talking to one another. Do not touch volumes, health checks, networks or `depends_on` (`.claude/rules/docker.md`). Do not use `down -v` or any volume removal. Image tag pinning belongs to the low-items ticket, not this one.

## Affected Files

| File | Change |
|------|--------|
| `docker-compose.yml` | Edit — loopback port bindings; Grafana auth env; Postgres password from env |
| `.env.example` | Edit — add `GRAFANA_ADMIN_PASSWORD` and the Postgres password variable (placeholders) |
| `docs/SETUP.md` | Edit — note loopback-only and the Grafana login |
| `CLAUDE.md` | Edit — one line on Grafana login if the port list mentions anonymous access |

---

## TODO

### [x] STEP 1 — Record the current state
```bash
docker compose ps
docker compose config | grep -n "published\|host_ip" 
```
Note which containers are running so you can restart only what changes.

> **Why:** `.claude/rules/docker.md` says to check `docker compose ps` first and start or rebuild only what the task needs.

### [x] STEP 2 — Bind ports to loopback
For each service listed in the acceptance criteria, change `"HOST:CONTAINER"` to `"127.0.0.1:HOST:CONTAINER"`.

> **Why:** A host IP in front of the port makes Docker listen on that interface only. Container-to-container traffic is unaffected.

### [x] STEP 3 — Replace Grafana anonymous admin with a login
Remove the three `GF_AUTH_*` anonymous lines and add `GF_SECURITY_ADMIN_USER=admin` and `GF_SECURITY_ADMIN_PASSWORD=${GRAFANA_ADMIN_PASSWORD:?set GRAFANA_ADMIN_PASSWORD in .env}`. Add the variable to `.env.example` with a placeholder like `change-me`.

> **Why:** The `:?` form makes compose stop with a clear message instead of silently using a weak default. SEC-01 forbids committing credentials.

### [x] STEP 4 — Remove the default Postgres password fallback
Where compose uses `postgres_password_here`, read the password from an environment variable with the `:?` guard, and document it in `.env.example`. Check `.env` files, `scripts/` and `docs/SETUP.md` for other users of the old literal and update them, without printing real values.

> **Why:** A published default password is only safe if the port is unreachable; removing the default means a future change cannot reopen the hole.

### [x] STEP 5 — Verify
```bash
docker compose config > /dev/null && echo "compose valid"
docker compose up -d grafana loki tempo alloy prometheus ai-service db
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/login   # expect 200
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/api/org  # expect 401 without credentials
curl -s http://127.0.0.1:8000/health
```
Then check that the machine's LAN address does not answer on those ports (for example `curl --max-time 3 http://<your-LAN-IP>:3000` should fail). Report each result.

> **Why:** The acceptance test for this ticket is that the services are unreachable from other devices but still work locally.

> **Note:** `docker compose config` verified (valid with vars set; fails cleanly without them). The live `up -d` + curl checks could not run from this worktree because the fixed `container_name:` values collide with the main checkout's (Exited) `personal-finance` containers. Deferred to the owner's G3 live check (Owner Review Checklist, part D/E).

### [x] STEP 6 — Update docs and finish
Update `docs/SETUP.md` and the CLAUDE.md port line. Run `git diff --stat`; expect only the files above. Do not commit.

> **Why:** Docs that say anonymous Grafana would mislead the next person and the next agent.

---

## Notes

- `api` (7208) and `frontend` (8080) are intentionally untouched: the owner has not asked to restrict them, and phone testing on the LAN may rely on them. If the owner wants them loopback-only too, that is a one-line follow-up.
- Supabase's own ports are managed by the Supabase CLI, not compose, and are out of scope.
- If the stack runs through `npm start`, restart it after changing the compose file so the new bindings take effect. Never use `docker compose down -v` (it destroys data).
- Related: pinning `:latest` monitoring images is in the low-items ticket.

## Execution Notes

Model: **Sonnet 5.5** · Effort: **high**. One config file and docs, but a wrong edit can break the local stack or leave a port open.
Before you start: the owner sets `GRAFANA_ADMIN_PASSWORD` and the Postgres password in the local `.env` (never in git).

```
/execute plans/in-progress/PF-145-bind-local-services-to-loopback-todo.md
```

### Stop and ask if

- Starting the stack would require removing a volume or recreating the Postgres data directory.
- A script or tool outside compose depends on reaching these ports from another device.

---

## ✅ Owner Review Checklist (G3)

**State:** All four files edited; diff is scoped to exactly `docker-compose.yml`, `.env.example`, `docs/SETUP.md`, `CLAUDE.md` (nothing else). `docker compose config` is valid with the two required env vars set and fails cleanly (exit 1, clear message) without them. gitleaks is clean. Code is left uncommitted. The verifier could **not** run the live `docker compose up -d` + curl checks from the worktree because the fixed `container_name:` values collide with the main checkout's (Exited) `personal-finance` containers — bringing the stack up from here would have disrupted the main checkout. That live check was then run on 2026-10-24 (see AC5): services answer on loopback only, anonymous Grafana is off. What is left for you is a re-check with your own passwords (parts A, D, E), and the stray `node.exe` on 0.0.0.0:3000 noted below.

**Also found:** an unrelated Next.js app (`node.exe`, PID 36584) listens on `0.0.0.0:3000` and `[::]:3000`, the same port as Grafana. Grafana is bound to `127.0.0.1:3000`, so `http://127.0.0.1:3000` reaches Grafana, but a browser that resolves `localhost` to `::1` may land on that app instead. It is not a compose binding and not part of this change.

**Known defects to confirm:** A hardcoded health-check fallback string `...Password=postgres_password_here` still exists in `apps/api/src/PersonalFinance.Api/Program.cs:107`. It is outside this plan's Affected Files and the AC's "in compose" scope, so it was deliberately left alone, but it is a related weak-default worth a one-line follow-up ticket. A config-only review cannot catch it because it only takes effect when no connection string is configured at all.

### A. Before you start
- ☐ On branch `loop/pf-145` (`git branch --show-current`), in the worktree `.worktrees/pf-145`.
- ☐ In your local `.env` at the repo root, set `GRAFANA_ADMIN_PASSWORD` to a real value and `POSTGRES_PASSWORD` to your existing DB password. Never commit `.env`.
- ☐ Docker Desktop is running.

### B. Read the code
- ☐ `docker-compose.yml`: every `db`/`ai-service`/`alloy`/`prometheus`/`loki`/`tempo`/`grafana` published port starts with `127.0.0.1:`; `api` (7208) and `frontend` (8080) do **not**. Grafana env has only `GF_SECURITY_ADMIN_USER` and `GF_SECURITY_ADMIN_PASSWORD=${GRAFANA_ADMIN_PASSWORD:?...}` — no `GF_AUTH_ANONYMOUS_*` / `GF_AUTH_DISABLE_LOGIN_FORM`. Both Postgres password references use `${POSTGRES_PASSWORD:?...}`.
- ☐ `.env.example`: has `GRAFANA_ADMIN_PASSWORD=change-me` and the `POSTGRES_PASSWORD` placeholder, both with comments; no real secret.
- ☐ `docs/SETUP.md` and `CLAUDE.md`: the Grafana/ports lines say loopback-only and that Grafana needs an `admin` login.

### C. Run the config + scan checks
- ☐ `docker compose config > /dev/null` with `GRAFANA_ADMIN_PASSWORD` and `POSTGRES_PASSWORD` set → no error ("compose valid").
- ☐ Unset both and run `docker compose config` → it must exit non-zero with "required variable ... is missing a value: set ... in .env".
- ☐ `docker compose config | grep -E "host_ip|0.0.0.0"` → every target service shows `host_ip: 127.0.0.1`; the only `0.0.0.0` is Alloy's `--server.http.listen-addr=0.0.0.0:12345` command line (expected — in-container, not a host binding).
- ☐ `gitleaks detect --no-banner` → "no leaks found".

### D. Start the stack and check it (the deferred live check)
- ☐ If the main checkout has old `personalfinance-*` containers, stop/remove them first so names don't collide: from `C:\workspaces\personal-finance` run `docker compose down` (plain `down`, never `-v`). Then from the worktree run `docker compose up -d db alloy prometheus loki tempo grafana ai-service`.
- ☐ `docker compose ps` → the services are `healthy`/`running`.

### E. Live acceptance checks (AC5)
- ☐ `curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/login` → `200`.
- ☐ `curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/api/org` → `401` (anonymous is off).
- ☐ Log in at `http://localhost:3000` as `admin` with your `GRAFANA_ADMIN_PASSWORD` → dashboards load.
- ☐ `curl -s http://127.0.0.1:8000/health` → healthy JSON.
- ☐ From another device (or using this machine's LAN IP): `curl --max-time 3 http://<LAN-IP>:3000` → connection refused/timeout (not reachable). Repeat the spirit of this for a couple of the other moved ports (e.g. 9090, 5432) if you want extra assurance.
- ☐ API still serves `/health` and Supabase Studio (`http://127.0.0.1:54323`) still loads — unaffected by this change.

### F. Optional stretch
- ☐ File a one-line follow-up to replace the `postgres_password_here` fallback in `Program.cs:107` with an env-backed value or a fail-fast.

### G. Decide and close
- ☐ "Accepted" = parts B–E all pass (especially the LAN-unreachable check and the Grafana login). 
- ☐ This branch is **not** merged through a PR by the loop; if you merge it yourself locally, do **not** run `/loop-accept` afterward. Once satisfied, tell Claude to move this plan to `plans/done/`, update `plans/BOARD.md`, and remove the `loop/pf-145` branch and `.worktrees/pf-145` worktree.

## Loop Notes
- 2026-10-24 11:29 Asia/Makassar all 6 steps done; live loopback checks passed 2026-10-24; awaiting G3 re-check with owner passwords
