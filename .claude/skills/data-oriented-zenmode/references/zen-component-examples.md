# Zen Mode Component Examples

Copy-paste HTML/JSX for all zen mode components. Each example is self-contained.

---

## 1. Centered Stage — Landing / Prompt Page

The default zen layout. One input, one CTA, receding secondary content below.

```html
<body>
  <div class="zen-center">
    <div class="zen-stage" style="max-width: 640px; text-align: center;">

      <!-- Title block -->
      <h1 class="zen-h1 zen-animate zen-animate-d1" style="margin-bottom: 8px;">
        What are you working on?
      </h1>
      <p class="zen-subtitle zen-animate zen-animate-d2" style="margin-bottom: 32px;">
        Start typing to get going, or pick from below.
      </p>

      <!-- Primary input with embedded CTA -->
      <div class="zen-input-group zen-animate zen-animate-d3">
        <input class="zen-input" placeholder="Describe your task..." />
        <button class="zen-cta">
          Let's go
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 8h10M9 4l4 4-4 4"/>
          </svg>
        </button>
      </div>

      <!-- Secondary content — receding -->
      <div class="zen-animate zen-animate-d4" style="margin-top: 40px; text-align: left;">
        <p class="zen-label">Recent</p>
        <div class="zen-secondary-item">Quarterly revenue analysis</div>
        <div class="zen-secondary-item">API rate limiter design</div>
        <div class="zen-secondary-item">Team 1-on-1 notes template</div>
      </div>

    </div>
  </div>
</body>
```

---

## 2. Ghost Topbar

Invisible by default. Appears when user hovers within 12px of the top edge.

```html
<!-- Place at top of body -->
<nav class="zen-ghost-topbar" id="ghostTopbar">
  <button class="zen-back-arrow" onclick="history.back()">
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none"
         stroke="currentColor" stroke-width="1.5">
      <path d="M10 3L5 8l5 5"/>
    </svg>
    Back
  </button>
  <div style="flex: 1;"></div>
  <span class="zen-meta">Last saved 2 min ago</span>
</nav>

<script>
  // Reveal ghost topbar on mouse near top edge
  document.addEventListener('mousemove', (e) => {
    const bar = document.getElementById('ghostTopbar');
    if (e.clientY < 12) {
      bar.classList.add('visible');
    }
  });
  document.getElementById('ghostTopbar').addEventListener('mouseleave', function() {
    this.classList.remove('visible');
  });
</script>
```

---

## 3. Bottom Action Bar

Contextual actions for active work. Show/hide based on state.

```html
<div class="zen-action-bar" id="actionBar">
  <button class="primary">Save</button>
  <button>Reset</button>
  <button>Export</button>
</div>

<script>
  // Show when user has unsaved changes
  function showActionBar() {
    document.getElementById('actionBar').classList.add('visible');
  }
  function hideActionBar() {
    document.getElementById('actionBar').classList.remove('visible');
  }
</script>
```

---

## 4. Weightless Card List

For repeatable items — tasks, results, records.

```html
<div class="zen-stage">
  <p class="zen-label">Active Tasks</p>

  <div class="zen-card">
    <div style="display: flex; justify-content: space-between; align-items: center;">
      <div>
        <div class="zen-body" style="font-weight: 500;">Implement rate limiter</div>
        <div class="zen-meta" style="margin-top: 4px;">Backend · Due Mar 15</div>
      </div>
      <span class="zen-tag" style="--c: #D97706;">In Progress</span>
    </div>
  </div>

  <div class="zen-card">
    <div style="display: flex; justify-content: space-between; align-items: center;">
      <div>
        <div class="zen-body" style="font-weight: 500;">Review PR #482</div>
        <div class="zen-meta" style="margin-top: 4px;">Code Review · Due Today</div>
      </div>
      <span class="zen-tag" style="--c: #DC2626;">Urgent</span>
    </div>
  </div>
</div>

<style>
  .zen-tag {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 0.6875rem;
    font-weight: 500;
    background: color-mix(in srgb, var(--c) 10%, transparent);
    color: var(--c);
    border: 1px solid color-mix(in srgb, var(--c) 18%, transparent);
  }
</style>
```

---

## 5. Minimal Data Table

Chrome-free table with warm hover states.

```html
<div class="zen-stage zen-stage--wide">
  <p class="zen-label">Portfolio Holdings</p>

  <table class="zen-table">
    <thead>
      <tr>
        <th>Ticker</th>
        <th>Name</th>
        <th data-align="right" style="text-align: right;">Shares</th>
        <th data-align="right" style="text-align: right;">Avg Cost</th>
        <th data-align="right" style="text-align: right;">Current</th>
        <th data-align="right" style="text-align: right;">P&L %</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td class="mono" style="font-weight: 600;">BBRI</td>
        <td>Bank Rakyat Indonesia</td>
        <td class="mono">5,000</td>
        <td class="mono">4,250</td>
        <td class="mono">4,600</td>
        <td class="mono" style="color: var(--green);">+8.2%</td>
      </tr>
      <tr>
        <td class="mono" style="font-weight: 600;">MEDC</td>
        <td>Medco Energi</td>
        <td class="mono">10,000</td>
        <td class="mono">1,380</td>
        <td class="mono">1,520</td>
        <td class="mono" style="color: var(--green);">+10.1%</td>
      </tr>
      <tr>
        <td class="mono" style="font-weight: 600;">GIAA</td>
        <td>Garuda Indonesia</td>
        <td class="mono">50,000</td>
        <td class="mono">82</td>
        <td class="mono">56</td>
        <td class="mono" style="color: var(--red);">-31.7%</td>
      </tr>
    </tbody>
  </table>
</div>
```

