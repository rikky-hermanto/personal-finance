---
name: efficient-model
description: "Reduce unnecessary context and execution cost for broad repository tasks using bounded searches, concise evidence, and optional authorized delegation. Does not change the user's model."
---

# efficient-model

Read [shared Codex workflow conventions](../../WORKFLOWS.md) before using this skill.

Keep the selected model. Start with narrow rg queries, targeted reads, bounded log
output, batched independent tool calls, and reusable evidence. Do not spawn an agent
for a quick command or a few-file edit; overhead can exceed saved work.

If delegation is authorized by the current session and a concrete independent slice
can run alongside useful local work, use the available Codex collaboration tools.
State objective, file ownership, exclusions, acceptance criteria, checks, evidence
format, and stop conditions. Avoid concurrent edits to shared files and recursive
unbounded fan-out. Reuse an existing agent when it retains useful context.

No Claude Agent/Workflow tools, Explore types, or Sonnet/Haiku tier mapping are assumed.
Use only available model IDs, and only override a model when current instructions/
user authorization allow it. Do not claim a model is cheaper from its name; verify
current cost/capability information before a cost-based recommendation. If no suitable
delegation is allowed, continue locally without asking merely to optimize overhead.

Keep architectural/financial/contract judgments with the coordinating agent. Reopen
cited files and verify changes/tests before accepting reports. Agents return findings
and uncertainty, not unverified completion claims. Preserve secrets and all Claude
sources. Historical model-orchestrator assets were not copied because their tier
labels would misdescribe this Codex workflow.
