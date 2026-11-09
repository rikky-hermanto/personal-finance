# Build — shipping code

Turn a request into merged-quality code: plan → execute → check → commit.

## Order

1. **plan**: write the plan file using [templates/plan-template.md](templates/plan-template.md) and add it to `plans/BOARD.md`.
2. **execute**: implement every unchecked step and verify the acceptance criteria.
3. **ci-check**: run all gates before a push (`ci-check quick` while iterating).
4. **commit**: stage safe files, scan for secrets, write the message.

As needed: **add-endpoint** (new REST endpoint), **db-migrate** (Supabase SQL migration), **docker-up** (start the stack or one service), **chores** (housekeeping between features).
For finance logic, also see `ai/decide/` before building.

## Finished examples

- [PF-009-gemini-hello-llm-todo.md](../../plans/done/PF-009-gemini-hello-llm-todo.md): the canonical learning-ticket plan
- [PF-133-trading-desk-foundation-todo.md](../../plans/done/PF-133-trading-desk-foundation-todo.md): a large build ticket with gate rules
- [PF-132-ai-chat-502-provider-schema-fix-todo.md](../../plans/done/PF-132-ai-chat-502-provider-schema-fix-todo.md): a bug-fix plan
