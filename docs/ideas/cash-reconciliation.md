# Idea: Cash Reconciliation (ATM Withdrawal Breakdown)

> **Status:** Braindump — not yet planned
> **Captured:** 2026-08-04
> **Source:** /braindump — kepikiran soal keganjalan kalau hanya rely on bank statement semata

---

## The Core Idea

Bank statement hanya mencatat "penarikan ATM 300rb" sebagai satu transaksi — kemana cash itu dipakai jadi blind spot. Idenya: unit-unit kecil transaksi cash (misalnya di-capture via foto ke Telegram) direkonsiliasi menjadi **breakdown** atas withdrawal induknya, sehingga tidak ada double transaksi.

```
Bank statement                     Capture cash spending (di luar bank)
──────────────                     ─────────────────────────────────────
[Tarik ATM -300rb] ◄── parent      [foto struk via Telegram] → 50rb makan
        │                          [foto struk via Telegram] → 30rb parkir
        │                          [foto struk via Telegram] → 120rb belanja
        ▼                                        │
   Rekonsiliasi ◄────────────────────────────────┘
        │
        ▼
  300rb withdrawal = parent
  ├── 50rb  makan      (child breakdown)
  ├── 30rb  parkir     (child breakdown)
  ├── 120rb belanja    (child breakdown)
  └── 100rb belum ter-alokasi (sisa cash)

  → total expense tetap 300rb, TIDAK double count
```

---

## Context & Pain (from the dump)

- "saat ini semua transaksi dikumpulkan dari bank statement, jadi hal2 yg tercatat ya apapun yg ditulis disana"
- Setelah tarik cash dari ATM (misal 300rb), yang tercatat di bank statement cuma "penarikan ATM" — aliran dana yang dipakai di luar itu tidak terpetakan
- "semua unit kecil transaksi menggunakan cash ini misalnya kita foto pakai telegram, ini bisa kita rekonsialisasikan menjadi breakdown transaksi atas 300rb yg ditarik tadi"
- "Jadi tidak ada double transaksi"
- "aku merasa ada keganjalan disini kalau hanya rely on bank statement semata"

---

## Rough Notes

- Interpretasiku: withdrawal ATM menjadi **parent transaction**, cash spending menjadi **child transactions** yang di-link ke parent — expense total dihitung dari parent (atau dari children yang menggantikan porsi parent), bukan keduanya.
- Capture channel yang disebut: foto via Telegram — implies bot/ingestion path baru di luar bank statement upload (LLM vision sudah ada di /parse-image).
- Pertanyaan terbuka: bagaimana handle sisa cash yang belum ter-alokasi? Bagaimana kalau breakdown melebihi jumlah withdrawal?
- Ini melengkapi money-tracing: money-tracing soal transfer antar akun sendiri (e-wallet top-up), ini soal cash yang keluar dari sistem perbankan sama sekali.

---

## Related Ideas / Features

- [money-tracing.md](money-tracing.md) — sama-sama soal "bank statement bukan gambaran lengkap"; itu untuk transfer/e-wallet chain, ini untuk cash yang keluar dari banking system.

---

## Next Step (when ready)

Run `/pm-brainstorm analyze cash-reconciliation` for full PM analysis, or `/plan` when ready to build.
