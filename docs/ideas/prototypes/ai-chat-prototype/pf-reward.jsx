/* ── Reward loop (mockup): useRewardState + GardenWidget + RewardToast ──
   Closes the gamification loop:
   1. visible progress  → GardenWidget lives in the sidebar on every page
   2. immediate feedback→ RewardToast (+pts) + growth bar + plant pulse
   3. clear next step   → quest cards already provide this
*/
const cnr = (...a) => a.filter(Boolean).join(' ');
const PFR = window.PF;

const RW_PLANTS = {
  L1: ['🌰', '🌱', '🌿', '🌳'],
  L2: ['🌱', '🌿', '🎄', '🌲'],
  L3: ['🌱', '🌿', '🌷', '🌻'],
  L4: ['🌿', '🌳', '🍏', '🌳'],
  L5: ['🌳', '🌲', '🌴', '🏞️'],
};
const RW_STAGES = ['Seed', 'Sprout', 'Growing', 'Flourishing'];
const rwStage = (s) => Math.min(3, Math.floor(s / 25));
const RW_KEY = 'pf_reward_demo_v1';

// Map a quest's target indicator to the tier its points feed.
function rwLevelFor(indicatorCode) {
  const ind = PFR.journeyState.indicators.find((i) => i.code === indicatorCode);
  if (ind) return ind.level;
  if (/liquid|emergency|insurance/.test(indicatorCode || '')) return 'L2';
  return 'L1';
}

