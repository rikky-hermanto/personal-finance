# Component Examples — Data-Oriented Theme
# Rule: No floating cards. Structure = proportion + dividers.

---

## KPI Strip (stat row, not stat cards)

```html
<div class="kpi-strip">
  <div class="kpi-cell">
    <div class="kpi-label">TICKERS</div>
    <div class="kpi-value">955</div>
  </div>
  <div class="kpi-cell">
    <div class="kpi-label">INVESTORS</div>
    <div class="kpi-value">5,270</div>
  </div>
  <div class="kpi-cell">
    <div class="kpi-label">LOCAL</div>
    <div class="kpi-value">57.3%</div>
    <div class="kpi-delta positive">▲ 1.2pp</div>
  </div>
  <div class="kpi-cell">
    <div class="kpi-label">FOREIGN</div>
    <div class="kpi-value">42.7%</div>
    <div class="kpi-delta negative">▼ 1.2pp</div>
  </div>
</div>

<style>
.kpi-strip {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  border-bottom: 1px solid var(--border);
  border-top: 1px solid var(--border);
}
.kpi-cell {
  padding: var(--space-4) var(--space-6);
  border-right: 1px solid var(--border);
}
.kpi-cell:last-child { border-right: none; }
.kpi-label {
  font-size: 0.6875rem;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-secondary);
  margin-bottom: var(--space-1);
}
.kpi-value {
  font-size: 1.75rem;
  font-weight: 600;
  font-family: var(--font-mono);
  letter-spacing: -0.02em;
  color: var(--text-primary);
}
.kpi-delta {
  font-size: 0.75rem;
  font-family: var(--font-mono);
  margin-top: var(--space-1);
}
.kpi-delta.positive { color: var(--success); }
.kpi-delta.negative { color: var(--danger); }
</style>
```

---

## Section Panel (replaces card — uses rows + divider label)

```html
<section class="data-section">
  <div class="section-label">Market Overview</div>
  <div class="section-row">
    <span class="row-tag" style="--tag-color: #6B7280">CP</span>
    <span class="row-name">Corporate</span>
    <span class="row-value">2,305</span>
  </div>
  <div class="section-row">
    <span class="row-tag" style="--tag-color: #2563EB">ID</span>
    <span class="row-name">Individual</span>
    <span class="row-value">2,147</span>
  </div>
  <div class="section-row">
    <span class="row-tag" style="--tag-color: #D97706">IB</span>
    <span class="row-name">Investment Bank</span>
    <span class="row-value">138</span>
  </div>
</section>

<style>
.data-section { /* No border-box wrapping. Lives inside a grid pane. */ }
.section-label {
  font-size: 0.6875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-secondary);
  padding: var(--space-3) 0 var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--border);
  border-left: 3px solid var(--accent);
}
.section-row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) 0;
  border-bottom: 1px solid var(--border);
}
.section-row:last-child { border-bottom: none; }
.row-tag {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 20px;
  border-radius: 3px;
  font-size: 0.625rem;
  font-weight: 700;
  background: color-mix(in srgb, var(--tag-color) 15%, transparent);
  color: var(--tag-color);
  flex-shrink: 0;
}
.row-name { flex: 1; font-size: 0.875rem; color: var(--text-primary); }
.row-value { font-family: var(--font-mono); font-size: 0.875rem; color: var(--text-secondary); }
</style>
```

---

## Two-Column Split Layout

```html
<div class="split-layout">
  <div class="split-main"><!-- Primary: table, list, main data --></div>
  <div class="split-side"><!-- Secondary: ranked list, filters, meta --></div>
</div>

<style>
.split-layout {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 0;
  border-top: 1px solid var(--border);
}
.split-main {
  border-right: 1px solid var(--border);
  padding: var(--space-6);
}
.split-side { padding: var(--space-6); }
</style>
```

---

## Data Table

