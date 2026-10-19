# Owner smoke test: AI chat with your own data (PF-S15)

About 10 minutes. You only click, type and look. Nothing here changes your data.

**Before you start:**

- AI chat is switched on in your local config files (`services/ai-service/.env`, `appsettings.Development.json` and `apps/frontend/.env`). To switch it off again, see "Roll back" below.
- Start the app with `npm start` from the project folder and wait about a minute. Then open http://localhost:8080 and sign in.
- Keep the terminal that runs `npm start` visible. You will watch the AI service log in step 5.
- Your Gemini model (`gemini-2.5-flash`) used up its free daily quota on 2026-10-15. If chat answers with an error, either wait until the next day or set `AI_MODEL=gemini-3.5-flash-lite` in `services/ai-service/.env` and restart.

## Steps

1. **Chat opens.** Go to http://localhost:8080/chat.
   Pass: you see the chat page with an input box, not "AI chat is paused". Under the input you see the line starting "Jawaban dibuat AI dari transaksi Anda sendiri".
2. **A lookup question.** Ask about one merchant you know is in your transactions, for example `Kapan terakhir saya bayar <merchant>?`.
   Pass: the answer names a real transaction of yours, and the sources under it match rows on Cashflow, then Transactions.
3. **A total.** Ask `Berapa total pengeluaran saya bulan <month you have data for>?`.
   Pass: the total shown in the answer equals the sum you get on Cashflow, then Transactions, filtered to that month and to expenses. Note both numbers if they differ.
4. **Streaming.** Ask any question and watch the answer.
   Pass: the words appear a few at a time, not all at once after a pause.
5. **Closing the tab stops the work.** Ask a longer question, such as `Ringkas semua pengeluaran saya bulan ini per kategori`. While the answer is still appearing, close the browser tab.
   Pass: within a few seconds the AI service log in the `npm start` terminal stops printing for that request, and no error trace appears.
6. **Follow-up chips.** After an answer finishes, look below it.
   Pass: up to three suggested questions appear, and clicking one puts it in the input box.
7. **Sign out clears chat.** Click "Sign out", sign in again, and open `/chat`.
   Pass: the previous conversation is gone.

## Roll back

Switch off in this order, then restart: `VITE_AI_CHAT_ENABLED=false` in `apps/frontend/.env`, then `AiChat:Enabled` to `false` in `appsettings.Development.json`, then `AI_CHAT_ENABLED=false` in `services/ai-service/.env`. `/chat` then shows "AI chat is paused" again.

## Already tested by Claude (not needed here)

Two-user isolation, run live on the disposable harness: chat lookups, totals, follow-ups, search and embedding writes never cross between users.

## If something fails

Write down the step number and what you saw (a screenshot helps), and tell Claude.
