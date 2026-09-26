# Jev for this Codex project

Installed on 2026-09-26. **Live integration remains unverified until a key is
available and an actual agent task receives a Jev response.** No application
service uses Jev; this is development-agent decision support.

## Components

- Official skill: `.agents/skills/typesafe-ai/`, the complete upstream directory
  (currently `SKILL.md` and `LICENSE`). Installed
  once using Codex's GitHub skill installer with a project-local destination.
  Read `SKILL.md` directly; `/typesafe:typesafe-ai` is a Claude invocation.
- Router: `tools/jev-router/`, cloned from
  https://github.com/Bodila51/muse-jev-playbook at
  `70edf68eeb19cfdb6b8e118cce214313b154455f`.
- Isolated Python environment: `tools/jev-router/.venv/`.
  Installed direct dependencies: `typesafe-sdk==0.7.1`, `PyYAML==6.0.3`.
- Local configuration: `tools/jev-router/config.yaml`, `enabled: true`,
  `mode: shadow`. Neither config nor checkout/logs are tracked by the parent repo.
- Project invocation: `scripts/jev_route.py`; persistent policy: root `AGENTS.md`.
- Upstream logs: `tools/jev-router/logs/runs.jsonl`; adapter evidence and outcomes:
  `tools/jev-router/logs/agent-runs.jsonl`. Both are ignored by Git.

The adapter calls upstream `route_task`, retaining its questions, normalization
and action mapping. It instruments the SDK call, disables automatic retries,
sets a 10-second HTTP timeout, logs actual model/token usage when available,
and catches failures without printing exception payloads. Missing credentials
fall back to normal work. A received response is not necessarily a valid route;
check both `response_received` and `jev_used`. No executable action is dispatched.

## Private credentials

Create a key at https://console.typesafe.ai/keys. Never paste it into chat,
configuration files, state JSON, source code, command arguments or logs.
In your own PowerShell terminal, run:

```powershell
$jevSecret = Read-Host 'TypeSafe API key' -AsSecureString
$env:TYPESAFE_API_KEY = [System.Net.NetworkCredential]::new('', $jevSecret).Password
Remove-Variable jevSecret
```

This is process-scoped. Run the commands below in that terminal, or launch a new
Codex process from it (`codex` from the repository root if the CLI is installed).
An already-running Codex app cannot inherit a variable from another terminal.
Do not use `setx` or put a literal key into a shell command. Clear the terminal's
copy when finished with `Remove-Item Env:TYPESAFE_API_KEY`.

## Restore the local router on another checkout

The router is intentionally an ignored nested clone, not a Git submodule. From
the project root, if `tools/jev-router` does not exist:

```powershell
rtk git clone https://github.com/Bodila51/muse-jev-playbook.git tools/jev-router
rtk git -C tools/jev-router checkout 70edf68eeb19cfdb6b8e118cce214313b154455f
rtk proxy python -m venv tools/jev-router/.venv
rtk proxy tools/jev-router/.venv/Scripts/python.exe -m pip install typesafe-sdk==0.7.1 PyYAML==6.0.3
rtk proxy powershell -NoProfile -Command 'Copy-Item tools/jev-router/config.example.yaml tools/jev-router/config.yaml'
```

Set `enabled: false` for the initial offline dry run. Then restore `enabled: true`
while retaining `mode: shadow`. These pin direct dependencies, not a complete
transitive dependency lock. Re-audit upstream changes before updating the clone.

## Invoke and inspect

From `C:\workspaces\personal-finance`, pass compact, manually sanitized state:

```powershell
@{ goal = 'Choose a bounded review approach for AI service provider routing'; kind = 'coding'; constraints = 'Read-only; no subagents; no financial data' } | ConvertTo-Json -Compress | rtk proxy tools/jev-router/.venv/Scripts/python.exe scripts/jev_route.py
```

Interpret `action` and `details` as advice, then continue the original task. Log
what actually happened, replacing the placeholder with the returned `run_id`:

```powershell
@{ actual_action = 'Read provider factory and call sites'; outcome = 'ok' } | ConvertTo-Json -Compress | rtk proxy tools/jev-router/.venv/Scripts/python.exe scripts/jev_route.py --outcome RUN_ID
```

