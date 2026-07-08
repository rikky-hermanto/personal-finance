/* ── Cashflow Overview: balance strip, net cashflow card, insights, categories, quests ── */
const cnc = (...a) => a.filter(Boolean).join(' ');
const PFC = window.PF;
const fc = PFC.formatCurrency;
const fm = PFC.formatMonth;

const CATEGORY_EMOJI = {
  bill: '📄', utilities: '📄', electricity: '📄', food: '🍽️', dining: '🍽️', restaurant: '🍽️',
  grocery: '🛒', groceries: '🛒', vet: '🐾', pet: '🐾', dog: '🐾', withdraw: '💸', atm: '💸',
  family: '👨‍👩‍👧', transport: '🚗', travel: '✈️', shopping: '🛍️', health: '💊', medical: '💊',
  entertainment: '🎬', education: '📚', investment: '📈', salary: '💰', income: '💰',
  rent: '🏠', house: '🏠', subscription: '📱', insurance: '🛡️',
};
function catEmoji(category) {
  const lower = (category || '').toLowerCase();
  for (const [k, v] of Object.entries(CATEGORY_EMOJI)) if (lower.includes(k)) return v;
  return '📂';
}
const fmtDay = (s) => new Date(s).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });

// ── Current balance strip (popover on click) ──────────────────────────
function CurrentBalanceStrip() {
  const [open, setOpen] = React.useState(false);
  const data = PFC.accountBalances;
  const total = data.reduce((s, a) => s + a.currentBalance, 0);
  return (
    <div className="relative">
      <button onClick={() => setOpen(o => !o)} className="flex items-baseline gap-2 group cursor-pointer hover:opacity-80 transition-opacity">
        <span className="text-xs text-muted-foreground">Current Balance</span>
        <span className="text-sm font-semibold text-foreground tabular-nums">Rp {PFC.fmtDecimal(total)}</span>
        <Icon name="ChevronDown" size={12} className="text-muted-foreground/50" />
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 w-72 z-30 pf-card overflow-hidden shadow-lg">
          <div className="px-3 py-2 border-b border-border">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Balance by Account</p>
          </div>
          <div className="divide-y divide-border">
            {data.map((a) => (
              <div key={a.accountId} className="flex items-center justify-between px-3 py-2.5">
                <div>
                  <p className="text-sm font-medium text-foreground">{a.accountName}</p>
                  <p className="text-xs text-muted-foreground">{a.institutionName}</p>
                  <p className="text-xs text-muted-foreground/60">as of {new Date(a.asOf).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                </div>
                <span className="text-sm tabular-nums font-medium text-foreground">Rp {PFC.fmtDecimal(a.currentBalance)}</span>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between px-3 py-2.5 border-t border-border bg-muted/30">
            <span className="text-xs font-semibold text-muted-foreground">Total (IDR)</span>
            <span className="text-sm font-bold tabular-nums">Rp {PFC.fmtDecimal(total)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Daily pulse ────────────────────────────────────────────────────────
const TONE_STYLE = {
  positive: 'bg-emerald-50 border-emerald-200 text-emerald-800',
  neutral: 'bg-muted/50 border-border text-muted-foreground',
  caution: 'bg-amber-50 border-amber-200 text-amber-800',
};
function DailyPulse({ pulse, onDismiss }) {
  if (!pulse) return null;
  return (
    <div className={cnc('flex items-center gap-2.5 rounded-md border px-3.5 py-2 text-sm', TONE_STYLE[pulse.tone])}>
      <span className="text-base">{pulse.tone === 'positive' ? '✦' : pulse.tone === 'caution' ? '⚠' : '·'}</span>
      <span className="font-medium flex-1">{pulse.headline}</span>
      {onDismiss && <button onClick={onDismiss} className="ml-1 rounded p-0.5 opacity-50 hover:opacity-100 transition-opacity"><Icon name="X" size={14} /></button>}
    </div>
  );
}

// ── Quest chips strip ──────────────────────────────────────────────────
const CHIP_ICONS = { alert: 'AlertCircle', tag: 'Tag', refresh: 'RefreshCw' };
function CashflowQuestStrip({ quests, onNav }) {
  if (!quests.length) return null;
  return (
    <div className="flex gap-2 overflow-x-auto pb-0.5 scrollbar-none">
      {quests.map((q) => (
        <button key={q.id} onClick={onNav} className="flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground hover:border-primary hover:text-foreground transition-colors">
          <Icon name={CHIP_ICONS[q.icon]} size={14} />{q.label}
        </button>
      ))}
    </div>
  );
}

// ── Mini sparkline ─────────────────────────────────────────────────────
function MiniSparkline({ data, positive }) {
  const w = 56, h = 18;
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * h}`).join(' ');
  return (
    <svg width={w} height={h} className="overflow-visible">
      <polyline points={pts} fill="none" stroke={positive ? 'hsl(var(--success))' : 'hsl(var(--destructive))'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── Composed chart (income/expense bars + net line) ────────────────────
function ComposedChart({ data, height = 160 }) {
  if (!data || !data.length) return null;
  const w = 560, pad = { l: 8, r: 8, t: 12, b: 22 };
  const innerW = w - pad.l - pad.r, innerH = height - pad.t - pad.b;
  const maxVal = Math.max(...data.map(d => Math.max(d.income, d.expenses)));
  const nets = data.map(d => d.net);
  const netMin = Math.min(...nets, 0), netMax = Math.max(...nets, 0);
  const netRange = netMax - netMin || 1;
  const groupW = innerW / data.length;
  const barW = Math.min(18, groupW * 0.28);
  const y = (v) => pad.t + innerH - (v / maxVal) * innerH;
  const netY = (v) => pad.t + innerH - ((v - netMin) / netRange) * innerH;
  const linePts = data.map((d, i) => `${pad.l + groupW * i + groupW / 2},${netY(d.net)}`).join(' ');
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${height}`} style={{ display: 'block' }}>
      <line x1={pad.l} y1={pad.t + innerH} x2={w - pad.r} y2={pad.t + innerH} stroke="hsl(var(--border))" strokeWidth="1" />
      {data.map((d, i) => {
        const cx = pad.l + groupW * i + groupW / 2;
        return (
          <g key={d.month}>
            <rect x={cx - barW - 1} y={y(d.income)} width={barW} height={pad.t + innerH - y(d.income)} rx="2" fill="hsla(170,90%,32%,0.85)" />
            <rect x={cx + 1} y={y(d.expenses)} width={barW} height={pad.t + innerH - y(d.expenses)} rx="2" fill="hsla(354,80%,60%,0.85)" />
            <text x={cx} y={height - 6} textAnchor="middle" fontSize="9" fill="hsl(var(--muted-foreground))">
              {new Date(parseInt(d.month.split('-')[0]), parseInt(d.month.split('-')[1]) - 1).toLocaleDateString('en-US', { month: 'short' })}
            </text>
          </g>
        );
      })}
      <polyline points={linePts} fill="none" stroke="hsl(var(--foreground))" strokeWidth="1.5" strokeOpacity="0.55" />
      {data.map((d, i) => (
        <circle key={d.month} cx={pad.l + groupW * i + groupW / 2} cy={netY(d.net)} r="2.5" fill="hsl(var(--background))" stroke="hsl(var(--foreground))" strokeWidth="1.5" strokeOpacity="0.6" />
      ))}
    </svg>
  );
}

// ── Avg income/spend bar chart (click-to-reveal under savings row) ────
const fmtShortMonth = (m) => {
  const [y, mo] = m.split('-');
  return new Date(parseInt(y), parseInt(mo) - 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
};
function AvgBarChart({ data, seriesKey, avg, color }) {
  const w = 560, h = 140, pad = { l: 8, r: 8, t: 10, b: 20 };
  const innerW = w - pad.l - pad.r, innerH = h - pad.t - pad.b;
  const vals = data.map((d) => d[seriesKey]);
  const min = Math.min(...vals), max = Math.max(...vals) || 1;
  const groupW = innerW / data.length;
  const barW = Math.min(28, groupW * 0.5);
  const y = (v) => pad.t + innerH - (v / max) * innerH;
  const avgY = pad.t + innerH - (avg / max) * innerH;
  const opacity = (v) => (max > min ? 0.2 + 0.8 * (v - min) / (max - min) : 0.7);
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{ display: 'block' }}>
      <line x1={pad.l} y1={avgY} x2={w - pad.r} y2={avgY} stroke={color} strokeOpacity="0.5" strokeDasharray="3 3" strokeWidth="1" />
      {data.map((d, i) => {
        const cx = pad.l + groupW * i + groupW / 2;
        const v = d[seriesKey];
        return (
          <g key={d.month}>
            <rect x={cx - barW / 2} y={y(v)} width={barW} height={pad.t + innerH - y(v)} rx="2" fill={color} fillOpacity={opacity(v)} />
            <text x={cx} y={h - 6} textAnchor="middle" fontSize="9" fill="hsl(var(--muted-foreground))">{fmtShortMonth(d.month)}</text>
          </g>
        );
      })}
    </svg>
  );
}

// ── Net cashflow card ──────────────────────────────────────────────────
const Delta = ({ pct, inverse = false }) => {
  if (!pct) return null;
  const isGood = inverse ? pct < 0 : pct > 0;
  return <span className={cnc('ml-1 text-[10px] font-medium tabular-nums', isGood ? 'text-success' : 'text-destructive')}>
    {pct > 0 ? '▲' : '▼'}{Math.abs(pct).toFixed(1)}%
  </span>;
};

function NetCashflowCard({ data, chartData, sparklineData, expanded, onToggle }) {
  const { income, expenses, net, month, incomeChangePercent, expenseChangePercent, netChangePercent } = data;
  const isPositive = net >= 0;
  const savingsRate = income > 0 ? (net / income) * 100 : null;
  const avgExp = chartData.reduce((s, m) => s + m.expenses, 0) / chartData.length;
  const avgInc = chartData.reduce((s, m) => s + m.income, 0) / chartData.length;
  const [avgView, setAvgView] = React.useState(null);
  const handleToggleChart = () => { if (avgView) setAvgView(null); onToggle(); };
  const handleToggleIncome = () => { if (expanded) onToggle(); setAvgView((v) => (v === 'income' ? null : 'income')); };
  const handleToggleExpense = () => { if (expanded) onToggle(); setAvgView((v) => (v === 'expense' ? null : 'expense')); };
  return (
    <div className="pf-card p-5">
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-sm font-medium text-foreground">Net Cashflow</h3>
        <button onClick={handleToggleChart} className="flex items-center gap-2 cursor-pointer hover:opacity-70 transition-opacity">
          <MiniSparkline data={sparklineData} positive={isPositive} />
          <p className="text-[11px] text-muted-foreground">{fm(month)}</p>
          <Icon name={expanded ? 'ChevronUp' : 'ChevronDown'} size={14} className="text-muted-foreground/50" />
        </button>
      </div>

      <div className="grid grid-cols-3">
        <div className="pr-6">
          <p className="text-[11px] text-muted-foreground mb-1.5 flex items-center">
            <Icon name={isPositive ? 'TrendingUp' : 'TrendingDown'} size={12} className={cnc('mr-1', isPositive ? 'text-success' : 'text-destructive')} />
            Net<Delta pct={netChangePercent} />
          </p>
          <p className={cnc('font-mono text-xl font-semibold tabular-nums', isPositive ? 'text-success' : 'text-destructive')}>
            {isPositive ? '+' : ''}{fc(net)}
          </p>
        </div>
        <div className="px-6">
          <p className="text-[11px] text-muted-foreground mb-1.5 flex items-center">Income<Delta pct={incomeChangePercent} /></p>
          <p className="font-mono text-sm tabular-nums text-success">+{fc(income)}</p>
        </div>
        <div className="pl-6">
          <p className="text-[11px] text-muted-foreground mb-1.5 flex items-center">Expenses<Delta pct={expenseChangePercent} inverse /></p>
          <p className="font-mono text-sm tabular-nums text-destructive">-{fc(expenses)}</p>
        </div>
      </div>

      {expanded && (
        <>
          <div className="mt-4 border-t border-dashed border-border/50" />
          <div className="pt-4"><ComposedChart data={chartData} height={160} /></div>
        </>
      )}

      {savingsRate !== null && (
        <div className="mt-4 pt-3.5 border-t border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground">Savings rate</span>
            <span className={cnc('text-xs font-semibold tabular-nums', savingsRate >= 20 ? 'text-success' : savingsRate >= 10 ? 'text-foreground' : 'text-destructive')}>{savingsRate.toFixed(1)}%</span>
          </div>
          <button onClick={handleToggleIncome} className="flex items-center gap-2 cursor-pointer">
            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
              Avg income
              <Icon name={avgView === 'income' ? 'ChevronUp' : 'ChevronDown'} size={11} className="text-muted-foreground/50" />
            </span>
            <span className="text-xs font-mono tabular-nums text-success">{fc(avgInc)}</span>
          </button>
          <button onClick={handleToggleExpense} className="flex items-center gap-2 cursor-pointer">
            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
              Avg spend
              <Icon name={avgView === 'expense' ? 'ChevronUp' : 'ChevronDown'} size={11} className="text-muted-foreground/50" />
            </span>
            <span className="text-xs font-mono tabular-nums text-destructive">{fc(avgExp)}</span>
          </button>
        </div>
      )}

      {avgView && (
        <div className="mt-3 border-t border-dashed border-border/50 pt-3">
          <AvgBarChart data={chartData} seriesKey={avgView === 'income' ? 'income' : 'expenses'}
            avg={avgView === 'income' ? avgInc : avgExp}
            color={avgView === 'income' ? 'hsl(170,90%,32%)' : 'hsl(354,80%,60%)'} />
        </div>
      )}
    </div>
  );
}

// ── Insight stack ──────────────────────────────────────────────────────
const DOT = { alert: 'bg-red-500', warning: 'bg-amber-400', streak_break: 'bg-orange-400', win: 'bg-emerald-500', info: 'bg-blue-400' };
const META = { alert: 'text-red-600', warning: 'text-amber-600', streak_break: 'text-orange-500', win: 'text-emerald-600', info: 'text-blue-600' };

function InsightCard({ insight, onDismiss }) {
  const { severity, title, body, metricLabel, metricValue, actionType } = insight;
  return (
    <div className="flex items-start gap-3">
      <span className={cnc('mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full', DOT[severity])} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium leading-snug">{title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">{body}</p>
        {(metricLabel || actionType === 'navigate') && (
          <div className="mt-1 flex items-center gap-3">
            {metricLabel && metricValue !== undefined && (
              <span className={cnc('text-[11px] font-medium', META[severity])}>{metricLabel} · {metricValue.toLocaleString('id-ID')}</span>
            )}
            {actionType === 'navigate' && (
              <button className="text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors">View →</button>
            )}
          </div>
        )}
      </div>
      <button onClick={() => onDismiss(insight.id)} className="mt-0.5 shrink-0 text-muted-foreground/30 hover:text-muted-foreground transition-colors"><Icon name="X" size={12} /></button>
    </div>
  );
}

function InsightStack({ insights }) {
  const [dismissed, setDismissed] = React.useState(new Set());
  const visible = insights.filter((i) => !dismissed.has(i.id));
  if (!visible.length) return <p className="py-3 text-xs text-muted-foreground">All clear ✦ — View Spend Pulse for deeper analysis.</p>;
  return (
    <div className="space-y-5">
      {visible.map((i) => <InsightCard key={i.id} insight={i} onDismiss={(id) => setDismissed(prev => new Set([...prev, id]))} />)}
    </div>
  );
}

// ── Top categories ─────────────────────────────────────────────────────
function TopCategoriesCard({ data, month }) {
  return (
    <div className="pf-card p-5">
      <div className="mb-4">
        <h3 className="text-sm font-medium text-foreground">Top Categories</h3>
        <p className="text-[10px] text-muted-foreground mt-0.5">{month ? fm(month) : '—'}</p>
      </div>
      <div className="space-y-0.5">
        {data.map((cat) => (
          <div key={cat.category} className="w-full flex items-start justify-between px-3 py-2.5 rounded-md">
            <div className="flex items-start gap-2.5 min-w-0 flex-1">
              <span className="text-lg leading-none flex-shrink-0 mt-0.5">{catEmoji(cat.category)}</span>
              <div className="min-w-0">
                <span className="text-xs text-foreground truncate block">{cat.category}</span>
                <span className="text-[10px] text-muted-foreground">{cat.transactionCount} transaction{cat.transactionCount !== 1 ? 's' : ''}</span>
              </div>
            </div>
            <div className="font-mono text-xs text-foreground tabular-nums flex-shrink-0 ml-4 mt-0.5" title={`${cat.percentage.toFixed(1)}% of total spend`}>{fc(cat.amount)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Top spending ───────────────────────────────────────────────────────
function TopSpendingCard() {
  const items = [...PFC.topSpending].sort((a, b) => b.amountIdr - a.amountIdr).slice(0, 5);
  return (
    <div className="pf-card p-5">
      <h3 className="text-sm font-medium text-foreground mb-0.5">Top Spending</h3>
      <p className="text-[10px] text-muted-foreground mb-3">Largest individual transactions</p>
      <div className="space-y-3">
        {items.map((tx) => (
          <div key={tx.id} className="flex items-start gap-2.5">
            <span className="text-base leading-none mt-0.5 shrink-0">{catEmoji(tx.category)}</span>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-foreground truncate leading-snug" title={tx.description}>{tx.description}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{tx.category} · {fmtDay(tx.date)}</p>
            </div>
            <p className="font-mono text-xs tabular-nums text-destructive shrink-0 mt-0.5">{fc(tx.amountIdr)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Active quests (cashflow) ───────────────────────────────────────────
function CashflowActiveQuests({ quests, onNav, reward }) {
  return (
    <div className="space-y-3 pt-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-semibold text-foreground">Active Quests</h2>
        <ResetDemoButton reward={reward} />
      </div>
      <div className="grid grid-cols-3 gap-3">
        {quests.map((q) => {
          const done = reward ? !!reward.done[q.id] : false;
          const lvl = rwLevelFor(q.tag);
          const diffColor = q.difficulty === 'Easy' ? 'text-emerald-600 bg-emerald-50' : q.difficulty === 'Medium' ? 'text-amber-600 bg-amber-50' : 'text-rose-600 bg-rose-50';
          const diffIcon = q.difficulty === 'Easy' ? 'Zap' : q.difficulty === 'Medium' ? 'Shield' : 'Target';
          return (
            <div key={q.id} className={cnc('flex flex-col justify-between rounded-lg border bg-card p-4 gap-4 transition-colors',
              done ? 'border-emerald-200/70 bg-emerald-50/40 dark:bg-emerald-500/5 dark:border-emerald-500/20' : 'border-border')}>
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <span className={cnc('text-sm font-medium leading-snug', done ? 'text-foreground/60' : 'text-foreground')}>{q.title}</span>
                  {done
                    ? <Icon name="CheckCircle2" size={15} className="text-emerald-500 shrink-0 mt-0.5" />
                    : <span className={cnc('flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold', diffColor)}>
                        <Icon name={diffIcon} size={12} />{q.difficulty}
                      </span>}
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{q.description}</p>
              </div>
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span className={cnc('font-semibold', done ? 'text-emerald-700 dark:text-emerald-400' : 'text-foreground')}>+{q.points} pts</span>
                  <span className="rounded bg-muted px-1.5 py-0.5">{q.tag}</span>
                </div>
                {done ? (
                  <div className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400 font-medium pop-in">
                    <Icon name="Sprout" size={13} /> Completed — {lvl} grew
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <button onClick={() => reward && reward.completeQuest(q.id, { pts: q.points, level: lvl, title: q.title })}
                      className="flex items-center gap-1 text-xs font-medium h-6 px-2 -ml-2 rounded-md text-foreground hover:bg-emerald-50 hover:text-emerald-800 dark:hover:bg-emerald-500/10 dark:hover:text-emerald-300 transition-colors">
                      <Icon name="Check" size={12} /> Complete
                    </button>
                    <span className="text-muted-foreground/30">·</span>
                    <button onClick={onNav} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">Start <Icon name="ArrowRight" size={12} /></button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CashflowOverview({ onNav, reward }) {
  const d = PFC.dashboardData;
  const [range, setRange] = React.useState(1);
  const [expanded, setExpanded] = React.useState(true);
  const [dismissedPulse, setDismissedPulse] = React.useState(false);
  const [dismissedStale, setDismissedStale] = React.useState(false);
  const RANGES = [
    { label: 'Last Month', value: 1 }, { label: '3M', value: 3 }, { label: '6M', value: 6 },
    { label: '1Y', value: 12 }, { label: '2Y', value: 24 }, { label: 'YTD', value: 0 }, { label: 'All Time', value: -1 },
  ];
  const chips = [];
  const sparkline = d.cashFlow.map(m => m.net);

  return (
    <div className="p-8">
      <div className="max-w-6xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <CurrentBalanceStrip />
          <div className="flex items-center gap-3">
            <button onClick={() => onNav('/cashflow')} className="inline-flex items-center h-8 px-3 text-xs font-medium gap-1.5 rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-opacity">
              <Icon name="Upload" size={14} /> Upload Statement
            </button>
            <div className="w-px h-5 bg-border" />
            <div className="flex items-center gap-0.5">
              {RANGES.map((r) => (
                <button key={r.label} onClick={() => setRange(r.value)}
                  className={cnc('h-7 px-2.5 text-xs font-medium transition-all rounded-md',
                    range === r.value ? 'bg-secondary text-foreground' : 'bg-transparent text-muted-foreground hover:text-foreground hover:bg-foreground/5')}>
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {!dismissedPulse && <DailyPulse pulse={PFC.dailyPulse} onDismiss={() => setDismissedPulse(true)} />}

        <CashflowQuestStrip quests={chips} onNav={() => onNav('/cashflow')} />

        <div className="grid grid-cols-[1fr_300px] gap-4 items-start">
          <div className="space-y-3">
            <NetCashflowCard data={d.currentMonth} chartData={d.cashFlow} sparklineData={sparkline} expanded={expanded} onToggle={() => setExpanded(e => !e)} />
            {!dismissedStale && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-md px-3 py-2">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
                <span>Data through {fm(d.currentMonth.month)} —{' '}</span>
                <button onClick={() => onNav('/cashflow')} className="underline underline-offset-2 hover:text-foreground transition-colors">upload a new statement to sync</button>
                <button onClick={() => setDismissedStale(true)} className="ml-auto rounded p-0.5 opacity-50 hover:opacity-100 transition-opacity"><Icon name="X" size={12} /></button>
              </div>
            )}
            <div className="flex items-center gap-2 px-1">
              <span className="font-mono text-[10px] px-1.5 py-0.5 rounded border border-border text-muted-foreground/60">PREVIEW</span>
              <span className="text-[11px] text-muted-foreground/60">Sample insights — real data appears after PF-121 ships</span>
            </div>
            <InsightStack insights={PFC.insights} />
          </div>
          <div className="space-y-4">
            <TopCategoriesCard data={d.topCategories} month={d.currentMonth.month} />
            <TopSpendingCard />
          </div>
        </div>

        <CashflowActiveQuests quests={PFC.cashflowQuests} onNav={() => onNav('/cashflow')} reward={reward} />
      </div>
    </div>
  );
}

Object.assign(window, { CashflowOverview });