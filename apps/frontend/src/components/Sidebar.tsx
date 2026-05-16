import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Mountain, Settings, Menu, X, PiggyBank, Sun, Moon, Landmark, Bot, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useFocusMode } from '@/lib/focus-mode';
import { useTheme } from 'next-themes';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const AI_MODELS = [
  { id: 'gemini-31-pro-high', label: 'Gemini 3.1 Pro (High)' },
  { id: 'gemini-31-pro-low', label: 'Gemini 3.1 Pro (Low)' },
  { id: 'gemini-3-flash', label: 'Gemini 3 Flash' },
  { id: 'claude-sonnet-46-thinking', label: 'Claude Sonnet 4.6 (Thinking)' },
  { id: 'claude-opus-46-thinking', label: 'Claude Opus 4.6 (Thinking)' },
  { id: 'gpt-oss-120b', label: 'GPT-OSS 120B (Medium)' },
] as const;

const menuItems = [
  { id: 'journey', label: 'Journey', icon: Mountain, path: '/journey', matchPrefix: '/journey' },
  { id: 'assets', label: 'Assets', icon: Landmark, path: '/assets', matchPrefix: '/assets' },
  { id: 'cashflow', label: 'Cashflow', icon: PiggyBank, path: '/cashflow', matchPrefix: '/cashflow' },
  { id: 'investment', label: 'Investments', icon: TrendingUp, path: '/investment', matchPrefix: '/investment' },
];

