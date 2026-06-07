# Financial Journey Scoring Rubric

## Source Framework

Adopted from the **Financial Health Network's 8 Indicators of Financial Health**, adapted to
Indonesian middle-class context (Jakarta cost-of-living baseline, 2026).

## Score Formula

- Each indicator: **0–100** (piecewise linear interpolation between defined thresholds)
- Level score: **average of all non-N/A indicators in that level** (N/A indicators excluded)
- Level "graduated" when **all non-N/A indicators in that level reach ≥ 70**
- Total score: **average of all level scores** (L1–L5)

## Hierarchy of Financial Needs

```
        ▲
       /L5\   Legacy       — preserve and transfer wealth
      /────\
     / L4   \ Freedom      — passive income covers living costs
    /─────────\
   /   L3      \ Growth    — building long-term wealth, protected
  /─────────────\
 /     L2        \ Defense — cushion against shocks
/─────────────────\
       L1          Cashflow — the foundation: income > expenses
───────────────────
```

---

## Indicators

### L1 — Cashflow (Foundation)

#### 1. `spend_lt_income` — Spend Less Than Income (3-month rolling average)

| Ratio (expense / income) | Score |
|--------------------------|-------|
| ≥ 1.00 (spending ≥ income) | 0 |
| 0.95 (spending = 95% income) | 50 |
| ≤ 0.80 (spending ≤ 80% income) | 100 |

*Interpolation: piecewise linear between the three breakpoints.*

- **Data source:** `transactions` table — 3-month rolling average of (total_expense / total_income)
- **Indonesia note:** A 20% savings margin is achievable for median Jakarta salary (Rp 8–15M/month range); lower than FHN's US baseline assumption

#### 2. `pay_bills_on_time` — Pay Bills on Time

| Scenario | Score |
|----------|-------|
| Any bill overdue in last 3 months | 0 |
| All bills paid on time | 100 |

- **Data source:** ❌ **No data source — N/A in MVP.** Requires bill due-date tracking module (Phase 4).
- **Display:** "Coming soon — bill tracking required"

---

### L2 — Defense (Cushion)

#### 3. `liquid_savings_ratio` — Liquid Savings Ratio (Emergency Fund)

| Months of expenses covered | Score |
|---------------------------|-------|
| < 0.5 months | 0 |
| 1.5 months | 50 |
| ≥ 3 months | 100 |

*Interpolation: piecewise linear: 0→50 over 0.5–1.5 months, 50→100 over 1.5–3 months.*

- **Data source:** `accounts` where `account_type = 'Savings'` → latest valuation in `valuations` table. Divided by average monthly expense (last 3 months from `transactions`)
- **Indonesia note:** 3× monthly expense target (Bank Indonesia recommendation; FHN suggests 3–6×, lower end appropriate for earlier career stage in Indonesia)

#### 4. `manageable_dti` — Manageable Debt (DTI Ratio)

| Debt-to-income ratio (monthly) | Score |
|-------------------------------|-------|
| ≥ 50% | 0 |
| 36% | 50 |
| ≤ 20% | 100 |

*Interpolation: piecewise linear: 0→50 over 50%→36%, 50→100 over 36%→20%.*

- **Data source:** `liabilities.monthly_payment` sum / average monthly income from `transactions`
- **Indonesia note:** 36% DTI cap aligns with global standard; conservative for Indonesia where 40–50% is common but financially risky at IDR volatility levels

---

### L3 — Growth (Wealth Building)

#### 5. `savings_rate` — Long-term Savings Rate (3-month avg)

| Contribution rate (savings / income) | Score |
|--------------------------------------|-------|
| 0% (no contribution last 3 months) | 0 |
| 5% | 50 |
| ≥ 15% | 100 |

*Interpolation: piecewise linear: 0→50 over 0%→5%, 50→100 over 5%→15%.*

- **Data source:** `transactions` where `category = 'Investment'` or `category = 'Savings Transfer'` — sum as % of avg monthly income (last 3 months)
- **Indonesia note:** 15% savings rate target matches FHN; lower than typical FIRE advice (20–30%) but realistic for Indonesian middle class

