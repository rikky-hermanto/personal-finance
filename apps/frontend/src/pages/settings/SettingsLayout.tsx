import { useLocation, useNavigate, Outlet } from 'react-router-dom';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

const TABS = [
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
    TABS.find((t) => location.pathname.startsWith(t.path))?.value ?? 'categories';

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Tab bar */}
      <div className="flex items-center px-6 pt-5 pb-0 border-b border-border gap-4">
        <div className="flex items-baseline gap-3 mr-4">
          <h1 className="text-xl font-semibold text-foreground">Settings</h1>
        </div>
        <Tabs value={activeTab} onValueChange={(v) => {
          const tab = TABS.find((t) => t.value === v);
          if (tab && !tab.disabled) navigate(tab.path);
        }}>
          <TabsList className="bg-transparent h-auto p-0 gap-0 rounded-none">
            {TABS.map((tab) => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                disabled={tab.disabled}
                className={cn(
                  'bg-transparent rounded-none border-b-2 px-4 pb-3 pt-1 text-xs font-medium transition-colors',
                  'data-[state=active]:border-foreground data-[state=active]:text-foreground data-[state=active]:shadow-none',
                  'data-[state=inactive]:border-transparent data-[state=inactive]:text-muted-foreground',
                  'hover:text-foreground',
                  tab.disabled && 'opacity-40 cursor-not-allowed hover:text-muted-foreground'
                )}
              >
                {tab.label}
                {tab.disabled && (
                  <span className="ml-1.5 text-[10px] text-muted-foreground/70">soon</span>
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
