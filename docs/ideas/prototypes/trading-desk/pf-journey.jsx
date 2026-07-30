/* ── Journey page: LivingGardenHero, TierCard, QuestCard, StreakHeatmap ── */
const cn = (...a) => a.filter(Boolean).join(' ');
const PF = window.PF;

// Per-level plant identity — each tier is its own species that grows through 4 stages.
const PLANT_MATRIX = {
  L1: ['🌰', '🌱', '🌿', '🌳'],   // Foundations — an oak takes root
  L2: ['🌱', '🌿', '🎄', '🌲'],   // Defense — a hardy evergreen for shelter
  L3: ['🌱', '🌿', '🌷', '🌻'],   // Growth — it flowers and flourishes
  L4: ['🌿', '🌳', '🍏', '🌳🍎'], // Freedom — it bears fruit / passive yield
  L5: ['🌳', '🌲', '🌴', '🏞️'],   // Legacy — it becomes an enduring grove
};
const STAGE_LABELS = ['Seed', 'Sprout', 'Growing', 'Flourishing'];
const stageFromScore = (s) => Math.min(3, Math.floor(s / 25));
const LEVEL_KEYS = ['L1', 'L2', 'L3', 'L4', 'L5'];

// ── Journey visualization style switcher (tree / skyline / crystal) ──
const JOURNEY_STYLE_KEY = 'pf_journey_style';
const JOURNEY_STYLE_OPTIONS = [
  { id: 'tree', label: 'Tree', icon: 'TreePine' },
  { id: 'skyline', label: 'Skyline', icon: 'Building2' },
  { id: 'crystal', label: 'Diamond', icon: 'Gem' },
];
function useJourneyStyle() {
  const [style, setStyleState] = React.useState(() => {
    try { return localStorage.getItem(JOURNEY_STYLE_KEY) || 'tree'; } catch { return 'tree'; }
  });
  const setStyle = (s) => { try { localStorage.setItem(JOURNEY_STYLE_KEY, s); } catch {} setStyleState(s); };
  return [style, setStyle];
}
function JourneyStyleSwitcher({ style, setStyle }) {
  return (
    <div className="flex justify-center gap-1 mb-4">
      {JOURNEY_STYLE_OPTIONS.map((opt) => (
        <button key={opt.id} onClick={() => setStyle(opt.id)} title={opt.label}
          className={cn('flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-medium transition-colors',
            style === opt.id ? 'bg-secondary text-foreground' : 'text-muted-foreground/50 hover:text-muted-foreground hover:bg-foreground/5')}>
          <Icon name={opt.icon} size={12} />{opt.label}
        </button>
      ))}
    </div>
  );
}