The adapter intentionally omits state from its own log; upstream logs a truncated
goal. Sanitize before calling: there is no reliable automatic secret/PII scrubber.
Use `cached_artifact`, not `has_cached_artifact` (the latter is an upstream
documentation mismatch). Skip simple tasks and user bypasses without calling
the script or producing a log.

For the upstream QUICKSTART live CLI check, this Windows-safe invocation avoids
PowerShell native JSON quoting problems:

```powershell
rtk proxy tools/jev-router/.venv/Scripts/python.exe scripts/jev_cli_check.py
```

This calls upstream `src.cli.main` with the JSON argument used by its CLI. For
agent tasks use the bounded project wrapper, which reads JSON from stdin.

## Verification and promotion

Observed setup results:

| Check | Result |
|---|---|
| Upstream offline dry run | 5/5 disabled decisions; five matching logs |
| Upstream stubbed policy tests | 9/9 passed |
| Project adapter unit tests | 5/5 passed; SDK mocked throughout |
| Simple question / bypass | Offline test confirms no SDK call and no log; 2+2 = 4 |
| Actual task routing attempt | Run `654d4607-ec85-4b25-827a-04cbcc249ee5`; missing-key fallback; focused inspection performed and outcome logged |
| Repeated-failure case | Run `4479f42e-52ec-4602-8860-773c1a796d23`; missing-key fallback; documentation failures used retrospectively, HTML fallback recorded |
| Upstream live CLI | Failed: missing `TYPESAFE_API_KEY`; no API response |
| Persistence in new Codex session | Not tested; exact test prompt below |

Neither real routing attempt received a Jev response. Mocked results are not
model-quality evidence. The integration is installed but **not live-verified**.

Offline checks (no paid API calls):

```powershell
rtk proxy tools/jev-router/.venv/Scripts/python.exe scripts/test_jev_route.py
rtk proxy tools/jev-router/.venv/Scripts/python.exe tools/jev-router/scripts/test_policy.py
```

The upstream dry run was executed first with `enabled: false`: all five cases
returned `proceed_full`, `jev_used: false`, and wrote five matching records.
Set it false again before rerunning `scripts/dry_run.py`; with true it calls Jev.

Three acceptance tasks:

1. Ask `What is 2+2?` → answer 4 without router invocation or new decision log.
2. Ask for a read-only assessment of provider routing, choosing between broad
   architecture review and bounded call-site inspection → invoke router, inspect
   real typed output and logs, execute the chosen task, append actual outcome.
3. Present a repeated identical failure → invoke with `prior_error` and
   `same_error_count: 2`; inspect advice, change approach if justified, log outcome.
   A simulated failure is a fixture, not evidence of an actual repeated failure.

New-session persistence test (one prompt):
`Review the AI service provider routing read-only; choose between a broad architecture review and a focused inspection, follow this project's decision-support policy, and report the router run ID and actual action.`

Instructions encourage use but are not a runtime hook or guarantee. No separate
Codex session was started by this setup. Review 20–50 representative real decisions
before considering active mode; the upstream suggested threshold is at least 90%
correct in its high-confidence band, not a proven guarantee. Also assess latency,
missed calls, false skips and failure impact. The wrapper currently rejects active
mode; changing it requires a separate reviewed change.

Known upstream limitations: policy thresholds `act_min`/`surface_min` are not
enforced by the mapping, low-confidence research still caps sources, cache/retry
branches precede irreversible classification, Noul probability is not Choice
confidence, and upstream error handling/logging is incomplete. Independent human
confirmation and agent restrictions always apply, including the restriction on
spawning subagents. Never treat `allow_subagent` as authorization.

## Sources

- https://docs.typesafe.ai/introduction/quickstart
- https://docs.typesafe.ai/agent-skill
- https://github.com/typesafe-ai/skills
- https://docs.typesafe.ai/sdk/python
- https://docs.typesafe.ai/models (pricing checked 2026-09-26)
- https://github.com/Bodila51/muse-jev-playbook/blob/main/QUICKSTART.md