const Sidebar = () => {
  const [collapsed, setCollapsed] = useState(false);
  const [activeModel, setActiveModel] = useState(AI_MODELS[0].id);
  const navigate = useNavigate();
  const location = useLocation();
  const { focused } = useFocusMode();
  const { theme, setTheme } = useTheme();
  const isDark = theme === 'dark';
  const toggleTheme = () => setTheme(isDark ? 'light' : 'dark');

  return (
    <div
      className={cn(
        'bg-sidebar h-full flex flex-col flex-shrink-0 transition-all duration-300 ease-in-out',
        collapsed ? 'w-14' : 'w-60',
        focused && 'focus-recessed'
      )}
    >
      {/* Header */}
      <div className="h-14 px-4 flex items-center justify-between">
        {!collapsed && (
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 bg-foreground/5 rounded flex items-center justify-center flex-shrink-0 border border-foreground/5">
              <PiggyBank className="w-4 h-4 text-foreground" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-foreground tracking-tight">Finance</div>
            </div>
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-1.5 rounded hover:bg-sidebar-accent transition-colors flex-shrink-0"
        >
          {collapsed
            ? <Menu className="w-3.5 h-3.5 text-sidebar-foreground" />
            : <X className="w-3.5 h-3.5 text-sidebar-foreground" />}
        </button>
      </div>

      {/* Journey hero CTA */}
      <div className={cn('px-3 pt-4 pb-2', collapsed && 'flex justify-center')}>
        <button
          onClick={() => navigate('/journey')}
          className={cn(
            'flex items-center gap-2 transition-all duration-200 border',
            location.pathname.startsWith('/journey')
              ? 'bg-foreground/10 border-foreground/15 text-foreground'
              : 'bg-foreground/5 hover:bg-foreground/10 text-foreground border-foreground/5',
            collapsed
              ? 'p-2 justify-center w-9 h-9 rounded-full mx-auto'
              : 'px-3 py-2 w-full text-xs font-medium rounded-lg'
          )}
          title={collapsed ? 'Journey' : undefined}
        >
          <Mountain className="w-4 h-4 flex-shrink-0" strokeWidth={1.5} />
          {!collapsed && <span>Journey</span>}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 pb-4 pt-2 overflow-y-auto">
        <ul className="space-y-0.5">
          {menuItems.filter(item => item.id !== 'journey').map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname.startsWith(item.matchPrefix);
            return (
              <li key={item.id}>
                <button
                  onClick={() => navigate(item.path)}
                  title={collapsed ? item.label : undefined}
                  className={cn(
                    'w-full flex items-center rounded-lg transition-all duration-150 group',
                    collapsed ? 'justify-center px-2 py-2' : 'px-3 py-2 gap-3',
                    isActive
                      ? 'bg-secondary text-foreground'
                      : 'text-sidebar-foreground hover:bg-foreground/5 hover:text-foreground'
                  )}
                >
                  <Icon
                    className={cn(
                      "w-4 h-4 flex-shrink-0 transition-colors",
                      isActive ? "text-foreground" : "text-inherit group-hover:text-foreground"
                    )}
                    strokeWidth={1.5}
                  />
                  {!collapsed && (
                    <span className="text-xs font-medium tracking-wide">{item.label}</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Theme toggle — above the divider */}
      <div className={cn('px-3 pb-2', collapsed ? 'flex justify-center' : '')}>
        <button
          onClick={toggleTheme}
          title={isDark ? 'Switch to Light' : 'Switch to Dark'}
          className={cn(
            'w-full flex items-center rounded-lg transition-colors duration-150 group',
            'text-sidebar-foreground hover:text-foreground',
            collapsed ? 'justify-center px-2 py-2' : 'px-3 py-2 gap-3'
          )}
        >
          {isDark
            ? <Sun className="w-4 h-4 flex-shrink-0" strokeWidth={1.5} />
            : <Moon className="w-4 h-4 flex-shrink-0" strokeWidth={1.5} />
          }
          {!collapsed && (
            <span className="text-xs font-medium tracking-wide">
              {isDark ? 'Light mode' : 'Dark mode'}
            </span>
          )}
        </button>
      </div>

      {/* AI Model selector */}
      <div className={cn('px-3 pb-2', collapsed ? 'flex justify-center' : '')}>
        {collapsed ? (
          <button
            title={AI_MODELS.find(m => m.id === activeModel)?.label}
            className="flex items-center justify-center px-2 py-2 rounded-lg text-sidebar-foreground hover:text-foreground transition-colors duration-150"
          >
            <Bot className="w-4 h-4 flex-shrink-0" strokeWidth={1.5} />
          </button>
        ) : (
          <div className="px-3 py-1 flex items-center gap-3">
            <Bot className="w-4 h-4 flex-shrink-0 text-sidebar-foreground" strokeWidth={1.5} />
            <Select value={activeModel} onValueChange={v => setActiveModel(v as typeof activeModel)}>
              <SelectTrigger className="flex-1 h-auto border-none shadow-none bg-transparent px-0 py-0 text-xs font-medium text-sidebar-foreground hover:text-foreground focus:ring-0 justify-start gap-1 [&>svg]:opacity-50 [&>svg]:w-3 [&>svg]:h-3 [&>svg]:flex-shrink-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AI_MODELS.map(m => (
                  <SelectItem key={m.id} value={m.id} className="text-xs">{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Settings — below the divider */}
      <div className="px-3 pb-4 pt-2 border-t border-sidebar-border">
        <button
          onClick={() => navigate('/settings')}
          title={collapsed ? 'Settings' : undefined}
          className={cn(
            'w-full flex items-center rounded-lg transition-all duration-150 group',
            collapsed ? 'justify-center px-2 py-2' : 'px-3 py-2 gap-3',
            location.pathname.startsWith('/settings')
              ? 'bg-secondary text-foreground'
              : 'text-sidebar-foreground hover:bg-foreground/5 hover:text-foreground'
          )}
        >
          <Settings
            className={cn(
              'w-4 h-4 flex-shrink-0 transition-colors',
              location.pathname.startsWith('/settings') ? 'text-foreground' : 'text-inherit group-hover:text-foreground'
            )}
            strokeWidth={1.5}
          />
          {!collapsed && <span className="text-xs font-medium tracking-wide">Settings</span>}
        </button>
      </div>
    </div>
  );
};

export default Sidebar;
