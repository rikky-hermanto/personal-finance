# Idea: Money Tracing (Transfer Chain Visibility)

> **Status:** Braindump — not yet planned
> **Captured:** 2026-06-02
> **Source:** PM brainstorm session

---

## The Core Idea

Ketika user mentransfer uang antar akun sendiri atau top-up e-wallet, sistem mengenali rantai perpindahan dana dan hanya menghitung **terminal transactions** (pengeluaran nyata) sebagai expense — bukan transfer perantaranya.

**Contoh rantai:**
```
BCA -500K (DEBIT)  →  GoPay +500K (CREDIT)  →  QRIS/merchant expenses
     └── bukan expense            └── bukan expense       └── expense nyata
```

---

## User Context (dari diskusi)

- User pakai **QRIS via GoPay** sebagai primary spending method sehari-hari
- Top-up GoPay dari BCA dianggap sebagai **satu blok pengeluaran** — tidak perlu trace micro-transactions per merchant
- Pain utama: transfer ke GoPay muncul sebagai "expense" di dashboard padahal itu cuma perpindahan dana
- Detail pengeluaran GoPay (per merchant) tidak diketahui karena GoPay bukan bank statement yang diupload

---

## Pain Points

| Pain Point | Severity |
|------------|---------|
| Transfer BCA → GoPay dihitung sebagai expense, double-count | **High** |
| Dashboard Total Expenses tidak akurat karena semua transfer masuk hitungan | **High** |
| Tidak ada cara bedain "transfer ke diri sendiri" vs "bayar orang lain" | **Medium** |

**Pain verdict:** Aspirin — data cashflow yang inaccurate adalah pain nyata, bukan nice-to-have.

---

## Revised Framing (post-discussion)

User tidak butuh full chain tracing sampai level micro-transaction GoPay (karena memang tidak punya data itu). Yang dibutuhkan:

> **"Top-up GoPay dari BCA = satu expense item bernama 'GoPay', bukan transfer yang harus di-exclude."**

Ini lebih dekat ke **"Transfer Neutralizer + Smart Categorization"** daripada full chain tracing:
- BCA -500K yang match dengan deskripsi "GoPay", "OVO", "Dana", "LinkAja" → auto-category "E-Wallet Top-Up"
- E-Wallet Top-Up dianggap sebagai pengeluaran final (karena user tidak punya data breakdown GoPay)
- Bukan excluded, tapi di-group sebagai expense category tersendiri

---

## Alternative Approaches

### Alt A — Transfer Neutralizer (original)
Auto-detect BCA -500K ↔ GoPay +500K pair, exclude keduanya dari expense. Perlu GoPay parser untuk sisi GoPay-nya.

### Alt B — Smart E-Wallet Categorization (fits user's actual need)
Regex/keyword match: deskripsi "GoPay", "OVO", "DANA", "QRIS Top Up" → auto-tag sebagai expense category "E-Wallet Spending". No pairing needed. GoPay top-up menjadi proxy untuk actual GoPay spending.

### Alt C — Transfer Tagging UX
User bisa mark transaksi tertentu sebagai "Internal Transfer" — excluded from reports. Manual tapi precise.

---

## Technical Dependencies

- [ ] `is_transfer` boolean field di transactions schema (belum ada)
- [ ] `transfer_link_id` untuk pair linking (belum ada, butuh migration)
- [ ] GoPay/OVO parser (belum ada — tidak bisa auto-detect pair tanpa data kedua sisi)
- [ ] Supabase migration PF-S08+ harus selesai dulu sebelum schema changes

---

## Fit Score

| Dimension | Score |
|-----------|-------|
| Pain severity | 4/5 |
| Market differentiation | 5/5 |
| Foundation fit | 2/5 |
| Scope realism (MVP) | 3/5 |
| User discovery | 3/5 |
| **Total** | **17/25** |

---

## Recommendation

**Go — tapi dengan Alt B framing, setelah Supabase migration selesai.**

Quick-win yang bisa dilakukan sekarang: tambah keyword-based auto-categorization untuk e-wallet top-ups ("GoPay", "OVO", "Dana", "QRIS") sehingga muncul sebagai expense category "E-Wallet" bukan uncategorized debit. Full transfer-pair linking bisa jadi PF-120+.

---

## Suggested Ticket (when ready)

**Title:** `[PF-118+] Auto-categorize e-wallet top-ups as E-Wallet Spending expense`
**First AC:** BCA transactions with description matching "GoPay|OVO|DANA|LinkAja|QRIS" are auto-categorized as "E-Wallet Spending" (not "Transfer") on upload.
