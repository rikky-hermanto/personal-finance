# PF-114 — Journey: Financial Hierarchy Dashboard & Light Gamification

> **GitHub Issue:** _to be created_
> **Status:** Phase 0–3 COMPLETE — awaiting manual smoke test (STEP 21)
> **Started:** 2026-05-16
> **Completed:** 2026-05-16
> **Spec:** [specs/gamification-engine.md](../../specs/gamification-engine.md)
> **Review notes:** [C:\Users\rikky\.claude\plans\aku-discover-tentang-hierarki-woolly-river.md](C:/Users/rikky/.claude/plans/aku-discover-tentang-hierarki-woolly-river.md)

## Objective

Aplikasi saat ini terasa "jadul" — data-dashboard standar tanpa narasi progres. Adopsi konsep **Hierarchy of Financial Needs** (L1 Cashflow → L2 Defense → L3 Growth → L4 Freedom → L5 Legacy) sebagai *lensa* baru di atas modul yang sudah ada. Ganti landing `/dashboard` jadi `/journey` — sebuah **pyramid hero visualization** yang menampilkan skor finansial profesional per level, lengkap dengan quest cards dari AI dan badge milestones. Tidak ada decay punishment, tidak ada feature lock. Positioning: **professional finance coach dengan sentuhan gamification ringan**, bukan game penuh.

Iterasi pertama (MVP, Phase 0–3) menyelesaikan: scoring rubric, backend scoring engine, journey UI, quest cards. Feature gaps (emergency fund tracker L2, FIRE simulator L4) dan visual themes (Zen Forest / Metropolis) di luar scope MVP.

## Acceptance Criteria

- [ ] Dokumen `specs/scoring-rubric.md` mendefinisikan 8 indikator (basis Financial Health Network) dengan threshold 0–100 yang dapat di-audit, disesuaikan konteks Indonesia
- [ ] Tabel Supabase baru: `user_journey_state`, `journey_indicator_snapshots`, `journey_achievements` (migration applied)
- [ ] Domain entity + repo via `supabase-csharp` untuk 3 tabel di atas (Clean Arch — Domain/Entities, Application/Interfaces)
- [ ] `IJourneyScoringService` di Application layer + impl yang menghitung skor per indikator + total level
- [ ] Command `RecalculateJourneyCommand` + handler, di-trigger oleh existing domain events (`TransactionCreatedEvent`, `AssetUpdatedEvent`)
- [ ] Endpoint `GET /api/journey/state` mengembalikan: current level, scores per indicator, level progress, achievements
- [ ] Endpoint `GET /api/journey/quests` mengembalikan 3 quest aktif dari AI service
- [ ] AI service: `journey_advisor.py` generate top-3 quests via Anthropic `tool_use` (sesuai `.claude/rules/ai-service.md`)
- [ ] Route `/dashboard` di-replace jadi `/journey`; sidebar item "Dashboard" jadi "Journey"
- [ ] Komponen `PyramidProgress.tsx` (SVG + framer-motion) — 5 tier yang terisi sesuai score
- [ ] 5 tier cards dengan status (✓ Achieved / ◐ In Progress / ○ Not Started) + CTA deep-link ke modul existing
- [ ] `QuestCard.tsx` menampilkan quest dari AI dengan "Aktifkan reminder" button
- [ ] `StreakHeatmap.tsx` (kecil, tidak dominan) — 12-week activity grid
- [ ] Badge gallery di `/journey/achievements` (sederhana: grid + tooltip)
- [ ] Playwright E2E: `e2e/journey.spec.ts` — verify pyramid render, tier deep-links, quest cards visible
- [ ] xUnit tests untuk `JourneyScoringService` (1 test per indikator, edge cases)
- [ ] pytest untuk `journey_advisor.py` dengan mocked Anthropic client

## Approach

**Lensa di atas modul existing, bukan rewrite.** Pyramid hero baca data agregat dari modul-modul yang sudah ada (`SpendingAnalysisService`, Assets, Investment) via service composition di .NET — tidak ada duplikasi storage transaksi. Hanya skor & snapshot yang disimpan terpisah di tabel `user_journey_state`.

**Scoring rubric publik & auditable.** Bukan formula opaque. Setiap indikator punya threshold yang ditulis di `specs/scoring-rubric.md` dan ditampilkan ke user via tooltip "How is this scored?".

**Recalc strategy hybrid.** (1) Trigger on domain event saat transaksi/asset berubah → enqueue recompute. (2) Fallback nightly batch via Supabase `pg_cron` untuk catch-all. Hindari recompute synchronous di request path.

**AI service reuse pattern dari `portfolio_reviewer.py`.** `journey_advisor.py` mengikuti contract yang sama: input = financial snapshot, output = structured quests via `tool_use`, temperature 0.0.

**Out of scope (MVP):** Pro/Playful toggle (bring back DashboardPage as opt-in), emergency fund tracker, FIRE simulator, insurance tracker, estate planning, visual themes (Zen Forest / Metropolis / Mineral Town), push notifications, decay animations, feature locking.

## Affected Files

