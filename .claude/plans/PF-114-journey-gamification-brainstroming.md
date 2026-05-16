# Review & Rekomendasi: Gamification Engine (Hierarchy of Financial Needs)

## Context

User menemukan konsep **Hierarchy of Financial Needs** (analog Maslow untuk keuangan) dan ingin tahu apakah bisa diadopsi ke aplikasi. Draft awal sudah ditulis di [specs/gamification-engine.md](specs/gamification-engine.md) — 5 level (Cashflow → Defense → Growth → Freedom → Legacy), 3 tema visual (Zen Forest / Metropolis / Mineral Town), 4 fase implementasi.

User concern: aplikasi sekarang sudah berfungsi tapi **terasa "jadul" / boring** seperti aplikasi finansial standar lainnya. Tiga arah yang dipertimbangkan:
1. Workflow/pipeline → restrukturisasi menu jadi L1–L5
2. Dopamine-driven gamification (à la Forest Focus)
3. Scoring standard profesional

Aplikasi saat ini sudah cukup matang di L1 & L3 (Cashflow + Investment), partial di L2 (liabilities tapi belum emergency fund / insurance), dan **kosong** di L4 (passive income / FIRE) dan L5 (legacy/tax).

---

## Penilaian Draft Saat Ini

### ✅ Yang Bagus
- **Framework hierarki** sangat tepat — memetakan dengan rapi ke modul yang sudah/akan ada.
- **Phase 1 (scoring engine)** adalah fondasi yang benar — angka dulu, visual belakangan.
- **Quest cards dinamis berbasis AI** = leverage natural untuk infra Python AI service yang sudah ada.

### ⚠️ Yang Perlu Direvisi

**1. Jangan ganti menu fungsional dengan menu L1–L5.**
Menu seperti Transactions, Accounts, Investment punya nilai **akses cepat** untuk power-user (user sendiri). Mengganti dengan "L1: Survival, L2: Defense…" memaksa user mental-translate setiap kali ingin lihat saldo. Hierarki seharusnya jadi **lensa baru di atas** struktur yang ada, bukan pengganti. → Tambah surface baru `/journey`, jangan reshuffle sidebar.

**2. "Locking" L4/L5 sampai L1/L2 lulus = anti-pattern untuk aplikasi finance.**
Cocok untuk Duolingo (skill-tree linear) tapi kontra-produktif untuk uang riil — orang sering punya investasi sebelum emergency fund komplit, atau warisan sebelum passive income. → Ganti dengan **"Recommended Next" highlighting**, bukan lock. Tunjukkan progress, jangan blokir akses.

**3. Decay animation / "tree wilting saat impulse buy" = bahaya secara perilaku.**
Finance bukan game — hukuman visual saat user "salah" bisa memicu *avoidance behavior* (user berhenti buka app justru ketika paling butuh). Riset behavioral finance (Ariely, Thaler) konsisten: **positive reinforcement > loss aversion** untuk habit jangka panjang. → Hapus mekanik decay. Ganti dengan "neutral state" saat metrik turun, plus quest pemulihan.

**4. Tiga tema visual (Forest/City/Farm) terlalu mahal untuk MVP.**
Setiap tema = sprite art × 5 level × state animations. Realistis butuh artist + 2–3 sprint per tema. → Fase 1 cukup **satu hero visualization: pyramid yang terisi** (mirip infografik referensi yang user share). Profesional, langsung mengkomunikasikan konsep, low art cost. Tema warna-warni jadi Phase 5 opsional.

**5. Scoring algorithm di draft terlalu vague.**
Hanya disebut "Cashflow Ratio, Liquidity Ratio, DTI". Ini perlu rubrik konkret yang bisa di-audit. → Gunakan **8 indikator dari Financial Health Network** (FHN) sebagai dasar, disesuaikan ke konteks Indonesia.

---

## Rekomendasi: Hybrid Approach

> **"Professional dashboard scoring + light gamification touches"** — bukan game penuh, bukan spreadsheet kering. Posisikan sebagai *financial coach*, bukan *Tamagotchi*.

### Pilar Rekomendasi

**A. Scoring framework profesional (bukan dikarang)**
Adopsi **Financial Health Network's 8 Indicators**, dikelompokkan ke 5 level hierarki:

| Level | Indikator (target Indonesia) | Sumber data yang sudah ada |
|---|---|---|
| L1 Cashflow | Spend < Income (3mo rolling); Pay bills on time | `SpendingAnalysisService`, `safe-to-spend` |
| L2 Defense | Liquid savings ≥ 3× monthly expense; Manageable debt (DTI < 36%) | Assets accounts + Liabilities tab (baru) |
| L3 Growth | Long-term savings on track; Appropriate insurance; Prime credit score | Investment module + (baru) Insurance tracker |
| L4 Freedom | Passive income ≥ 50% monthly expense; Plan ahead financially | (baru) Dividend/yield tracker, FIRE simulator |
| L5 Legacy | Net worth target hit; Estate plan in place | (baru) Estate / tax planning module |

