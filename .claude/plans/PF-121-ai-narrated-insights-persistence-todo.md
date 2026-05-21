# PF-121 — AI-Narrated Anomaly Insights + Persistence

> **GitHub Issue:** (create after PF-120 ships and validates)
> **Status:** Blocked by PF-120
> **Gate:** Start only if PF-120 demonstrably increases dwell time / return visits after 1 week
> **Started:** TBD

## Objective

Layer AI-narrated anomaly detection onto the Phase 1 insight shell. Gemini produces Indonesian-language card copy from structured findings (category + z-score + delta) — it never invents numbers, only narrates what the backend computed. Insights persist in a new `cashflow_insights` Supabase table so dismiss/snooze survive page reloads, and a history archive page lets users review past insights.

## Acceptance Criteria

- [ ] `cashflow_insights` table created via Supabase migration, applies cleanly with `supabase db push`
- [ ] After a statement upload, new insights appear in `cashflow_insights` within 30 seconds
- [ ] At least one AI-narrated anomaly card surfaces when seeded with a category that has z-score ≥ 1.5
- [ ] Dismissed insights survive page reload (read `dismissed_at` from table)
- [ ] Snoozed insights hide until `snoozed_until` passes
- [ ] `/cashflow/insights` history page shows paginated archive of all past insights including dismissed
- [ ] AI service unit test: Gemini called with `temperature=0`, JSON mode (`response_mime_type`), strict schema; asserts no free-text output
- [ ] `stop_reason == "max_tokens"` path raises structured error per ai-service.md rules
- [ ] Each narrate call logs `input_tokens` + `output_tokens` (cost discipline)
- [ ] E2E: dismiss card → reload → card gone; appears in history page

## Approach

Three-layer build: (1) DB schema → (2) backend anomaly detector + AI narration client → (3) frontend persistence wiring + history page. The AI service receives only structured `{type, category, current, baseline, z_score, period}` findings and returns narrated `{title, body}` pairs — it never touches raw transaction data. Insights regenerate on statement-upload events (trigger from the upload complete handler) and on a 24h timer until PF-S11 Supabase Webhook pipeline is built.

## Affected Files

| File | Change |
|------|--------|
| `supabase/migrations/NNNN_cashflow_insights.sql` | Create — `cashflow_insights` table |
| `apps/api/src/PersonalFinance.Domain/Entities/CashflowInsight.cs` | Create — Supabase entity |
| `apps/api/src/PersonalFinance.Application/Dtos/InsightFindingDto.cs` | Create — anomaly finding sent to Python |
| `apps/api/src/PersonalFinance.Application/Interfaces/IInsightNarratorClient.cs` | Create — interface for Python client |
| `apps/api/src/PersonalFinance.Infrastructure/External/InsightNarratorClient.cs` | Create — typed HttpClient |
| `apps/api/src/PersonalFinance.Application/Services/InsightService.cs` | Edit — add anomaly detector + persist to table + read from table |
| `apps/api/src/PersonalFinance.Api/Controllers/InsightsController.cs` | Edit — add dismiss/snooze/regenerate/history endpoints |
| `apps/api/src/PersonalFinance.Api/Program.cs` | Edit — register `IInsightNarratorClient` HttpClient |
| `services/ai-service/app/services/insight_narrator.py` | Create — Gemini structured output narrator |
| `services/ai-service/app/prompts/insight_narrator_v1.py` | Create — system prompt with ID examples |
| `services/ai-service/app/main.py` | Edit — wire `POST /cashflow/insights/narrate` |
| `services/ai-service/tests/test_insight_narrator.py` | Create — mock Gemini unit tests |
| `apps/frontend/src/api/insightsApi.ts` | Edit — add dismiss/snooze/history fetchers |
| `apps/frontend/src/components/cashflow/InsightCard.tsx` | Edit — wire dismiss/snooze to API |
| `apps/frontend/src/pages/cashflow/InsightHistory.tsx` | Create — paginated history page |
| `apps/frontend/src/App.tsx` | Edit — add `/cashflow/insights` route |

---

## TODO

### [ ] STEP 1 — Create Supabase migration

Create `supabase/migrations/NNNN_cashflow_insights.sql` (use next available number, e.g. `20260521000000_cashflow_insights.sql`):