| File | Change |
|------|--------|
| `specs/scoring-rubric.md` | **Create** — 8 indikator + threshold + adaptasi Indonesia |
| `supabase/migrations/YYYYMMDDHHMMSS_journey_tables.sql` | **Create** — 3 tables + indexes + RLS |
| `apps/api/src/PersonalFinance.Domain/Entities/UserJourneyState.cs` | **Create** — entity dengan `[Table]` attrs |
| `apps/api/src/PersonalFinance.Domain/Entities/JourneyIndicatorSnapshot.cs` | **Create** |
| `apps/api/src/PersonalFinance.Domain/Entities/JourneyAchievement.cs` | **Create** |
| `apps/api/src/PersonalFinance.Application/Interfaces/IJourneyScoringService.cs` | **Create** |
| `apps/api/src/PersonalFinance.Application/Services/JourneyScoringService.cs` | **Create** — compute 8 indicators |
| `apps/api/src/PersonalFinance.Application/Commands/RecalculateJourneyCommand.cs` | **Create** — command + handler |
| `apps/api/src/PersonalFinance.Application/Dtos/JourneyStateDto.cs` | **Create** — wire contract |
| `apps/api/src/PersonalFinance.Application/Dtos/JourneyQuestDto.cs` | **Create** |
| `apps/api/src/PersonalFinance.Application/EventHandlers/JourneyRecalcOnTransactionHandler.cs` | **Create** — INotification handler |
| `apps/api/src/PersonalFinance.Application/EventHandlers/JourneyRecalcOnAssetHandler.cs` | **Create** |
| `apps/api/src/PersonalFinance.Infrastructure/External/JourneyAdvisorClient.cs` | **Create** — typed HttpClient → AI service |
| `apps/api/src/PersonalFinance.Api/Controllers/JourneyController.cs` | **Create** — GET /state, /quests |
| `apps/api/src/PersonalFinance.Api/Program.cs` | **Edit** — register service, HttpClient |
| `apps/api/tests/PersonalFinance.Tests/Services/JourneyScoringServiceTests.cs` | **Create** — 1 test/indikator |
| `services/ai-service/app/services/journey_advisor.py` | **Create** — tool_use quest generator |
| `services/ai-service/app/prompts/journey_advisor_v1.py` | **Create** — system prompt + examples |
| `services/ai-service/app/main.py` | **Edit** — add POST /journey/advise endpoint |
| `services/ai-service/app/models.py` | **Edit** — add `JourneyAdviseRequest`, `Quest` pydantic models |
| `services/ai-service/tests/test_journey_advisor.py` | **Create** — mocked Anthropic test |
| `apps/frontend/src/api/journeyApi.ts` | **Create** — fetch state + quests |
| `apps/frontend/src/types/Journey.ts` | **Create** — TS types matching DTOs |
| `apps/frontend/src/pages/journey/JourneyPage.tsx` | **Create** — main page |
| `apps/frontend/src/pages/journey/AchievementsPage.tsx` | **Create** — badge gallery |
| `apps/frontend/src/components/journey/PyramidProgress.tsx` | **Create** — SVG pyramid |
| `apps/frontend/src/components/journey/TierCard.tsx` | **Create** — 5 tier cards |
| `apps/frontend/src/components/journey/QuestCard.tsx` | **Create** |
| `apps/frontend/src/components/journey/StreakHeatmap.tsx` | **Create** |
| `apps/frontend/src/components/journey/IndicatorScoreBar.tsx` | **Create** |
| `apps/frontend/src/App.tsx` | **Edit** — `/dashboard` route → `/journey`, default redirect ke `/journey` |
| `apps/frontend/src/components/AppShell.tsx` | **Edit** — sidebar item Dashboard → Journey (icon `Mountain` / `Trophy`) |
| `apps/frontend/src/pages/DashboardPage.tsx` | **Keep, un-route** — akan di-revive sebagai Pro mode di iterasi berikutnya |
| `apps/frontend/e2e/journey.spec.ts` | **Create** — E2E spec |
| `apps/frontend/package.json` | **Edit** — tambah `framer-motion` jika belum ada |

---

## TODO

### Phase 0 — Scoring Rubric Definition

### [x] STEP 1 — Tulis `specs/scoring-rubric.md`

Susun dokumen rubrik dengan struktur berikut:

```markdown
# Financial Journey Scoring Rubric

## Source Framework
Adopted from Financial Health Network's 8 Indicators of Financial Health,
adapted to Indonesian middle-class context (Jakarta cost of living baseline).

## Score Formula
Each indicator: 0–100 (linear interpolation between defined thresholds).
Level score = average of indicators in that level.
Level "graduated" when all indicators in that level reach >= 70.

## Indicators

### L1 Cashflow
1. **Spend less than income (3-month rolling)**
   - 0:   spend >= income
   - 50:  spend = 95% income
   - 100: spend <= 80% income
   - Data: `SpendingAnalysisService.GetRollingNetCashflowAsync(3)`
2. **Pay bills on time**
   - 0:   any overdue bill last 3 months
   - 100: all bills on time
   - Data: TBD — needs bill due date tracking (defer if not available; treat as N/A in MVP)

### L2 Defense
3. **Liquid savings ratio**
   - 0:   < 0.5 month
   - 50:  = 1.5 months
   - 100: >= 3 months
   - Data: sum(Assets where type=cash/savings) / avg monthly expense
4. **Manageable debt (DTI)**
   - 0:   DTI >= 50%
   - 50:  DTI = 36%
   - 100: DTI <= 20%
   - Data: sum(monthly debt payment) / monthly income

### L3 Growth
5. **Long-term savings on track**
   - 0:   no contribution last 3 months
   - 50:  contribution rate = 5% income
   - 100: contribution rate >= 15% income
   - Data: monthly delta of Investment holdings cost basis
6. **Appropriate insurance** — defer to V2 (no insurance module yet)
7. **Prime credit score** — defer to V2 (no credit score data source)

### L4 Freedom
8. **Passive income coverage**
   - 0:   0% of monthly expense covered
   - 100: >= 50% of monthly expense
   - Data: TBD — needs dividend/yield tracker (defer; treat as 0 in MVP)

## Indonesia-Specific Adjustments
- Emergency fund target = 3× monthly expense (matches FHN; reasonable for Jakarta)
- FIRE target = 25× annual expense
- DTI cap = 36% (matches global standard; conservative for Indonesia where 40-50% common)
- Currency: all in IDR; FX conversion via existing Wise FX rate logic

## Indicators Not in MVP
Indicators 2 (bill timing), 6 (insurance), 7 (credit), 8 (passive income) marked N/A
in MVP — pyramid will show "Data not yet available" for these. They unlock when
Phase 4 feature gaps are filled (separate ticket).
```

> **Why:** Rubric harus di-write FIRST agar scoring code tidak subjektif. Setiap angka di pyramid harus traceable ke rubrik publik. Tanpa ini, user (atau reviewer) tidak bisa audit "kenapa skor saya 73, bukan 85". Indikator yang belum punya data source di-explicit-kan sebagai N/A di MVP — better honest than fake-scored.

---

### Phase 1 — Data Spine (Backend)

### [x] STEP 2 — Buat Supabase migration

```bash
cd c:/workspaces/personal-finance
supabase migration new journey_tables
```

Isi file migration:

