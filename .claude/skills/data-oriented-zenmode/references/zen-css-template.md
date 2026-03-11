# Zen Mode CSS Template

Complete CSS foundation for zen mode builds. Copy the relevant sections into your artifact or HTML file.

---

## Full CSS Variables

```css
:root {
  /* ═══ Canvas ═══ */
  --zen-bg:          #F5F3EE;
  --zen-surface:     #FFFFFF;
  --zen-elevated:    #FAF9F7;

  /* ═══ Borders — warm, soft ═══ */
  --zen-border:      #E8E5DF;
  --zen-border-hi:   #D4D0C8;
  --zen-border-faint: rgba(0, 0, 0, 0.04);

  /* ═══ Text — warm-black hierarchy ═══ */
  --zen-tx-1:        #37352F;
  --zen-tx-2:        #6B6B6B;
  --zen-tx-3:        #9B9B9B;
  --zen-tx-ghost:    #BFBFBF;

  /* ═══ Accents ═══ */
  --zen-accent:      #37352F;        /* primary actions: dark, confident */
  --zen-accent-h:    #2A2825;        /* hover */
  --zen-accent-s:    #F0EEEA;        /* subtle surface highlight */
  --zen-cta:         #E8C5A8;        /* warm CTA (one per page) */
  --zen-cta-h:       #DEBB9A;        /* warm CTA hover */
  --zen-cta-tx:      #5C3D1E;        /* warm CTA text */

  /* ═══ Functional (inherited from data-oriented-theme) ═══ */
  --green:           #16A34A;
  --amber:           #D97706;
  --red:             #DC2626;

  /* ═══ Typography ═══ */
  --font-sans:       'Inter', system-ui, -apple-system, sans-serif;
  --font-mono:       'JetBrains Mono', 'Fira Code', 'SF Mono', monospace;

  /* ═══ Motion ═══ */
  --zen-ease-reveal:  300ms cubic-bezier(0.16, 1, 0.3, 1);
  --zen-ease-dismiss: 200ms cubic-bezier(0.4, 0, 0.2, 1);
  --zen-ease-morph:   400ms cubic-bezier(0.16, 1, 0.3, 1);

  /* ═══ Spacing (8px grid) ═══ */
  --s-1: 4px;   --s-2: 8px;   --s-3: 12px;
  --s-4: 16px;  --s-5: 20px;  --s-6: 24px;
  --s-8: 32px;  --s-10: 40px; --s-12: 48px;
}
```

---

## Base Reset & Canvas

```css
*, *::before, *::after {
  margin: 0; padding: 0; box-sizing: border-box;
}

html {
  font-size: 16px;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

body {
  font-family: var(--font-sans);
  color: var(--zen-tx-1);
  line-height: 1.5;
  min-height: 100vh;

  /* Warm canvas with subtle grid */
  background-color: var(--zen-bg);
  background-image:
    linear-gradient(rgba(0, 0, 0, 0.018) 1px, transparent 1px),
    linear-gradient(90deg, rgba(0, 0, 0, 0.018) 1px, transparent 1px);
  background-size: 80px 80px;
}
```

---

## Layout Utilities

```css
/* Centered stage container */
.zen-stage {
  width: 100%;
  max-width: 640px;
  margin: 0 auto;
  padding: max(8vh, 48px) 24px 48px;
}

.zen-stage--wide {
  max-width: 960px;
}

.zen-stage--full {
  max-width: 1200px;
}

/* Vertical centering for short content */
.zen-center {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px;
}
```

---

## Typography Utilities

```css
.zen-h1 {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--zen-tx-1);
  letter-spacing: -0.02em;
  line-height: 1.3;
}

.zen-h2 {
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--zen-tx-1);
  letter-spacing: -0.01em;
}

.zen-subtitle {
  font-size: 0.875rem;
  color: var(--zen-tx-2);
  font-weight: 400;
  line-height: 1.5;
}

.zen-label {
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--zen-tx-3);
  margin-bottom: 12px;
}

.zen-body {
  font-size: 0.875rem;
  color: var(--zen-tx-1);
  line-height: 1.6;
}

.zen-meta {
  font-size: 0.75rem;
  color: var(--zen-tx-3);
}

.zen-mono {
  font-family: var(--font-mono);
  font-size: 0.8125rem;
}
```

---

## Staggered Page Load Animation

```css
@keyframes zen-fade-up {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.zen-animate {
  animation: zen-fade-up 400ms cubic-bezier(0.16, 1, 0.3, 1) both;
}

.zen-animate-d1 { animation-delay: 0ms; }
.zen-animate-d2 { animation-delay: 60ms; }
.zen-animate-d3 { animation-delay: 120ms; }
.zen-animate-d4 { animation-delay: 180ms; }
.zen-animate-d5 { animation-delay: 240ms; }
```

---

## Ghost Topbar

```css
.zen-ghost-topbar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 52px;
  display: flex;
  align-items: center;
  padding: 0 20px;
  opacity: 0;
  transition: opacity var(--zen-ease-reveal);
  pointer-events: none;
  z-index: 100;
  background: linear-gradient(to bottom, var(--zen-bg), transparent);
}

.zen-ghost-topbar:hover,
.zen-ghost-topbar.visible {
  opacity: 1;
  pointer-events: auto;
}

/* Hover zone — transparent hit area at top of viewport */
.zen-ghost-topbar::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 12px;
  pointer-events: auto;
}

.zen-back-arrow {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--zen-tx-2);
  font-size: 0.875rem;
  text-decoration: none;
  opacity: 0.5;
  transition: opacity 160ms ease;
  cursor: pointer;
  background: none;
  border: none;
}

.zen-back-arrow:hover {
  opacity: 1;
}
```