Setiap indikator → skor 0–100 dengan threshold publik. **Total score = weighted average**, level = milestone (graduate L1 saat semua 3 indikator L1 ≥ 70).

**B. "Journey" sebagai surface BARU, bukan pengganti**
- Tambah route `/journey` (atau ubah `/dashboard` jadi journey-first, dengan link ke dashboard analitik lama).
- Hero: **pyramid visualization** — 5 tier yang terisi sesuai score. Animasi halus (framer-motion), bukan dopamine-bait.
- Setiap tier card menampilkan: indikator, current vs target, status (✓ Achieved / ◐ In Progress / ○ Not Started), CTA → modul existing.
- Sidebar **tidak diubah**. Hanya tambah item "Journey" di posisi atas.

**C. Quests, bukan punishment**
- AI service generate **3 quests aktif** harian/mingguan berdasarkan gap terbesar:
  *"Tinggal Rp 2.3jt lagi untuk emergency fund 3-bulan. Atur auto-transfer Rp 500rb/minggu → selesai dalam 5 minggu."*
- Quest = saran konkret + estimasi waktu + tombol "Aktifkan reminder". **Bukan XP/coin** — reward = milestone visual di pyramid + badge profesional ("Emergency Ready", "Debt-Free", "5% Saver").
- Existing `portfolio_reviewer.py` infra bisa di-extend jadi `journey_advisor.py`.

**D. Streak yang sesuai konteks finance**
- Forest Focus-style streak cocok untuk **habit kecil**: "log transaksi mingguan", "review weekly verdict", "tidak melewati budget kategori X". 
- Streak besar (3 bulan positive cashflow) = milestone, dirayakan, **tidak di-reset** saat 1 minggu jelek. Treat sebagai badge permanent, bukan Duolingo streak yang menghantui.

**E. Tema visual = Phase opsional di akhir**
Setelah core scoring + journey surface + quests stabil, baru pertimbangkan Zen Forest / Metropolis sebagai **skin opsional** untuk pyramid hero. Risk-managed: kalau ternyata tidak terpakai, app tetap utuh.

---

## Fase Implementasi yang Direkomendasikan

### Phase 0 — Scoring Rubric Definition (no code, 1–2 hari)
- Tulis dokumen `specs/scoring-rubric.md`: 8 indikator FHN diadaptasi ke Indonesia (mis. target emergency fund dalam IDR, FIRE multiplier 25× untuk middle class Jakarta, dst).
- Definisikan threshold publik untuk setiap indikator (0–100 scoring formula).
- **Critical**: rubrik ini = kontrak. Tanpa ini, scoring nanti subjektif dan tidak bisa di-audit user.

### Phase 1 — Data Spine (Backend, ~1 sprint)
- Supabase migration: `user_journey_state`, `journey_indicator_snapshots`, `journey_achievements`.
- .NET: `JourneyScoringService` di Application layer (Clean Arch — interface dulu, impl belakangan), command `RecalculateJourneyCommand`, handler trigger oleh existing domain events (`TransactionCreatedEvent`, `AssetUpdatedEvent`).
- Background recompute (Hangfire atau Supabase pg_cron) nightly + on-event invalidation.
- Endpoint: `GET /api/journey/state`, `GET /api/journey/quests`.
- **Tidak ada UI di phase ini** — verify lewat API testing.

### Phase 2 — Journey Page MVP (Frontend, ~1 sprint)
- **Ganti `/dashboard` jadi `/journey`** — `DashboardPage.tsx` dipensiun dari route default. Sidebar item "Dashboard" jadi "Journey", icon diganti (mis. `Mountain` atau `Trophy` dari lucide-react). Komponen `DashboardPage.tsx` di-archive (tidak di-delete) — akan dikembalikan saat fitur **Pro/Playful toggle** dibangun di iterasi berikutnya.
- Komponen `PyramidProgress` (framer-motion, SVG-based — bukan three.js, overkill). 5 tier yang terisi sesuai score per level, animasi halus saat data update.
- 5 tier cards dengan link deep ke modul existing (Cashflow → `/cashflow/overview`, Defense → `/assets/liabilities`, Growth → `/investment/overview`, dst).
- "Recommended Next" highlighting di tier yang gap-nya paling impactful — **tidak ada lock icon**, semua tier tetap clickable.
- Menggunakan `data-oriented-theme` standard yang sudah ada di `.claude/skills/`.
- Default route `/` redirect ke `/journey` (sebelumnya `/dashboard`).

