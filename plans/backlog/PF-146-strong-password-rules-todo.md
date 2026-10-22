---
id: PF-146
epic: E-001
flags: [Ready]
---

# PF-146 — Strong password rules for sign-in

> **GitHub Issue:** _(create when scheduling)_
> **Status:** To Do
> **Started:** —
> **Epic:** E-001 (slice 4 of 8)
> **Sensitive:** auth. Never print or commit a real password.
> **Planned from branch:** main

## Objective

Sign-in is the only door to the owner's money data, and `supabase/config.toml` currently accepts 6-character passwords with no complexity rules and does not require a recent sign-in to change a password. This ticket sets a strong password policy before the move to Supabase Cloud. The owner decided on 2026-10-22: strong password rules only, no MFA.

## Acceptance Criteria

- [ ] In `supabase/config.toml` under `[auth]`, `minimum_password_length` is at least 12 and `password_requirements` is `lower_upper_letters_digits_symbols`.
- [ ] Under `[auth.email]`, `secure_password_change = true`.
- [ ] MFA settings are left untouched (explicitly out of scope).
- [ ] The local stack still starts with `supabase start`, and the owner can still sign in with the current account. If the owner's current password does not meet the new rules, the plan's STEP 4 explains the change-password path; sign-in itself is not blocked, since the rules apply when a password is set or changed.
- [ ] A note in `docs/runbooks/` (or `docs/architecture/supabase-migration.md`, whichever already covers the cloud move) says the same four values must be set in the Supabase Cloud dashboard (Authentication, then Policies/Providers) before go-live, because `config.toml` only configures the local stack.
- [ ] Frontend: if a sign-in or password screen shows a password hint or client-side length check, it matches the new rule (12 characters, mixed types). If none exists, nothing is added.
- [ ] A test or script check shows that setting a weak password through the Auth API is rejected locally (record the command and result in the plan's execution notes).

## Approach

Edit three lines in `config.toml` and add the cloud checklist note; do not add MFA, passkeys or a new sign-in method. Verify with a local Auth API call that a weak password is rejected and a strong one is accepted, using a throwaway test user that is deleted afterwards, never the owner's real account. Check the frontend for any hard-coded password rule.

## Affected Files

| File | Change |
|------|--------|
| `supabase/config.toml` | Edit — `minimum_password_length`, `password_requirements`, `secure_password_change` |
| `docs/runbooks/` or `docs/architecture/supabase-migration.md` | Edit — add the "set these in the cloud dashboard" checklist item |
| `apps/frontend/src/` (login or settings password UI, if any) | Edit only if it shows a conflicting rule |

---

## TODO

### [ ] STEP 1 — Find any frontend password rule
Search `apps/frontend/src` for `password`, `minLength` and zod schemas on sign-in or settings pages. Note whether a rule exists and what it says.

> **Why:** A client rule that disagrees with the server rule produces confusing errors. Know before editing.

### [ ] STEP 2 — Edit the policy
Set `minimum_password_length = 12`, `password_requirements = "lower_upper_letters_digits_symbols"`, and `secure_password_change = true`.

> **Why:** These are the supported GoTrue settings for password strength and re-authentication on change. MFA is deliberately not touched (owner decision).

### [ ] STEP 3 — Restart auth and test with a throwaway user
Restart the local stack's auth (`npx supabase stop` then `npx supabase start`, which keeps the database volume; do not use `supabase db reset`). Using the Auth admin API with the local service key from your own environment, create a test user with a weak password and confirm a 422 weak-password error, then create one with a strong password and confirm success, then delete that user. Never use the owner's account for this and never paste keys into output.

> **Why:** The only proof the policy is active is a rejected weak password.

### [ ] STEP 4 — Owner password check
Tell the owner that the new rules apply the next time a password is set or changed, and that the existing password keeps working. Suggest changing it to meet the new rules before the cloud move. Do not change the owner's password yourself.

> **Why:** Changing the owner's credential is outside this ticket and would risk locking them out.

### [ ] STEP 5 — Document the cloud step
Add a checklist line to the cloud-migration runbook: "In the Supabase Cloud dashboard set minimum password length 12, require lower/upper/digits/symbols, and enable secure password change." Update the frontend only if STEP 1 found a conflicting hint. Do not commit.

> **Why:** `config.toml` never reaches the hosted project, so without this note the policy would silently not apply in production.

---

## Notes

- Passkeys and MFA remain out of scope; revisit if a second user is ever added.
- This depends on nothing else in E-001 and can run in any order.

## Execution Notes

Model: **Opus 5.5** · Effort: **high**. Auth settings, where a wrong value can lock the owner out or silently weaken sign-in.
Before you start: none.

```
/execute plans/in-progress/PF-146-strong-password-rules-todo.md
```

### Stop and ask if

- Restarting Supabase would require `supabase db reset` or any step that drops local data.
- The owner's current sign-in stops working after the change.
