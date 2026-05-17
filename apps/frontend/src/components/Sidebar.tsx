import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Mountain, Settings, Menu, X, PiggyBank, Sun, Moon, Landmark, Bot, TrendingUp,
  Wallet, Receipt, Shield, Target, Flame, Coins, ScrollText, FileText, Briefcase,
} from 'lucide-react';
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

const navSections = [
  {
    level: 'L1', label: 'Foundations', color: 'rgb(100 116 139)',
    items: [
      { id: 'cashflow',    label: 'Cashflow',            icon: PiggyBank,  path: '/cashflow',    matchPrefix: '/cashflow',    live: true  },
      { id: 'budgeting',   label: 'Budgeting',           icon: Wallet,     path: '/budgeting',   matchPrefix: '/budgeting',   live: false },
      { id: 'bills',       label: 'Recurring',             icon: Receipt,  path: '/bills',       matchPrefix: '/bills',       live: false },
    ],
  },
  {
    level: 'L2', label: 'Defense', color: 'rgb(76 175 80)',
    items: [
      { id: 'assets',          label: 'Assets',         icon: Landmark, path: '/assets',          matchPrefix: '/assets',          live: true  },
      { id: 'emergency-fund',  label: 'Emergency Fund', icon: Shield,   path: '/emergency-fund',  matchPrefix: '/emergency-fund',  live: false },
    ],
  },
  {
    level: 'L3', label: 'Growth', color: 'rgb(56 142 60)',
    items: [
      { id: 'investment',  label: 'Investments',   icon: TrendingUp, path: '/investment',  matchPrefix: '/investment',  live: true  },
      { id: 'goals',       label: 'Savings Goals', icon: Target,     path: '/goals',       matchPrefix: '/goals',       live: false },
    ],
  },
  {
    level: 'L4', label: 'Freedom', color: 'rgb(46 125 50)',
    items: [
      { id: 'fire',           label: 'FIRE Calculator', icon: Flame, path: '/fire',           matchPrefix: '/fire',           live: false },
      { id: 'passive-income', label: 'Passive Income',  icon: Coins, path: '/passive-income', matchPrefix: '/passive-income', live: false },
    ],
  },
  {
    level: 'L5', label: 'Legacy', color: 'rgb(27 94 32)',
    items: [
      { id: 'estate',     label: 'Estate Planning', icon: ScrollText, path: '/estate',     matchPrefix: '/estate',     live: false },
      { id: 'succession', label: 'Succession',      icon: Briefcase,  path: '/succession', matchPrefix: '/succession', live: false },
      { id: 'tax',        label: 'Tax Planning',    icon: FileText,   path: '/tax',        matchPrefix: '/tax',        live: false },
    ],
  },
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
      <nav className="flex-1 pb-4 pt-2 overflow-y-auto">
        {!collapsed ? (
          <div className="px-3">
            {navSections.map((section, sIdx) => {
              const hasLive = section.items.some(i => i.live);
              const isLast = sIdx === navSections.length - 1;
              return (
                <div key={section.level} className="flex gap-0">
                  {/* Left: dot + connecting line */}
                  <div className="flex flex-col items-center w-5 flex-shrink-0 pt-[12px]">
                    <div
                      className="w-[7px] h-[7px] rounded-full flex-shrink-0 relative z-10"
                      style={{ backgroundColor: section.color }}
                    />
                    {!isLast && (
                      <div
                        className="flex-1 mt-1 mb-0"
                        style={{ width: '1.5px', borderLeft: '1.5px dashed rgba(150,150,150,0.18)' }}
                      />
                    )}
                  </div>

                  {/* Right: section label + items */}
                  <div className="flex-1 min-w-0 pb-2">
                    <div className="pl-2 pt-1 pb-0.5">
                      <span
                        className="text-[10px] font-semibold tracking-widest uppercase"
                        style={{ color: section.color }}
                      >
                        {section.label}
                      </span>
                    </div>
                    <ul className="space-y-0.5">
                      {section.items.map((item) => {
                        const Icon = item.icon;
                        const isActive = item.live && location.pathname.startsWith(item.matchPrefix);
                        return (
                          <li key={item.id}>
                            <button
                              onClick={() => item.live && navigate(item.path)}
                              disabled={!item.live}
                              className={cn(
                                'w-full flex items-center justify-start text-left rounded-lg transition-all duration-150 group px-2 py-1.5 gap-2.5',
                                !item.live && 'opacity-45 cursor-default',
                                isActive
                                  ? 'bg-secondary text-foreground'
                                  : item.live
                                    ? 'text-sidebar-foreground hover:bg-foreground/5 hover:text-foreground'
                                    : 'text-sidebar-foreground'
                              )}
                            >
                              <Icon
                                className={cn(
                                  'w-4 h-4 flex-shrink-0 transition-colors',
                                  isActive ? 'text-foreground' : 'text-inherit',
                                  item.live && !isActive && 'group-hover:text-foreground'
                                )}
                                strokeWidth={1.5}
                              />
                              <span className="flex-1 text-xs font-medium tracking-wide">{item.label}</span>
                              {!item.live && (
                                <span className="text-[9px] font-semibold tracking-wider uppercase px-1.5 py-0.5 rounded bg-foreground/6 text-foreground/40">
                                  soon
                                </span>
                              )}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Collapsed mode — icons only, dividers between sections */
          <div className="px-3 space-y-3">
            {navSections.map((section, sIdx) => (
              <div key={section.level}>
                {sIdx > 0 && <div className="mx-2 mb-2 border-t border-sidebar-border opacity-40" />}
                <ul className="space-y-0.5">
                  {section.items.map((item) => {
                    const Icon = item.icon;
                    const isActive = item.live && location.pathname.startsWith(item.matchPrefix);
                    return (
                      <li key={item.id}>
                        <button
                          onClick={() => item.live && navigate(item.path)}
                          title={item.label}
                          disabled={!item.live}
                          className={cn(
                            'w-full flex items-center justify-center rounded-lg transition-all duration-150 group px-2 py-2',
                            !item.live && 'opacity-45 cursor-default',
                            isActive
                              ? 'bg-secondary text-foreground'
                              : item.live
                                ? 'text-sidebar-foreground hover:bg-foreground/5 hover:text-foreground'
                                : 'text-sidebar-foreground'
                          )}
                        >
                          <Icon
                            className={cn(
                              'w-4 h-4 flex-shrink-0 transition-colors',
                              isActive ? 'text-foreground' : 'text-inherit',
                              item.live && !isActive && 'group-hover:text-foreground'
                            )}
                            strokeWidth={1.5}
                          />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
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
