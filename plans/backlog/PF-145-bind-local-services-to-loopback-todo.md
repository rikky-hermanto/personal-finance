---
id: PF-145
epic: E-001
flags: [Ready]
---

# PF-145 — Bind local services to 127.0.0.1 and require a Grafana login

> **GitHub Issue:** _(create when scheduling)_
> **Status:** To Do
> **Started:** —
> **Epic:** E-001 (slice 3 of 8)
> **Sensitive:** security (network exposure, credentials). Never print or commit a real password.
> **Planned from branch:** main

## Objective

`docker-compose.yml` publishes the monitoring stack, Postgres and the AI service on every network interface, and Grafana lets anyone in as admin with the login form disabled. Anyone on the same Wi-Fi can read logs and traces that contain request data, or reach the legacy Postgres with its default password. This ticket makes every supporting service reachable only from this machine and gives Grafana a real login.

## Acceptance Criteria

- [ ] In `docker-compose.yml`, the host side of every published port for `db` (5432), `ai-service` (8000), `alloy` (4317, 4318, 12345), `prometheus` (9090), `loki` (3100), `tempo` (3200, 4319) and `grafana` (3000) is `127.0.0.1`, for example `"127.0.0.1:3000:3000"`.
- [ ] Grafana no longer sets `GF_AUTH_ANONYMOUS_ENABLED`, `GF_AUTH_ANONYMOUS_ORG_ROLE` or `GF_AUTH_DISABLE_LOGIN_FORM`. The admin password comes from an environment variable (`GRAFANA_ADMIN_PASSWORD`), and compose fails with a clear message if it is unset instead of falling back to a default.
- [ ] `.env.example` lists `GRAFANA_ADMIN_PASSWORD` with a placeholder, and no real value is committed (gitleaks stays clean).
- [ ] The Postgres default password `postgres_password_here` is no longer used as a fallback in compose; the value comes from an environment variable like the other secrets, and `.env.example` documents it.
- [ ] `docker compose config` shows no `0.0.0.0` bindings or bare `"port:port"` entries for those services, and `docker compose up -d` still brings the stack up healthy locally (Grafana reachable at `http://localhost:3000` after logging in; API, AI service `/health` and Supabase Studio still work).
- [ ] The docs that list ports and Grafana access (`docs/SETUP.md` and the Grafana line in CLAUDE.md's key ports) say the services are loopback-only and Grafana needs a login.
- [ ] `api` (7208) and `frontend` (8080) are left as they are; see Notes.

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

### [ ] STEP 1 — Record the current state
```bash
docker compose ps
docker compose config | grep -n "published\|host_ip" 
```
Note which containers are running so you can restart only what changes.

> **Why:** `.claude/rules/docker.md` says to check `docker compose ps` first and start or rebuild only what the task needs.

### [ ] STEP 2 — Bind ports to loopback
For each service listed in the acceptance criteria, change `"HOST:CONTAINER"` to `"127.0.0.1:HOST:CONTAINER"`.

> **Why:** A host IP in front of the port makes Docker listen on that interface only. Container-to-container traffic is unaffected.

### [ ] STEP 3 — Replace Grafana anonymous admin with a login
Remove the three `GF_AUTH_*` anonymous lines and add `GF_SECURITY_ADMIN_USER=admin` and `GF_SECURITY_ADMIN_PASSWORD=${GRAFANA_ADMIN_PASSWORD:?set GRAFANA_ADMIN_PASSWORD in .env}`. Add the variable to `.env.example` with a placeholder like `change-me`.

> **Why:** The `:?` form makes compose stop with a clear message instead of silently using a weak default. SEC-01 forbids committing credentials.

### [ ] STEP 4 — Remove the default Postgres password fallback
Where compose uses `postgres_password_here`, read the password from an environment variable with the `:?` guard, and document it in `.env.example`. Check `.env` files, `scripts/` and `docs/SETUP.md` for other users of the old literal and update them, without printing real values.

> **Why:** A published default password is only safe if the port is unreachable; removing the default means a future change cannot reopen the hole.

### [ ] STEP 5 — Verify
```bash
docker compose config > /dev/null && echo "compose valid"
docker compose up -d grafana loki tempo alloy prometheus ai-service db
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/login   # expect 200
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/api/org  # expect 401 without credentials
curl -s http://127.0.0.1:8000/health
```
Then check that the machine's LAN address does not answer on those ports (for example `curl --max-time 3 http://<your-LAN-IP>:3000` should fail). Report each result.

> **Why:** The acceptance test for this ticket is that the services are unreachable from other devices but still work locally.

### [ ] STEP 6 — Update docs and finish
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