```sql
CREATE TABLE IF NOT EXISTS cashflow_insights (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       uuid,                              -- nullable until PF-S08 Auth lands
    type          text        NOT NULL,
    severity      text        NOT NULL,
    title         text        NOT NULL,
    body          text        NOT NULL,
    metric_label  text,
    metric_value  numeric,
    category      text,
    action_type   text,
    action_target text,
    payload       jsonb,
    source        text        NOT NULL DEFAULT 'deterministic',  -- 'deterministic' | 'ai_narrated'
    generated_at  timestamptz NOT NULL DEFAULT now(),
    valid_until   timestamptz,
    dismissed_at  timestamptz,
    snoozed_until timestamptz
);

CREATE INDEX idx_cashflow_insights_user_id      ON cashflow_insights (user_id);
CREATE INDEX idx_cashflow_insights_generated_at ON cashflow_insights (generated_at DESC);
CREATE INDEX idx_cashflow_insights_valid_until  ON cashflow_insights (valid_until);

-- RLS placeholder (permissive until PF-S08)
ALTER TABLE cashflow_insights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all" ON cashflow_insights USING (true);
```

Apply: `supabase db push`

> **Why:** `valid_until` and `dismissed_at` are null-able — an insight without `valid_until` never expires. The permissive RLS policy matches the current app-wide pattern (all tables use `USING (true)` until PF-S08 Auth is wired). No `NOT NULL` on `user_id` — avoids a breaking migration when Auth ships.

---

### [ ] STEP 2 — Create CashflowInsight entity

Create `apps/api/src/PersonalFinance.Domain/Entities/CashflowInsight.cs`:

```csharp
using Supabase.Postgrest.Attributes;
using Supabase.Postgrest.Models;

namespace PersonalFinance.Domain.Entities;

[Table("cashflow_insights")]
public class CashflowInsight : BaseModel
{
    [PrimaryKey("id", false)]
    public Guid Id { get; set; }

    [Column("user_id")]
    public Guid? UserId { get; set; }

    [Column("type")]
    public string Type { get; set; } = string.Empty;

    [Column("severity")]
    public string Severity { get; set; } = string.Empty;

    [Column("title")]
    public string Title { get; set; } = string.Empty;

    [Column("body")]
    public string Body { get; set; } = string.Empty;

    [Column("metric_label")]
    public string? MetricLabel { get; set; }

    [Column("metric_value")]
    public decimal? MetricValue { get; set; }

    [Column("category")]
    public string? Category { get; set; }

    [Column("action_type")]
    public string? ActionType { get; set; }

    [Column("action_target")]
    public string? ActionTarget { get; set; }

    [Column("source")]
    public string Source { get; set; } = "deterministic";

    [Column("generated_at")]
    public DateTime GeneratedAt { get; set; }

    [Column("valid_until")]
    public DateTime? ValidUntil { get; set; }

    [Column("dismissed_at")]
    public DateTime? DismissedAt { get; set; }

    [Column("snoozed_until")]
    public DateTime? SnoozedUntil { get; set; }
}
```

> **Why:** Follows the Supabase entity pattern from `Transaction.cs` / `Asset.cs` — `BaseModel` + `[Table]` + `[Column]` snake_case attributes. `[PrimaryKey("id", false)]` = not auto-generated by postgrest on insert (we pass a Guid from .NET).

---

### [ ] STEP 3 — Create InsightFindingDto + IInsightNarratorClient interface

Create `apps/api/src/PersonalFinance.Application/Dtos/InsightFindingDto.cs`:

```csharp
namespace PersonalFinance.Application.Dtos;

public record InsightFindingDto(
    string Type,      // "spending_anomaly" | "category_spike" | "category_dip"
    string Category,
    decimal Current,
    decimal Baseline,
    decimal ZScore,
    string Period     // e.g. "Mei 2026"
);

public record NarratedInsightDto(
    string Type,
    string Severity,
    string Title,
    string Body,
    string? MetricLabel,
    decimal? MetricValue
);
```

Create `apps/api/src/PersonalFinance.Application/Interfaces/IInsightNarratorClient.cs`:

```csharp
using PersonalFinance.Application.Dtos;

namespace PersonalFinance.Application.Interfaces;

public interface IInsightNarratorClient
{
    Task<IReadOnlyList<NarratedInsightDto>> NarrateAsync(
        IReadOnlyList<InsightFindingDto> findings,
        CancellationToken ct = default);
}
```

> **Why:** The client interface stays in `Application/Interfaces/` per ARCH-02. The implementation (`InsightNarratorClient`) goes in `Infrastructure/External/` alongside other typed HttpClients. This keeps the Application layer independent of HTTP.

---

### [ ] STEP 4 — Create InsightNarratorClient (typed HttpClient)

Create `apps/api/src/PersonalFinance.Infrastructure/External/InsightNarratorClient.cs`:

```csharp
using System.Net.Http.Json;
using Microsoft.Extensions.Logging;
using PersonalFinance.Application.Dtos;
using PersonalFinance.Application.Interfaces;

namespace PersonalFinance.Infrastructure.External;

public class InsightNarratorClient(HttpClient http, ILogger<InsightNarratorClient> logger) : IInsightNarratorClient
{
    public async Task<IReadOnlyList<NarratedInsightDto>> NarrateAsync(
        IReadOnlyList<InsightFindingDto> findings,
        CancellationToken ct = default)
    {
        logger.LogInformation("Narrating {Count} insight findings via AI service", findings.Count);

        var response = await http.PostAsJsonAsync("/cashflow/insights/narrate", new { findings }, ct);

        if (!response.IsSuccessStatusCode)
        {
            logger.LogWarning("Insight narrator returned {StatusCode} — falling back to deterministic titles", response.StatusCode);
            return Array.Empty<NarratedInsightDto>();
        }

        var result = await response.Content.ReadFromJsonAsync<List<NarratedInsightDto>>(cancellationToken: ct);
        return result ?? Array.Empty<NarratedInsightDto>();
    }
}
```

> **Why:** Falls back gracefully (empty list) when AI service is unavailable — InsightService will use deterministic titles for those findings rather than throwing. Same resilient pattern as `LlmCategorizationClient`. Timeout is set in Program.cs registration (15s max — narration is fast, not a full parse).

---

### [ ] STEP 5 — Register InsightNarratorClient in Program.cs

In `apps/api/src/PersonalFinance.Api/Program.cs`, after existing `AddHttpClient` registrations:

```csharp
builder.Services.AddHttpClient<IInsightNarratorClient, InsightNarratorClient>(client =>
{
    client.BaseAddress = new Uri(builder.Configuration["AiService:BaseUrl"] ?? "http://localhost:8000");
    client.Timeout = TimeSpan.FromSeconds(15);
});
```

Also add the `InsightNarratorClient` using statement at the top if needed:
```csharp
using PersonalFinance.Infrastructure.External;
```

> **Why:** 15s timeout — narration of 3–5 findings via Gemini Flash is fast (< 5s typical). Longer timeout would block the dashboard load if the AI service is slow.

---

### [ ] STEP 6 — Update InsightService: anomaly detection + persist + read from table

Update `apps/api/src/PersonalFinance.Application/Services/InsightService.cs` — add z-score anomaly detection and table read/write:

Key changes:
1. Add `IInsightNarratorClient` constructor parameter
2. `GetInsightsAsync` reads from `cashflow_insights` table first (cache); if cache is empty or stale (>6h), regenerates and persists
3. New private `DetectAnomaliesAsync` method computes per-category z-scores and calls narrator
4. New `RegenerateAsync` method (called by upload pipeline and the new controller endpoint)

