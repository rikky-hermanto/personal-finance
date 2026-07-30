# Finance Formula Reference

> Canonical definitions for every financial calculation in this product. When code and this
> document disagree, one of them is a bug — resolve it, don't work around it.
>
> Governed by [FIN-02](../../../.claude/rules/finance-domain.md) (no magic thresholds) and
> [FIN-03](../../../.claude/rules/finance-domain.md) (return figures state their method).
>
> Last updated: 2026-07-30

## Contents

1. [Household health ratios](#1-household-health-ratios)
2. [Journey scoring — live breakpoints](#2-journey-scoring--live-breakpoints)
3. [Return measurement](#3-return-measurement)
4. [Risk measurement](#4-risk-measurement)
5. [Position sizing](#5-position-sizing)
6. [Allocation and concentration](#6-allocation-and-concentration)
7. [Freedom / FIRE math](#7-freedom--fire-math)
8. [Inflation and real values](#8-inflation-and-real-values)

---

## 1. Household health ratios

All ratios use a **3-month rolling average** of the flow terms unless stated otherwise. A single
month is noise — irregular income, annual premiums, and one-off purchases all distort it.

| Metric | Formula | Notes |
|--------|---------|-------|
| Savings rate | `(income − expense) / income` | Income is take-home (post-tax). Gross-income savings rate is a different, higher number — don't mix the two across screens. |
| Expense ratio | `expense / income` | The inverse framing of savings rate; the L1 indicator uses this direction. |
| Emergency fund months | `liquid_assets / avg_monthly_essential_expense` | **Essential** expense, not total. Including discretionary spend inflates the requirement and makes the target feel unreachable. Liquid = cash, savings, deposits redeemable ≤ 7 days at par. Not: stocks, mutual funds with T+ settlement risk, crypto, property. |
| Debt-to-income (DTI) | `monthly_debt_service / monthly_gross_income` | **Debt *service*** (required payments), not outstanding balance. This is the lending-industry definition and the one the L2 indicator uses. A "total debt / annual income" ratio is a different metric — if both are ever shown, label them distinctly. |
| Liquid savings ratio | `liquid_assets / monthly_expense` | Same numerator as emergency fund months but denominator is total (not essential) expense — a stricter, more conservative reading. |
| Net worth | `Σ assets − Σ liabilities` | Assets at current fair value, not purchase price. Illiquid assets (property, vehicles) need a stated valuation date; a 3-year-old appraisal presented as "current" is misinformation. |
| Solvency ratio | `net_worth / total_assets` | Fraction of the balance sheet actually owned. Falls as leverage rises. |

**Why essential vs total expense matters enough to be a rule:** a user with Rp 12M/month total
spend of which Rp 7M is essential needs Rp 21M for 3 months, not Rp 36M. Getting this wrong makes
L2 unreachable and, per the pyramid's own logic, blocks the user from L3 forever.

---

## 2. Journey scoring — live breakpoints

The methodology source is [scoring-rubric.md](../../ideas/scoring-rubric.md), adapted from the
**Financial Health Network's 8 Indicators of Financial Health** (US baseline) to a Jakarta
cost-of-living context. Each indicator scores 0–100 by **piecewise linear interpolation** between
breakpoints; a level's score is the mean of its non-N/A indicators; a level graduates at ≥ 70 on
every non-N/A indicator.

Implemented in [JourneyScoringService.cs](../../../apps/api/src/PersonalFinance.Application/Services/JourneyScoringService.cs).
These are the breakpoints actually in the code as of 2026-07-30:

| Indicator | 0 points | 50 points | 100 points | Code |
|-----------|----------|-----------|-----------|------|
| `spend_lt_income` (expense/income) | ≥ 1.00 | 0.95 | ≤ 0.80 | [:299](../../../apps/api/src/PersonalFinance.Application/Services/JourneyScoringService.cs#L299) |
| `emergency_ready` (months covered) | ≤ 0.5 | 1.5 | ≥ 3.0 | [:308](../../../apps/api/src/PersonalFinance.Application/Services/JourneyScoringService.cs#L308) |
| `manageable_dti` (debt service/income) | ≥ 0.50 | 0.36 | ≤ 0.20 | [:317](../../../apps/api/src/PersonalFinance.Application/Services/JourneyScoringService.cs#L317) |
| `savings_rate` | ≤ 0 | 0.05 | ≥ 0.15 | [:326](../../../apps/api/src/PersonalFinance.Application/Services/JourneyScoringService.cs#L326) |

Other declared indicators: `pay_bills_on_time`, `liquid_savings_ratio`, `consistent_investor`,
`appropriate_insurance`, `prime_credit`, `passive_income`, `debt_free`.

**Provenance of the specific numbers** — worth knowing before anyone "tunes" them:

- **DTI 0.36 / 0.20** are US mortgage-underwriting conventions (the 28/36 rule). They are
  defensible as a health signal but they are not an Indonesian regulatory standard.
- **Savings rate 0.15** is the common "save 15% including employer match" retirement heuristic —
  again US-origin, where employer matching exists. Indonesia's BPJS/JHT structure differs.
- **Emergency fund 3 months** is the low end of the 3–6 month range; the rubric argues 3 is the
  right *graduation* bar with 6 as an aspiration.

None of this makes the numbers wrong. It means any change to them is a **methodology decision**
that goes through `/cio methodology`, not a tuning knob. Changing a breakpoint silently re-scores
every user's history and can un-graduate someone from a level they already celebrated.

---

## 3. Return measurement

Per [FIN-03](../../../.claude/rules/finance-domain.md), every return figure names its method.

### Holding-period return (HPR)

```
HPR = (ending_value − beginning_value + income) / beginning_value
```

Correct only when there are no cash flows in between. With deposits or withdrawals it is
meaningless — which is the normal case for a personal portfolio.

### Time-weighted return (TWR)

Removes the effect of cash flow timing. Break the period at each cash flow, compute each
sub-period return, then link geometrically:

```
TWR = Π(1 + r_i) − 1        where r_i = (V_end,i − CF_i) / V_start,i
```

**Answers:** how good was the strategy/manager. **Use for:** comparing a portfolio against a
benchmark (IHSG, a bond index), because the benchmark has no cash flows either.

### Money-weighted return (MWR / IRR / XIRR)

The discount rate `r` where all cash flows plus terminal value net to zero:

```
Σ [ CF_t / (1 + r)^(t/365) ] + V_terminal / (1 + r)^(T/365) = 0
```

Solve numerically (bisection or Newton–Raphson; guard against no-sign-change and multiple roots —
alternating large flows can produce more than one valid IRR, in which case report "not
meaningful" rather than the first root found).

**Answers:** what did *this investor* actually earn, timing decisions included. **Use for:** the
user's own "how am I doing" number. A user who bought heavily right before a rally has a higher
MWR than TWR, and that gap is real information about their behaviour.

### Annualization

```
CAGR = (V_end / V_start)^(1/years) − 1
```

Never annualize a period shorter than one year for display — extrapolating a 3-month 8% gain to
"36% p.a." is the single most common way retail dashboards mislead. Show the period return and
label the period.

---

## 4. Risk measurement

| Metric | Formula | Caveat that matters |
|--------|---------|---------------------|
| Volatility (annualized) | `σ_daily × √252` for daily data, `σ_monthly × √12` for monthly | 252 is the trading-day convention; IDX's actual count differs slightly year to year. Don't mix daily-derived and monthly-derived σ in one comparison. |
| Max drawdown | `min over t of (V_t / running_max(V) − 1)` | Peak-to-trough on the *equity curve*, using the running maximum — not high-minus-low of the period. |
| Current drawdown | `V_now / running_max(V) − 1` | The number that governs risk limits, because it is the one the user is living in. |
| Historical VaR (95%) | 5th percentile of the empirical return distribution | Needs a stated lookback window; a 1-year window through a calm period understates tail risk badly. |
| Parametric VaR | `μ − 1.645σ` (95%), `μ − 2.326σ` (99%) | Assumes normality. Financial returns have fat tails, so this **understates** losses exactly when it matters. Prefer historical VaR; if parametric is used, label the assumption. |
| R-multiple | `(exit − entry) / (entry − stop)` | The unit of account for a risk-managed trading journal: outcomes in R, not rupiah, are comparable across position sizes. |
| Expectancy (per R) | `win_rate × avg_win_R − loss_rate × avg_loss_R` | Needs ≥ 30 closed trades before it means anything. Below that, report the sample size instead of the number. |
| Correlation | Pearson `ρ` on returns over a stated window | Correlations rise toward 1 in crashes. A "diversified" portfolio sized on calm-period correlation is more concentrated than it looks. |

---

## 5. Position sizing

**Risk-first sizing (fixed fractional)** — the only default a risk-managed desk should ship:

```
risk_rupiah = active_trading_nav × risk_per_trade_pct
units       = floor( risk_rupiah / (entry − stop) )          # long
units       = floor( risk_rupiah / (stop − entry) )          # short
```

Then apply, in order, and take the binding minimum:

1. `units` from risk (above)
2. Lot rounding — IDX trades in lots of 100 shares, so `lots = floor(units / 100)`
3. Notional cap — `units × entry ≤ nav × max_position_pct`
4. Liquidity cap — `units ≤ participation_pct × avg_daily_volume`
5. Cluster/sector cap — combined risk across correlated positions ≤ cluster limit

**Why the stop is an input and not an output:** sizing from conviction ("I really like this one")
and then placing a stop wherever it fits is how accounts die. The stop defines the loss; risk
tolerance defines the size. A wide stop must produce a *small* position, not a rationalized
normal one.

**Kelly criterion** — `f* = p − q/b` for a binary payoff, or `f* = (μ − r) / σ²` in continuous
form. Include it only as a reference ceiling, never a default, and cap at a fraction of it
(¼–½ Kelly is the usual practice). Full Kelly is optimal only with a *known* edge and infinite
horizon; with an estimated edge it routinely prescribes ruinous size. If Kelly ever appears in
this product, it appears next to its cap and a plain-language warning.

**Aggregate risk** is what actually kills an account:

```
open_risk = Σ (units_i × |entry_i − stop_i|)
```

This is the number a daily/weekly loss limit constrains — not the count of open positions.

---

## 6. Allocation and concentration

| Concept | Definition | Practical rule |
|---------|-----------|----------------|
| Strategic allocation (SAA) | Long-run target weights per asset class | Written down before trading, changed deliberately — not in reaction to a drawdown |
| Rebalancing band | Trigger when a weight drifts beyond its band | The **5/25 rule**: rebalance when a weight moves 5 percentage points absolute, or 25% relative to its target, whichever is smaller. Bands beat calendar rebalancing on tax and cost. |
| Concentration (HHI) | `Σ wᵢ²` | 1.0 = single holding; 0.1 = ten equal holdings. An HHI implying < 5 effective positions is a concentration flag, not a portfolio. |
| Effective N | `1 / HHI` | The intuitive form to show a user: "you effectively hold 3.2 positions." |
| Position cap | Max weight per single holding | Cap must exist and be stated. Without one, the winner silently becomes the portfolio. |

**Tax and cost drag** is the one improvement available with certainty, unlike returns:
every rebalance in Indonesia realizes a 0.1% final tax on the sale side of IDX stock plus
brokerage on both sides (see [tax-id.md](tax-id.md)). Model the drag before recommending a
rebalancing frequency — a monthly rebalance can cost more than the tracking error it corrects.

---

## 7. Freedom / FIRE math

| Metric | Formula |
|--------|---------|
| Passive income coverage | `monthly_passive_income / monthly_essential_expense` |
| FI number (naive) | `annual_expense / withdrawal_rate` |
| Coast FI | `target / (1 + real_return)^years_remaining` |

**The 4% rule does not transfer to Indonesia, and this matters for L4.** It comes from the Trinity
Study: US stock/bond returns, US inflation, a 30-year horizon, and a portfolio of US equities and
Treasuries. Indonesian inflation history, currency risk, the available instrument set, and the
absence of a comparable long bond history all break the backtest. If a withdrawal rate appears in
this product, it must be presented as a **user-adjustable assumption with its origin stated**, and
the projection must show sensitivity (e.g. 3% / 4% / 5%) rather than a single confident number.
Any single-number "you will be free in 2041" output is a false-precision claim — route it through
`/compliance disclosure` before shipping.

---

## 8. Inflation and real values

```
real_return = (1 + nominal) / (1 + inflation) − 1
```

Not `nominal − inflation`. The subtraction approximation drifts materially at Indonesian
inflation levels and compounds over a projection horizon.

Purchasing power of a future amount:

```
present_value = future_amount / (1 + inflation)^years
```

Any projection longer than ~5 years shown in nominal rupiah without a real-terms companion
figure overstates the outcome. State the inflation assumption used, on screen, every time.