---

## Bottom Action Bar

```css
.zen-action-bar {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 1px;
  background: var(--zen-surface);
  border: 1px solid var(--zen-border);
  border-radius: 10px;
  padding: 4px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06);
  z-index: 100;
  opacity: 0;
  pointer-events: none;
  transition: opacity var(--zen-ease-reveal);
}

.zen-action-bar.visible {
  opacity: 1;
  pointer-events: auto;
}

.zen-action-bar button {
  padding: 8px 16px;
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--zen-tx-2);
  background: transparent;
  border: none;
  border-radius: 7px;
  cursor: pointer;
  transition: background 140ms ease, color 140ms ease;
  white-space: nowrap;
}

.zen-action-bar button:hover {
  background: var(--zen-accent-s);
  color: var(--zen-tx-1);
}

.zen-action-bar button.primary {
  background: var(--zen-accent);
  color: #FFFFFF;
}

.zen-action-bar button.primary:hover {
  background: var(--zen-accent-h);
}
```

---

## Primary Input

```css
.zen-input {
  width: 100%;
  padding: 14px 18px;
  font-size: 0.9375rem;
  font-family: var(--font-sans);
  color: var(--zen-tx-1);
  background: var(--zen-surface);
  border: 1px solid var(--zen-border);
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  transition: border-color 160ms ease, box-shadow 160ms ease;
  outline: none;
}

.zen-input:focus {
  border-color: var(--zen-border-hi);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.zen-input::placeholder {
  color: var(--zen-tx-ghost);
}

/* Input group with embedded CTA */
.zen-input-group {
  position: relative;
  width: min(100%, 580px);
  margin: 0 auto;
}

.zen-input-group .zen-input {
  padding-right: 110px;
}

.zen-input-group .zen-cta {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
}
```

---

## Warm CTA Button

```css
.zen-cta {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: var(--zen-cta);
  color: var(--zen-cta-tx);
  border: none;
  border-radius: 16px;
  padding: 8px 18px;
  font-size: 0.8125rem;
  font-weight: 550;
  font-family: var(--font-sans);
  cursor: pointer;
  transition: background 160ms ease;
  white-space: nowrap;
}

.zen-cta:hover {
  background: var(--zen-cta-h);
}

/* Arrow icon inside CTA */
.zen-cta svg {
  width: 14px;
  height: 14px;
}
```

---

## Cards (Weightless)

```css
.zen-card {
  background: var(--zen-surface);
  border: 1px solid var(--zen-border);
  border-radius: 12px;
  padding: 16px 20px;
  transition: border-color 160ms ease;
}

.zen-card:hover {
  border-color: var(--zen-border-hi);
}

.zen-card + .zen-card {
  margin-top: 8px;
}
```

---

## Data Table (Minimal)

```css
.zen-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
}

.zen-table thead th {
  text-align: left;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--zen-tx-3);
  padding: 8px 12px 12px;
  border-bottom: 1px solid var(--zen-border);
}

.zen-table thead th[data-align="right"] {
  text-align: right;
}

.zen-table tbody td {
  padding: 12px;
  border-bottom: 1px solid var(--zen-border-faint);
  color: var(--zen-tx-1);
}

.zen-table tbody tr:last-child td {
  border-bottom: none;
}

.zen-table tbody tr:hover td {
  background: var(--zen-elevated);
}

.zen-table .mono {
  font-family: var(--font-mono);
  font-size: 0.8125rem;
  text-align: right;
}
```

---

## Command Palette

```css
.zen-command-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.08);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 20vh;
  z-index: 1000;
  animation: zen-fade-in 150ms ease both;
}

@keyframes zen-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

.zen-command-palette {
  width: min(90vw, 520px);
  background: var(--zen-surface);
  border: 1px solid var(--zen-border);
  border-radius: 14px;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.1);
  overflow: hidden;
  animation: zen-scale-up 200ms cubic-bezier(0.16, 1, 0.3, 1) both;
}

@keyframes zen-scale-up {
  from {
    opacity: 0;
    transform: scale(0.98) translateY(-4px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.zen-command-palette input {
  width: 100%;
  padding: 16px 20px;
  font-size: 1rem;
  border: none;
  border-bottom: 1px solid var(--zen-border-faint);
  background: transparent;
  color: var(--zen-tx-1);
  outline: none;
}

.zen-command-palette .results {
  max-height: 320px;
  overflow-y: auto;
}

.zen-command-palette .result-item {
  padding: 10px 20px;
  font-size: 0.875rem;
  color: var(--zen-tx-2);
  cursor: pointer;
  transition: background 100ms ease;
}

.zen-command-palette .result-item:hover,
.zen-command-palette .result-item.active {
  background: var(--zen-accent-s);
  color: var(--zen-tx-1);
}

.zen-command-palette .result-item kbd {
  float: right;
  font-size: 0.6875rem;
  color: var(--zen-tx-3);
  font-family: var(--font-mono);
}
```

---

## Responsive Overrides

```css
@media (max-width: 768px) {
  .zen-stage {
    padding: max(4vh, 24px) 16px 32px;
  }

  .zen-action-bar {
    bottom: 16px;
    left: 16px;
    right: 16px;
    transform: none;
    width: auto;
  }
}

@media (max-width: 480px) {
  body {
    background-image: none;  /* remove grid texture on small screens */
  }

  .zen-h1 {
    font-size: 1.25rem;
  }

  .zen-input {
    padding: 12px 14px;
    font-size: 0.875rem;
  }
}
```