// ── Global reward state ────────────────────────────────────────────────
function useRewardState() {
  const base = PFR.journeyState;
  const [state, setState] = React.useState(() => {
    try {
      const raw = localStorage.getItem(RW_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return { scores: { ...base.levelScores }, done: {} };
  });
  const [toasts, setToasts] = React.useState([]);

  React.useEffect(() => {
    try { localStorage.setItem(RW_KEY, JSON.stringify(state)); } catch {}
  }, [state]);

  const dismissToast = React.useCallback((id) => {
    setToasts((ts) => ts.filter((t) => t.id !== id));
  }, []);

  const pushToast = React.useCallback((t) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((ts) => [...ts.slice(-1), { ...t, id }]);
    setTimeout(() => dismissToast(id), t.kind === 'stage' ? 5200 : 4200);
  }, [dismissToast]);

  const completeQuest = (key, { pts, level, title }) => {
    if (state.done[key]) return;
    const before = state.scores[level] ?? 0;
    const after = Math.min(100, before + pts);
    setState({
      scores: { ...state.scores, [level]: after },
      done: { ...state.done, [key]: true },
    });
    pushToast({ kind: 'pts', pts, level, title, score: after });
    if (rwStage(after) > rwStage(before)) {
      setTimeout(() => pushToast({ kind: 'stage', level, stage: rwStage(after) }), 900);
    }
  };

  const resetDemo = () => {
    setState({ scores: { ...base.levelScores }, done: {} });
    setToasts([]);
  };

  const journey = React.useMemo(() => {
    const gained = Object.keys(state.scores).reduce(
      (sum, k) => sum + ((state.scores[k] ?? 0) - (base.levelScores[k] ?? 0)), 0);
    return {
      ...base,
      levelScores: state.scores,
      totalScore: Math.min(100, base.totalScore + gained * 0.4),
    };
  }, [state.scores]);

  const anyDone = Object.keys(state.done).length > 0;
  return { journey, done: state.done, anyDone, completeQuest, resetDemo, toasts, dismissToast };
}

// ── Animated number (count-up, zen ease) ───────────────────────────────
function useAnimatedNumber(value, dur = 800) {
  const [shown, setShown] = React.useState(value);
  const fromRef = React.useRef(value);
  React.useEffect(() => {
    const from = fromRef.current;
    if (from === value) return;
    const t0 = performance.now();
    let raf;
    const tick = (t) => {
      const p = Math.min(1, (t - t0) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      setShown(from + (value - from) * e);
      if (p < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, dur]);
  return shown;
}

// ── Persistent sidebar garden widget ───────────────────────────────────
function GardenWidget({ journey, onNav, active }) {
  const lvl = `L${journey.currentLevel}`;
  const score = journey.levelScores[lvl] ?? 0;
  const stage = rwStage(score);
  const meta = PFR.TIER_META[lvl];
  const shown = useAnimatedNumber(score);
  const [gain, setGain] = React.useState(null);
  const prevRef = React.useRef(score);

  React.useEffect(() => {
    if (score > prevRef.current) {
      setGain({ amt: Math.round(score - prevRef.current), id: Date.now() });
      const t = setTimeout(() => setGain(null), 1400);
      prevRef.current = score;
      return () => clearTimeout(t);
    }
    prevRef.current = score;
  }, [score]);

  return (
    <div className="px-3 pb-1">
      <button onClick={onNav}
        className={cnr('w-full text-left rounded-lg border bg-card px-3 py-2.5 transition-colors relative group',
          active ? 'border-amber-300/80' : 'border-border hover:border-amber-300/60')}>
        <div className="flex items-center gap-2.5">
          <span key={`${lvl}-${stage}`} className={cnr('text-[22px] leading-none select-none', gain && 'rw-pulse')}
            role="img" aria-label={`${meta.label} plant, stage ${RW_STAGES[stage]}`}>
            {RW_PLANTS[lvl][stage]}
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[11px] font-semibold text-foreground/80 truncate">{lvl} · {meta.label}</span>
              <span className="text-[11px] font-mono tabular-nums text-foreground">
                {Math.round(shown)}<span className="text-muted-foreground/60 font-normal">/100</span>
              </span>
            </div>
            <div className="mt-1.5 h-1 rounded-full bg-muted overflow-hidden">
              <div className="h-full rounded-full bg-amber-400 grow-bar" style={{ width: `${shown}%` }}></div>
            </div>
            <div className="mt-1 flex items-center justify-between">
              <span className="text-[9px] text-muted-foreground/60">{RW_STAGES[stage]}</span>
              <span className="text-[9px] text-muted-foreground/40 group-hover:text-muted-foreground/80 transition-colors">Journey →</span>
            </div>
          </div>
        </div>
        {gain && <span key={gain.id} className="rw-float-gain font-mono text-income">+{gain.amt}</span>}
      </button>
    </div>
  );
}

// ── Bottom-center reward toast (zen pill) ──────────────────────────────
function RewardToast({ toasts, onDismiss, onNav }) {
  if (!toasts.length) return null;
  return (
    <div className="fixed bottom-6 left-0 right-0 z-50 flex flex-col items-center gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div key={t.id}
          className={cnr('rw-toast pointer-events-auto flex items-center gap-3 pl-4 pr-2 py-2.5 rounded-xl border bg-card',
            t.kind === 'stage' ? 'border-amber-300/80' : 'border-border')}
          style={{ boxShadow: '0 4px 16px rgba(0,0,0,0.06)' }}>
          {t.kind === 'pts' ? (
            <React.Fragment>
              <span className="text-base leading-none select-none">{RW_PLANTS[t.level][rwStage(t.score)]}</span>
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-semibold font-mono tabular-nums text-foreground">+{t.pts} pts</span>
                <span className="text-xs text-muted-foreground">→ {t.level} · {PFR.TIER_META[t.level].label}</span>
              </div>
              <button onClick={() => { onNav('/journey'); onDismiss(t.id); }}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors px-1">View →</button>
            </React.Fragment>
          ) : (
            <React.Fragment>
              <span className="text-base leading-none select-none rw-pulse">{RW_PLANTS[t.level][t.stage]}</span>
              <span className="text-sm text-foreground/90">
                Your {PFR.TIER_META[t.level].label.toLowerCase()} plant grew — <span className="font-semibold">{RW_STAGES[t.stage]}</span>
              </span>
            </React.Fragment>
          )}
          <button onClick={() => onDismiss(t.id)} aria-label="Dismiss"
            className="p-1.5 rounded hover:bg-foreground/5 text-muted-foreground/50 hover:text-foreground transition-colors">
            <Icon name="X" size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}

// ── Tiny "Reset demo" ghost control for quest sections ─────────────────
function ResetDemoButton({ reward }) {
  if (!reward || !reward.anyDone) return null;
  return (
    <button onClick={reward.resetDemo}
      className="inline-flex items-center gap-1 text-[11px] text-muted-foreground/50 hover:text-foreground transition-colors">
      <Icon name="RefreshCw" size={11} /> Reset demo
    </button>
  );
}

Object.assign(window, { useRewardState, GardenWidget, RewardToast, ResetDemoButton, rwLevelFor });