```sql
-- user_journey_state: 1 row per user, current snapshot
CREATE TABLE user_journey_state (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    current_level SMALLINT NOT NULL DEFAULT 1 CHECK (current_level BETWEEN 1 AND 5),
    total_score NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (total_score BETWEEN 0 AND 100),
    level_scores JSONB NOT NULL DEFAULT '{}',     -- {"L1": 73.5, "L2": 40.0, ...}
    indicator_scores JSONB NOT NULL DEFAULT '{}', -- {"spend_lt_income": 80, ...}
    last_computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- journey_indicator_snapshots: historical (one row per indicator per day, for streak/trend)
CREATE TABLE journey_indicator_snapshots (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    snapshot_date DATE NOT NULL,
    indicator_code TEXT NOT NULL,  -- e.g. 'spend_lt_income', 'liquid_savings_ratio'
    score NUMERIC(5,2) NOT NULL,
    raw_value NUMERIC(20,4),       -- the underlying metric (e.g. 0.85 for 85% spend ratio)
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, snapshot_date, indicator_code)
);
CREATE INDEX idx_journey_snapshots_user_date ON journey_indicator_snapshots(user_id, snapshot_date DESC);

-- journey_achievements: unlocked badges
CREATE TABLE journey_achievements (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    achievement_code TEXT NOT NULL,  -- e.g. 'positive_cashflow_3mo', 'emergency_ready'
    unlocked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, achievement_code)
);

-- RLS (permissive placeholder until PF-S08 auth — matches existing pattern)
ALTER TABLE user_journey_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE journey_indicator_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE journey_achievements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_journey_state" ON user_journey_state USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_snapshots" ON journey_indicator_snapshots USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_achievements" ON journey_achievements USING (true) WITH CHECK (true);
```

Apply: `supabase db push`

> **Why:** `JSONB` untuk `level_scores`/`indicator_scores` — schema indikator akan berevolusi (Phase 4 menambah indicator 6/7/8). JSONB menghindari migration setiap kali rubrik berubah. `journey_indicator_snapshots` adalah append-only history → memungkinkan trend chart & streak tanpa recompute dari mentah. Permissive RLS placeholder konsisten dengan pattern existing (PF-S08 akan tightening).

---

### [x] STEP 3 — Buat Domain entities

File `apps/api/src/PersonalFinance.Domain/Entities/UserJourneyState.cs`:

```csharp
using Supabase.Postgrest.Attributes;
using Supabase.Postgrest.Models;

namespace PersonalFinance.Domain.Entities;

[Table("user_journey_state")]
public class UserJourneyState : BaseModel
{
    [PrimaryKey("user_id", false)]
    public Guid UserId { get; set; }

    [Column("current_level")]
    public short CurrentLevel { get; set; } = 1;

    [Column("total_score")]
    public decimal TotalScore { get; set; }

    [Column("level_scores")]
    public string LevelScoresJson { get; set; } = "{}";

    [Column("indicator_scores")]
    public string IndicatorScoresJson { get; set; } = "{}";

    [Column("last_computed_at")]
    public DateTime LastComputedAt { get; set; }
}
```

Buat `JourneyIndicatorSnapshot.cs` dan `JourneyAchievement.cs` mengikuti pola yang sama (lihat existing entities di folder `Domain/Entities/` untuk konvensi).

> **Why:** Snake_case attributes harus exact-match kolom DB (lihat CLAUDE.md "Entity model convention"). `BaseModel` dari `Supabase.Postgrest.Models` provides PostgREST integration. JSONB di-handle sebagai string di sisi C# — di-deserialize ke `Dictionary<string, decimal>` di service layer (lebih sederhana daripada custom JSONB converter).

---

### [x] STEP 4 — Definisikan interfaces & DTOs

`apps/api/src/PersonalFinance.Application/Interfaces/IJourneyScoringService.cs`:

```csharp
public interface IJourneyScoringService
{
    Task<JourneyStateDto> GetStateAsync(Guid userId, CancellationToken ct = default);
    Task<JourneyStateDto> RecalculateAsync(Guid userId, CancellationToken ct = default);
}
```

`apps/api/src/PersonalFinance.Application/Dtos/JourneyStateDto.cs`:

```csharp
public record JourneyStateDto(
    int CurrentLevel,
    decimal TotalScore,
    Dictionary<string, decimal> LevelScores,        // L1..L5 → 0..100
    List<IndicatorScoreDto> Indicators,
    List<AchievementDto> Achievements,
    DateTime LastComputedAt);

public record IndicatorScoreDto(
    string Code,                 // e.g. "spend_lt_income"
    string Level,                // "L1"..."L5"
    decimal Score,               // 0..100
    decimal? RawValue,
    string Status,               // "achieved" | "in_progress" | "not_started" | "no_data"
    string DisplayName,
    string Description);

public record AchievementDto(string Code, string Name, DateTime UnlockedAt);
```

`apps/api/src/PersonalFinance.Application/Dtos/JourneyQuestDto.cs`:

```csharp
public record JourneyQuestDto(
    string Title,
    string Description,
    string TargetIndicator,      // which indicator code this quest improves
    decimal EstimatedScoreGain,  // expected delta if completed
    string Difficulty,           // "easy" | "medium" | "hard"
    string? ActionDeeplink);     // e.g. "/cashflow/upload"
```

> **Why:** DTOs adalah wire contract. Status enum sebagai string (bukan int) supaya readable di JSON & frontend tidak perlu mapping table. `RawValue` nullable supaya indikator N/A (no data source) tetap bisa direpresentasikan.

---

### [x] STEP 5 — Implementasi `JourneyScoringService`

Buat `apps/api/src/PersonalFinance.Application/Services/JourneyScoringService.cs` dengan struktur:

