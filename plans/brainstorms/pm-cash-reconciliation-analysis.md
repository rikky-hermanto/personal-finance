# PM Analysis: Cash Reconciliation (ATM Withdrawal Breakdown)

> **Date:** 2026-10-24 · **Verdict:** No-Go for now · **Score:** 11/25 · **Gate:** Pain severity 2/5 (below the 3/5 gate)
> **Source idea:** [docs/ideas/cash-reconciliation.md](../../docs/ideas/cash-reconciliation.md) (braindump, 2026-08-04)
> **Related:** [docs/ideas/money-tracing.md](../../docs/ideas/money-tracing.md) (same class of problem: money that leaves the bank statement's view)

## The Idea (in one sentence)

When the user withdraws cash at an ATM, let them attribute the cash they later spend (captured as a photo sent to Telegram) to that withdrawal, so the single "TARIKAN ATM" row on the bank statement becomes a category breakdown without counting the money twice.

*Assumption:* Telegram is one possible capture channel, not the requirement. The core of the idea is parent/child allocation of a withdrawal.

**Premise check: the total is already right.** `TARIKAN ATM` matches a category preset (`Withdrawing`, type Expense), and every spending aggregate counts it once. Double counting would only appear after child rows are added next to the parent. What is missing today is attribution (what the cash bought), not the amount.

## User Pain Map

| Pain Point | Who | Frequency | Severity |
|---|---|---|---|
| Cash spending has no category: an ATM withdrawal shows as one opaque `Withdrawing` line | The owner, and any user who pays cash for parking, warung, small vendors | Monthly. Size unknown: the local database holds 24 transactions (2026-05-01 to 2026-08-03) and none are ATM rows | M. The total is correct, only the breakdown is missing |
| The Cashflow Statement files `Withdrawing` under Financing, next to Loan, Credit Card and Insurance, so operating expense leaves out cash that was spent | The owner | Every time the statement view is opened | L–M. A labeling issue, cheap to fix, and it exists with or without this feature |
| "How much of the cash is left?" is not answerable | The owner | Occasional | L |

**Pain verdict: vitamin.** Three reasons. No total in Journey, Safe-to-Spend or the dashboard changes. The owner's primary spending method is QRIS through GoPay (per money-tracing.md), so the larger blind spot is the e-wallet, not cash. And QRIS volume is still growing fast (+158% year on year to September 2025, per [Investortrust](https://investortrust.id/financial/85155/tumbuh-158-transaksi-qris-tembus-10-33-miliar-per-september-2025)), so the cash gap narrows over time. I could not find a national cash-versus-QRIS share to size it better.

## Competitive Scan

| Product | Approach | What they do well | What's missing |
|---|---|---|---|
| YNAB | Two documented methods: a **cash account** (an ATM withdrawal is a transfer into an unlinked Cash account, spending is recorded there) or a **cash category** ([guide](https://support.ynab.com/en_us/handling-cash-in-ynab-a-guide-BJVYYkXR9.md), [blog](https://www.ynab.com/blog/two-ways-to-handle-cash)) | A clear rule: use the cash account only if cash is a large share of spending, otherwise use the category, and do not mix both | No receipt capture, no matching. Every cash spend is typed by hand |
| Goodbudget | ATM withdrawal recorded as an account transfer from Checking to a Cash account | Same structural answer as YNAB | Manual |
| GnuCash | Transfer to a cash account | Its docs state the trade-off plainly: the transfer shows how much left checking, not where it went | Manual |
| Wallet by BudgetBakers, Money Lover, Spendee | A cash wallet as a standard account type (general knowledge, not verified this session) | Fast manual add | Link to the bank's ATM row unverified |
| Jenius, Bank Jago, BCA mobile, GoPay history | Show only their own ledger, so an ATM withdrawal is one line (not verified this session) | Complete for their own money | No cash tracking |

Kredivo and Akulaku (BNPL) are not relevant to cash and were skipped.

**Competitive gap:** I could not verify any product that links itemized cash capture to the specific withdrawal it came from. The gap exists, but it is the least valuable part of the idea. The standard cash-account pattern reaches the same accounting result with no parent/child machinery. The hard part for any product is the capture habit, not the matching.

## Feature Breakdown

| Sub-feature | User value | Complexity | Ship order |
|---|---|---|---|
| 1. Show cash as a visible blind spot: move `Withdrawing` out of Financing in `CashflowSectionMapping`, and show "cash not itemized" with its share of monthly expense | Honest picture, no habit change | S | 1 |
| 2. Manual quick-add of a single transaction. There is no single-transaction create endpoint or UI today (`TransactionsController` has only categorize-preview, upload-preview, upload-preview-new, submit and reset). A `CreateTransactionCommand`, handler and validator already exist, but nothing calls them and no test covers them | Prerequisite for anything below | S–M (revised down from M, see addendum) | 2 |
| 3. A Cash wallet account (`account_type 'wallet'` is already allowed by the CHECK constraint) plus treating the ATM row as a transfer into it. Needs an `is_transfer` / transfer-link field, shared with money-tracing | Double counting is avoided by construction | M | 3 |
| 4. Cash count (kas opname): enter the physical cash on hand, the difference becomes "unexplained cash" | Closes the loop on the braindump's "100rb not yet allocated". Required, not optional: once an ATM row stops counting as spending, untracked cash would drop out of every total without it | S after 3 | 4 |
| 5. Parent/child allocation as drawn in the braindump (`parent_id`, aggregators substitute children for the parent's portion) | The idea as written | L. Dashboard, SpendingAnalysis, Insight, Journey scoring, Buckets and the chat SQL totals each sum `Type == Expense` today | 5, not recommended: #3 gives the same result |
| 6. Telegram photo capture plus receipt OCR | Zero-typing capture | XL. A new channel, linking a Telegram identity to the single Supabase owner, a public webhook while the stack is local-only, and a receipt prompt (the existing `/parse-image` is built for bank screenshots, 10 MB cap). Many cash purchases (parking, warung) produce no receipt | 6 |

**MVP cut (if this is ever built):** sub-features 2 + 3 against a Cash wallet. Neither parent/child nor Telegram. Before any code, the cheapest proof is a 30-day diary: does the owner log cash spending at all?

## Risks & Blind Spots

- **Assumption risk:** that cash is a material share of spending (no data shows it, and the owner is QRIS-first), and that people will photograph cash purchases, many of which have no receipt.
- **Scope creep risk:** parent/child leads to split transactions and rules for overspend and underspend against the parent. Telegram leads to multi-user identity and then bots for GoPay and other wallets.
- **Technical dependency:** no manual entry, no transfer flag, no `parent_id` or source on `Transaction`, no deployed endpoint for a webhook, and six-plus services that each filter `Type == Expense` plus the chat SQL totals.
- **User behavior risk:** a new habit at the moment of purchase with no forcing function. Half-logged cash is worse than none: an itemized 40% looks complete when it is not, the same honesty problem FIN-04 guards against on risk screens.

## Fit Score

| Dimension | Score | Rationale |
|---|---|---|
| **Pain severity** | 2/5 | The total is already correct. Only attribution is missing. The owner is QRIS-first and the local data has no ATM rows. |
| **Market differentiation** | 3/5 | The matching of itemized cash to its withdrawal is uncommon, but it is the least valuable part. The accounting result is standard (YNAB, Goodbudget). |
| **Foundation fit** | 2/5 | Helpful: `wallet` account type, `account_id` on transactions, `Withdrawing` category, `/parse-image`, running-balance view. Missing: manual entry, transfer flag, parent link, an externally reachable webhook (stack is local-only, per STATUS.md), a receipt prompt. |
| **Scope realism** | 3/5 | Scored on the MVP cut (2 + 3), roughly 3–5 days. The full idea would be 1/5. STATUS.md already lists Trading Desk Pre-Trade/Journal, PF-AI011/012 security and PF-S11/S12 as open. |
| **User discovery** | 1/5 | Needs a new habit with no forcing function and is not on the Journey home page. |

**Total: 11/25.** Pain severity is below 3, so this is a No-Go regardless of total. The total alone lands in the 10–14 band (No-Go until prerequisites are met).

## Verdict

**No-Go for now.** The idea solves a real but small problem (attribution of cash spending) at a high price (a per-purchase capture habit and changes to every spending aggregate), and it solves a double-counting problem that it creates itself. The deciding reason is that nothing the owner sees as a number is wrong today, and no data shows cash is material. What to validate first: how big the `Withdrawing` slice actually is across several real months of statements, and whether the owner will log cash for 30 days.

No `/cio` or `/compliance` review is needed: the idea does not touch investing, returns, risk or tax.

### What would flip this verdict

These thresholds are PM judgment calls, not finance constants; adjust them if the owner disagrees.

- `Withdrawing` is at least 15% of monthly expense in 3 of the last 6 months of real statements.
- A 30-day cash diary (any note app) reaches at least 20 of 30 days. If the owner will not do this, no capture UI will survive.
- Prerequisites exist: manual transaction entry, and the `is_transfer` / transfer link from money-tracing (so the Cash wallet pattern comes almost free).
- Scope is cut to sub-features 2 + 3 (Cash wallet + manual quick-add). Telegram and parent/child stay out, which drops the effort to about 3–5 days and Scope Realism stays at 3/5 or higher.

## Alternative Framings

1. **Cash as an account, not a breakdown (YNAB / Goodbudget pattern).** An ATM withdrawal is a transfer from the bank into a "Cash" wallet account. Cash spending is an ordinary expense on that account. The transfer is neutral, so no aggregator needs to learn parent/child. The unallocated remainder is simply the wallet balance. Shares its schema with money-tracing.
2. **Cash as a category with honest labeling (YNAB's other method).** Keep `Withdrawing` as the expense, move it out of Financing, and show "cash not itemized" with its percentage on Cashflow Overview. No habit change, about a day of work, and it produces the evidence needed to decide whether anything bigger is justified.
3. **One monthly question instead of per-receipt capture.** At month close (the Buckets month-close view exists), ask once: "You withdrew Rp 900k in cash. Roughly where did it go?" with category chips. It adds one 20-second ritual per month inside an existing workflow. Needs split-transaction rows marked as estimated.

**Suggested next step:** run alternative 2 first. It is the only one that is cheap and informative. If it shows a material cash share, revisit alternatives 1 and 3.

## Addendum 2026-10-24: prerequisites graph

The dependency map for this feature is in [diagram-cash-reconciliation-prerequisites.html](diagram-cash-reconciliation-prerequisites.html) (open it in a browser). Building it turned up four things that adjust the analysis above. The verdict does not change.

- **Manual entry is smaller than estimated.** `CreateTransactionCommand`, its handler and validator already exist and publish `TransactionCreatedEvent`, but nothing calls them and no test covers them. The validator only compares `AccountId` with `Guid.Empty`, allows a zero amount and has its `Type` rule commented out. The handler does not categorise, queue an embedding or set a source. There is still no endpoint, no edit or delete (only `DELETE /reset`) and no UI.
- **A Cash wallet can be created today.** `wallet` is a valid account type in the Add account dialog, and `include_in_cashflow` defaults to true. What is missing is a default Cash account for quick-add.
- **The cash count is required for the MVP.** If an ATM row becomes a transfer into the Cash wallet, cash that is never itemised vanishes from every total. The remainder has to be booked as an estimated "Untracked cash" expense, by a cash count or at month close. The graph adds "Remainder policy" as a decision gate for this.
- **The long pole is the totals, not the entry form.** Five services (Dashboard, SpendingAnalysis, Insight, Journey scoring, Buckets) plus the chat SQL totals must treat the new transfer rows the same way, and that must land before any ATM row is linked. `transactions.type` is `varchar(15)` with no CHECK constraint, so a new `Transfer` type value would avoid touching the `Type == Expense` filters that an `is_transfer` flag would force. That choice belongs to the plan.

Counts from the graph: the MVP needs 22 prerequisites (5 built, 2 partly built, 15 to do); the full idea (parent/child plus Telegram) adds 12 more.
