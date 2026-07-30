# Indonesian Instrument Mechanics

> Trading and settlement conventions for every instrument class this product tracks. These are the
> details that make a calculation right or wrong — lot size, settlement lag, cut-off time,
> tradability.
>
> ⚠ marks a fact that has **not** been verified against a primary source this session. Exchange
> microstructure (tick ladders, auto-rejection bands, session times) changes by IDX regulation and
> must be confirmed at [idx.co.id](https://www.idx.co.id) before it drives code.
>
> Last updated: 2026-07-30

---

## IDX equities

| Property | Value | Status |
|---|---|---|
| Lot size | **100 shares** — orders and positions are in lots | ✅ stable convention |
| Settlement | T+2 | ⚠ verify |
| Tick size | Tiered ladder by price band | ⚠ verify — the ladder has been revised more than once; never hardcode from memory |
| Auto-rejection (ARA/ARB) | Asymmetric percentage bands by price band, tightened/loosened by IDX policy | ⚠ verify — bands changed repeatedly post-2020 |
| Sessions | Pre-opening, Session I, Session II, pre-closing, post-trading | ⚠ verify times |
| Price basis for valuation | Closing price of the last trading day | ✅ |

**Consequences for this product:**

- Position sizing must floor to whole lots (see [formulas.md §5](formulas.md#5-position-sizing)).
  A sizing engine that returns 137 shares produced a number that cannot be executed.
- Any "sell to reach target allocation" suggestion is quantized by lot size. On a high-priced
  stock, one lot can be a large fraction of a small portfolio, so exact rebalancing to a target
  weight is often impossible — say so rather than showing an unreachable target.
- T+2 means proceeds are not liquid on the trade date. Cash available for emergency-fund purposes
  excludes unsettled sale proceeds.

## Government securities (SBN)

Retail series issued by DJPPR, Ministry of Finance.

| Series | Type | Coupon | Tradable before maturity | Notes |
|---|---|---|---|---|
| **ORI** (Obligasi Negara Ritel) | Conventional bond | Fixed | Yes, in secondary market | ORI030 offered from 2026-07-06, coupons 6.9% (3y) / 7.0% (6y) ✅ |
| **SR** (Sukuk Ritel) | Sharia | Fixed | Yes | ⚠ verify current series terms |
| **ST** (Savings Bond Ritel) | Conventional | **Floating with floor** | **No** — non-tradable, early redemption facility only | ⚠ verify redemption window and fee |
| **SBR** | Savings type | Floating with floor | No | ⚠ verify whether series is still issued |

| Property | Value | Status |
|---|---|---|
| Coupon payment | Monthly, on the **15th** | ✅ 2026-07-30 |
| Coupon tax | 10% PPh final, withheld — the user receives net | ✅ see [tax-id.md](tax-id.md) |
| Minimum purchase | Rp 1,000,000 | ⚠ verify per series |
| Distribution | Registered midis / partner banks and platforms | ✅ |

**Consequences:** a yield figure shown to the user must be net of the 10% coupon tax, because that
is what lands in their account. Floating-with-floor series (ST/SBR) cannot be valued with a fixed
coupon assumption, and non-tradable series have no mark-to-market price — carry them at par and
label the valuation basis.

## Mutual funds (reksa dana)

| Property | Value | Status |
|---|---|---|
| Unit price | NAB/UP (net asset value per unit), published once per day | ✅ |
| Order cut-off | ~13:00 WIB — orders after cut-off transact at the *next* day's NAB | ⚠ verify per APERD/platform |
| Settlement | Redemption proceeds typically T+2 to T+7 depending on fund type | ⚠ verify |
| Investor-level tax | None separately; tax is borne at fund level, NAB is already net | ✅ see [tax-id.md](tax-id.md) |
| Types | Pasar uang · Pendapatan tetap · Campuran · Saham · Indeks / ETF | ✅ |

**Consequences:** a purchase does not have a known unit count at order time. Any position display
must handle the pending window rather than assuming instant fill, and money-market funds are the
only category with a defensible claim to emergency-fund liquidity — and even then not same-day.

## Crypto

| Property | Value | Status |
|---|---|---|
| Regulator | Supervision transitioned from Bappebti to **OJK** under UU P2SK | ⚠ verify current state of transition |
| Eligible venue | Registered domestic platform (PAKD) vs foreign platform — **tax differs 0.21% vs 1%** | ✅ see [tax-id.md](tax-id.md) |
| Quote currency | IDR pairs domestically; USD/USDT pairs need an FX step | ✅ |
| Trading hours | 24/7 | ✅ |

**Consequences:** the platform class is a required field, not cosmetic — it changes the tax by
nearly 5×. 24/7 trading means a "daily loss limit" needs an explicit day boundary and timezone,
or the limit is unenforceable.

## P2P lending (pindar)

| Property | Value | Status |
|---|---|---|
| Regulator | OJK-licensed; the legal term is now *pindar* (pinjaman daring) | ⚠ verify terminology currency |
| Headline risk metric | TKB90 (90-day repayment success rate), published per platform | ✅ widely used |
| Principal protection | **None.** Not deposit insurance, not guaranteed | ✅ |
| Tax | Interest treated as income; withholding practice varies | ⚠ see [tax-id.md](tax-id.md) |

**Consequences:** P2P principal is at risk and illiquid until the loan matures. It must never be
counted toward emergency-fund liquidity, and a portfolio view that shows P2P yield without default
risk is presenting an incomplete picture. TKB90 is a platform-level statistic, not a guarantee
about the user's specific loans.

## Bank deposits and savings

| Property | Value | Status |
|---|---|---|
| Deposit insurance | LPS guarantee, **Rp 2,000,000,000** per customer per bank | ⚠ verify current limit |
| Guarantee eligibility | Void if the deposit rate exceeds the LPS maximum guaranteed rate | ⚠ verify current rate cap |
| Interest tax | 20% PPh final | ✅ see [tax-id.md](tax-id.md) |
| Liquidity | Savings immediate; time deposits penalized on early break | ✅ |

**Consequences:** the LPS cap is a real concentration limit — balances above it at a single bank
carry bank credit risk that a net-worth screen shows as risk-free cash. Chasing an above-cap rate
forfeits the guarantee entirely, which is the opposite of what a user seeking safety intends.

## Foreign exchange

| Property | Value | Status |
|---|---|---|
| Reference rate | JISDOR (Bank Indonesia) for USD/IDR | ⚠ verify current publication basis |
| Valuation convention | Use one documented source consistently; never mix a broker rate into a BI-valued portfolio | ✅ |
| Multi-currency source in this product | Wise CSV carries its own `exchange_rate` per row | ✅ see `TransactionDto.ExchangeRate` |

**Consequences:** an unstated or stale FX rate silently misstates net worth for any user with
foreign holdings. The Trading Desk's FX-staleness gate rule exists for exactly this reason — see
the Gate Rule Registry in [PF-133](../../../.claude/plans/PF-133-trading-desk-foundation-todo.md).
Every stored FX rate needs an `as_of` timestamp, and a rate older than the staleness threshold is
a blocking condition, not a warning to ignore.
