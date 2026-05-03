# Plan: Cash Flow Statement Tab

> **GitHub Issue**: #TBD (will be created alongside this plan)
> **Status**: 📋 Planning
> **Estimated Effort**: ~4-6 hours across 4 phases

---

## 1. Overview

Adaptasi tabel **Laporan Arus Kas** (Cash Flow Statement) dari skala perusahaan (contoh: BBRI)
ke personal finance. Menampilkan aggregasi transaksi dalam format collapsible tree-table
dengan kolom period (quarterly/monthly), dikelompokkan ke 3 section utama:

- **Arus Kas Operasional** — pendapatan & pengeluaran rutin sehari-hari
- **Arus Kas Investasi** — pembelian/penjualan aset investasi
- **Arus Kas Pendanaan** — pinjaman, transfer antar wallet, gift

Ditempatkan sebagai **tab baru "Statement"** di Cashflow layout.

---

## 2. Architecture Decisions

### 2.1 Placement: New Tab (not bottom of Overview)
- Overview page sudah padat (Net Cashflow + Top Categories + Chart)
- Statement punya data density tinggi, butuh viewport sendiri
- Tab navigation sudah ada pattern-nya di `CashflowLayout.tsx`

### 2.2 Category → Section Mapping
Hardcode mapping di **backend** (C# constant dictionary) + **frontend** (TypeScript constant).
Mapping bisa di-override nanti via Settings UI (future enhancement).

Default mapping:

```
OPERATING_INCOME:
  - Salary, Freelance, Side Income, Saving Interest, Cashback, Refund, 
    Bank Transfer (CR), Gift (CR)

OPERATING_EXPENSE:
  - Food, Food & Drinks, Transport, Bill, Subscription, Shopping, 
    Entertainment, Health, Education, Vet and Dog, Household, Personal Care

INVESTING:
  - Stock, Crypto, Gold, Property, Mutual Fund, Dividen, Bond, P2P Lending

FINANCING:
  - Loan, Credit Card, Withdrawing, Bank Transfer (DB), Insurance
```

Uncategorized/unknown → fallback ke **Operating** berdasarkan type (Income→OPERATING_INCOME, Expense→OPERATING_EXPENSE).

### 2.3 Period Grouping
- Default: **Quarterly** (Q1 2026, Q4 2025, Q3 2025...)
- Toggle option: **Monthly** (Jan 26, Feb 26, Mar 26...)
- Pakai range selector yang sama dengan Overview: Last Month, 3M, 6M, 1Y, 2Y, YTD

### 2.4 Query Strategy — NOT Heavy
- **Reuse** existing paginated fetch from `DashboardService` (same date-range filtering)
- New backend method: `GetCashflowStatementAsync(months, wallet, groupBy)`
- Aggregation di C# in-memory (same pattern as existing `GetDashboardDataAsync`)
- Data volume estimate: 2Y = ~4,800 rows → trivial aggregation
- Single query, no additional DB indexes needed

---

## 3. Data Flow

```
┌─────────────┐     GET /api/transactions/statement     ┌───────────────────┐
│  Frontend    │ ──────────────────────────────────────→ │  .NET API          │
│  StatementTab│     ?months=6&groupBy=quarterly         │  TransactionsCtrl  │
│              │ ←────────────────────────────────────── │  → StatementService│
│              │     CashflowStatementDto                │    → Supabase      │
└─────────────┘                                          └───────────────────┘
```

### 3.1 Backend Response Shape

```json
{
  "periods": ["Q1 2026", "Q4 2025", "Q3 2025", "Q2 2025"],
  "sections": [
    {
      "id": "operating",
      "label": "Arus Kas Operasional",
      "subsections": [
        {
          "id": "operating_income",
          "label": "Pendapatan",
          "categories": [
            {
              "category": "Salary",
              "values": { "Q1 2026": 25500000, "Q4 2025": 25500000, "Q3 2025": 25500000, "Q2 2025": 25500000 }
            },
            {
              "category": "Freelance",
              "values": { "Q1 2026": 6900000, "Q4 2025": 5400000, "Q3 2025": 6300000, "Q2 2025": 4200000 }
            }
          ],
          "totals": { "Q1 2026": 32400000, "Q4 2025": 30900000, "Q3 2025": 31800000, "Q2 2025": 29700000 }
        },
        {
          "id": "operating_expense",
          "label": "Pengeluaran Rutin",
          "categories": [ ... ],
          "totals": { ... }
        }
      ],
      "totals": { "Q1 2026": 21500000, ... }
    },
    {
      "id": "investing",
      "label": "Arus Kas Investasi",
      ...
    },
    {
      "id": "financing", 
      "label": "Arus Kas Pendanaan",
      ...
    }
  ],
  "grandTotals": { "Q1 2026": 1816000, "Q4 2025": 3173000, "Q3 2025": 2189000, "Q2 2025": 1450000 }
}
```

---

## 4. Implementation Phases

### Phase 1: Backend — Category Mapping & DTO (Est: 1.5h)

**Files to create:**
- `PersonalFinance.Application/Constants/CashflowSectionMapping.cs`
  - Static dictionary `Category → Section` mapping
  - Enum: `CashflowSection { OperatingIncome, OperatingExpense, Investing, Financing }`

- `PersonalFinance.Application/Dtos/CashflowStatementDto.cs`
  - `CashflowStatementDto` (root)
  - `StatementSectionDto` (section: operating/investing/financing)
  - `StatementSubsectionDto` (subsection: income/expense within operating)
  - `StatementCategoryDto` (leaf: category name + period→amount map)

**Files to modify:**
- `PersonalFinance.Application/Interfaces/IDashboardService.cs`
  - Add: `Task<CashflowStatementDto> GetCashflowStatementAsync(int months, string? wallet, string groupBy)`

- `PersonalFinance.Application/Services/DashboardService.cs`
  - Add: `GetCashflowStatementAsync` implementation
  - Fetch transactions (reuse existing paginated fetch logic)
  - Group by period (quarterly/monthly) → section → category
  - Return structured DTO

- `PersonalFinance.Api/Controllers/TransactionsController.cs`
  - Add endpoint: `[HttpGet("statement")]`
  - Params: `months` (int, default 6), `wallet` (string?), `groupBy` (string, "quarterly"|"monthly")

### Phase 2: Frontend — Types & API Layer (Est: 0.5h)

**Files to create:**
- `apps/frontend/src/types/CashflowStatement.ts`
  - TypeScript interfaces matching backend DTOs

**Files to modify:**
- `apps/frontend/src/api/transactionsApi.ts`
  - Add: `getCashflowStatement(months?, wallet?, groupBy?): Promise<CashflowStatementDto>`

### Phase 3: Frontend — Statement Component (Est: 2.5h)

**Files to create:**
- `apps/frontend/src/components/CashflowStatementTable.tsx`
  - Main table component
  - Dark theme matching existing design system (bg-card, border-border, etc.)
  - Collapsible section headers (▼/▶) with animation
  - Section rows: bold, background accent (subtle)
  - Subsection total rows: semi-bold, subtle separator
  - Category rows: normal weight, monospace numbers
  - Grand total row: bold, double-border top, accent color
  - Negative values shown in parentheses `(1,850,000)` and red tint
  - Positive values in normal/green tint
  - Responsive: horizontal scroll on narrow viewports
  - Loading skeleton state (same pattern as existing widgets)

- `apps/frontend/src/pages/cashflow/StatementTab.tsx`
  - Page wrapper with:
    - Title "Cash Flow Statement"
    - Range selector (reuse RANGES pattern from OverviewTab)
    - Period toggle: Quarterly / Monthly
    - Wallet filter (optional, future)
  - Fetches data via API on mount and range/groupBy change
  - Renders `<CashflowStatementTable>`

### Phase 4: Integration & Polish (Est: 0.5h)

**Files to modify:**
- `apps/frontend/src/pages/cashflow/CashflowLayout.tsx`
  - Add "Statement" tab to TABS array:
    `{ value: 'statement', label: 'Statement', path: '/cashflow/statement' }`

- `apps/frontend/src/App.tsx`
  - Add route: `<Route path="statement" element={<StatementTab />} />`
  - Add import for `StatementTab`

---

## 5. UI Design Spec

### 5.1 Table Layout

```
┌──────────────────────┬──────────────┬──────────────┬──────────────┬──────────────┐
│                      │   Q1 2026    │   Q4 2025    │   Q3 2025    │   Q2 2025    │
├──────────────────────┼──────────────┼──────────────┼──────────────┼──────────────┤
│ ▼ ARUS KAS OPERASIONAL                                                          │
│   Pendapatan                                                                     │
│     Salary           │  25,500,000  │  25,500,000  │  25,500,000  │  25,500,000  │
│     Freelance        │   6,900,000  │   5,400,000  │   6,300,000  │   4,200,000  │
│     Saving Interest  │     135,000  │     126,000  │     114,000  │      98,000  │
│   Total Pendapatan   │  32,535,000  │  31,026,000  │  31,914,000  │  29,798,000  │
│                      │              │              │              │              │
│   Pengeluaran Rutin                                                              │
│     Food & Drinks    │ (5,550,000)  │ (5,760,000)  │ (5,340,000)  │ (5,100,000)  │
│     Bill             │ (2,850,000)  │ (2,850,000)  │ (2,850,000)  │ (2,850,000)  │
│     Transport        │ (2,040,000)  │ (2,160,000)  │ (1,950,000)  │ (1,890,000)  │
│   Total Pengeluaran  │(10,440,000)  │(10,770,000)  │(10,140,000)  │ (9,840,000)  │
│                      │              │              │              │              │
│   Arus Kas Operasi   │  22,095,000  │  20,256,000  │  21,774,000  │  19,958,000  │
│   Bersih             │              │              │              │              │
├──────────────────────┼──────────────┼──────────────┼──────────────┼──────────────┤
│ ▼ ARUS KAS INVESTASI                                                             │
│     Stock            │(15,000,000)  │ (9,000,000)  │(13,500,000)  │(12,000,000)  │
│     Dividen          │     450,000  │     360,000  │     390,000  │     320,000  │
│   Total Investasi    │(14,550,000)  │ (8,640,000)  │(13,110,000)  │(11,680,000)  │
├──────────────────────┼──────────────┼──────────────┼──────────────┼──────────────┤
│ ▼ ARUS KAS PENDANAAN                                                             │
│     Loan Payment     │ (1,500,000)  │ (1,500,000)  │ (1,500,000)  │ (1,500,000)  │
│   Total Pendanaan    │ (1,500,000)  │ (1,500,000)  │ (1,500,000)  │ (1,500,000)  │
╞══════════════════════╪══════════════╪══════════════╪══════════════╪══════════════╡
│ PERUBAHAN KAS BERSIH │   6,045,000  │  10,116,000  │   7,164,000  │   6,778,000  │
└──────────────────────┴──────────────┴──────────────┴──────────────┴──────────────┘
```

### 5.2 Styling Rules (matching existing dark theme)
- **Section header rows**: `bg-muted/30`, `text-xs uppercase tracking-wider`, `font-semibold`
- **Subsection label rows**: `text-muted-foreground`, `text-xs font-medium`, indent 8px
- **Category rows**: `text-sm`, monospace numbers, indent 24px
- **Total rows**: `font-semibold`, `border-t border-border`
- **Grand total row**: `font-bold`, `border-t-2 border-foreground/30`, `bg-muted/20`
- **Negative values**: `text-red-400/80`, shown as `(xxx,xxx)`
- **Positive values**: `text-emerald-400/80` for income sections
- **Table**: `bg-card border border-border rounded-lg overflow-hidden`
- **Numbers**: Right-aligned, `font-mono tabular-nums text-xs`

### 5.3 Interactions
- Click section header (▼/▶) to collapse/expand
- All sections expanded by default
- Hover row: subtle `bg-muted/10` highlight
- Sticky first column (category name) on horizontal scroll

---

## 6. File Change Summary

### New Files (6)
| # | File | Description |
|---|------|-------------|
| 1 | `apps/api/.../Constants/CashflowSectionMapping.cs` | Category→Section mapping dictionary |
| 2 | `apps/api/.../Dtos/CashflowStatementDto.cs` | Backend response DTOs |
| 3 | `apps/frontend/src/types/CashflowStatement.ts` | Frontend TypeScript interfaces |
| 4 | `apps/frontend/src/components/CashflowStatementTable.tsx` | Statement table component |
| 5 | `apps/frontend/src/pages/cashflow/StatementTab.tsx` | Statement tab page wrapper |
| 6 | *(this plan)* | Implementation plan |

### Modified Files (5)
| # | File | Change |
|---|------|--------|
| 1 | `apps/api/.../Interfaces/IDashboardService.cs` | Add `GetCashflowStatementAsync` method |
| 2 | `apps/api/.../Services/DashboardService.cs` | Implement statement aggregation logic |
| 3 | `apps/api/.../Controllers/TransactionsController.cs` | Add `GET /api/transactions/statement` endpoint |
| 4 | `apps/frontend/src/api/transactionsApi.ts` | Add `getCashflowStatement()` API function |
| 5 | `apps/frontend/src/pages/cashflow/CashflowLayout.tsx` | Add "Statement" tab |
| 6 | `apps/frontend/src/App.tsx` | Add `/cashflow/statement` route |

---

## 7. Testing Checklist

- [ ] Backend returns correct aggregation for quarterly grouping
- [ ] Backend returns correct aggregation for monthly grouping
- [ ] Negative amounts shown in parentheses with red tint
- [ ] Section collapse/expand works smoothly
- [ ] Range selector (Last Month → 2Y) changes data correctly
- [ ] Period toggle (Quarterly ↔ Monthly) re-fetches data
- [ ] Loading skeleton displays during fetch
- [ ] Empty state when no transactions in range
- [ ] Tab navigation works (Overview → Statement → back)
- [ ] Numbers align correctly (right-aligned, monospace)
- [ ] Grand total = Operating + Investing + Financing totals
- [ ] Unknown categories fall back to Operating section

---

## 8. Future Enhancements (Out of Scope)

- [ ] Settings UI to customize category→section mapping
- [ ] Export statement as PDF
- [ ] YoY comparison mode (side by side)
- [ ] Drill-down: click category → filter TransactionsTab
- [ ] Wallet-level filter on Statement tab