```csharp
public class JourneyScoringService(
    Supabase.Client _supabase,
    ISpendingAnalysisService _spending,    // existing (PF-108)
    IAssetService _assets,                  // existing
    ILogger<JourneyScoringService> _logger
) : IJourneyScoringService
{
    public async Task<JourneyStateDto> RecalculateAsync(Guid userId, CancellationToken ct = default)
    {
        var indicators = new List<IndicatorScoreDto>();

        // L1.1 — Spend less than income (3mo rolling)
        indicators.Add(await ComputeSpendLtIncomeAsync(userId, ct));

        // L1.2 — Pay bills on time → N/A in MVP
        indicators.Add(NotAvailable("pay_bills_on_time", "L1", "Pay bills on time"));

        // L2.3 — Liquid savings ratio
        indicators.Add(await ComputeLiquidSavingsAsync(userId, ct));

        // L2.4 — Manageable debt (DTI)
        indicators.Add(await ComputeDtiAsync(userId, ct));

        // L3.5 — Long-term savings rate
        indicators.Add(await ComputeSavingsRateAsync(userId, ct));

        // L3.6, L3.7, L4.8 → N/A
        indicators.Add(NotAvailable("appropriate_insurance", "L3", "Appropriate insurance"));
        indicators.Add(NotAvailable("prime_credit", "L3", "Prime credit score"));
        indicators.Add(NotAvailable("passive_income", "L4", "Passive income coverage"));

        var levelScores = ComputeLevelScores(indicators);
        var totalScore = levelScores.Values.Average();
        var currentLevel = DetermineCurrentLevel(levelScores);  // graduated when all indicators in level >= 70

        // Persist to user_journey_state (upsert) + append snapshots
        await PersistAsync(userId, currentLevel, totalScore, levelScores, indicators, ct);

        // Check & unlock achievements
        var achievements = await EvaluateAchievementsAsync(userId, indicators, ct);

        return new JourneyStateDto(currentLevel, totalScore, levelScores, indicators, achievements, DateTime.UtcNow);
    }

    // ... private helpers per indicator
}
```

Register di `Program.cs`:

```csharp
builder.Services.AddScoped<IJourneyScoringService, JourneyScoringService>();
```

> **Why:** Service compose dari `ISpendingAnalysisService` (sudah ada dari PF-108) + `IAssetService` — tidak duplicate query logic. Setiap indikator = method privat satu konsep — testable independen. `NotAvailable()` helper untuk indikator yang belum punya data source — mereka tetap muncul di response dengan `Status: "no_data"` supaya frontend bisa render "Coming soon" tile.

---

### [x] STEP 6 — Buat `RecalculateJourneyCommand` + event handlers

`apps/api/src/PersonalFinance.Application/Commands/RecalculateJourneyCommand.cs`:

```csharp
public record RecalculateJourneyCommand(Guid UserId) : IRequest<JourneyStateDto>;

public class RecalculateJourneyCommandHandler(IJourneyScoringService _service)
    : IRequestHandler<RecalculateJourneyCommand, JourneyStateDto>
{
    public Task<JourneyStateDto> Handle(RecalculateJourneyCommand request, CancellationToken ct)
        => _service.RecalculateAsync(request.UserId, ct);
}
```

Event handlers — `apps/api/src/PersonalFinance.Application/EventHandlers/JourneyRecalcOnTransactionHandler.cs`:

```csharp
public class JourneyRecalcOnTransactionHandler(IMediator _mediator, ILogger<...> _logger)
    : INotificationHandler<TransactionCreatedEvent>
{
    public async Task Handle(TransactionCreatedEvent notification, CancellationToken ct)
    {
        try { await _mediator.Send(new RecalculateJourneyCommand(notification.UserId), ct); }
        catch (Exception ex) { _logger.LogError(ex, "Journey recalc failed for user {UserId}", notification.UserId); }
    }
}
```

Buat juga `JourneyRecalcOnAssetHandler` untuk `AssetUpdatedEvent`.

> **Why:** Event-driven supaya pyramid update real-time setelah user upload statement atau update aset — tanpa polling. Try/catch supaya scoring failure tidak block transaksi save (ERR-04 pattern). Nightly batch (Phase 1 follow-up via Supabase pg_cron) jadi fallback catch-all kalau event miss.

---

### [x] STEP 7 — Buat `JourneyController`

`apps/api/src/PersonalFinance.Api/Controllers/JourneyController.cs`:

```csharp
[ApiController]
[Route("api/[controller]")]
public class JourneyController(IMediator _mediator, IJourneyScoringService _service, IJourneyAdvisorClient _advisor)
    : ControllerBase
{
    [HttpGet("state")]
    public async Task<ActionResult<JourneyStateDto>> GetState(CancellationToken ct)
    {
        var userId = GetCurrentUserId();  // placeholder until PF-S08 auth
        var state = await _service.GetStateAsync(userId, ct);
        return Ok(state);
    }

    [HttpPost("recalculate")]
    public async Task<ActionResult<JourneyStateDto>> Recalc(CancellationToken ct)
    {
        var userId = GetCurrentUserId();
        var state = await _mediator.Send(new RecalculateJourneyCommand(userId), ct);
        return Ok(state);
    }

    [HttpGet("quests")]
    public async Task<ActionResult<List<JourneyQuestDto>>> GetQuests(CancellationToken ct)
    {
        var userId = GetCurrentUserId();
        var state = await _service.GetStateAsync(userId, ct);
        var quests = await _advisor.GenerateQuestsAsync(state, ct);
        return Ok(quests);
    }

    private Guid GetCurrentUserId() => Guid.Parse("00000000-0000-0000-0000-000000000001"); // TODO: PF-S08
}
```

> **Why:** Controller tipis (ARCH-04, ≤15 baris per action) — semua logic di service/handler. Hardcoded userId konsisten dengan pre-auth state. `/recalculate` endpoint disediakan untuk manual trigger (debugging + "force refresh" button di UI).

---

### [x] STEP 8 — Tulis unit tests `JourneyScoringServiceTests`

`apps/api/tests/PersonalFinance.Tests/Services/JourneyScoringServiceTests.cs` — ikuti pola `CategoryRuleServiceTests`:

```csharp
public class JourneyScoringServiceTests : IDisposable
{
    private readonly Mock<ISpendingAnalysisService> _spendingMock = new();
    private readonly Mock<IAssetService> _assetsMock = new();
    // ... mock Supabase client (atau buat in-memory wrapper)

    [Fact]
    public async Task ComputeSpendLtIncome_WhenSpendExceedsIncome_ReturnsZero() { /* ... */ }

    [Fact]
    public async Task ComputeSpendLtIncome_WhenSpendIs80PercentIncome_Returns100() { /* ... */ }

    [Fact]
    public async Task ComputeLiquidSavings_AtThreeMonthsExpense_Returns100() { /* ... */ }

    [Fact]
    public async Task ComputeDti_At36Percent_Returns50() { /* ... */ }

    [Fact]
    public async Task DetermineCurrentLevel_AllL1IndicatorsAbove70_GraduatesToL2() { /* ... */ }

    [Fact]
    public async Task Recalculate_PersistsSnapshot_OneRowPerIndicator() { /* ... */ }

    public void Dispose() { }
}
```