```csharp
// Add to constructor parameters:
public class InsightService(
    Supabase.Client supabase,
    IInsightNarratorClient narratorClient,
    ILogger<InsightService> logger) : IInsightService

// Add to IInsightService interface:
Task RegenerateAsync(CancellationToken ct = default);

// GetInsightsAsync — read from table with fallback:
public async Task<IReadOnlyList<InsightDto>> GetInsightsAsync(CancellationToken ct = default)
{
    var cached = await supabase.From<CashflowInsight>()
        .Filter("dismissed_at", Operator.Is, null)
        .Filter("snoozed_until", Operator.LessThan, DateTime.UtcNow.ToString("O"))  // or Is null
        .Order("generated_at", Ordering.Descending)
        .Limit(20)
        .Get();

    var fresh = cached.Models
        .Where(i => i.ValidUntil == null || i.ValidUntil > DateTime.UtcNow)
        .Where(i => i.GeneratedAt > DateTime.UtcNow.AddHours(-6))
        .ToList();

    if (fresh.Any())
    {
        logger.LogInformation("Returning {Count} cached insights from table", fresh.Count);
        return fresh.Select(ToDto).ToList();
    }

    // Cache miss or stale — regenerate
    await RegenerateAsync(ct);
    return await GetInsightsAsync(ct);
}

// RegenerateAsync:
public async Task RegenerateAsync(CancellationToken ct = default)
{
    // ... (fetch transactions, run all detectors including anomaly, persist to table)
}
```

The z-score anomaly detection (for `DetectAnomaliesAsync`):

```csharp
private async Task<IEnumerable<InsightDto>> DetectAnomaliesAsync(
    List<Transaction> current, List<Transaction> trailing, List<DateTime> trailingMonths)
{
    var expenses = current.Where(t => t.Type.Equals("Expense", StringComparison.OrdinalIgnoreCase)).ToList();
    var findings = new List<InsightFindingDto>();

    foreach (var cat in expenses.Select(t => t.Category).Distinct())
    {
        var monthlySpends = trailingMonths
            .Select(m => trailing.Where(t =>
                t.Date.Year == m.Year && t.Date.Month == m.Month &&
                t.Category == cat && t.Type.Equals("Expense", StringComparison.OrdinalIgnoreCase))
                .Sum(t => t.AmountIdr))
            .ToList();

        var avg = monthlySpends.DefaultIfEmpty(0m).Average();
        if (avg < 100_000m) continue;

        var stdev = (decimal)Math.Sqrt(
            (double)monthlySpends.Select(x => (x - avg) * (x - avg)).Average());
        if (stdev == 0) continue;

        var currentSpend = expenses.Where(t => t.Category == cat).Sum(t => t.AmountIdr);
        var zScore = (currentSpend - avg) / stdev;

        if (Math.Abs(zScore) < 1.5m) continue;
        if (Math.Abs(currentSpend - avg) < 100_000m) continue;

        findings.Add(new InsightFindingDto(
            zScore > 0 ? "category_spike" : "category_dip",
            cat, currentSpend, avg, Math.Round(zScore, 2),
            DateTime.Today.ToString("MMMM yyyy", new System.Globalization.CultureInfo("id-ID"))));
    }

    if (!findings.Any()) return Enumerable.Empty<InsightDto>();

    var narrated = await narratorClient.NarrateAsync(findings);

    return narrated.Select(n => new InsightDto(
        $"anomaly-{n.Type}-{Guid.NewGuid():N}",
        n.Type, n.Severity, n.Title, n.Body,
        n.MetricLabel, n.MetricValue, null, null, null,
        DateTime.Today.AddMonths(1).AddDays(-DateTime.Today.Day)));
}
```

> **Why:** Z-score threshold of 1.5 with a minimum absolute delta of Rp 100k prevents noise from tiny-category spikes. `category_spike` z > 1.5 = 1 standard deviation above average — specific enough to be meaningful, not so strict it never fires. Average monthly spend < Rp 100k is skipped — too small to care about.

---

### [ ] STEP 7 — Add dismiss/snooze/history endpoints to InsightsController

```csharp
[HttpPost("regenerate")]
public async Task<IActionResult> Regenerate(CancellationToken ct)
{
    await insightService.RegenerateAsync(ct);
    return NoContent();
}

[HttpPost("{id}/dismiss")]
public async Task<IActionResult> Dismiss(string id, CancellationToken ct)
{
    await insightService.DismissAsync(id, ct);
    return NoContent();
}

[HttpPost("{id}/snooze")]
public async Task<IActionResult> Snooze(string id, [FromBody] SnoozeRequest req, CancellationToken ct)
{
    await insightService.SnoozeAsync(id, req.Days, ct);
    return NoContent();
}

[HttpGet("history")]
public async Task<ActionResult<PagedResult<InsightDto>>> GetHistory(
    [FromQuery] int page = 1,
    [FromQuery] int pageSize = 20,
    CancellationToken ct = default)
    => Ok(await insightService.GetHistoryAsync(page, pageSize, ct));

public record SnoozeRequest(int Days);
```