// ── Skyline visualization — all 5 levels as one city, tallest at center ──
function winGrid(bx, by, bw, bh, cols, rows, ww = 4, wh = 5) {
  const hGap = (bw - cols * ww) / (cols + 1);
  const vGap = (bh - rows * wh) / (rows + 1);
  const out = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) out.push([bx + hGap + c * (ww + hGap), by + vGap + r * (wh + vGap), ww, wh]);
  return out;
}
function Windows({ wins, lit }) {
  return wins.map(([x, y, w, h], i) => (
    <rect key={i} x={x} y={y} width={w} height={h} fill={lit ? 'rgb(253 224 71)' : 'rgb(180 190 200)'} opacity={lit ? 0.9 : 0.5} rx="0.5" />
  ));
}
const GHOST = 'rgb(226 232 240)';
function SkylineSVG({ state, selLevel, onSelect }) {
  const sc = (lvl) => (state.levelScores[lvl] ?? 0) / 100;
  const GROUND = 244;
  const b = {
    l5Main: [184, 90, 32, GROUND - 90], l5Upper: [191, 68, 18, 24],
    l4Left: [106, 128, 50, GROUND - 128], l4Right: [244, 128, 50, GROUND - 128],
    l3FarL: [50, 162, 42, GROUND - 162], l3NearL: [143, 168, 32, GROUND - 168], l3NearR: [225, 168, 32, GROUND - 168], l3FarR: [308, 162, 42, GROUND - 162],
    l2FarL: [18, 200, 26, GROUND - 200], l2NearL: [98, 206, 24, GROUND - 206], l2NearR: [278, 206, 24, GROUND - 206], l2FarR: [356, 200, 26, GROUND - 200],
    l1Left: [163, 225, 18, GROUND - 225], l1Right: [219, 225, 18, GROUND - 225],
  };
  const roofL = `${b.l1Left[0]},${b.l1Left[1]} ${b.l1Left[0] + b.l1Left[2] / 2},${b.l1Left[1] - 10} ${b.l1Left[0] + b.l1Left[2]},${b.l1Left[1]}`;
  const roofR = `${b.l1Right[0]},${b.l1Right[1]} ${b.l1Right[0] + b.l1Right[2] / 2},${b.l1Right[1] - 10} ${b.l1Right[0] + b.l1Right[2]},${b.l1Right[1]}`;
  const Ghost = ({ rect }) => <rect x={rect[0]} y={rect[1]} width={rect[2]} height={rect[3]} fill={GHOST} opacity="0.55" rx="1" />;
  const Block = ({ lvl, rects, cols, rows, extra }) => (
    <g onClick={() => onSelect(lvl)} style={{ cursor: 'pointer' }} className="pop-in">
      <title>{`${lvl} · ${PF.TIER_META[lvl].label} · ${(state.levelScores[lvl] ?? 0).toFixed(0)}/100`}</title>
      {rects.map((r, i) => <Ghost key={i} rect={r} />)}
      {rects.map((r, i) => <Windows key={i} wins={winGrid(...r, cols, rows)} lit={false} />)}
      <g style={{ opacity: sc(lvl), transition: 'opacity 0.9s cubic-bezier(.16,1,.3,1)' }}
        filter={selLevel === lvl ? 'url(#sk-glow)' : undefined}>
        {rects.map((r, i) => <rect key={i} x={r[0]} y={r[1]} width={r[2]} height={r[3]} fill={PF.TIER_META[lvl].color} rx="1" />)}
        {rects.map((r, i) => <Windows key={i} wins={winGrid(...r, cols, rows)} lit={true} />)}
        {extra}
      </g>
    </g>
  );
  return (
    <svg viewBox="0 0 400 256" className="w-full max-w-xs mx-auto select-none" aria-label="Financial journey city skyline">
      <defs><filter id="sk-glow" x="-35%" y="-35%" width="170%" height="170%"><feGaussianBlur stdDeviation="5" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter></defs>
      <rect x="0" y="0" width="400" height="244" fill="rgb(248 250 252)" />
      <rect x="0" y="244" width="400" height="12" fill="rgb(196 218 190)" rx="1" />
      <Block lvl="L5" cols={3} rows={8} rects={[b.l5Main, b.l5Upper]} extra={<g><line x1="200" y1="68" x2="200" y2="50" stroke={PF.TIER_META.L5.color} strokeWidth="2.5" /><circle cx="200" cy="49" r="3" fill="rgb(253 224 71)" /></g>} />
      <Block lvl="L4" cols={2} rows={5} rects={[b.l4Left, b.l4Right]} />
      <Block lvl="L3" cols={2} rows={3} rects={[b.l3FarL, b.l3NearL, b.l3NearR, b.l3FarR]} />
      <Block lvl="L2" cols={1} rows={2} rects={[b.l2FarL, b.l2NearL, b.l2NearR, b.l2FarR]} />
      <g onClick={() => onSelect('L1')} style={{ cursor: 'pointer' }} className="pop-in">
        <title>{`L1 · ${PF.TIER_META.L1.label} · ${(state.levelScores.L1 ?? 0).toFixed(0)}/100`}</title>
        <Ghost rect={b.l1Left} /><Ghost rect={b.l1Right} />
        <polygon points={roofL} fill={GHOST} opacity="0.55" /><polygon points={roofR} fill={GHOST} opacity="0.55" />
        <g style={{ opacity: sc('L1'), transition: 'opacity 0.9s cubic-bezier(.16,1,.3,1)' }} filter={selLevel === 'L1' ? 'url(#sk-glow)' : undefined}>
          <rect x={b.l1Left[0]} y={b.l1Left[1]} width={b.l1Left[2]} height={b.l1Left[3]} fill={PF.TIER_META.L1.color} rx="1" />
          <rect x={b.l1Right[0]} y={b.l1Right[1]} width={b.l1Right[2]} height={b.l1Right[3]} fill={PF.TIER_META.L1.color} rx="1" />
          <polygon points={roofL} fill={PF.TIER_META.L1.color} /><polygon points={roofR} fill={PF.TIER_META.L1.color} />
        </g>
      </g>
    </svg>
  );
}