Minimal 1 test per indikator + edge cases (boundary thresholds, level graduation logic).

> **Why:** Scoring logic = jantung produk. Bug di sini = trust hilang ("kok skor saya turun padahal saving naik?"). Boundary tests (= 70, = 100) penting karena interpolasi linear sering bug di tepi.

---

### Phase 2 — Journey UI MVP

### [x] STEP 9 — Install `framer-motion`

```bash
cd apps/frontend
npm install framer-motion
```

> **Why:** Pyramid SVG akan punya transisi (fill animation, hover scale). Framer Motion = idiomatic untuk React + ringan vs three.js. Kalau sudah terinstall, skip step ini.

---

### [x] STEP 10 — Buat TypeScript types & API client

`apps/frontend/src/types/Journey.ts`:

```typescript
export interface JourneyState {
  currentLevel: number;
  totalScore: number;
  levelScores: Record<string, number>;
  indicators: IndicatorScore[];
  achievements: Achievement[];
  lastComputedAt: string;
}

export interface IndicatorScore {
  code: string;
  level: 'L1' | 'L2' | 'L3' | 'L4' | 'L5';
  score: number;
  rawValue: number | null;
  status: 'achieved' | 'in_progress' | 'not_started' | 'no_data';
  displayName: string;
  description: string;
}

export interface Achievement { code: string; name: string; unlockedAt: string; }

export interface Quest {
  title: string;
  description: string;
  targetIndicator: string;
  estimatedScoreGain: number;
  difficulty: 'easy' | 'medium' | 'hard';
  actionDeeplink: string | null;
}
```

`apps/frontend/src/api/journeyApi.ts`:

```typescript
import { JourneyState, Quest } from '@/types/Journey';
const API = import.meta.env.VITE_API_URL;

export const getJourneyState = async (): Promise<JourneyState> => {
  const r = await fetch(`${API}/api/journey/state`);
  if (!r.ok) throw new Error('Failed to load journey');
  return r.json();
};

export const getJourneyQuests = async (): Promise<Quest[]> => {
  const r = await fetch(`${API}/api/journey/quests`);
  if (!r.ok) throw new Error('Failed to load quests');
  return r.json();
};

export const recalculateJourney = async (): Promise<JourneyState> => {
  const r = await fetch(`${API}/api/journey/recalculate`, { method: 'POST' });
  if (!r.ok) throw new Error('Failed to recalculate');
  return r.json();
};
```

> **Why:** Plain `fetch` (frontend.md rule). Types persis match DTO field names — TS akan catch contract drift kalau backend rename field.

---

### [x] STEP 11 — Buat `PyramidProgress` component

`apps/frontend/src/components/journey/PyramidProgress.tsx`:

5-tier SVG triangle. Setiap tier:
- Base width berkurang ke atas (L1 paling lebar, L5 paling sempit)
- Fill berdasarkan `levelScores[Lx]` — gradient dari abu-abu (0) ke warna level (100)
- Warna per level (data-oriented palette, bukan neon): L1 slate-500, L2 amber-600, L3 emerald-600, L4 sky-600, L5 violet-600
- Hover: tier scale 1.02 + tooltip dengan skor & top indikator
- Animasi: `motion.path` dengan `pathLength` driven by score

```typescript
import { motion } from 'framer-motion';
import { JourneyState } from '@/types/Journey';

export const PyramidProgress = ({ state }: { state: JourneyState }) => {
  const tiers = [
    { level: 'L1', label: 'Cashflow',  color: 'rgb(100 116 139)' /* slate-500 */ },
    { level: 'L2', label: 'Defense',   color: 'rgb(217 119 6)'   /* amber-600 */ },
    { level: 'L3', label: 'Growth',    color: 'rgb(5 150 105)'   /* emerald-600 */ },
    { level: 'L4', label: 'Freedom',   color: 'rgb(2 132 199)'   /* sky-600 */ },
    { level: 'L5', label: 'Legacy',    color: 'rgb(124 58 237)'  /* violet-600 */ },
  ];
  // Render 5 stacked trapezoids/triangle slice. Each filled proportionally to state.levelScores[level].
  // Use viewBox + polygon points for each tier.
  return <svg viewBox="0 0 400 320">{/* ... */}</svg>;
};
```

> **Why:** SVG (bukan three.js) — load cepat, accessible, no WebGL dep. Geometric pyramid (bukan ilustrasi tree/city/farm) — konsisten dengan data-oriented theme + match referensi infografik yang user share. Warna pakai palet existing Tailwind (jangan rainbow neon — feel jadul/childish).

---

### [x] STEP 12 — Buat `TierCard`, `IndicatorScoreBar`, `QuestCard`, `StreakHeatmap`

`apps/frontend/src/components/journey/TierCard.tsx` — card per level, menampilkan:
- Level number + nama + ikon (lucide-react)
- Status badge: ✓ Achieved / ◐ In Progress / ○ Not Started
- 1–3 IndicatorScoreBar (mini progress bar per indikator)
- CTA button: "Open [module]" → deep link
- "Recommended Next" highlight (border accent) di tier dengan gap impactful

`IndicatorScoreBar.tsx` — bar horizontal 0–100 dengan threshold markers (50, 70, 100).

`QuestCard.tsx` — card dengan title, description, difficulty badge, deep-link button, "Aktifkan reminder" (no-op di MVP, telemetry only).

`StreakHeatmap.tsx` — 12 minggu × 7 hari grid. Cell color = activity hari itu (transaction logged / no transaction). Klik cell → tooltip "3 transactions on 2026-05-10".

> **Why:** Component split sesuai single-responsibility — testable + reusable di achievement page nanti. Streak heatmap kecil (≤200px tinggi), tidak dominan visualnya — sesuai positioning "professional bukan game". "Aktifkan reminder" di-stub karena push notification = Phase 4.

---

### [x] STEP 13 — Buat `JourneyPage` (replace Dashboard)

`apps/frontend/src/pages/journey/JourneyPage.tsx`:

```typescript
import { useQuery } from '@tanstack/react-query';
import { getJourneyState, getJourneyQuests } from '@/api/journeyApi';
import { PyramidProgress } from '@/components/journey/PyramidProgress';
import { TierCard } from '@/components/journey/TierCard';
import { QuestCard } from '@/components/journey/QuestCard';
import { StreakHeatmap } from '@/components/journey/StreakHeatmap';

export const JourneyPage = () => {
  const { data: state } = useQuery({ queryKey: ['journey-state'], queryFn: getJourneyState });
  const { data: quests } = useQuery({ queryKey: ['journey-quests'], queryFn: getJourneyQuests });

  if (!state) return <div>Loading…</div>;
  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">Your Financial Journey</h1>
        <p className="text-muted-foreground">Level {state.currentLevel} · Score {state.totalScore.toFixed(1)} / 100</p>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-1"><PyramidProgress state={state} /></div>
        <div className="md:col-span-2 space-y-3">
          {['L1','L2','L3','L4','L5'].map(lvl => (
            <TierCard key={lvl} level={lvl} state={state} />
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">Active Quests</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {quests?.map(q => <QuestCard key={q.title} quest={q} />)}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">Activity Streak</h2>
        <StreakHeatmap />
      </section>
    </div>
  );
};
```

`AchievementsPage.tsx` — grid badges dengan tooltip & unlock date.

> **Why:** Layout 3-section (pyramid+tiers / quests / streak) — pyramid jadi hero tapi tidak dominan total. React Query untuk caching + auto-refetch saat data invalidate (mutation hook nanti).

---

### [x] STEP 14 — Re-route: `/dashboard` → `/journey`

Edit `apps/frontend/src/App.tsx`:

```typescript
// Sebelum:
<Route path="/dashboard" element={<DashboardPage />} />
<Route path="/" element={<Navigate to="/dashboard" replace />} />

// Sesudah:
<Route path="/journey" element={<JourneyPage />} />
<Route path="/journey/achievements" element={<AchievementsPage />} />
<Route path="/" element={<Navigate to="/journey" replace />} />
<Route path="/dashboard" element={<Navigate to="/journey" replace />} />  {/* graceful redirect */}
```

Edit `AppShell.tsx` sidebar:

```typescript
// Ganti item "Dashboard" jadi:
{ label: 'Journey', icon: Mountain, path: '/journey' }
```

**Penting:** `DashboardPage.tsx` JANGAN dihapus — dipertahankan untuk Pro mode di iterasi berikutnya.

> **Why:** Graceful redirect dari `/dashboard` → `/journey` supaya bookmark lama tidak broken. Sidebar item label & icon ganti → user langsung lihat perubahan tanpa training. DashboardPage di-keep secara fisik tapi un-routed — zero risk regression saat Pro mode dikembalikan.

---

### Phase 3 — AI Quests & Polish

### [x] STEP 15 — Tambah Pydantic models di AI service

Edit `services/ai-service/app/models.py`:

```python
class IndicatorSnapshot(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    code: str
    level: Literal["L1","L2","L3","L4","L5"]
    score: Decimal
    raw_value: Decimal | None
    status: Literal["achieved","in_progress","not_started","no_data"]

class JourneyAdviseRequest(BaseModel):
    user_id: str
    current_level: int
    total_score: Decimal
    indicators: list[IndicatorSnapshot]

class Quest(BaseModel):
    title: str
    description: str
    target_indicator: str
    estimated_score_gain: Decimal
    difficulty: Literal["easy","medium","hard"]
    action_deeplink: str | None = None

class JourneyAdviseResponse(BaseModel):
    quests: list[Quest]
```

> **Why:** Pydantic v2, Decimal untuk angka (rule ai-service.md). Field names snake_case matching the DTOs on .NET side (snake → PascalCase di .NET HttpClient via JsonNamingPolicy).

---

### [x] STEP 16 — Buat prompt template `journey_advisor_v1.py`

`services/ai-service/app/prompts/journey_advisor_v1.py`:

```python
SYSTEM_PROMPT = """You are a financial coach generating actionable quests for a personal finance app user.

You will receive the user's current financial health snapshot (8 indicators, 0-100 scores).

Generate exactly 3 quests that:
1. Target the indicator with the largest gap (lowest score, highest impact on level graduation)
2. Are concrete and actionable ("Set up auto-transfer Rp 500,000/week to savings"), not vague ("Save more")
3. Estimate score gain conservatively (5-15 points per quest)
4. Include a difficulty rating based on user's current financial slack

Output via the generate_quests tool. Indonesian context — use IDR amounts, refer to Indonesian banks/products when relevant.
"""

EXAMPLES = [
    # 2-3 sanitized examples...
]
```

> **Why:** System prompt eksplisit tentang "concrete actionable" — LLM cenderung produce vague advice ("save more") tanpa guardrails ini. Examples membantu calibrate output format.

---

### [x] STEP 17 — Implementasi `journey_advisor.py`

`services/ai-service/app/services/journey_advisor.py`:

```python
import anthropic
from app.models import JourneyAdviseRequest, JourneyAdviseResponse, Quest
from app.prompts.journey_advisor_v1 import SYSTEM_PROMPT
from app.config import settings

TOOL = {
    "name": "generate_quests",
    "description": "Generate 3 actionable financial quests based on the user's indicator gaps",
    "input_schema": {
        "type": "object",
        "properties": {
            "quests": {
                "type": "array",
                "minItems": 3, "maxItems": 3,
                "items": {
                    "type": "object",
                    "properties": {
                        "title": {"type": "string"},
                        "description": {"type": "string"},
                        "target_indicator": {"type": "string"},
                        "estimated_score_gain": {"type": "number"},
                        "difficulty": {"type": "string", "enum": ["easy","medium","hard"]},
                        "action_deeplink": {"type": ["string","null"]}
                    },
                    "required": ["title","description","target_indicator","estimated_score_gain","difficulty"]
                }
            }
        },
        "required": ["quests"]
    }
}

async def advise(req: JourneyAdviseRequest) -> JourneyAdviseResponse:
    client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
    user_msg = f"User snapshot:\n{req.model_dump_json(indent=2)}\n\nGenerate 3 quests."
    response = await client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=2048,
        temperature=0.0,
        system=SYSTEM_PROMPT,
        tools=[TOOL],
        tool_choice={"type": "tool", "name": "generate_quests"},
        messages=[{"role": "user", "content": user_msg}]
    )
    if response.stop_reason == "max_tokens":
        raise RuntimeError("Quest generation truncated")
    tool_use = next(b for b in response.content if b.type == "tool_use")
    quests = [Quest(**q) for q in tool_use.input["quests"]]
    return JourneyAdviseResponse(quests=quests)
```

