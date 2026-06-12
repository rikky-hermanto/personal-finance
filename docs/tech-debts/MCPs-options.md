# MCP Adoption Options — Personal Finance

A scan of MCP servers worth evaluating for this project, grouped by where they'd plug in. Recommendations at the bottom.

---

## 1. Architectural-level MCPs (dev/ops productivity)

| MCP | Fit | Why it matters here |
|-----|-----|---------------------|
| **Supabase MCP** | 🟢 Very high | Mid-migration (PF-S08 next). Lets Claude run SQL, inspect RLS policies, apply migrations, manage Storage buckets directly. Big leverage during PF-S08 (Auth) → PF-S11 (Webhooks) → PF-S12 (Realtime) → PF-S13 (RAG). |
| **GitHub MCP** | 🟢 High | Replaces `gh` CLI flows for Issues + Projects v2 board ops. Structured access to PRs, reviews, project fields (Status), milestones. Would streamline the `.claude/plans/BOARD.md` snapshot workflow. |
| **Postgres MCP** | 🟡 Medium | Subset of Supabase MCP — only useful if Supabase MCP doesn't expose enough raw SQL. Probably redundant. |
| **Grafana / Loki / Tempo MCP** | 🟡 Medium | LGTM stack is live (PF-100). Query traces and logs from chat instead of pivoting to Grafana UI. Useful during incident triage; less useful day-to-day. |
| **Docker MCP** | 🟡 Medium | Container lifecycle from chat — minor win since `npm start` already orchestrates the full stack. |
| **Playwright MCP** | 🟢 Already available | E2E suites in `apps/frontend/e2e/`. Use for authoring/debugging specs interactively, especially for upload-wizard flows. |
| **Filesystem MCP** | 🟢 Already available | — |

## 2. Feature-level MCPs (in-product capabilities)

| MCP | Fit | Why |
|-----|-----|-----|
| **Fetch / Web MCP** | 🟢 High | Wise CSV parser needs FX rates; Investment Portfolio needs IDX stock prices, mutual fund NAVs, crypto. Currently no live-data path exists. |
| **pgvector / Vector MCP** | 🟢 High | PF-S13 (RAG over transactions) is on the roadmap. A vector MCP would let you prototype embeddings + semantic search before building infrastructure. |
| **PDF MCP** | 🟡 Low | You already have PyMuPDF + LLM extraction. Marginal value. |
| **Linear MCP** | 🔴 Skip | You use GitHub Issues, not Linear. |
| **Spotify / Gmail / Calendar MCPs** | 🔴 Skip | Out of scope for a finance app. |

## 3. Custom MCPs worth building (highest long-term leverage)

These are MCPs **you would build** that expose your app's capabilities to other agents:

1. **Bank Statement Parser MCP** — wrap `IBankStatementParser` + the validation pipeline as an MCP server. Any agent (Claude Desktop, IDE, future automation) could parse statements without going through the API. Natural extension once PF-S11 webhook pipeline lands.
2. **Cashflow Query MCP** — natural-language queries against the master cashflow schema. Essentially the PF-S13 RAG endpoint exposed as MCP — turns the app into a tool other agents can call (e.g. "what did I spend on groceries last month?").
3. **Bank Profile MCP** — once the YAML profile config system (PF-045) lands, expose profile CRUD as MCP so adding a new bank can be done conversationally.

**Premature for now** — wait until PF-S11/S13 are built.

---

## Recommendation

The two highest-ROI adoptions **right now**:

1. **Supabase MCP** — accelerates PF-S08 → PF-S13 dramatically. RLS policy iteration alone is worth the install.
2. **Fetch MCP** — unblocks Wise FX + live investment prices, which are current product gaps.

**Defer:** GitHub MCP (nice-to-have but `gh` works), Grafana MCP (only useful during incidents), custom MCPs (premature).

**Skip:** PDF MCP, Linear, Spotify/Gmail/Calendar.

---

## Open questions before adopting

- **Auth model:** Supabase MCP wants a service role key — same secret-handling constraints as SEC-01. Where does it live? (User-level `.mcp.json`, not committed.)
- **Scope:** Project-level (`.mcp.json` in repo) vs user-level. Project-level means every Claude instance on the repo gets it; user-level means just you.
- **Local vs Cloud Supabase:** MCP can target either. Start with local (`http://127.0.0.1:54321`) to avoid touching prod schema.