#### 6. `appropriate_insurance` — Appropriate Insurance Coverage

| Scenario | Score |
|----------|-------|
| No insurance tracked | N/A |
| Life + health coverage verified | 100 |

- **Data source:** ❌ **No data source — N/A in MVP.** Requires insurance module (Phase 4).
- **Display:** "Coming soon — insurance tracking required"

#### 7. `prime_credit` — Prime Credit Score

| Scenario | Score |
|----------|-------|
| No credit data | N/A |
| SLIK/BI-Checking clean | 100 |

- **Data source:** ❌ **No data source — N/A in MVP.** Requires credit bureau API integration (Phase 4).
- **Display:** "Coming soon — credit data required"

---

### L4 — Freedom (Financial Independence)

#### 8. `passive_income_coverage` — Passive Income Coverage

| Coverage (passive / total expense) | Score |
|------------------------------------|-------|
| 0% | 0 |
| ≥ 50% of monthly expenses | 100 |

*Interpolation: linear 0→100 over 0%→50%.*

- **Data source:** ❌ **No data source — N/A in MVP.** Requires dividend/yield tracker (Phase 4).
- **Display:** "Coming soon — passive income tracking required"

---

### L5 — Legacy (Wealth Transfer)

All indicators for L5 are **Phase 4 scope** — estate planning, wealth transfer structures, etc.

---

## Level Graduation Rules

A user is considered to have "graduated" a level when **all non-N/A indicators in that level score ≥ 70**.

If a level has only N/A indicators (e.g., L4, L5 in MVP), the level is shown as "Data not available" and
is not counted toward the total score. The user's current level is the highest level where at least 1 indicator
is live and all live indicators score ≥ 70.

---

## Indonesia-Specific Adjustments

| Metric | Value | Rationale |
|--------|-------|-----------|
| Emergency fund target | 3× monthly expense | Bank Indonesia recommendation; FHN allows 3–6× |
| FIRE multiple | 25× annual expense | Standard 4% rule; validated for Indonesia long-term |
| DTI cap | 36% | Conservative; global standard; lower than common Indonesian lending practice |
| Base currency | IDR | All amounts in IDR; Wise/multi-currency converted via existing FX rate logic |
| Income baseline | 3-month rolling average | Smooths seasonal variation (THR, bonuses) |

---

## Indicators Excluded from MVP

These 4 indicators are defined in the rubric but not scored in MVP due to missing data sources:

| Code | Reason | Phase |
|------|---------|-------|
| `pay_bills_on_time` | No bill due-date tracking | Phase 4 |
| `appropriate_insurance` | No insurance module | Phase 4 |
| `prime_credit` | No credit bureau integration | Phase 4 |
| `passive_income_coverage` | No dividend/yield tracker | Phase 4 |

They will appear in the pyramid with `status: "no_data"` and a "Request this feature" CTA. **Honest > fake-scored.**

---

## Achievement Codes

| Code | Trigger | Display Name |
|------|---------|--------------|
| `positive_cashflow_3mo` | 3 consecutive months `spend_lt_income ≥ 70` | "Positive Cashflow Streak" |
| `emergency_ready` | `liquid_savings_ratio = 100` (3 months coverage) | "Emergency Ready" |
| `debt_free` | `manageable_dti = 100` (DTI ≤ 20%) | "Light Footprint" |
| `consistent_investor` | `savings_rate ≥ 70` for 3 consecutive months | "Steady Builder" |
| `graduated_l1` | All live L1 indicators ≥ 70 | "Level 1 Cleared" |
| `graduated_l2` | All live L2 indicators ≥ 70 | "Level 2 Cleared" |
| `graduated_l3` | All live L3 indicators ≥ 70 | "Level 3 Cleared" |

---

## Audit Trail

Every score shown to the user is derived from this document. The "How is this scored?" tooltip in the
pyramid UI links to the relevant indicator section above. Formula changes require a version bump
(e.g., `journey_advisor_v2.py`) and a migration to recompute historical snapshots.