> **Why:** `POST {id}/dismiss` and `POST {id}/snooze` use POST (not PATCH/DELETE) for simplicity — they represent state transitions, not partial updates. `GET history` uses page+pageSize per PERF-02 pagination rule.

---

### [ ] STEP 8 — Create Python AI narrator service

Create `services/ai-service/app/services/insight_narrator.py`:

```python
import json
import logging
from decimal import Decimal
from typing import Any
import google.generativeai as genai

from ..config import settings
from ..prompts.insight_narrator_v1 import SYSTEM_PROMPT

logger = logging.getLogger(__name__)


async def narrate_insights(findings: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """
    Accepts structured anomaly findings, returns narrated InsightCard fields in Indonesian.
    Never invents data — only narrates what's in `findings`.
    """
    if not findings:
        return []

    genai.configure(api_key=settings.gemini_api_key)
    model = genai.GenerativeModel(
        model_name=settings.ai_model or "gemini-2.5-flash",
        generation_config=genai.GenerationConfig(
            temperature=0.0,
            response_mime_type="application/json",
            response_schema={
                "type": "ARRAY",
                "items": {
                    "type": "OBJECT",
                    "properties": {
                        "type":         {"type": "STRING"},
                        "severity":     {"type": "STRING", "enum": ["info", "win", "warning", "alert", "streak_break"]},
                        "title":        {"type": "STRING"},
                        "body":         {"type": "STRING"},
                        "metric_label": {"type": "STRING"},
                        "metric_value": {"type": "NUMBER"},
                    },
                    "required": ["type", "severity", "title", "body"],
                }
            }
        )
    )

    findings_text = json.dumps(findings, ensure_ascii=False, default=str)
    prompt = f"{SYSTEM_PROMPT}\n\nFindings:\n{findings_text}"

    logger.info("Narrating %d findings", len(findings))
    response = await model.generate_content_async(prompt)

    if response.usage_metadata:
        logger.info(
            "Narrator tokens: input=%d output=%d",
            response.usage_metadata.prompt_token_count,
            response.usage_metadata.candidates_token_count,
        )

    result = json.loads(response.text)

    # Validate max length
    for card in result:
        if len(card.get("title", "")) > 80:
            card["title"] = card["title"][:77] + "..."
        if len(card.get("body", "")) > 200:
            card["body"] = card["body"][:197] + "..."

    return result
```

Create `services/ai-service/app/prompts/insight_narrator_v1.py`:

```python
SYSTEM_PROMPT = """Kamu adalah asisten keuangan personal yang mengubah data anomali transaksi menjadi pesan insight yang personal, singkat, dan actionable dalam Bahasa Indonesia.

ATURAN PENTING:
1. Jangan mengarang data — hanya gunakan angka yang ada di findings
2. Title maksimal 60 karakter
3. Body maksimal 150 karakter — langsung ke poin
4. Gunakan Bahasa Indonesia yang santai tapi profesional (bukan slang)
5. severity harus salah satu dari: info | win | warning | alert | streak_break
6. Untuk category_spike (pengeluaran naik): severity = warning jika z_score < 2, alert jika >= 2
7. Untuk category_dip (pengeluaran turun lebih dari biasa): severity = win

CONTOH INPUT:
{"type": "category_spike", "category": "Coffee", "current": 450000, "baseline": 150000, "z_score": 2.1, "period": "Mei 2026"}

CONTOH OUTPUT:
{"type": "category_spike", "severity": "alert", "title": "Pengeluaran Kopi naik drastis bulan ini", "body": "Rp 450.000 vs rata-rata Rp 150.000 — 3× lipat dari biasanya. Hati-hati, cek apakah ini satu kali atau tren.", "metric_label": "Kenaikan vs rata-rata", "metric_value": 300000}

CONTOH INPUT 2:
{"type": "category_dip", "category": "Food", "current": 300000, "baseline": 900000, "z_score": -2.3, "period": "Mei 2026"}

CONTOH OUTPUT 2:
{"type": "category_dip", "severity": "win", "title": "Hemat pengeluaran Makan bulan ini!", "body": "Hanya Rp 300.000 vs rata-rata Rp 900.000. Sisa Rp 600.000 bisa disisihkan ke tabungan.", "metric_label": "Berhasil dihemat", "metric_value": 600000}

Kembalikan array JSON dari objek insight, satu per finding."""
```

