# Indonesian Investment Tax Reference

> **Not tax advice.** This is an engineering reference so the product's arithmetic and copy match
> current regulation. Users with real filing questions need a consultant.
>
> Governed by [FIN-06](../../../.claude/rules/finance-domain.md): **never quote a rate from this
> file without checking its `Verified` date.** Rows marked ⚠ have not been confirmed against a
> primary source and must be verified before they reach code, UI copy, or a user-facing answer.
>
> Last full review: **2026-07-30**

## Why this file has verification dates

Indonesian investment tax moved materially on 2026-01-01: crypto's rate more than doubled and its
VAT disappeared. Anything in the codebase or docs written before that date is presumed stale. A
rate that was right last year and is quoted confidently today is worse than no number at all —
the user acts on it.

Primary sources, in order of authority: [pajak.go.id](https://www.pajak.go.id) (DJP) ·
[ojk.go.id](https://www.ojk.go.id) · [idx.co.id](https://www.idx.co.id) ·
[djppr.kemenkeu.go.id](https://www.djppr.kemenkeu.go.id) (SBN).

---

## Rate table

| Instrument / event | Tax | Rate | Basis | Regulation | Status |
|---|---|---|---|---|---|
| **IDX stock — sale** | PPh final | **0.1%** | Gross sale proceeds (not gain) | PP 41/1994 as amended | ✅ 2026-07-30 |
| **IDX stock — founder shares at IPO** | PPh final, additional | 0.5% | Share value at IPO | PP 14/1997 | ⚠ not verified |
| **Dividend — domestic company → resident individual** | PPh final | **10%**, or **0% if reinvested** in Indonesia and reported | Gross dividend | PP 9/2021 / UU HPP | ✅ 2026-07-30 |
| **Bond / SBN / ORI / SR — coupon or interest** | PPh final | **10%** | Gross interest | PP 91/2021 | ✅ 2026-07-30 |
| **Bond — capital gain on sale (discount)** | PPh final | 10% | Realized discount/gain | PP 91/2021 | ⚠ rate likely aligned with coupon; verify basis |
| **Crypto — sale via *domestic* registered platform (PAKD)** | PPh 22 final | **0.21%** | Transaction value | **PMK 50/2025**, effective 2026-01-01 (was 0.1%) | ✅ 2026-07-30 |
| **Crypto — sale via *foreign* platform (PMSE)** | PPh 22 final | **1%** | Transaction value | PMK 50/2025 | ✅ 2026-07-30 |
| **Crypto — purchase** | PPN | **none** | — | PMK 50/2025 removed VAT by treating crypto as securities | ✅ 2026-07-30 |
| **Crypto mining** | PPh general | Art. 17 progressive rates | Net income | PMK 50/2025, from FY2026 | ✅ 2026-07-30 |
| **Bank deposit / time deposit interest** | PPh final | **20%** | Gross interest | PP 131/2000 | ✅ 2026-07-30 |
| **Mutual fund (reksa dana) — redemption** | — | No separate investor-level tax | Tax is borne at fund level; NAV is already net | DJP guidance | ✅ 2026-07-30 |
| **P2P lending (pindar) — interest received** | PPh | Treated as other income; platform withholding varies | Gross interest | PMK 69/2022 | ⚠ not verified — confirm withholding vs self-report |
| **Physical gold** | PPh 22 on purchase from certain sellers; gain not separately taxed | varies | Purchase value | PMK 48/2023 | ⚠ not verified |

### Notes that change the arithmetic

**Stock tax is on proceeds, not profit.** A loss-making sale is still taxed 0.1%. Any
return calculation that nets tax must apply it to the sale value, and any "what will this
rebalance cost me" estimate must include it on every sell leg.

**Crypto's 0.21% applies to the transaction, both directions of a round trip.** A buy-then-sell
round trip therefore carries the tax on the sell side only, but frequent trading compounds it far
faster than the old 0.1%. If the product ever shows crypto trading cost, this is now the dominant
term for small trades.

**The dividend exemption is conditional and easy to lose.** 0% requires reinvestment in Indonesia
in an eligible instrument, held for the required period, with a realization report filed for three
consecutive years plus disclosure in the annual SPT. Presenting "dividends are tax-free" without
those conditions is the kind of simplification that costs a user 10% — if the product surfaces
this, it surfaces the conditions too.

**Final tax means final.** Instruments marked *PPh final* are settled at withholding and are not
recomputed against the user's progressive bracket. Never sum final-taxed income into a marginal
rate estimate.

---

## What this means for features

| If the product does this | Then it must account for |
|---|---|
| Show portfolio return | Whether the figure is gross or net of the 0.1% / 0.21% sale tax, and say which |
| Recommend rebalancing | Sale tax on every sell leg + brokerage both sides — the drag can exceed the benefit |
| Show bond yield | Net-of-10% coupon, since the user receives it net; a gross coupon number overstates income |
| Compare deposits vs SBN | 20% vs 10% final tax is the whole point of the comparison — omitting it inverts the ranking |
| Show crypto P&L | 0.21% domestic / 1% foreign, and which platform class the account is |
| Project passive income (L4) | Net-of-tax income, or the freedom threshold is reached on paper years before reality |

Any of these landing in UI copy goes through `/compliance tax` first — the rate and its
verification date are checked at that gate, not assumed.

---

## Verification log

| Date | What was checked | Outcome |
|------|------------------|---------|
| 2026-07-30 | Crypto (PMK 50/2025), bond/SBN coupon 10%, IDX 0.1%, dividend PP 9/2021, deposit 20%, mutual fund fund-level | Confirmed via DJP articles and tax-practitioner coverage; crypto rate change to 0.21% + PPN removal effective 2026-01-01 confirmed |

**Sources used in this review:**
- [PMK 50/2025: Babak Baru Pemajakan Aset Kripto — DJP](https://www.pajak.go.id/en/node/117234)
- [Beli Kripto Tidak Lagi Kena PPN — DJP](https://www.pajak.go.id/en/node/117774)
- [Aspek Pajak Transaksi Kripto Dulu dan Sekarang — DJP](https://www.pajak.go.id/index.php/en/node/117834)
- [Mulai 2026, Tarif Pajak Kripto Naik Jadi 0,21% namun PPN Dihapuskan — IKPI](https://ikpi.or.id/en/mulai-2026-tarif-pajak-kripto-naik-jadi-021-namun-ppn-dihapuskan/)
- [Pemerintah Tawarkan ORI030, Begini Perlakuan Pajak atas Kuponnya — DDTC](https://news.ddtc.co.id/berita/nasional/1820612/pemerintah-tawarkan-ori030-begini-perlakuan-pajak-atas-kuponnya)
- [Surat Berharga Negara dan Potongan PPh Final Investasi SBN — Klikpajak](https://klikpajak.id/blog/surat-berharga-negara/)
- [Sisi Pajak Reksa Dana dan Saham bagi Orang Pribadi — DJP](https://pajak.go.id/en/node/51056)
- [Ingin Dividen Bebas Pajak? Ingat Lagi Sederet Ketentuannya — DDTC](https://news.ddtc.co.id/berita/nasional/1817052/ingin-dividen-bebas-pajak-ingat-lagi-sederet-ketentuannya)
