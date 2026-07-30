import { useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { useDeskState } from '@/hooks/useDeskState';
import GateBar from '@/components/desk/GateBar';
import GateDrawer from '@/components/desk/GateDrawer';
import DeskDisclaimer from '@/components/desk/DeskDisclaimer';
import { fmtIDR, fmtPct } from '@/lib/desk/deskFormat';

const TABS = [
  { value: 'command', label: 'Command Center', path: '/desk/command', live: true },
  { value: 'portfolio', label: 'Portfolio', path: '/desk/portfolio', live: true },
  { value: 'mandate', label: 'Mandate', path: '/desk/mandate', live: true },
  { value: 'reconcile', label: 'Reconcile', path: '/desk/reconcile', live: true },
  { value: 'pretrade', label: 'Pre-Trade', path: '/desk/pretrade', live: false },
  { value: 'journal', label: 'Journal', path: '/desk/journal', live: false },
];

const DeskLayout = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { data: state, isLoading, isError } = useDeskState();

  const activeTab = TABS.find(t => location.pathname.startsWith(t.path))?.value ?? 'command';

  if (isLoading) {
    return <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">Loading desk state…</div>;
  }
  if (isError || !state) {
    return <div className="flex-1 flex items-center justify-center text-sm text-destructive">Failed to load desk state.</div>;
  }

  return (
    <div className="flex flex-col h-full bg-transparent">
      <div className="flex items-center px-6 pt-6 pb-5 gap-6">
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Trading Desk</h1>
        <Tabs value={activeTab} onValueChange={(v) => {
          const tab = TABS.find(t => t.value === v);
          if (tab?.live) navigate(tab.path);
        }}>
          <TabsList className="bg-transparent h-auto p-0 gap-2 rounded-none border-none">
            {TABS.map(tab => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                disabled={!tab.live}
                className={cn(
                  'rounded-md px-4 py-1.5 text-xs font-medium transition-all duration-150',
                  'data-[state=active]:bg-secondary data-[state=active]:text-foreground data-[state=active]:shadow-none',
                  'data-[state=inactive]:text-muted-foreground hover:text-foreground hover:bg-foreground/5',
                  !tab.live && 'opacity-45 cursor-default hover:bg-transparent'
                )}
              >
                {tab.label}
                {!tab.live && <span className="ml-1.5 text-[9px] uppercase tracking-wider text-foreground/40">soon</span>}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      <GateBar chain={state.navChain} gate={state.gate} onOpenDrawer={() => setDrawerOpen(true)} />

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 overflow-auto relative">
          <Outlet context={state} />
        </div>

        {/* Right-hand read-only context panel */}
        <div className="w-72 flex-shrink-0 border-l border-border p-4 space-y-4 overflow-y-auto hidden xl:block">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold mb-2">Context</div>
            <dl className="space-y-2 text-xs">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Regime</dt>
                <dd className="font-mono tabular-nums">{state.navChain.regime.name} {state.navChain.regime.multiplier.toFixed(2)}x</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Heat</dt>
                <dd className="font-mono tabular-nums">{fmtPct(state.navChain.heat, { signed: false })}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Headroom (daily)</dt>
                <dd className="font-mono tabular-nums">{fmtIDR(state.navChain.dailyHeadroom)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Active Trading NAV</dt>
                <dd className="font-mono tabular-nums">{fmtIDR(state.navChain.activeTradingNav)}</dd>
              </div>
            </dl>
          </div>
          <button
            onClick={() => setDrawerOpen(true)}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
          >
            Explain gate
          </button>
        </div>
      </div>

      <DeskDisclaimer />
      <GateDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} gate={state.gate} />
    </div>
  );
};

export default DeskLayout;
