# PF-S01 — Supabase project init + CLI setup

> **GitHub Issue:** #64  
> **Status:** Not Started / Ready  
> **Started:** TBD  

## Objective

Initialize the Supabase local development environment to start Phase 1 of the Supabase migration strategy. Establish local configurations for Database, Auth, Storage, and Realtime services, ensuring the `.gitignore` correctly ignores auto-generated and local temporary Supabase files.

## Acceptance Criteria

- [ ] Supabase CLI installed (or executed via `npx supabase`)
- [ ] `supabase init` command successfully runs at the root of the monolithic repository
- [ ] `supabase/config.toml` exists with valid configuration for the local stack
- [ ] Root `.gitignore` is updated with rules to ignore `supabase/.temp/` and `supabase/.branches/`
- [ ] `npx supabase start` boots up the platform containers properly
- [ ] Local Supabase Studio is accessible at `http://localhost:54323`

## Approach

Leveraging the Supabase CLI (`npx supabase` to avoid global installations, or globally if available), we initialize a new Supabase local instance inside the `personal-finance` root workspace structure.

Since we are replacing the existing standalone PostgreSQL setup handled by Docker Compose `db` service, we will introduce the Supabase-managed local containers schema but defer ripping out the old `db` and `docker-compose.yml` changes until `PF-S02` or `PF-S06` when the migration is complete. For now, running `supabase start` boots the development suite. Care must be taken to `.gitignore` the temporary configurations it spins up so we do not pollute the repository.

## Affected Files

| File | Change |
|------|--------|
| `supabase/config.toml` | Create via CLI — initial configuration for all Supabase local services |
| `.gitignore` | Modify — add ignores for `supabase/.temp/` and `supabase/.branches/` |

---

## TODO

### Phase 1 — CLI & Initialization

---

### STEP 1 — Initialize Supabase project
Run the initialization via `npx` inside the repository root.

```bash
# From workspace root
npx supabase init
```

> **Why `npx` instead of native CLI?**
> Relying on the `npm` execution via `npx supabase` ensures anyone pulling the repository can run the tooling natively via Node.js rather than installing OS-specific binaries. If the `supabase` CLI is already installed locally in the path, `supabase init` can be run straight away!

---

### STEP 2 — Update `.gitignore`
Append to the `c:/workspaces/personal-finance/.gitignore`:
```gitignore
# Supabase Local
supabase/.temp/
supabase/.branches/
```

> **Why?**
> When starting the local stack, Supabase generates proxy configurations, Docker volumes, and cached files inside `.temp` which should not be version controlled.

---

### STEP 3 — Verification (Start Local Stack)
Boot up the stack to assure Docker daemon correctly spins up the entire Supabase architecture (PostgreSQL, GoTrue for Auth, Realtime, Storage, and Postgres-Meta).

```bash
# Warning: Make sure Docker is running!
npx supabase start
```
* **Verify:** Ensure `http://localhost:54323` brings up the local Supabase studio GUI.

---