---

## 6. Command Palette (Cmd+K)

Full-page navigation replacement. No sidebar needed.

```html
<div class="zen-command-backdrop" id="commandPalette" style="display: none;">
  <div class="zen-command-palette">
    <input
      type="text"
      placeholder="Type a command or search..."
      id="commandInput"
      autocomplete="off"
    />
    <div class="results">
      <div class="result-item active">
        Dashboard <kbd>⌘1</kbd>
      </div>
      <div class="result-item">
        Portfolio Overview <kbd>⌘2</kbd>
      </div>
      <div class="result-item">
        Trade Journal <kbd>⌘3</kbd>
      </div>
      <div class="result-item">
        Settings <kbd>⌘,</kbd>
      </div>
    </div>
  </div>
</div>

<script>
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      const palette = document.getElementById('commandPalette');
      const isOpen = palette.style.display !== 'none';
      palette.style.display = isOpen ? 'none' : 'flex';
      if (!isOpen) document.getElementById('commandInput').focus();
    }
    if (e.key === 'Escape') {
      document.getElementById('commandPalette').style.display = 'none';
    }
  });

  // Close on backdrop click
  document.getElementById('commandPalette').addEventListener('click', function(e) {
    if (e.target === this) this.style.display = 'none';
  });
</script>
```

---

## 7. Focused Workspace (Editor / Form)

White workspace surface on warm canvas. Ghost topbar + bottom action bar.

```html
<body>
  <!-- Ghost topbar -->
  <nav class="zen-ghost-topbar" id="ghostTopbar">
    <button class="zen-back-arrow">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none"
           stroke="currentColor" stroke-width="1.5">
        <path d="M10 3L5 8l5 5"/>
      </svg>
      Notes
    </button>
    <div style="flex: 1;"></div>
    <span class="zen-meta">Auto-saved</span>
  </nav>

  <!-- Main workspace -->
  <div class="zen-stage zen-stage--wide" style="padding-top: max(6vh, 40px);">
    <div class="zen-card zen-animate zen-animate-d1"
         style="min-height: 60vh; padding: 32px;">

      <h1 contenteditable="true"
          class="zen-h1"
          style="border: none; outline: none; margin-bottom: 16px;"
          data-placeholder="Untitled">
      </h1>

      <div contenteditable="true"
           class="zen-body"
           style="outline: none; min-height: 200px; color: var(--zen-tx-2);"
           data-placeholder="Start writing...">
      </div>
    </div>
  </div>

  <!-- Bottom action bar -->
  <div class="zen-action-bar visible">
    <button class="primary">Save</button>
    <button>Discard</button>
  </div>
</body>
```

---

## 8. React Component — Zen Stage

For React/JSX artifacts.

```jsx
import { useState, useEffect } from "react";

const ZenStage = ({ children, title, subtitle, maxWidth = 640 }) => {
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setLoaded(true));
  }, []);

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      backgroundColor: '#F5F3EE',
      backgroundImage: `
        linear-gradient(rgba(0,0,0,0.018) 1px, transparent 1px),
        linear-gradient(90deg, rgba(0,0,0,0.018) 1px, transparent 1px)
      `,
      backgroundSize: '80px 80px',
      fontFamily: "'Inter', system-ui, sans-serif",
      color: '#37352F',
    }}>
      <div style={{
        maxWidth,
        width: '100%',
        textAlign: 'center',
        opacity: loaded ? 1 : 0,
        transform: loaded ? 'translateY(0)' : 'translateY(8px)',
        transition: 'opacity 400ms cubic-bezier(0.16,1,0.3,1), transform 400ms cubic-bezier(0.16,1,0.3,1)',
      }}>
        {title && (
          <h1 style={{
            fontSize: '1.5rem',
            fontWeight: 700,
            letterSpacing: '-0.02em',
            marginBottom: 8,
          }}>
            {title}
          </h1>
        )}
        {subtitle && (
          <p style={{
            fontSize: '0.875rem',
            color: '#6B6B6B',
            marginBottom: 32,
          }}>
            {subtitle}
          </p>
        )}
        {children}
      </div>
    </div>
  );
};

export default ZenStage;
```

---

## 9. React — Zen Table

```jsx
const ZenTable = ({ columns, data }) => {
  return (
    <table style={{
      width: '100%',
      borderCollapse: 'collapse',
      fontSize: '0.875rem',
    }}>
      <thead>
        <tr>
          {columns.map(col => (
            <th key={col.key} style={{
              textAlign: col.align || 'left',
              fontSize: '0.75rem',
              fontWeight: 600,
              color: '#9B9B9B',
              padding: '8px 12px 12px',
              borderBottom: '1px solid #E8E5DF',
            }}>
              {col.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.map((row, i) => (
          <tr key={i} style={{ cursor: 'default' }}
            onMouseEnter={e => e.currentTarget.style.background = '#FAF9F7'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            {columns.map(col => (
              <td key={col.key} style={{
                padding: '12px',
                borderBottom: '1px solid rgba(0,0,0,0.04)',
                textAlign: col.align || 'left',
                fontFamily: col.mono ? "'JetBrains Mono', monospace" : 'inherit',
                fontSize: col.mono ? '0.8125rem' : 'inherit',
                color: row[col.colorKey] || '#37352F',
              }}>
                {row[col.key]}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
};

export default ZenTable;
```