Tambah endpoint di `app/main.py`:

```python
from app.services.journey_advisor import advise

@app.post("/journey/advise", response_model=JourneyAdviseResponse)
async def journey_advise(req: JourneyAdviseRequest):
    return await advise(req)
```

> **Why:** Tool_use (bukan JSON mode) per `.claude/rules/ai-service.md`. `tool_choice={"type": "tool", "name": ...}` force LLM pakai tool (lebih ketat dari `"any"`). Temperature 0.0 — quests harus konsisten antar refresh. minItems=maxItems=3 enforce di schema.

---

### [x] STEP 18 — Tulis pytest untuk advisor

`services/ai-service/tests/test_journey_advisor.py`:

```python
from unittest.mock import AsyncMock, patch, MagicMock
import pytest
from app.services.journey_advisor import advise
from app.models import JourneyAdviseRequest, IndicatorSnapshot

@pytest.mark.asyncio
async def test_advise_returns_three_quests_when_low_l2_score():
    snapshot_req = JourneyAdviseRequest(
        user_id="test", current_level=1, total_score=42,
        indicators=[
            IndicatorSnapshot(code="liquid_savings_ratio", level="L2", score=20,
                              raw_value=0.5, status="in_progress"),
        ]
    )
    tool_use_block = MagicMock()
    tool_use_block.type = "tool_use"
    tool_use_block.input = {"quests": [
        {"title": "Build first 1M IDR emergency", "description": "...",
         "target_indicator": "liquid_savings_ratio", "estimated_score_gain": 12,
         "difficulty": "easy", "action_deeplink": "/assets/accounts"},
        # ... 2 more
    ]}
    mock_response = MagicMock(stop_reason="tool_use", content=[tool_use_block])

    with patch("app.services.journey_advisor.anthropic.AsyncAnthropic") as mock_cls:
        instance = AsyncMock()
        instance.messages.create = AsyncMock(return_value=mock_response)
        mock_cls.return_value = instance
        result = await advise(snapshot_req)

    assert len(result.quests) == 3
    assert result.quests[0].target_indicator == "liquid_savings_ratio"

@pytest.mark.asyncio
async def test_advise_raises_on_max_tokens_truncation():
    # ... mock with stop_reason="max_tokens", assert RuntimeError
    pass
```

> **Why:** Tes truncation path — per `.claude/rules/ai-service.md` ini wajib di-cover. Mock Anthropic, jangan hit real API.

---

### [x] STEP 19 — Buat typed HttpClient `JourneyAdvisorClient` di .NET

`apps/api/src/PersonalFinance.Infrastructure/External/JourneyAdvisorClient.cs`:

```csharp
public interface IJourneyAdvisorClient
{
    Task<List<JourneyQuestDto>> GenerateQuestsAsync(JourneyStateDto state, CancellationToken ct);
}

public class JourneyAdvisorClient(HttpClient _http, ILogger<JourneyAdvisorClient> _logger)
    : IJourneyAdvisorClient
{
    public async Task<List<JourneyQuestDto>> GenerateQuestsAsync(JourneyStateDto state, CancellationToken ct)
    {
        var payload = new {
            user_id = "00000000-0000-0000-0000-000000000001",
            current_level = state.CurrentLevel,
            total_score = state.TotalScore,
            indicators = state.Indicators.Select(i => new {
                code = i.Code, level = i.Level, score = i.Score,
                raw_value = i.RawValue, status = i.Status
            })
        };
        var response = await _http.PostAsJsonAsync("/journey/advise", payload, ct);
        response.EnsureSuccessStatusCode();
        var body = await response.Content.ReadFromJsonAsync<QuestsResponse>(cancellationToken: ct);
        return body!.Quests.Select(q => new JourneyQuestDto(
            q.Title, q.Description, q.TargetIndicator, q.EstimatedScoreGain,
            q.Difficulty, q.ActionDeeplink)).ToList();
    }
    private record QuestsResponse(List<QuestRaw> Quests);
    private record QuestRaw(string Title, string Description, string TargetIndicator,
        decimal EstimatedScoreGain, string Difficulty, string? ActionDeeplink);
}
```

Register di `Program.cs`:

```csharp
builder.Services.AddHttpClient<IJourneyAdvisorClient, JourneyAdvisorClient>(c =>
{
    c.BaseAddress = new Uri(builder.Configuration["AiService:BaseUrl"] ?? "http://localhost:8000");
});
```

> **Why:** Pattern sama dengan `LlmExtractionClient` existing — typed HttpClient terdaftar via factory. snake_case di payload manual karena pyramid Pydantic side strict.

---

### [x] STEP 20 — Tulis Playwright E2E `journey.spec.ts`

`apps/frontend/e2e/journey.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';

test.describe('Journey Page', () => {
  test('renders pyramid and 5 tier cards on load', async ({ page }) => {
    await page.goto('/journey');
    await expect(page.getByRole('heading', { name: /Your Financial Journey/i })).toBeVisible();
    await expect(page.locator('svg[data-testid="pyramid"]')).toBeVisible();
    for (const lvl of ['Cashflow','Defense','Growth','Freedom','Legacy']) {
      await expect(page.getByText(lvl)).toBeVisible();
    }
  });

  test('default route / redirects to /journey', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/journey$/);
  });

  test('legacy /dashboard redirects to /journey', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/journey$/);
  });

  test('tier card CTA deep-links to module', async ({ page }) => {
    await page.goto('/journey');
    await page.getByRole('link', { name: /Open Cashflow/i }).click();
    await expect(page).toHaveURL(/\/cashflow/);
  });

  test('quest cards render when AI service available', async ({ page }) => {
    await page.goto('/journey');
    await expect(page.getByText(/Active Quests/i)).toBeVisible();
    // At least 1 quest card rendered (may be 0 if AI service down — handle gracefully)
  });
});
```

Jalankan:

```bash
cd apps/frontend
npm run e2e -- journey.spec.ts
```

> **Why:** E2E = single source of truth bahwa UI bekerja end-to-end dengan backend nyata. Test redirect dari `/dashboard` penting — pastikan no regression untuk user yang bookmark URL lama.

---

### [x] STEP 21 — Manual smoke test end-to-end

