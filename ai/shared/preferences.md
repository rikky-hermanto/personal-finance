# Shared preferences

How Rikky wants work done and reported, for every job and every agent (Claude and Codex).
Project rules (architecture, money, tests) live in `.claude/rules/` and `.agents/rules/`, not here.

## Reporting

- **Lead with the outcome.** The first sentence answers "what happened" or "what did you find". Reasons come after.
- **Readable beats compressed.** Write full sentences. No fragments, arrow chains (`A → B → fails`), or jargon used as shorthand. Keep it short by dropping details that don't change what the reader does next.

## Working style

- **Run end to end.** When the task is clear, finish it without mid-task "should I proceed?" check-ins. Make a reasonable call, say what you chose, and keep going.
- **Stop only for real blockers:** a missing file or credential, or a destructive, irreversible action (delete, force push, drop table, volume removal) that wasn't asked for.

## Outputs

- **Local files only.** HTML diagrams, reports, and dashboards for this project are written to their repo path (e.g. `docs/architecture/*.html`) and opened in a browser. Don't publish them to claude.ai artifacts or other hosts unless explicitly asked.
- **Keep emojis in README.md.** Preserve emoji prefixes on headings and the ✅/🔜 status markers; match the existing style when adding sections.
- **Commits:** no AI co-author or attribution trailers.
