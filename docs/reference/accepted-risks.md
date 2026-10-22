# Accepted risks

Findings the owner has decided to live with, recorded so they are a conscious choice and not an oversight. Add one row per accepted item; keep names, credentials and other sensitive values out of this file.

| Finding | Decision | Date | Reason |
|---------|----------|------|--------|
| Real names in the public category-rules export (`docs/data/category-rules-2026-05-07.csv`, plus two PF-107 docs), present in git history since commit `c77208a7` | Current tree scrubbed in PF-143. History is not rewritten and nothing is force-pushed. The copies in old commits stay exposed and that is accepted. | 2026-10-22 | Owner decision under E-001: a history rewrite plus force-push breaks every clone and open branch. |

## Dependencies (PF-147)

Known dependency advisories that are deliberately left open, with the reason each one cannot hurt users and the date the decision was made. Re-check each row when the package is next touched. Decided by the owner on 2026-10-22 under PF-147: fix what ships to users, accept build-time-only advisories in writing.

### npm: `apps/frontend`

| Package | Advisory | Why it cannot reach users | Date |
|---------|----------|---------------------------|------|
| `react-router` / `react-router-dom` 6.30.6 | GHSA-wrjc-x8rr-h8h6 (open redirect via backslash), GHSA-337j-9hxr-rhxg (`deserializeErrors` in SSR hydration) | Shipped to the browser, so this is a real residual, not a build-time one. Both are fixed only in 7.x, which is a migration. The app is client-rendered only (no `hydrateRoot` or `react-router-dom/server` in `src/`, so the second advisory is not reachable). Almost every `<Link>`/`navigate` target is a literal internal path; the exception is quest and insight paths (`actionDeeplink`, `actionPath`, `actionTarget`), which come from the app's own API and the AI journey advisor, never from URL parameters or other users' input. This is a single-owner app. Constraining those to paths starting with a single `/` is a cheap follow-up. Revisit with the React Router 7 migration. | 2026-10-22 |
| `tailwindcss` 3.4.x and its chain (`chokidar`, `braces`, `micromatch`, `fast-glob`, `postcss-nested`, `postcss-selector-parser`) | GHSA-vfj7-8cjw-p6xm and related ReDoS/stack-exhaustion | Runs only during `vite build` on the developer machine and in the Docker build stage. The runtime image is static files served by nginx. Input is the repo's own source, not attacker data. No fix exists on the 3.x line. | 2026-10-22 |
| `tailwindcss-animate` | Inherits the `tailwindcss` advisories | Tailwind plugin, build-time only. Moved from `dependencies` to `devDependencies` in PF-147, where it belongs. | 2026-10-22 |
| Dev tooling (`vite`/`esbuild`/`rollup`, `vitest`, `eslint` plugins, `js-yaml`, `shell-quote`, `ajv`, `browserslist`, `flatted`, `tinypool`) | Reported by plain `npm audit` only; absent from `npm audit --omit=dev` | Dev server, test runner and linter. Never installed in the runtime image. Dev server is bound to localhost. | 2026-10-22 |

### Python: `services/ai-service`

Every advisory below is fixed only on the 1.x line of the package. Moving to 1.x needs `langchain-google-genai` 4.x, which no longer ships `google.api_core`, and `app/agents/chat_model_factory.py` patches that client directly (`ResourceExhausted`, `client.generate_content`). That is an agent rewrite, so it is a separate ticket, not part of PF-147. Tried on 2026-10-22: the dependency install resolved, but the advisor tests failed at import. Exposure in this deployment: the AI service runs locally for the single owner, the agents only receive the owner's own data and a signed owner token, and the advisories concern checkpoint/SDK/serialization paths that the app does not expose to third parties. Revisit when the AI service is deployed.

| Package (installed) | Advisory (fixed in) | Date |
|---------------------|---------------------|------|
| `langgraph` 0.6.11 | PYSEC-2026-83 (1.0.10) | 2026-10-22 |
| `langgraph-checkpoint` 3.0.1 | PYSEC-2026-2573 (4.1.1), PYSEC-2026-2574 (4.0.0) | 2026-10-22 |
| `langgraph-sdk` 0.2.15 | PYSEC-2026-2194, PYSEC-2026-2575 (0.3.15), PYSEC-2026-4240 (0.4.4) | 2026-10-22 |
| `langchain-core` 0.3.86 | PYSEC-2026-2193 (1.2.22), PYSEC-2026-2562 (1.2.11) | 2026-10-22 |
| `langchain-anthropic` 0.3.22 | PYSEC-2026-2556 (1.4.6) | 2026-10-22 |
| `langchain` 0.3.30 | PYSEC-2026-2192 (1.3.9). Declared explicitly in PF-147 because `langfuse.langchain` needs it; it used to arrive only through the eval stack. | 2026-10-22 |
| `langchain-text-splitters` 0.3.11 | PYSEC-2026-77 (1.1.2) | 2026-10-22 |
| `setuptools` 65.5.0 | PYSEC-2022-43012, PYSEC-2025-49, PYSEC-2026-1918, PYSEC-2026-3447. Only the bootstrap copy that `python -m venv` installs; it is not an app dependency and the runtime image does not run it. | 2026-10-22 |

The eval-only stack (`ragas`, `langchain-openai`, `langchain-community`, plus `datasets`, `fsspec`, `diskcache`) is now the `eval` extra in `pyproject.toml`. It is not in the production image or the `dev` install, so its own advisories (for example `ragas` PYSEC-2026-3046/3047) do not ship. Install it only to run `evals/`.