1. Start full stack: `npm start` (Supabase + API + AI + Frontend)
2. Seed sample data via existing upload flow: upload 3 bulan BCA CSV
3. Buka `http://localhost:8080/journey`
4. Verifikasi:
   - Pyramid render dengan L1 terisi parsial, L2–L5 kosong/parsial
   - 5 tier cards muncul, status badge sesuai
   - Tombol "Recalculate" trigger fresh compute (cek network tab)
   - Quest cards muncul (3 buah, AI-generated, target indikator paling lemah)
   - Click "Open Cashflow" di tier L1 → navigate ke `/cashflow/overview`
   - Click `/dashboard` di address bar → redirect ke `/journey`
5. Inspeksi DB di Supabase Studio (`http://localhost:54323`):
   - `user_journey_state` ada 1 row dengan `total_score` sesuai
   - `journey_indicator_snapshots` ada 8 rows (1 per indikator) untuk hari ini
6. Test event trigger: tambah 1 transaksi baru via UI → tunggu 2 detik → reload `/journey` → score berubah

> **Why:** E2E + unit tests tidak menangkap "feel" — manual pass memverifikasi animasi pyramid mulus, layout tidak break di mobile, warna tier readable. Juga validasi event-driven recalc (test sulit untuk timing-sensitive flow).

---

### [x] STEP 22 — Commit per phase

Commit terpisah per phase supaya history navigable:

```bash
# After Phase 0:
git add specs/scoring-rubric.md
git commit -m "PF-114: scoring rubric — 8 indicators adapted to Indonesia"

# After Phase 1:
git add supabase/migrations/*journey_tables.sql apps/api/
git commit -m "PF-114: journey scoring engine + recalc command + controller"

# After Phase 2:
git add apps/frontend/src/pages/journey apps/frontend/src/components/journey apps/frontend/src/api/journeyApi.ts apps/frontend/src/types/Journey.ts apps/frontend/src/App.tsx apps/frontend/src/components/AppShell.tsx
git commit -m "PF-114: journey UI — pyramid, tiers, route swap dashboard→journey"

# After Phase 3:
git add services/ai-service/app/services/journey_advisor.py services/ai-service/app/prompts/journey_advisor_v1.py services/ai-service/app/models.py services/ai-service/app/main.py services/ai-service/tests/test_journey_advisor.py apps/api/src/PersonalFinance.Infrastructure/External/JourneyAdvisorClient.cs
git commit -m "PF-114: AI quest advisor via tool_use + typed HttpClient"

git add apps/frontend/e2e/journey.spec.ts
git commit -m "PF-114: Playwright E2E for journey page"
```

> **Why:** Commit per fase = bisable di-revert independen. Spec → Backend → Frontend → AI → Tests = urutan natural dependency.

---

## Indicator Reference Table

| Level | Code | Display Name | Data Source | MVP Status |
|---|---|---|---|---|
| L1 | spend_lt_income | Spend less than income (3mo rolling) | `SpendingAnalysisService` | ✓ Live |
| L1 | pay_bills_on_time | Pay bills on time | _no source_ | N/A |
| L2 | liquid_savings_ratio | Liquid savings ratio | Assets accounts (cash type) | ✓ Live |
| L2 | manageable_dti | Manageable debt (DTI) | Liabilities + income | ✓ Live |
| L3 | savings_rate | Long-term savings rate | Investment cost basis delta | ✓ Live |
| L3 | appropriate_insurance | Appropriate insurance | _no source_ | N/A |
| L3 | prime_credit | Prime credit score | _no source_ | N/A |
| L4 | passive_income_coverage | Passive income coverage | _no source_ | N/A |

## Achievement Codes (MVP set)

| Code | Trigger | Display Name |
|---|---|---|
| positive_cashflow_3mo | 3 consecutive months `spend_lt_income >= 70` | "Positive Cashflow Streak" |
| emergency_ready | `liquid_savings_ratio >= 100` | "Emergency Ready" |
| debt_free | `manageable_dti = 100` (DTI ≤ 20%) | "Light Footprint" |
| consistent_investor | `savings_rate >= 70` for 3 months | "Steady Builder" |
| graduated_l1 | All L1 indicators ≥ 70 | "Level 1 Cleared" |
| graduated_l2 | All L2 indicators ≥ 70 | "Level 2 Cleared" |
| graduated_l3 | All L3 indicators ≥ 70 | "Level 3 Cleared" |

## Notes

- **Pro/Playful toggle** — `DashboardPage.tsx` sengaja tidak dihapus. Iterasi berikutnya akan menambah setting di `/settings/appearance` dengan opsi "Pro mode (analytical dashboard)" vs "Playful mode (journey hero)". Untuk MVP, semua user dapat Journey.
- **Auth placeholder** — `GetCurrentUserId()` hardcoded sampai PF-S08 selesai. Saat PF-S08 live, ganti dengan `User.FindFirst("sub")?.Value`.
- **N/A indicators** — 4 dari 8 indikator (`pay_bills_on_time`, `appropriate_insurance`, `prime_credit`, `passive_income_coverage`) belum punya data source. Mereka tampil di UI dengan status "Coming soon" + tombol "Request this feature". Honest > fake-scored. Akan unlock saat Phase 4 feature gaps dibangun (terpisah).
- **Decay & punishment dihindari** — design decision sadar (lihat review notes). Penurunan skor ditampilkan sebagai "neutral state change", bukan animasi visual menyedihkan.
- **Visual themes (Zen Forest / Metropolis / Mineral Town)** — out of scope. Akan jadi opsi skin pyramid di iterasi terpisah, hanya kalau Phase 2 hero pyramid terbukti tidak cukup engaging.
- **Cost estimate AI quest generation** — ~$0.005 per advise call (sonnet-4-6 dengan ~2k input tokens). Cache result 24 jam supaya tidak panggil setiap page load. Cache key: `userId + indicator-scores-hash`.
- **Streak heatmap data source** — query `transactions` table by `created_at` date (jumlah transaksi per hari). Tidak butuh tabel terpisah.
- **Migration order** — Phase 0 (rubric doc) HARUS selesai sebelum Phase 1 coding. Tanpa rubric tertulis, scoring code akan jadi opinion-driven.
- **Performance** — `RecalculateAsync` query Assets + Transactions agregat. Estimasi <500ms untuk 1000 transaksi user. Kalau lambat, tambah materialized view di Phase 1.5.