### Phase 3 — Quests & Streaks (~1 sprint)
- AI service: extend menjadi `journey_advisor.py` — given indicator gaps + 3 month transaction history, generate top-3 actionable quests (tool_use, sesuai rules ai-service.md).
- Frontend: `QuestCard` component di journey page + dashboard.
- Streak heatmap (kecil, tidak dominan) — sesuai konteks finance, bukan game.
- Badge gallery sederhana di `/journey/achievements`.

### Out of Scope untuk MVP (Iterasi Berikutnya)
- **Pro/Playful toggle**: bring back `DashboardPage` sebagai opsi "Pro mode" di Settings. User sudah explicit confirm ini bukan MVP.
- **Phase 4 — Tutup Gap Fitur**: emergency fund tracker (L2), insurance tracker (L2), passive income/dividend tracker + FIRE simulator (L4), estate/tax (L5). Akan dibangun setelah Phase 1–3 live dan kita lihat gap mana yang paling sering muncul di quest user nyata.
- **Phase 5 — Visual Themes**: Zen Forest / Metropolis / Mineral Town sebagai pyramid skin opsional. Dipertimbangkan hanya kalau Phase 2 pyramid hero terbukti tidak cukup engaging.

---

## Keputusan Strategis (Decided)

1. **Positioning**: ✅ Professional coach + light gamification. Pyramid hero, quest cards, badges profesional. No decay, no lock. Tema visual = phase opsional.
2. **Menu strategy**: ✅ **Ganti `/dashboard` jadi `/journey`** (bukan tambah baru). Dashboard analitik lama akan dibalikin di iterasi berikutnya sebagai bagian dari toggle **Pro mode** vs **Playful mode** (Pro = dashboard kembali, Playful = journey hero). Toggle ini di luar scope MVP — dibahas terpisah.
3. **MVP scope**: ✅ Phase 0–3 saja (~3 sprint). Tutup feature gaps (emergency fund tracker L2, FIRE simulator L4) di iterasi terpisah berdasarkan feedback nyata.

---

## File Paths yang Akan Tersentuh (Preview)

### New
- `specs/scoring-rubric.md`
- `supabase/migrations/XXX_journey_tables.sql`
- `apps/api/src/PersonalFinance.Application/Services/JourneyScoringService.cs`
- `apps/api/src/PersonalFinance.Application/Commands/RecalculateJourneyCommand.cs`
- `apps/api/src/PersonalFinance.Api/Controllers/JourneyController.cs`
- `apps/frontend/src/pages/journey/JourneyPage.tsx`
- `apps/frontend/src/components/journey/PyramidProgress.tsx`
- `apps/frontend/src/components/journey/TierCard.tsx`
- `apps/frontend/src/components/journey/QuestCard.tsx`
- `services/ai-service/app/services/journey_advisor.py`

### Extended
- `apps/frontend/src/App.tsx` — ganti default route `/dashboard` → `/journey`
- `apps/frontend/src/components/AppShell.tsx` — sidebar item "Dashboard" diganti jadi "Journey" (icon + label)
- `apps/frontend/src/pages/DashboardPage.tsx` — **tidak dihapus**, dipensiun dari route. Akan di-revive sebagai Pro mode di iterasi berikutnya
- `services/ai-service/app/main.py` — endpoint `/journey/quests`

### Reused
- `SpendingAnalysisService` (L1 metrics)
- `portfolio_reviewer.py` (pattern untuk advisor)
- Domain events existing (`TransactionCreatedEvent`, `AssetUpdatedEvent`)

---

## Verifikasi End-to-End

Setelah Phase 1–3 selesai:
1. `dotnet test` — pastikan scoring service unit-tested per indikator
2. Manual: seed user dengan profile L2 (cashflow positif, emergency fund 50% dari target), buka `/journey`, expect:
   - Pyramid L1 fully filled (hijau), L2 half filled, L3–L5 empty
   - Tier card L2: status "In Progress", CTA → assets page
   - 3 quest cards muncul, top quest tentang emergency fund gap
3. Trigger transaksi besar via API → verify journey state re-computed dalam <5 detik
4. Playwright E2E baru: `e2e/journey.spec.ts` — assert pyramid render, tier deep-links work

---

## Rangkuman Singkat untuk User

**TL;DR**: Konsep hierarki sangat solid dan layak diadopsi. Tapi geser dari "game penuh dengan tema Tree/City/Farm + decay punishment + menu replacement" ke **"professional journey dashboard"**: pyramid hero visualization, scoring rubrik berbasis Financial Health Network, quest cards dari AI, surface baru `/journey` (sidebar tetap utuh), no locking, no decay. Tema visual sebagai skin opsional di phase akhir. Pendekatan ini menjawab keluhan "boring" tanpa mengorbankan kredibilitas finansial — dan secara natural meng-expose feature gaps (emergency fund tracker, FIRE simulator) yang memang perlu dibangun.
