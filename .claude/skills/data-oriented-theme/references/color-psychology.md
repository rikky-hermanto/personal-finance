# Color Psychology Reference

## Scientific Basis for the Data-Oriented Palette

### Why Neutral Backgrounds Win for Data Analysis

**Cognitive Load Research (Sweller, 1988; Mayer, 2009):**
- Saturated backgrounds compete with foreground data for attention
- Neutral gray/white reduces extraneous cognitive load by 23–31% in reading tasks
- Brain allocates attention budget: decoration steals from comprehension

**Optimal Base Colors for Sustained Reading:**
- `#F7F8FA` (warm off-white) — reduces eye strain vs pure `#FFFFFF` (too high contrast)
- `#0F1117` (near-black, not pure black) — reduces glare in dark mode
- Pure black/white (#000/#fff) creates harsh halation on modern LCD/OLED

---

### Why Only 2 Accent Colors

**Fitts' Law + Visual Hierarchy:**
- Every additional color competes for fixation priority
- 2-color limit forces semantic meaning: Blue = "act here", Green/Red = "state signal"
- Users learn the system in <60 seconds → reduces decision fatigue

**Itti & Koch (2001) Saliency Model:**
- Color contrast is the #1 driver of bottom-up visual attention
- One high-contrast accent = clear focal point
- Multiple accents = saliency competition → user scans without acting

---

### Blue (#2563EB) as Primary Accent

**Why blue for interactive elements:**
- Blue is the most universally recognized "link/action" color (Nielsen Norman Group, 2004)
- Low emotional arousal — doesn't trigger urgency or alarm
- Tailwind Blue-600 (`#2563EB`) has 4.5:1 contrast ratio on white (WCAG AA)

**Avoid:**
- Purple (ambiguous — luxury vs error vs creative)
- Orange/red for CTAs (triggers caution/stop associations)
- Green for CTAs (reserved for success/positive delta)

---

### Green/Red for Deltas Only

**Traffic light coding (Green/Amber/Red):**
- Universally understood state signaling
- Green = positive, growth, healthy
- Red = negative, risk, alert
- Amber = caution, neutral, warning

**Rule: Never use green/red for decoration** — once used decoratively, users can't
trust them as state signals. This is why StockMap, Bloomberg, and financial dashboards
keep color use disciplined.

---

### Typography Contrast Ratios

| Pairing | Ratio | WCAG Level |
|---|---|---|
| `#111318` on `#F7F8FA` | 17.8:1 | AAA ✓ |
| `#6B7280` on `#FFFFFF` | 4.6:1 | AA ✓ |
| `#9CA3AF` on `#FFFFFF` | 2.9:1 | AA (large text only) |
| `#FFFFFF` on `#2563EB` | 4.5:1 | AA ✓ |

**Recommendation:** Never use `--text-tertiary` for anything the user must read to act.
Use it only for timestamps, IDs, metadata.

---

### Spacing and Density

**Miller's Law (7±2) applied to UI:**
- Group related data within 8–16px (perceived as one unit)
- Separate groups with 24–32px (perceived as distinct sections)
- 8px base grid is the minimum perceivable step change in spatial relationships

**Gestalt Proximity:**
- Items 4px apart → same group
- Items 16px apart → related but distinct
- Items 32px+ apart → separate sections
