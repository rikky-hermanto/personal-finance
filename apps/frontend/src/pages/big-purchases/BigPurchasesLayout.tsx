import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

const TABS = [
  { value: 'plans', label: 'Plans', path: '/big-purchases/plans' },
  { value: 'achieved', label: 'Achieved', path: '/big-purchases/achieved' },
];

/** Big Purchases (PF-154, Growth · L3). Same tab pattern as AssetsLayout; the tabs render no h1 of their own. */
export default function BigPurchasesLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const activeTab = TABS.find((t) => location.pathname.startsWith(t.path))?.value ?? 'plans';

  return (
    <div className="flex flex-col h-full bg-transparent">
      <div className="flex items-center px-6 pt-6 pb-5 gap-6">
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Big Purchases</h1>
        <Tabs
          value={activeTab}
          onValueChange={(v) => {
            const tab = TABS.find((t) => t.value === v);
            if (tab) navigate(tab.path);
          }}
        >
          <TabsList className="bg-transparent h-auto p-0 gap-2 rounded-none border-none">
            {TABS.map((tab) => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className={cn(
                  'rounded-md px-4 py-1.5 text-xs font-medium transition-all duration-150',
                  'data-[state=active]:bg-secondary data-[state=active]:text-foreground data-[state=active]:shadow-none',
                  'data-[state=inactive]:text-muted-foreground hover:text-foreground hover:bg-foreground/5',
                )}
              >
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>
      <div className="flex-1 overflow-auto">
        <Outlet />
      </div>
    </div>
  );
}
