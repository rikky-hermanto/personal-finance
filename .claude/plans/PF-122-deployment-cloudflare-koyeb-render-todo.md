# PF-105 — Deployment: Cloudflare Pages + Supabase Cloud + Koyeb + Render + Grafana Cloud

> **Based on:** `.claude/plans/PF-105-deployment-strategy-verdict.md` (Option A' synthesis)
> **Status:** Not Started
> **Target stack:** Cloudflare Pages (frontend) · Supabase Cloud (DB) · Koyeb Eco (API) · Render (AI) · Grafana Cloud (observability)

## Objective

Deploy the full personal-finance stack to free-tier cloud hosting so the app is publicly reachable. Zero ongoing cost until real users trigger scale. Execution blocks are clearly marked with **🧑 DEVELOPER ACTION REQUIRED** when you need to take action in a browser or external console — Claude cannot do those for you.

## Acceptance Criteria

- [ ] Frontend accessible at a public Cloudflare Pages URL
- [ ] `.NET API` health check returns 200 from Koyeb URL
- [ ] Python AI service health check returns 200 from Render URL
- [ ] Supabase Cloud DB connected and schema in place (migrations applied)
- [ ] End-to-end: upload BCA CSV on live site → row appears in Supabase Cloud DB
- [ ] End-to-end: upload PDF → AI service extracts → row appears in DB
- [ ] Grafana Cloud shows traces from both services
- [ ] Gemini + Anthropic spend caps set to $5/mo each
- [ ] No secrets in `appsettings.json` or `config.py` — all via platform env vars
- [ ] CORS locked to Cloudflare Pages domain only

## Affected Files

| File | Change |
|------|--------|
| `apps/api/src/PersonalFinance.Api/Program.cs` | Ensure `CORS_ORIGINS` read from env, not hardcoded |
| `apps/api/src/PersonalFinance.Api/appsettings.json` | Remove Supabase URL/keys — source from env only |
| `apps/api/src/PersonalFinance.Api/appsettings.Development.json` | Keep local values; confirm prod reads from env |
| `services/ai-service/app/config.py` | Confirm all API keys come from env; no hardcoded fallbacks |
| `apps/frontend/vite.config.ts` | No change needed — `VITE_API_URL` already reads from env at build time |
| `apps/api/Dockerfile` | Verify — should already work on Koyeb |
| `services/ai-service/Dockerfile` | Verify — should already work on Render |

---

## TODO

### [ ] STEP 1 — Verify Dockerfiles work locally before touching cloud

Before any cloud deployment, confirm both Dockerfiles build and run cleanly from scratch. A broken Dockerfile discovered after pushing wastes time.

```bash
# .NET API
cd apps/api
docker build -t pf-api-test .
docker run --rm -p 7208:7208 \
  -e Supabase__Url=http://host.docker.internal:54321 \
  -e Supabase__AnonKey=your-local-anon-key \
  -e Supabase__ServiceRoleKey=your-local-service-role-key \
  pf-api-test
# Visit http://localhost:7208/health → expect 200

# Python AI service
cd services/ai-service
docker build -t pf-ai-test .
docker run --rm -p 8000:8000 \
  -e AI_PROVIDER=gemini \
  -e GEMINI_API_KEY=your-key \
  pf-ai-test
# Visit http://localhost:8000/health → expect {"status":"ok"}
```

> **Why first?** Cloud deployment platforms (Koyeb, Render) pull your Dockerfile and build it. If it breaks in CI you get opaque logs. Finding the issue locally is 10x faster.

---

### [ ] STEP 2 — Audit `Program.cs` CORS configuration

Open `apps/api/src/PersonalFinance.Api/Program.cs` and verify that `CORS_ORIGINS` is read from an environment variable, not hardcoded. The policy must use the env var so the live deployment can lock CORS to the Cloudflare Pages domain.

**What to look for:**
```csharp
// CORRECT — reads from env
var corsOrigins = builder.Configuration["CORS_ORIGINS"]?.Split(',') 
    ?? new[] { "http://localhost:8080" };
builder.Services.AddCors(options =>
    options.AddDefaultPolicy(policy =>
        policy.WithOrigins(corsOrigins).AllowAnyHeader().AllowAnyMethod()));
```

If CORS origins are currently hardcoded strings, update to read from `Configuration["CORS_ORIGINS"]` with a localhost fallback for local dev. Claude will implement this change in this step.

---

### [ ] STEP 3 — Audit `appsettings.json` for hardcoded Supabase credentials

Open `apps/api/src/PersonalFinance.Api/appsettings.json`. The production config must NOT contain real Supabase URLs or keys — those must come from Koyeb's env var store.

**What to verify:**
- `appsettings.json` — should have empty/placeholder values only (non-secret)
- `appsettings.Development.json` — local dev values are fine here (well-known local Supabase defaults)

If the base `appsettings.json` has real Supabase keys, move them to be env-var-only. Claude will implement this if needed.

---

### [ ] STEP 4 — Audit `config.py` for hardcoded API keys

Open `services/ai-service/app/config.py`. Confirm every secret (GEMINI_API_KEY, ANTHROPIC_API_KEY) is sourced from `os.environ` or Pydantic `BaseSettings` with no hardcoded fallback value.

```python
# CORRECT
gemini_api_key: str = Field(..., validation_alias="GEMINI_API_KEY")  # ... = required, no default

# WRONG — hardcoded fallback is a security leak
gemini_api_key: str = os.getenv("GEMINI_API_KEY", "AIza...")
```

Claude will fix any hardcoded fallbacks in this step.

---

### [ ] STEP 5 — 🧑 DEVELOPER ACTION: Create Supabase Cloud project

> **You must do this — Claude cannot create cloud accounts or projects.**

1. Go to [https://supabase.com](https://supabase.com) and sign in (or create a free account)
2. Click **New Project**
3. Set:
   - **Organization:** your org (or create one)
   - **Name:** `personal-finance`
   - **Database Password:** generate a strong password — **save it in a password manager**
   - **Region:** pick closest to you (Singapore / Southeast Asia recommended)
4. Wait ~2 min for project provisioning
5. Go to **Settings → API** and copy:
   - **Project URL** (looks like `https://xxxxxxxxxxxx.supabase.co`)
   - **anon (public) key**
   - **service_role (secret) key** — treat this like a root password

> **Free tier limits:** 500MB DB, 1GB storage, 2GB bandwidth. Fine for sandbox.
> **Important:** Supabase free projects pause after **7 days of inactivity**. Step 17 adds a cron to prevent this.

---

### [ ] STEP 6 — Push database migrations to Supabase Cloud

With the Supabase Cloud project URL and service role key in hand, push your local migrations to the cloud project.

```bash
# Link your local Supabase CLI to the cloud project
# The project ref is the ID in your project URL: https://<ref>.supabase.co
supabase link --project-ref <your-project-ref>
# It will prompt for your database password (from Step 5)

# Push all migrations
supabase db push

# Verify: open Supabase Studio for your cloud project
# https://supabase.com/dashboard/project/<ref>/editor
# Check that tables (transactions, category_rules, uploaded_files, etc.) exist
```

> **Why `db push` not `db reset`?** `db reset` wipes the DB first. On a fresh cloud project `db push` is safe, but `db reset` should never be run against a project with real user data.

---

### [ ] STEP 7 — 🧑 DEVELOPER ACTION: Create Koyeb account and deploy .NET API

> **You must do this — Claude cannot log in to platforms or click deploy buttons.**

**7a. Sign up for Koyeb**
1. Go to [https://www.koyeb.com](https://www.koyeb.com) → **Sign up** (free, no credit card needed for Eco instances)

**7b. Deploy the .NET API**
1. From the Koyeb dashboard → **Create App**
2. Select **Docker** deployment type
3. Connect your GitHub repo: `rikky-hermanto/personal-finance`
4. Set:
   - **Dockerfile path:** `apps/api/Dockerfile`
   - **Instance type:** `eco-nano` (512MB RAM, free tier — the key insight from DevB)
   - **Port:** `7208`
   - **Health check path:** `/health`
5. Add environment variables (see the table below)
6. Click **Deploy**

**Environment variables to set on Koyeb:**

| Variable | Value | Where to find it |
|---|---|---|
| `ASPNETCORE_ENVIRONMENT` | `Production` | — |
| `Supabase__Url` | `https://xxxx.supabase.co` | Supabase Cloud → Settings → API |
| `Supabase__AnonKey` | `eyJ...` | Supabase Cloud → Settings → API |
| `Supabase__ServiceRoleKey` | `eyJ...` | Supabase Cloud → Settings → API (service_role) |
| `AiService__BaseUrl` | `https://<your-render-service>.onrender.com` | Set after Step 8 |
| `CORS_ORIGINS` | `https://<your-cf-pages-domain>.pages.dev` | Set after Step 9 |
| `ConnectionStrings__Default` | Postgres connection string | Supabase Cloud → Settings → Database → Connection string (Transaction pooler) |

> **Note:** `AiService__BaseUrl` and `CORS_ORIGINS` can be set after Steps 8 and 9. Leave them as temporary placeholders (`http://localhost:8000` and `http://localhost:8080`) to get the initial deploy working, then update.

---

### [ ] STEP 8 — 🧑 DEVELOPER ACTION: Create Render account and deploy Python AI service

> **You must do this — Claude cannot log in to Render.**

1. Go to [https://render.com](https://render.com) → **Sign up** (free)
2. Connect your GitHub account
3. **New → Web Service**
4. Select repo `rikky-hermanto/personal-finance`
5. Set:
   - **Root directory:** `services/ai-service`
   - **Dockerfile path:** `services/ai-service/Dockerfile`
   - **Instance type:** **Free** (512MB, cold starts expected — acceptable for async AI work)
   - **Port:** `8000`
   - **Health check path:** `/health`
6. Add environment variables:

| Variable | Value | Where to find it |
|---|---|---|
| `AI_PROVIDER` | `gemini` | — |
| `GEMINI_API_KEY` | your key | Google AI Studio → API Keys |
| `ANTHROPIC_API_KEY` | your key | console.anthropic.com → API Keys |
| `CORS_ORIGINS` | `https://<koyeb-api-url>,https://<cf-pages-url>` | Set after Steps 7 + 9 |
| `LOG_LEVEL` | `INFO` | — |

> **Cold start warning:** Render free tier spins down after 15 min inactivity. First AI extraction of the day will take 30–50 seconds. This is acceptable because the AI service handles async PDF/image extractions, not interactive API calls. Step 17 optionally adds a warmer cron if this bothers you.

---

### [ ] STEP 9 — 🧑 DEVELOPER ACTION: Deploy frontend to Cloudflare Pages

> **You must do this — Claude cannot create Cloudflare accounts.**

1. Go to [https://pages.cloudflare.com](https://pages.cloudflare.com) → **Sign up** (free)
2. **Create a project → Connect to Git**
3. Select repo `rikky-hermanto/personal-finance`
4. Build settings:
   - **Framework preset:** Vite
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
   - **Root directory:** `apps/frontend`
5. Environment variables (build-time):

| Variable | Value |
|---|---|
| `VITE_API_URL` | `https://<your-koyeb-api-url>` |

6. Click **Save and Deploy**

> **Why Cloudflare Pages over Vercel?** Better free-tier bandwidth terms for indie projects. No "fair use" policy that gates on traffic spikes. Integrates with Cloudflare Workers later if you need edge functions.

---

### [ ] STEP 10 — Update cross-service URLs now that all three are deployed

With Koyeb, Render, and Cloudflare Pages all live, go back and update the placeholder env vars:

**On Koyeb (.NET API):**
- `AiService__BaseUrl` → `https://<your-render-service>.onrender.com`
- `CORS_ORIGINS` → `https://<your-cf-pages>.pages.dev`

**On Render (Python AI):**
- `CORS_ORIGINS` → `https://<your-koyeb-url>.koyeb.app,https://<your-cf-pages>.pages.dev`

Both services will redeploy automatically after env var changes.

---

### [ ] STEP 11 — 🧑 DEVELOPER ACTION: Set up Grafana Cloud

> **You must do this — Claude cannot create Grafana Cloud accounts.**

1. Go to [https://grafana.com/auth/sign-up](https://grafana.com/auth/sign-up) → **Sign up** (free tier: 14-day retention, 10k series)
2. Create a new stack (give it any name)
3. From your stack dashboard → **Connections → Add new connection → OpenTelemetry**
4. Follow the wizard to get your OTLP endpoint + auth token
5. Note your:
   - OTLP endpoint URL (e.g. `https://otlp-gateway-prod-us-east-0.grafana.net/otlp`)
   - Instance ID + API token for Basic Auth

**Update env vars on both Koyeb and Render:**

| Service | Variable | Value |
|---|---|---|
| Koyeb (.NET API) | `OTEL_EXPORTER_OTLP_ENDPOINT` | Your Grafana Cloud OTLP URL |
| Koyeb (.NET API) | `OTEL_EXPORTER_OTLP_HEADERS` | `Authorization=Basic <base64(instanceId:token)>` |
| Render (Python AI) | `OTEL_EXPORTER_OTLP_ENDPOINT` | Same URL |
| Render (Python AI) | `OTEL_EXPORTER_OTLP_HEADERS` | Same header |

> The local LGTM Docker stack (`docker compose up grafana`) is for local dev only. The cloud deploys point at Grafana Cloud — no Docker needed in production.

---

### [ ] STEP 12 — 🧑 DEVELOPER ACTION: Set Gemini spend cap to $5/mo

> **Non-negotiable before sharing the URL with anyone.** A parser bug in a loop can burn $50/hr if uncapped.

1. Go to [https://aistudio.google.com](https://aistudio.google.com) → sign in
2. **Billing** → **Budget & Alerts** → **Create Budget**
3. Set:
   - **Amount:** $5 USD/month
   - **Alert thresholds:** 50%, 90%, 100%
   - **Actions:** check "Disable billing" at 100% (this cuts off API access rather than letting it run)

> Disabling billing stops charges but also stops all Gemini API calls. For a personal sandbox this is acceptable. If you'd rather get alerts without cutoff, uncheck the "Disable billing" box and just accept the notification.

---

### [ ] STEP 13 — 🧑 DEVELOPER ACTION: Set Anthropic spend cap to $5/mo

1. Go to [https://console.anthropic.com](https://console.anthropic.com) → sign in
2. **Settings → Billing → Usage limits**
3. Set **Monthly spend limit:** $5 USD

---

### [ ] STEP 14 — Verify health checks for all three services

With all deployments live, hit each health endpoint and confirm 200:

```bash
# Replace with your actual deployed URLs
curl https://<your-koyeb-api>.koyeb.app/health
# Expected: {"status":"Healthy"} or similar 200 response

curl https://<your-render-ai>.onrender.com/health
# Expected: {"status":"ok"}

# Frontend
curl -I https://<your-cf-pages>.pages.dev
# Expected: HTTP/2 200
```

> **Render cold start note:** The first curl to the AI service may take 30–50 seconds if it was idle. This is expected. Subsequent calls will be fast.

---

### [ ] STEP 15 — End-to-end smoke test: BCA CSV upload

1. Open your Cloudflare Pages URL in a browser
2. Navigate to **Upload** (or **Cashflow → Upload**)
3. Upload `apps/frontend/e2e/fixtures/bca-sample.csv`
4. Verify the two-table preview appears (Ready to Save / Duplicates)
5. Click **Submit**
6. Navigate to **Transactions** — the BCA rows should appear
7. In Supabase Cloud Studio (`https://supabase.com/dashboard/project/<ref>/editor`), run:
   ```sql
   SELECT * FROM transactions ORDER BY created_at DESC LIMIT 10;
   ```
   Confirm the rows are there.

---

### [ ] STEP 16 — End-to-end smoke test: PDF upload (AI service)

1. On the live site, upload a NeoBank or any supported PDF
2. The upload wizard routes to the AI service on Render
3. After extraction, the preview table should show extracted transactions
4. Submit and verify rows appear in Supabase Cloud DB
5. In Grafana Cloud → Explore → select Tempo datasource → confirm traces appear for both `.NET API` and `Python AI` service

---

### [ ] STEP 17 — Set up Supabase keep-alive cron (prevent 7-day idle pause)

Supabase free projects pause after 7 consecutive days with no activity. Add a GitHub Actions cron that hits a lightweight query every 5 days.

Create `.github/workflows/supabase-keepalive.yml`:

```yaml
name: Supabase Keep-Alive
on:
  schedule:
    - cron: '0 8 */5 * *'   # Every 5 days at 08:00 UTC

jobs:
  ping:
    runs-on: ubuntu-latest
    steps:
      - name: Ping Supabase
        run: |
          curl -s -o /dev/null -w "%{http_code}" \
            "${{ secrets.SUPABASE_URL }}/rest/v1/category_rules?select=id&limit=1" \
            -H "apikey: ${{ secrets.SUPABASE_ANON_KEY }}" \
            -H "Authorization: Bearer ${{ secrets.SUPABASE_ANON_KEY }}"
```

**🧑 DEVELOPER ACTION:** Add these two secrets to your GitHub repo:
- Go to `https://github.com/rikky-hermanto/personal-finance/settings/secrets/actions`
- Add `SUPABASE_URL` = your Supabase Cloud project URL
- Add `SUPABASE_ANON_KEY` = your Supabase Cloud anon key

Claude will create the workflow file. You add the GitHub secrets.

---

### [ ] STEP 18 — (Optional) Set up Render AI service keep-alive cron

Only do this if the 30–50s Render cold start is unacceptable. Add a second GitHub Actions cron that pings the Render health endpoint every 10 minutes to keep the container warm.

Create `.github/workflows/render-keepalive.yml`:

```yaml
name: Render AI Service Keep-Alive
on:
  schedule:
    - cron: '*/10 * * * *'   # Every 10 minutes

jobs:
  ping:
    runs-on: ubuntu-latest
    steps:
      - name: Ping Render AI
        run: curl -s -o /dev/null "${{ secrets.RENDER_AI_URL }}/health"
```

**🧑 DEVELOPER ACTION:** Add `RENDER_AI_URL` secret to GitHub repo (same path as above).

> **Trade-off:** This makes the AI service warm but consumes ~4,300 GitHub Actions minutes/month. The free tier gives 2,000 min/month — this would exceed it. Only enable if you upgrade GitHub Actions or accept cold starts.

---

### [ ] STEP 19 — Final CORS lockdown verification

With the Cloudflare Pages URL known and set in Koyeb's `CORS_ORIGINS` env var, verify that cross-origin requests from any other origin are blocked:

```bash
# Should return CORS headers only for your CF Pages domain
curl -v -X OPTIONS \
  -H "Origin: https://evil.example.com" \
  -H "Access-Control-Request-Method: GET" \
  https://<your-koyeb-api>.koyeb.app/api/transactions

# Look for: Access-Control-Allow-Origin header
# It should NOT include https://evil.example.com
# If it does, CORS is still set to * — re-check Program.cs
```

---

### [ ] STEP 20 — Update `.claude/plans/BOARD.md` and close GitHub issue

```bash
# Move PF-105 to Done column in GitHub Projects v2
gh issue close 105 --repo rikky-hermanto/personal-finance

# Then update .claude/plans/BOARD.md to reflect Done state
```

---

## Notes

- **Auth not yet deployed (PF-S08):** The API is wide open. Do NOT share the deployed URL publicly or with untrusted users until PF-S08 (Supabase Auth + JwtBearer middleware) is complete. Trusted testers only.
- **Supabase idle resume:** When a paused Supabase project receives a request, it takes ~30 seconds to resume. Step 17's cron prevents this. If you skip Step 17, add a calendar reminder every 6 days to manually ping the project.
- **Render free tier limits:** 750 hours/month. With a single service, that's fine for a full month. If you add a second Render free service, hours split.
- **Koyeb Eco vs Fly.io:** Koyeb Eco is $0 forever with no credit expiry and no spin-down. Fly.io gives $5/mo free credit that expires — you'd eventually pay. DevB's insight here was correct.
- **Migration path to Azure (when ready):** Your Dockerfiles already work. When Supabase hits 500MB or you need SLAs: upgrade Supabase to Pro ($25/mo) and move .NET API + Python AI to Azure Container Apps consumption tier. Frontend stays on Cloudflare Pages. This is Option C from the verdict — no architectural rework needed.
- **Next PF task after this:** PF-S08 (Supabase Auth) — JWT middleware + user_id columns + RLS policies. That's the blocker before the URL can be shared publicly.
