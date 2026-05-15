import { useLocation, useNavigate, Outlet } from 'react-router-dom';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

const TABS = [
  { value: 'overview',     label: 'Overview',     path: '/assets/overview'     },
  { value: 'accounts',     label: 'Accounts',     path: '/assets/accounts'     },
  { value: 'investments',  label: 'Investments',  path: '/assets/investments'  },
  { value: 'properties',   label: 'Properties',   path: '/assets/properties'   },
  { value: 'liabilities',  label: 'Liabilities',  path: '/assets/liabilities'  },
];

export default function AssetsLayout() {
  const location = useLocation();
  const navigate = useNavigate();

  const activeTab =
    TABS.find((t) => location.pathname.startsWith(t.path))?.value ?? 'overview';

  return (
    <div className="flex flex-col h-full bg-transparent">
      {/* Tab bar — same pattern as CashflowLayout */}
      <div className="flex items-center px-6 pt-6 pb-5 border-b border-border gap-6">
        <div className="flex items-baseline gap-3">
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Assets</h1>
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

      {/* Tab content */}
      <div className="flex-1 overflow-auto">
        <Outlet />
      </div>
    </div>
  );
}