> **Why:** `response_mime_type="application/json"` + `response_schema` forces Gemini structured output with schema validation — same principle as Anthropic `tool_use`. Temperature 0.0 per ai-service.md. Token logging per cost-discipline rule. Indonesian system prompt with 2 real examples reduces hallucination of field values.

---

### [ ] STEP 9 — Wire Python route

In `services/ai-service/app/main.py`, add:

```python
from .services.insight_narrator import narrate_insights

@app.post("/cashflow/insights/narrate")
async def narrate_insights_endpoint(body: dict):
    findings = body.get("findings", [])
    if not findings:
        return []
    result = await narrate_insights(findings)
    return result
```

> **Why:** Intentionally simple — validation is handled by Pydantic at the caller (.NET InsightNarratorClient sends typed JSON). Route prefix `/cashflow/insights/narrate` matches the registered HttpClient base URL pattern.

---

### [ ] STEP 10 — Write Python unit tests

Create `services/ai-service/tests/test_insight_narrator.py`:

```python
import pytest
from unittest.mock import AsyncMock, patch, MagicMock


@pytest.fixture
def mock_gemini_response():
    mock_response = MagicMock()
    mock_response.text = '[{"type":"category_spike","severity":"warning","title":"Coffee naik bulan ini","body":"Rp 450.000 vs rata-rata Rp 150.000","metric_label":"Kenaikan","metric_value":300000}]'
    mock_response.usage_metadata.prompt_token_count = 120
    mock_response.usage_metadata.candidates_token_count = 80
    return mock_response


@pytest.mark.asyncio
async def test_narrate_insights_calls_gemini_with_zero_temperature(mock_gemini_response):
    with patch("app.services.insight_narrator.genai") as mock_genai:
        mock_model = AsyncMock()
        mock_model.generate_content_async = AsyncMock(return_value=mock_gemini_response)
        mock_genai.GenerativeModel.return_value = mock_model

        from app.services.insight_narrator import narrate_insights
        result = await narrate_insights([{
            "type": "category_spike", "category": "Coffee",
            "current": 450000, "baseline": 150000, "z_score": 2.1, "period": "Mei 2026"
        }])

        call_kwargs = mock_genai.GenerativeModel.call_args
        gen_config = call_kwargs[1]["generation_config"]
        assert gen_config.temperature == 0.0
        assert gen_config.response_mime_type == "application/json"
        assert len(result) == 1
        assert result[0]["severity"] == "warning"


@pytest.mark.asyncio
async def test_narrate_insights_empty_findings_returns_empty():
    from app.services.insight_narrator import narrate_insights
    result = await narrate_insights([])
    assert result == []


@pytest.mark.asyncio
async def test_narrate_insights_truncates_overlong_title(mock_gemini_response):
    long_text = "A" * 100
    mock_gemini_response.text = f'[{{"type":"x","severity":"info","title":"{long_text}","body":"short"}}]'

    with patch("app.services.insight_narrator.genai") as mock_genai:
        mock_model = AsyncMock()
        mock_model.generate_content_async = AsyncMock(return_value=mock_gemini_response)
        mock_genai.GenerativeModel.return_value = mock_model

        from app.services.insight_narrator import narrate_insights
        result = await narrate_insights([{"type": "x", "category": "Test", "current": 1, "baseline": 1, "z_score": 2, "period": "May"}])
        assert len(result[0]["title"]) <= 80
```

> **Why:** Mocks `genai` entirely — never hits real Gemini in CI per ai-service.md testing rules. Tests the two contracts that matter: zero temperature + JSON mime type, and the length-enforcement guard.

---

### [ ] STEP 11 — Update frontend dismiss/snooze wiring

In `apps/frontend/src/api/insightsApi.ts`, add:

```typescript
export const dismissInsight = (id: string): Promise<void> =>
  fetch(`${BASE}/api/insights/${encodeURIComponent(id)}/dismiss`, { method: 'POST' }).then(() => undefined);

export const snoozeInsight = (id: string, days: number): Promise<void> =>
  fetch(`${BASE}/api/insights/${encodeURIComponent(id)}/snooze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ days }),
  }).then(() => undefined);

export const getInsightHistory = (page = 1, pageSize = 20): Promise<{ items: Insight[]; total: number }> =>
  fetch(`${BASE}/api/insights/history?page=${page}&pageSize=${pageSize}`).then(r => r.json());
```

Update `InsightCard.tsx` — change dismiss to call API then invalidate query:

```tsx
// Replace onDismiss prop with useMutation:
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { dismissInsight } from '@/api/insightsApi';

const queryClient = useQueryClient();
const { mutate: dismiss } = useMutation({
  mutationFn: dismissInsight,
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ['insights'] }),
});
```

> **Why:** React Query `invalidateQueries` after dismiss triggers a refetch, which returns the updated list (minus dismissed) from the server. No more session-scoped state needed.

---

### [ ] STEP 12 — Create InsightHistory page + route

Create `apps/frontend/src/pages/cashflow/InsightHistory.tsx`:

```tsx
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getInsightHistory } from '@/api/insightsApi';
import { InsightCard } from '@/components/cashflow/InsightCard';

const InsightHistory = () => {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery({
    queryKey: ['insight-history', page],
    queryFn: () => getInsightHistory(page, 20),
  });

  return (
    <div className="p-8">
      <div className="max-w-2xl mx-auto space-y-4">
        <h2 className="text-lg font-semibold">Riwayat Insight</h2>
        {isLoading && <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-16 bg-muted animate-pulse rounded-lg" />)}</div>}
        {data?.items.map(insight => (
          <InsightCard key={insight.id} insight={insight} onDismiss={() => {}} />
        ))}
        {data && data.total > 20 && (
          <div className="flex gap-2 justify-center">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="text-sm px-3 py-1 border rounded disabled:opacity-40">Prev</button>
            <button onClick={() => setPage(p => p + 1)} disabled={page * 20 >= data.total} className="text-sm px-3 py-1 border rounded disabled:opacity-40">Next</button>
          </div>
        )}
      </div>
    </div>
  );
};

export default InsightHistory;
```

In `apps/frontend/src/App.tsx`, add the route inside the cashflow layout:

```tsx
<Route path="/cashflow/insights" element={<InsightHistory />} />
```

> **Why:** History page is read-only (dismiss button is a no-op — items are already dismissed) and paginated. It gives users an audit trail of past insights, building trust that the system is tracking their finances accurately over time.

---

### [ ] STEP 13 — Trigger regeneration on statement upload

In the existing upload completion flow (find where statement upload succeeds in `TransactionsController`), add a call to regenerate insights:

```csharp
// After successful upload + categorization, fire-and-forget:
_ = insightService.RegenerateAsync(CancellationToken.None);
```

> **Why:** Fire-and-forget (discard the task) is intentional — regeneration is background work that shouldn't block the upload response. If it fails, the next `GetInsightsAsync` call will detect stale cache and retry. Log the regeneration result inside `RegenerateAsync` itself.

---

## Notes

- Migration number: use `supabase migration new cashflow_insights` to get a timestamped filename
- Python narrator uses Gemini (`gemini-2.5-flash`), not Anthropic — per project convention (Gemini = primary, Anthropic = alternate)
- `z_score` math uses `decimal` in C# to avoid IEEE 754 float rounding on money amounts
- The `snooze_until` filter is tricky with PostgREST: filter for `snoozed_until IS NULL OR snoozed_until < now()`. PostgREST Supabase SDK may require `.Or()` — check the supabase-csharp docs for null-or-less-than filter syntax
- Dismiss/snooze actions should use React Query `useMutation` + `invalidateQueries(['insights'])` — not local state
- PF-S11 (Supabase Database Webhook) will eventually replace the fire-and-forget regeneration trigger. When PF-S11 ships, remove the in-request trigger from TransactionsController
- This ticket is gated on PF-118 validation — do not start until PF-118 has been in production use for ≥1 week
