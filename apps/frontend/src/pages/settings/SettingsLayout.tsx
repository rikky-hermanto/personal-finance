import { useLocation, useNavigate, Outlet } from 'react-router-dom';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

const TABS = [
  { value: 'appearance', label: 'Appearance', path: '/settings/appearance', disabled: false },
  { value: 'categories', label: 'Categories', path: '/settings/categories', disabled: false },
  { value: 'regional', label: 'Regional', path: '/settings/regional', disabled: false },
  { value: 'data', label: 'Data', path: '/settings/data', disabled: false },
  { value: 'banks', label: 'Banks & Accounts', path: '/settings/banks', disabled: true },
  { value: 'rules', label: 'Rules', path: '/settings/rules', disabled: true },
  { value: 'profile', label: 'Profile', path: '/settings/profile', disabled: true },
];

const SettingsLayout = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const activeTab =
    TABS.find((t) => location.pathname.startsWith(t.path))?.value ?? 'appearance';

  return (
    <div className="flex flex-col h-full bg-transparent">
      {/* Tab bar */}
      <div className="flex items-center px-6 pt-6 pb-5 border-b border-border gap-6">
        <div className="flex items-baseline gap-3">
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Settings</h1>
        </div>
        <Tabs value={activeTab} onValueChange={(v) => {
          const tab = TABS.find((t) => t.value === v);
          if (tab && !tab.disabled) navigate(tab.path);
        }}>
          <TabsList className="bg-transparent h-auto p-0 gap-2 rounded-none border-none">
            {TABS.map((tab) => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                disabled={tab.disabled}
                className={cn(
                  'rounded-md px-4 py-1.5 text-xs font-medium transition-all duration-150',
                  'data-[state=active]:bg-secondary data-[state=active]:text-foreground data-[state=active]:shadow-none',
                  'data-[state=inactive]:text-muted-foreground hover:text-foreground hover:bg-foreground/5',
                  tab.disabled && 'opacity-30 cursor-not-allowed hover:bg-transparent'
                )}
              >
                {tab.label}
                {tab.disabled && (
                  <span className="ml-1.5 text-[10px] text-muted-foreground/50">soon</span>
                )}
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
};

export default SettingsLayout;