// ── Crystal visualization — 5 gem facets, bottom (L1) to top table (L5) ──
function CrystalSVG({ state, selLevel, onSelect }) {
  const cx = 200, tableY = 62, tableHW = 76, crownY = 108, crownHW = 68, girdleTopY = 170, girdleHW = 148, girdleBotY = 182, pavilY = 240, pavilHW = 82, culetY = 292;
  const sc = (lvl) => (state.levelScores[lvl] ?? 0) / 100;
  const pts = (...c) => c.map(([x, y]) => `${x},${y}`).join(' ');
  const polys = {
    L5: pts([cx - tableHW, tableY], [cx + tableHW, tableY], [cx + crownHW, crownY], [cx - crownHW, crownY]),
    L4: pts([cx - crownHW, crownY], [cx + crownHW, crownY], [cx + girdleHW, girdleTopY], [cx - girdleHW, girdleTopY]),
    L3: pts([cx - girdleHW, girdleTopY], [cx + girdleHW, girdleTopY], [cx + girdleHW, girdleBotY], [cx - girdleHW, girdleBotY]),
    L2: pts([cx - girdleHW, girdleBotY], [cx + girdleHW, girdleBotY], [cx + pavilHW, pavilY], [cx - pavilHW, pavilY]),
    L1: pts([cx - pavilHW, pavilY], [cx + pavilHW, pavilY], [cx, culetY]),
  };
  const facets = [
    [[cx - tableHW, tableY], [cx - girdleHW, girdleTopY]], [[cx + tableHW, tableY], [cx + girdleHW, girdleTopY]],
    [[cx - tableHW, tableY], [cx, girdleTopY]], [[cx + tableHW, tableY], [cx, girdleTopY]],
    [[cx, crownY], [cx - girdleHW, girdleTopY]], [[cx, crownY], [cx + girdleHW, girdleTopY]],
    [[cx - girdleHW, girdleBotY], [cx, culetY]], [[cx + girdleHW, girdleBotY], [cx, culetY]],
    [[cx - pavilHW, pavilY], [cx, culetY]], [[cx + pavilHW, pavilY], [cx, culetY]],
    [[cx, girdleBotY], [cx - pavilHW, pavilY]], [[cx, girdleBotY], [cx + pavilHW, pavilY]],
  ];
  const sparkles = [[cx - tableHW - 14, tableY + 4, 7], [cx + tableHW + 14, tableY + 4, 7], [cx - 20, tableY - 14, 5], [cx + 20, tableY - 14, 5], [cx, tableY - 22, 6]];
  const Facet = ({ lvl }) => (
    <g onClick={() => onSelect(lvl)} style={{ cursor: 'pointer' }} className="pop-in">
      <title>{`${lvl} · ${PF.TIER_META[lvl].label} · ${(state.levelScores[lvl] ?? 0).toFixed(0)}/100`}</title>
      <polygon points={polys[lvl]} fill={GHOST} opacity="0.55" />
      <g style={{ opacity: sc(lvl), transition: 'opacity 0.9s cubic-bezier(.16,1,.3,1)' }} filter={selLevel === lvl ? 'url(#cr-glow)' : undefined}>
        <polygon points={polys[lvl]} fill={PF.TIER_META[lvl].color} />
        {lvl === 'L5' && sparkles.map(([x, y, r], i) => (
          <g key={i}><circle cx={x} cy={y} r={r} fill="rgb(253 224 71)" opacity="0.9" />
            <line x1={x - r - 3} y1={y} x2={x + r + 3} y2={y} stroke="rgb(253 224 71)" strokeWidth="1.5" opacity="0.7" />
            <line x1={x} y1={y - r - 3} x2={x} y2={y + r + 3} stroke="rgb(253 224 71)" strokeWidth="1.5" opacity="0.7" /></g>
        ))}
      </g>
    </g>
  );
  return (
    <svg viewBox="0 0 400 320" className="w-full max-w-xs mx-auto select-none" aria-label="Financial journey diamond">
      <defs>
        <filter id="cr-glow" x="-35%" y="-35%" width="170%" height="170%"><feGaussianBlur stdDeviation="5" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
        <linearGradient id="gem-sheen" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="white" stopOpacity="0.18" /><stop offset="40%" stopColor="white" stopOpacity="0.06" /><stop offset="100%" stopColor="white" stopOpacity="0.12" /></linearGradient>
      </defs>
      {['L1', 'L2', 'L3', 'L4', 'L5'].map((lvl) => <Facet key={lvl} lvl={lvl} />)}
      <g fill="none" stroke="white" strokeWidth="0.8" opacity="0.35" pointerEvents="none">
        {facets.map(([[x1, y1], [x2, y2]], i) => <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} />)}
      </g>
      <g pointerEvents="none" opacity="0.6">
        {['L5', 'L4', 'L3', 'L2', 'L1'].map((lvl) => <polygon key={lvl} points={polys[lvl]} fill="url(#gem-sheen)" />)}
      </g>
    </svg>
  );
}

