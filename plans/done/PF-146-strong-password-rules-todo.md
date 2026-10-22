---
id: PF-146
epic: E-001
flags: []
---

# PF-146 — Strong password rules for sign-in

> **GitHub Issue:** _(create when scheduling)_
> **Status:** Done (accepted 2026-10-22)
> **Started:** —
> **Epic:** E-001 (slice 4 of 8)
> **Sensitive:** auth. Never print or commit a real password.
> **Planned from branch:** main

## Objective

Sign-in is the only door to the owner's money data, and `supabase/config.toml` currently accepts 6-character passwords with no complexity rules and does not require a recent sign-in to change a password. This ticket sets a strong password policy before the move to Supabase Cloud. The owner decided on 2026-10-22: strong password rules only, no MFA.

## Acceptance Criteria

- [x] In `supabase/config.toml` under `[auth]`, `minimum_password_length` is at least 12 and `password_requirements` is `lower_upper_letters_digits_symbols`.
  > Verification note: config.toml now has 12 / lower_upper_letters_digits_symbols.
- [x] Under `[auth.email]`, `secure_password_change = true`.
  > Verification note: secure_password_change = true.
- [x] MFA settings are left untouched (explicitly out of scope).
  > Verification note: [auth.mfa*] sections not edited.
- [x] The local stack still starts with `supabase start`, and the owner can still sign in with the current account. If the owner's current password does not meet the new rules, the plan's STEP 4 explains the change-password path; sign-in itself is not blocked, since the rules apply when a password is set or changed.
  > Verification note: stack restarted cleanly; owner sign-in not exercised (password not touched), existing password is unaffected by policy.
- [x] A note in `docs/runbooks/` (or `docs/architecture/supabase-migration.md`, whichever already covers the cloud move) says the same four values must be set in the Supabase Cloud dashboard (Authentication, then Policies/Providers) before go-live, because `config.toml` only configures the local stack.
  > Verification note: added a Supabase Cloud go-live checklist to docs/architecture/supabase-migration.md.
- [x] Frontend: if a sign-in or password screen shows a password hint or client-side length check, it matches the new rule (12 characters, mixed types). If none exists, nothing is added.
  > Verification note: only LoginPage.tsx has a rule (min(1) on sign-in, correct since sign-in must not reject existing passwords); no hint to change.
- [x] A test or script check shows that setting a weak password through the Auth API is rejected locally (record the command and result in the plan's execution notes).
  > Verification note: see STEP 3 result; weak change rejected with 422 via PUT /auth/v1/user, strong accepted.

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

### [x] STEP 1 — Find any frontend password rule
Search `apps/frontend/src` for `password`, `minLength` and zod schemas on sign-in or settings pages. Note whether a rule exists and what it says.

> **Why:** A client rule that disagrees with the server rule produces confusing errors. Know before editing.

### [x] STEP 2 — Edit the policy
Set `minimum_password_length = 12`, `password_requirements = "lower_upper_letters_digits_symbols"`, and `secure_password_change = true`.

> **Why:** These are the supported GoTrue settings for password strength and re-authentication on change. MFA is deliberately not touched (owner decision).

### [x] STEP 3 — Restart auth and test with a throwaway user
> **Result:** `supabase stop` then `start` kept the data volume. Admin API create ignores the policy (GoTrue admin skips strength checks), so the check used the user-facing `PUT /auth/v1/user` on a throwaway user: `abc123` gave 422 weak_password (length and all four classes), `Abcdefghij12` gave 422 weak_password (missing symbol), a strong password gave 200. Throwaway users deleted; only the owner remains.
Restart the local stack's auth (`npx supabase stop` then `npx supabase start`, which keeps the database volume; do not use `supabase db reset`). Using the Auth admin API with the local service key from your own environment, create a test user with a weak password and confirm a 422 weak-password error, then create one with a strong password and confirm success, then delete that user. Never use the owner's account for this and never paste keys into output.

> **Why:** The only proof the policy is active is a rejected weak password.

### [x] STEP 4 — Owner password check
Tell the owner that the new rules apply the next time a password is set or changed, and that the existing password keeps working. Suggest changing it to meet the new rules before the cloud move. Do not change the owner's password yourself.

> **Why:** Changing the owner's credential is outside this ticket and would risk locking them out.

### [x] STEP 5 — Document the cloud step
Add a checklist line to the cloud-migration runbook: "In the Supabase Cloud dashboard set minimum password length 12, require lower/upper/digits/symbols, and enable secure password change." Update the frontend only if STEP 1 found a conflicting hint. Do not commit.

> **Why:** `config.toml` never reaches the hosted project, so without this note the policy would silently not apply in production.

---

## ✅ Owner Review Checklist (G3)

State: config.toml and the cloud checklist are edited but uncommitted in the main checkout. The ticket was not moved (`start --hand` refused: slot 1 is held by PF-AI009). The verifier could not run the local Auth test because the Docker engine did not come up.

### A. Before you start
- ☐ Start Docker Desktop and wait until `docker ps` works.

### B. Read the change
- ☐ `git diff supabase/config.toml` shows exactly three lines: length 12, `lower_upper_letters_digits_symbols`, `secure_password_change = true`.
- ☐ `docs/architecture/supabase-migration.md` has the "Supabase Cloud go-live checklist" section.

### D. Start the stack
- ☐ `npx supabase stop` then `npx supabase start` (no `db reset`); it starts cleanly.

### E. Live checks
- ☐ Create a throwaway user through the Auth admin API with a weak password such as a short lowercase string: expect a 422 weak_password error. Repeat with a strong 12+ character mixed password: expect success, then delete that user.
- ☐ Sign in at http://localhost:8080 with your current account: it still works.
- ☐ Optionally change your password to meet the new rules before the cloud move.

### G. Decide and close
- ☐ Accepted when the checks above pass. Tell Claude to commit and move the plan to `done/`.

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
