# Owner smoke test: login (PF-S08) and categorizer (PF-141)

About 10 minutes. You only click and look. Nothing here changes your real data if you follow the "do not" lines.

**Before you start:** start the app with `npm start` (from the project folder) and wait about a minute. Then open http://localhost:8080 in your browser.

## Part A: Login and private data (PF-S08)

1. **You are asked to sign in.** Opening http://localhost:8080 should show a "Sign in" page, not your data.
   Pass: you see the Sign in page. Fail: you see Journey or any numbers without signing in.
2. **Wrong password is refused.** Type your email and a deliberately wrong password, then press Sign in.
   Pass: an error appears and you stay on the page.
3. **Sign in properly.** Use your email and your real password (the one saved outside the project folder when the owner account was created).
   Pass: you land on Journey.
4. **Your data is there.** Click Cashflow, then Transactions. Click Assets and Investment.
   Pass: you see your transactions (about 24), your accounts, assets and holdings, and none of the pages shows an error.
5. **Stay signed in after a refresh.** Press F5 on any page.
   Pass: you are still signed in.
6. **AI chat opens.** Open http://localhost:8080/chat.
   Pass: you see the chat page. AI chat was switched back on in PF-S15; its own checks are in [owner-smoke-test-PF-S15.md](../done/owner-smoke-test-PF-S15.md). If your local config has the chat flags off, you see "AI chat is paused" instead, which is also correct.
7. **Sign out works.** Click "Sign out" at the bottom of the left sidebar.
   Pass: you return to the Sign in page. Press the browser Back button: you must not see your data again.
8. **No self-signup.** Look at the Sign in page.
   Pass: there is no "Create account" option.

## Part B: Categorizer (PF-141)

Jev is switched off by default, so the app should behave exactly as before. This part only checks that nothing broke. The real Jev comparison has not been run (see "Not tested").

1. Sign in, go to Cashflow, then Upload.
2. Drop in the sample file `apps/frontend/e2e/fixtures/bca-sample.csv`.
3. Look at the preview table.
   Pass: every row has a category, such as salary or food, and the page shows no error.
4. **Do not click the final save or submit button.** Close the preview or leave the page. Your real transactions must stay at about 24.
   Pass: after leaving, Cashflow, then Transactions still shows the same transactions as before.

## Not tested here (by design)

- Jev itself. It needs a TypeSafe key and approved spend. Until the live comparison is run and you decide, it stays off.
- AI chat and RAG. They are covered by the PF-S15 smoke test linked in step 6.

## If something fails

Write down the step number and what you saw (a screenshot helps), and tell Claude. Then use `/loop-accept <id> fail ...`.