```html
<table class="data-table">
  <thead>
    <tr>
      <th>Investor</th>
      <th class="num">Positions</th>
      <th class="num">Change</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>UOB KAY HIAN PTE LTD</td>
      <td class="num">65</td>
      <td class="num positive">▲ 3</td>
    </tr>
    <tr>
      <td>BANK OF SINGAPORE LTD</td>
      <td class="num">37</td>
      <td class="num negative">▼ 1</td>
    </tr>
  </tbody>
</table>

<style>
.data-table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
.data-table thead tr {
  background: var(--bg-elevated);
  border-bottom: 2px solid var(--border-strong);
}
.data-table th {
  padding: var(--space-2) var(--space-4);
  font-size: 0.6875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-secondary);
  text-align: left;
}
.data-table td {
  padding: 10px var(--space-4);
  border-bottom: 1px solid var(--border);
  color: var(--text-primary);
}
.data-table tbody tr:nth-child(even) td { background: var(--bg-base); }
.data-table tbody tr:hover td { background: var(--accent-subtle); }
.data-table .num { text-align: right; font-family: var(--font-mono); }
.positive { color: var(--success); }
.negative { color: var(--danger); }
</style>
```

---

## Sidebar Navigation

```html
<nav class="sidebar">
  <div class="nav-group-label">Overview</div>
  <a class="nav-item active">Market Overview</a>
  <a class="nav-item">Investors</a>
  <div class="nav-group-label">Tools</div>
  <a class="nav-item">Float Screener</a>
</nav>

<style>
.sidebar {
  width: 240px;
  min-height: 100vh;
  background: var(--bg-elevated);
  border-right: 1px solid var(--border);
  padding: var(--space-4) var(--space-2);
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.nav-group-label {
  font-size: 0.6875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-tertiary);
  padding: var(--space-4) var(--space-3) var(--space-1);
}
.nav-item {
  display: block;
  padding: 6px var(--space-3);
  border-radius: 4px;
  font-size: 0.875rem;
  color: var(--text-secondary);
  text-decoration: none;
  border-left: 3px solid transparent;
  transition: background var(--transition), color var(--transition);
  cursor: pointer;
}
.nav-item:hover { background: rgba(0,0,0,0.04); color: var(--text-primary); }
.nav-item.active {
  border-left-color: var(--accent);
  background: var(--accent-subtle);
  color: var(--accent);
  font-weight: 500;
}
</style>
```

---

## Ranked List Row

```html
<div class="ranked-list">
  <div class="ranked-row">
    <span class="rank">1</span>
    <span class="rank-name">ANDRY HAKIM</span>
    <span class="rank-value">1,308</span>
  </div>
  <div class="ranked-row">
    <span class="rank">2</span>
    <span class="rank-name">GOVT OF NORWAY</span>
    <span class="rank-value">969</span>
  </div>
</div>

<style>
.ranked-list { display: flex; flex-direction: column; }
.ranked-row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) 0;
  border-bottom: 1px solid var(--border);
}
.ranked-row:last-child { border-bottom: none; }
.rank { font-size: 0.75rem; font-family: var(--font-mono); color: var(--text-tertiary); width: 16px; text-align: right; flex-shrink: 0; }
.rank-name { flex: 1; font-size: 0.875rem; color: var(--text-primary); }
.rank-value { font-family: var(--font-mono); font-size: 0.8125rem; color: var(--text-secondary); }
</style>
```

---

## Search Input

```html
<input type="text" class="search-input" placeholder="Search ticker or investor...">

<style>
.search-input {
  width: 100%;
  padding: var(--space-2) var(--space-4);
  font-size: 0.875rem;
  font-family: var(--font-sans);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg-surface);
  color: var(--text-primary);
  outline: none;
  transition: border-color var(--transition), box-shadow var(--transition);
}
.search-input::placeholder { color: var(--text-tertiary); }
.search-input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
}
</style>
```
