# Idea: Reward Loop Closure — Garden Widget + Reward Toast

> **Status:** Braindump — not yet planned
> **Captured:** 2026-06-11
> **Source:** UX review session of the HTML prototype (Journey & Cashflow) — finding P1: "Loop reward tidak tertutup". Mockup sudah di-compile dan terbukti terasa di prototype.

---

## The Core Idea

Quest sudah punya "+10 pts", tapi poin itu tidak terlihat pergi ke mana — tutup loop gamifikasi dengan (1) widget garden mini permanen di sidebar (tanaman tier aktif + skor, hidup di semua halaman) dan (2) feedback sesaat saat quest selesai (toast "+pts", growth bar naik, tanaman pulse) — sesuai zen ease curves, tidak perlu confetti norak.

```
                         GAMIFICATION 101
        visible progress + immediate feedback + clear next step

┌──────────────┐   complete    ┌─────────────────────────────────┐
│  Quest Card  │ ────────────► │  award(pts → tier via target    │
│  "+10 pts"   │               │  indicator, mis. liquid_savings │
│  [✓Complete] │               │  → L2)                          │
└──────────────┘               └──────────────┬──────────────────┘
   (clear next step)                          │
                            ┌─────────────────┼───────────────────┐
                            ▼                 ▼                   ▼
                   ┌────────────────┐ ┌───────────────┐  ┌────────────────┐
                   │ RewardToast    │ │ GardenWidget  │  │ Journey page   │
                   │ bottom-center  │ │ (sidebar, ALL │  │ bars/hero ikut │
                   │ "+10 pts → L1" │ │ pages):       │  │ update         │
                   │ auto-dismiss   │ │ 🌿 L1·Found.  │  └────────────────┘
                   │ ~4s            │ │ bar 58→68,    │
                   └────────────────┘ │ count-up,     │
                   (immediate fb)     │ +10 float     │
                                      └───────┬───────┘
                                      (visible progress)
                                              │ score lewat stage
                                              │ boundary (75)
                                              ▼
                                   ┌─────────────────────┐
                                   │ Stage-up moment:    │
                                   │ 🌿 → 🌳 emoji swap  │
                                   │ toast ke-2: "Your   │
                                   │ plant grew —        │
                                   │ Flourishing"        │
                                   └─────────────────────┘
```

---

## Context & Pain (from the dump)

- Objective produk: **make finance fun for user awam** — zen/minimalis tapi gamified.
- Quest cards (Journey & Cashflow overview) menampilkan "+10 pts" tapi **tidak ada tempat poin terlihat terakumulasi** di header/sidebar.
- Garden/plant metaphor hanya hidup di halaman Journey — di halaman lain gamifikasi hilang sama sekali.
- Dari tiga pilar gamifikasi, baru "clear next step" yang ada; visible progress dan immediate feedback belum.

---

## Rough Notes

Perilaku yang sudah divalidasi di mockup HTML (project "Personal Finance", file `Journey & Cashflow.html` + `pf-reward.jsx`):

- **GardenWidget (sidebar, semua halaman):** plant emoji tier aktif + `L1 · Foundations` + amber progress bar + `58/100` + stage label (Seed/Sprout/Growing/Flourishing). Klik → navigasi ke Journey.
- **Saat complete quest:** skor count-up (~800ms ease-out), bar tumbuh (existing `grow-bar` transition), plant pulse (scale 1→1.3→1, ~650ms), chip `+10` float naik & fade.
- **RewardToast:** pill bawah-tengah, white surface + warm border + whisper shadow (zen action-bar pattern), isi: emoji + `+10 pts → L1 · Foundations` + link "View →" + dismiss. Auto-dismiss ~4s.
- **Stage-up toast** terpisah (delay ~900ms setelah pts toast), border amber: "Your foundations plant grew — Flourishing". Stage boundary = `floor(score/25)`.
- **Poin dialirkan ke tier sesuai `targetIndicator`** quest (mis. `liquid_savings` → L2), bukan selalu tier aktif — supaya bukan angka kosmetik; bar di Journey page ikut bergerak.
- Di mockup, tombol "✓ Complete" manual sebagai pengganti deteksi otomatis. Di real app, quest completion harusnya **terdeteksi dari data** (upload statement, set EF target, dst.) — toast muncul saat indicator recompute, bukan saat klik.
- Reduced-motion: semua animasi reward di-gate `prefers-reduced-motion`.
- Open questions:
  - Poin masuk ke **level score** atau ke **indicator score** lalu level score di-derive? (mockup: langsung level score, simplifikasi)
  - `totalScore` recompute formula? (mockup pakai aproksimasi `+gained*0.4` — bukan jawaban)
  - Kalau quest selesai saat user tidak membuka app (batch recompute), feedback-nya jadi apa? Queue toast saat next visit? Digest?
  - Toast stacking max berapa? (mockup: max 2)
  - Persist completed quests di mana — sekarang quest engine belum punya state "done"?
- Screenshot referensi UI tersimpan di project mockup: `ref/screens/` (7 screenshot: overview, journey-dark, bank-accounts, upload, statement-dark).

---

## Related Ideas / Features

- `gamification-engine.md` — spec induk: Hierarchy of Financial Needs + theme "Grow Your Own"; ide ini adalah mekanik feedback-loop yang menghidupkan spec itu di luar halaman Journey.
- `journey-quest-ideas.md` — sumber quest yang memberi pts; ide ini menjawab "pts-nya pergi ke mana".
- `scoring-rubric.md` — formula skor yang harus dijawab open questions di atas.

---

## Next Step (when ready)

Run `/pm-brainstorm analyze reward-loop-closure` for full PM analysis, or `/plan` when ready to build.
