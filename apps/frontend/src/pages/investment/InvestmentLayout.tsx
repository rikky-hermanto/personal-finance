import { useLocation, useNavigate, Outlet } from 'react-router-dom';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

const TABS = [
  { value: 'overview',  label: 'Overview',  path: '/investment/overview' },
  { value: 'holdings',  label: 'Holdings',  path: '/investment/holdings' },
  { value: 'snapshots', label: 'Snapshots', path: '/investment/snapshots' },
  { value: 'ai-review', label: 'AI Review', path: '/investment/ai-review' },
];

const InvestmentLayout = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const activeTab = (() => {
    const p = location.pathname;
    if (p.includes('/review/')) return 'ai-review';
    const match = TABS.find((t) => p.startsWith(t.path));
    if (match) return match.value;
    // wizard + setup-detail pages belong to the overview flow
    return 'overview';
  })();

  return (
    <div className="flex flex-col h-full bg-transparent">
      <div className="flex items-center px-6 pt-6 pb-5 border-b border-border gap-6">
        <div className="flex items-baseline gap-3">
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Investments</h1>
        </div>
        <Tabs value={activeTab} onValueChange={(v) => {
          const tab = TABS.find((t) => t.value === v);
          if (tab) navigate(tab.path);
        }}>
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
};

export default InvestmentLayout;
