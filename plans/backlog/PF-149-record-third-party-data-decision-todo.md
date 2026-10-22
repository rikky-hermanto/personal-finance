---
id: PF-149
epic: E-001
flags: [Ready]
---

# PF-149 — Record the third-party data decision (Gemini tier, Langfuse prompts)

> **GitHub Issue:** _(create when scheduling)_
> **Status:** To Do
> **Started:** —
> **Epic:** E-001 (slice 7 of 8)
> **Sensitive:** privacy. Never print an API key or paste statement text.
> **Planned from branch:** main

## Objective

Statement text is sent to Gemini for extraction, and Langfuse cloud stores full prompts. The audit asked two questions: is the Gemini key on a paid tier (free-tier prompts may be used by Google to improve products), and should prompts be masked in Langfuse. The owner decided on 2026-10-22: confirm the paid tier, do not mask Langfuse, and accept that exposure in writing. This ticket writes that decision down, makes the code show what is sent, and adds a cheap switch so tracing can be turned off.

## Acceptance Criteria

- [ ] `docs/reference/accepted-risks.md` has two rows: (1) Gemini data use — records the date the owner confirmed the key's billing tier (a plain statement from the owner; the executor must ask the owner and never guess) and the source they used; (2) Langfuse stores full prompts — decision "accepted, no masking", date `2026-10-22`, reason "owner decision under E-001", plus a note that real statement text, descriptions and amounts are in those prompts.
- [ ] `docs/architecture/` (or `services/ai-service/README`/`docs/SETUP.md`, wherever the Langfuse variables are documented) lists exactly what leaves the machine: statement text to Gemini and Anthropic (alternate provider), full prompts and responses to Langfuse cloud, and which environment variables control each.
- [ ] Langfuse tracing can be turned off by setting its keys empty or a single flag (for example `LANGFUSE_ENABLED=false`), with no code change at call sites. If this already exists, document it and add a test; if not, add the flag in the AI service's config and make `GeminiProvider` and `AnthropicProvider` skip tracing when it is off.
- [ ] A pytest test shows that with tracing disabled no Langfuse client is created or called (LLM calls mocked).
- [ ] No statement text, key, or personal data appears in the new docs or tests.

## Approach

This is mostly a record-keeping ticket. The one code change is a kill switch for tracing so the accepted exposure is reversible by configuration. Ask the owner the billing-tier question at the start of execution, because only they can answer it; if they are not available, write the row as "pending owner confirmation" and leave the acceptance criterion unchecked rather than guessing. Do not add prompt masking (owner decision) and do not change which provider is used.

## Affected Files

| File | Change |
|------|--------|
| `docs/reference/accepted-risks.md` | Edit — two rows (created in PF-143) |
| `docs/SETUP.md` or `docs/architecture/architecture-diagram.md` | Edit — "what leaves the machine" table with the controlling variables |
| `services/ai-service/app/config.py` | Edit — tracing flag, if one does not exist |
| `services/ai-service/app/providers/gemini.py`, `anthropic.py` | Edit — honour the flag |
| `services/ai-service/tests/` | Create or Edit — test for tracing disabled |
| `.env.example` / `services/ai-service/.env.example` | Edit — document the flag |

---

## TODO

### [ ] STEP 1 — Ask the owner about the Gemini billing tier
Ask: "Is the Gemini API key used by the AI service on a paid (billing enabled) project, and what date did you check?" Record the answer as given. If unknown, mark the row pending.

> **Why:** Only the key owner can see the billing state in Google AI Studio or Cloud Console. A guessed answer would make the risk record false.

### [ ] STEP 2 — See how tracing is wired
Read how Langfuse is initialised in `services/ai-service/app/` and in both providers, and which environment variables enable it. Note whether a disabled state already exists.

> **Why:** The cheapest correct change depends on whether a switch already exists.

### [ ] STEP 3 — Add or document the kill switch
If missing, add `LANGFUSE_ENABLED` (default true, to keep today's behaviour) in `config.py` and skip client creation and trace calls when false. Add the variable to the `.env.example` files.

> **Why:** An accepted risk should be reversible with one setting instead of a code change.

### [ ] STEP 4 — Test it
Add a pytest test with mocked providers that sets the flag false and asserts the Langfuse client is never constructed or called, and a second that asserts it is used when true. Never call a real LLM or Langfuse.

> **Why:** `.claude/rules/ai-service.md` requires mocked LLM calls and explicit path tests.

### [ ] STEP 5 — Write the records
Add the two rows to `docs/reference/accepted-risks.md` and the "what leaves the machine" table to the docs. Keep to the facts: provider, data, variable, decision, date. Do not commit.

> **Why:** The epic's done-condition is that every remaining item is accepted in writing; this is that writing.

---

## Notes

- This ticket does not touch PII masking. If the owner later wants masking, that is a new ticket (cost: prompt readability in Langfuse).
- `FIN-05` and `/compliance` are not triggered: no new financial output reaches users.

## Execution Notes

Model: **Sonnet 5.5** · Effort: **medium**. Docs plus one small flag with a test; the sensitive part is the owner's answer, not the code.
Before you start: ask the owner the billing-tier question (STEP 1).

```
/execute plans/in-progress/PF-149-record-third-party-data-decision-todo.md
```

### Stop and ask if

- The owner says the Gemini key is on the free tier. That changes the decision and needs the owner's call.
- Disabling tracing would require touching the provider interface used by other services.