function LivingGardenHero({ state, topQuest, onNav }) {
  const currentKey = `L${state.currentLevel}`;
  const [selLevel, setSelLevel] = React.useState(currentKey);
  const [previewStage, setPreviewStage] = React.useState(null);
  const [vizStyle, setVizStyle] = useJourneyStyle();

  const selScore = state.levelScores[selLevel] ?? 0;
  const naturalStage = stageFromScore(selScore);
  const shownStage = previewStage ?? naturalStage;
  const meta = PF.TIER_META[selLevel];
  const plants = PLANT_MATRIX[selLevel];
  const emoji = plants[shownStage];
  const isCurrent = selLevel === currentKey;

  const pickLevel = (key) => { setSelLevel(key); setPreviewStage(null); };

  return (
    <div className="relative px-4 pt-2 pb-4">
      <JourneyStyleSwitcher style={vizStyle} setStyle={setVizStyle} />

      {/* Level progress dots — clickable */}
      <div className="flex justify-center gap-6 mb-6">
        {LEVEL_KEYS.map((key) => {
          const s = state.levelScores[key] ?? 0;
          const graduated = s >= 70;
          const selected = key === selLevel;
          return (
            <button key={key} onClick={() => pickLevel(key)}
              className="flex flex-col items-center gap-1.5 group cursor-pointer"
              title={`${key} · ${PF.TIER_META[key].label} · ${s.toFixed(0)}/100`}>
              <div className={cn('rounded-full transition-all duration-200 group-hover:scale-125',
                selected ? 'w-3 h-3 bg-amber-400 ring-2 ring-amber-200 ring-offset-1'
                  : graduated ? 'w-2.5 h-2.5 bg-emerald-400' : 'w-2.5 h-2.5 bg-muted-foreground/20')} />
              <span className={cn('text-[9px] font-medium transition-colors',
                selected ? 'text-foreground/80' : 'text-muted-foreground/35 group-hover:text-muted-foreground/70')}>{key}</span>
            </button>
          );
        })}
      </div>

      {vizStyle === 'tree' ? (
        <div className="flex justify-center pop-in" key={`${selLevel}-${shownStage}`}>
          <span role="img" aria-label={`${meta.label}, stage ${shownStage} of 3`}
            style={{ fontSize: '88px', lineHeight: 1, userSelect: 'none' }}>{emoji}</span>
        </div>
      ) : vizStyle === 'skyline' ? (
        <SkylineSVG state={state} selLevel={selLevel} onSelect={pickLevel} />
      ) : (
        <CrystalSVG state={state} selLevel={selLevel} onSelect={pickLevel} />
      )}

      {/* Level name + score */}
      <div className="text-center mt-4 mb-4">
        <p className="text-[10px] tracking-widest uppercase text-muted-foreground/60 font-medium mb-1">
          {selLevel}{!isCurrent && <span className="ml-1.5 text-muted-foreground/40 normal-case tracking-normal">· preview</span>}
        </p>
        <h2 className="text-xl font-semibold tracking-tight">{meta.label}</h2>
        <div className="flex items-center justify-center gap-2.5 mt-3">
          <div className="w-36 h-1.5 rounded-full bg-muted overflow-hidden">
            <div className="h-full rounded-full bg-amber-400 grow-bar" style={{ width: `${selScore}%` }} />
          </div>
          <span className="text-sm font-mono font-semibold tabular-nums">
            {selScore.toFixed(0)}<span className="text-muted-foreground font-normal text-xs">/100</span>
          </span>
        </div>
      </div>

      {/* Growth-stage strip — tree style only */}
      {vizStyle === 'tree' && (
        <div className="flex justify-center gap-1.5 mb-5">
          {plants.map((p, i) => {
            const reached = i <= naturalStage;
            const active = i === shownStage;
            return (
              <button key={i}
                onMouseEnter={() => setPreviewStage(i)}
                onMouseLeave={() => setPreviewStage(null)}
                onClick={() => setPreviewStage(i)}
                title={`${STAGE_LABELS[i]} · ${i * 25}–${i * 25 + 24}`}
                className={cn('flex flex-col items-center gap-1 rounded-lg px-2 py-1.5 w-[58px] transition-all',
                  active ? 'bg-amber-50 ring-1 ring-amber-300'
                    : reached ? 'bg-muted/40 hover:bg-muted/70' : 'opacity-40 hover:opacity-70')}>
                <span style={{ fontSize: '22px', lineHeight: 1 }}>{p}</span>
                <span className={cn('text-[8px] font-medium tracking-wide',
                  active ? 'text-amber-700' : 'text-muted-foreground/60')}>{STAGE_LABELS[i]}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Integrated top quest CTA */}
      <div className="flex justify-center">
        {isCurrent && topQuest ? (
          <a onClick={onNav} className="cursor-pointer inline-flex items-center gap-1.5 text-xs bg-amber-50 border border-amber-200/80 text-amber-800 rounded-full px-4 py-1.5 hover:bg-amber-100 transition-colors font-medium">
            {topQuest.title}<Icon name="ArrowRight" size={12} />
          </a>
        ) : (
          <a onClick={onNav} className="cursor-pointer inline-flex items-center gap-1.5 text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors">
            Open {meta.module} <Icon name="ArrowRight" size={12} />
          </a>
        )}
      </div>
    </div>
  );
}

const STATUS_COLORS = { achieved: 'bg-emerald-500', in_progress: 'bg-amber-500', not_started: 'bg-slate-300', no_data: 'bg-slate-200' };

function IndicatorScoreBar({ indicator, headline, subtext }) {
  return (
    <div className="flex flex-col gap-0.5 py-0.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-foreground/80 truncate flex-1">{headline ?? indicator.displayName}</span>
        <span className="text-xs font-mono font-medium ml-2">{indicator.score.toFixed(0)}</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
        <div className={cn('h-full rounded-full grow-bar', STATUS_COLORS[indicator.status])} style={{ width: `${indicator.score}%` }} />
      </div>
      <div className="relative h-0">
        {[50, 70, 100].map((t) => (
          <div key={t} className="absolute w-px h-1.5 bg-border -top-1.5" style={{ left: `${t}%` }} />
        ))}
      </div>
      {subtext && <p className="text-[10px] text-muted-foreground/70 mt-0.5 truncate">{subtext}</p>}
    </div>
  );
}

function TierCard({ level, state, onNav }) {
  const meta = PF.TIER_META[level];
  const levelScore = state.levelScores[level] ?? 0;
  const liveIndicators = state.indicators.filter((i) => i.level === level && i.status !== 'no_data');
  const isGraduated = liveIndicators.length > 0 && liveIndicators.every((i) => i.score >= 70);
  const isActive = level === `L${state.currentLevel}`;
  const isLocked = !isGraduated && !isActive && parseInt(level[1]) > state.currentLevel;
  const statusLabel = isGraduated ? 'Achieved' : isActive ? 'In Progress' : 'Not Started';

  if (!isActive) {
    return (
      <div className={cn('flex items-center justify-between px-4 py-2.5 rounded-lg border transition-colors',
        isGraduated ? 'bg-emerald-50/50 border-emerald-200/60' : 'bg-muted/30 border-border/50 opacity-50')}>
        <div className="flex items-center gap-2.5">
          {isGraduated ? <Icon name="CheckCircle2" size={14} className="text-emerald-500 shrink-0" />
            : <Icon name="Circle" size={14} className="text-muted-foreground/30 shrink-0" />}
          <span className={cn('text-sm font-medium', isGraduated ? 'text-foreground/70' : 'text-muted-foreground/60')}>
            {level} · {meta.label}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-muted-foreground/60 tabular-nums">{levelScore.toFixed(0)}/100</span>
          {isGraduated && <span className="text-[9px] px-1.5 py-0 rounded border border-emerald-300 text-emerald-700">{statusLabel}</span>}
          {isLocked && <span className="text-[9px] text-muted-foreground/40">Locked</span>}
        </div>
      </div>
    );
  }

  return (
    <div className="pf-card ring-1 ring-amber-300 bg-amber-50/30">
      <div className="p-4 pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon name="CircleDot" size={16} className="text-amber-500 shrink-0" />
            <span className="font-semibold text-sm">{level} · {meta.label}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-muted-foreground tabular-nums">{levelScore.toFixed(0)} / 100</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground font-medium">{statusLabel}</span>
          </div>
        </div>
      </div>
      <div className="px-4 pb-4 pt-0 space-y-1">
        {state.indicators.filter((i) => i.level === level).map((ind) => {
          const lbl = PF.JOURNEY_LABELS[ind.code] || { headline: ind.displayName, subtext: () => `Score ${ind.score.toFixed(0)}/100` };
          return <IndicatorScoreBar key={ind.code} indicator={ind} headline={lbl.headline} subtext={lbl.subtext(ind)} />;
        })}
        <div className="pt-2">
          <a onClick={onNav} className="cursor-pointer inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
            Open {meta.module} <Icon name="ArrowRight" size={12} />
          </a>
        </div>
      </div>
    </div>
  );
}

const DIFFICULTY_CONFIG = {
  easy:   { icon: 'Zap',    color: 'text-emerald-600', label: 'Easy' },
  medium: { icon: 'Shield', color: 'text-amber-600',   label: 'Medium' },
  hard:   { icon: 'Flame',  color: 'text-red-500',     label: 'Hard' },
};

function QuestCard({ quest, onNav, done, onComplete }) {
  const cfg = DIFFICULTY_CONFIG[quest.difficulty] ?? DIFFICULTY_CONFIG.medium;
  const lvl = rwLevelFor(quest.targetIndicator);
  return (
    <div className={cn('pf-card flex flex-col h-full transition-colors',
      done && 'bg-emerald-50/40 border-emerald-200/70 dark:bg-emerald-500/5 dark:border-emerald-500/20')}>
      <div className="p-4 pb-2">
        <div className="flex items-start justify-between gap-2">
          <p className={cn('font-semibold text-sm leading-snug', done && 'text-foreground/60')}>{quest.title}</p>
          {done
            ? <Icon name="CheckCircle2" size={15} className="text-emerald-500 shrink-0 mt-0.5" />
            : <div className={cn('flex items-center gap-1 shrink-0', cfg.color)}>
                <Icon name={cfg.icon} size={14} /><span className="text-[10px] font-medium">{cfg.label}</span>
              </div>}
        </div>
      </div>
      <div className="px-4 pb-4 pt-0 flex flex-col gap-3 flex-1">
        <p className="text-xs text-muted-foreground leading-relaxed">{quest.description}</p>
        <div className="flex items-center gap-1.5">
          <span className={cn('text-[10px] px-1.5 py-0.5 rounded border',
            done ? 'border-emerald-300/70 text-emerald-700 dark:text-emerald-400' : 'border-border')}>+{quest.estimatedScoreGain.toFixed(0)} pts</span>
          <span className="text-[10px] text-muted-foreground">{quest.targetIndicator.replace(/_/g, ' ')}</span>
        </div>
        {done ? (
          <div className="flex items-center gap-1.5 mt-auto text-xs text-emerald-700 dark:text-emerald-400 font-medium pop-in">
            <Icon name="Sprout" size={13} /> Completed — {lvl} grew
          </div>
        ) : (
          <div className="flex items-center gap-2 mt-auto">
            <button onClick={() => onComplete && onComplete(quest, lvl)}
              className="inline-flex items-center text-xs h-7 px-2.5 rounded-md border border-border hover:bg-emerald-50 hover:border-emerald-300/70 hover:text-emerald-800 dark:hover:bg-emerald-500/10 dark:hover:text-emerald-300 transition-colors">
              <Icon name="Check" size={12} className="mr-1" /> Complete
            </button>
            <button onClick={onNav} className="text-xs h-7 px-2 text-muted-foreground hover:text-foreground transition-colors inline-flex items-center">
              Start <Icon name="ArrowRight" size={12} className="ml-1" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const cellColor = (c) => !c ? 'bg-muted' : c === 1 ? 'bg-emerald-200' : c <= 3 ? 'bg-emerald-400' : 'bg-emerald-600';

function StreakHeatmap() {
  const activity = PF.streakActivity;
  const today = PF.today;
  const days = [];
  for (let i = 83; i >= 0; i--) { const d = new Date(today); d.setDate(today.getDate() - i); days.push(d); }
  const weeks = []; let week = [];
  for (const day of days) { week.push(day); if (day.getDay() === 6) { weeks.push(week); week = []; } }
  if (week.length) weeks.push(week);
  const dayLabels = ['Sun', '', 'Tue', '', 'Thu', '', 'Sat'];

  return (
    <div className="overflow-x-auto">
      <div className="flex gap-1" style={{ minWidth: 'max-content' }}>
        <div className="flex flex-col gap-1 justify-around mr-1">
          {dayLabels.map((label, i) => (
            <span key={i} className="text-[9px] text-muted-foreground w-5 text-right leading-none" style={{ height: 10 }}>{label}</span>
          ))}
        </div>
        {weeks.map((wk, wi) => (
          <div key={wi} className="flex flex-col gap-1">
            {Array.from({ length: 7 }, (_, di) => {
              const day = wk[di];
              if (!day) return <div key={di} className="w-2.5 h-2.5 rounded-sm opacity-0" />;
              const count = activity[day.toISOString().slice(0, 10)];
              return <div key={di} className={cn('w-2.5 h-2.5 rounded-sm transition-colors cursor-default', cellColor(count))}
                title={`${day.toISOString().slice(0, 10)}: ${count ?? 0} transaction${count !== 1 ? 's' : ''}`} />;
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function JourneyPage({ onNav, reward }) {
  const state = (reward && reward.journey) || PF.journeyState;
  const quests = PF.journeyQuests;
  const completeJourneyQuest = (quest, lvl) => {
    if (!reward) return;
    reward.completeQuest(`jq-${quest.title}`, { pts: quest.estimatedScoreGain, level: lvl, title: quest.title });
  };
  return (
    <div className="space-y-8 p-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Your Financial Journey</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Level {state.currentLevel} · Score {state.totalScore.toFixed(1)} / 100 ·{' '}
            <span className="text-xs">updated {new Date(state.lastComputedAt).toLocaleDateString()}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="inline-flex items-center h-8 px-2.5 text-sm rounded-md hover:bg-accent transition-colors text-foreground">
            <Icon name="Trophy" size={16} className="mr-1.5" /> Achievements ({state.achievements.length})
          </button>
          <button className="inline-flex items-center h-8 px-3 text-sm rounded-md border border-border hover:bg-accent transition-colors">
            <Icon name="RefreshCw" size={14} className="mr-1.5" /> Recalculate
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-1">
          <LivingGardenHero state={state} topQuest={quests[0]} onNav={() => onNav('/cashflow')} />
        </div>
        <div className="md:col-span-2 space-y-2">
          {LEVEL_KEYS.map((lvl) => <TierCard key={lvl} level={lvl} state={state} onNav={() => onNav('/cashflow')} />)}
        </div>
      </div>

      <section>
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-lg font-semibold">Active Quests</h2>
          <ResetDemoButton reward={reward} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {quests.map((q) => (
            <QuestCard key={q.title} quest={q} onNav={() => onNav('/cashflow')}
              done={reward ? !!reward.done[`jq-${q.title}`] : false}
              onComplete={completeJourneyQuest} />
          ))}
        </div>
      </section>
    </div>
  );
}

Object.assign(window, { LivingGardenHero, TierCard, QuestCard, StreakHeatmap, JourneyPage });