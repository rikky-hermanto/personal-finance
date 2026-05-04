import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { BarChart3, TrendingUp, Settings, Menu, X, Plus, PiggyBank } from 'lucide-react';
import { cn } from '@/lib/utils';

const menuItems = [
  { id: 'dashboard', label: 'Dashboard', icon: BarChart3, path: '/dashboard', matchPrefix: '/dashboard' },
  { id: 'cashflow', label: 'Cashflow', icon: PiggyBank, path: '/cashflow', matchPrefix: '/cashflow' },
  { id: 'settings', label: 'Settings', icon: Settings, path: '/settings', matchPrefix: '/settings' },
];

const Sidebar = () => {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <div
      className={cn(
        'bg-sidebar h-full flex flex-col flex-shrink-0 transition-all duration-300 ease-in-out',
        collapsed ? 'w-14' : 'w-60'
      )}
    >
      {/* Header */}
      <div className="h-14 px-4 flex items-center justify-between">
        {!collapsed && (
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 bg-white/5 rounded flex items-center justify-center flex-shrink-0 border border-white/5">
              <PiggyBank className="w-4 h-4 text-white" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-white tracking-tight">Finance</div>
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

      {/* New upload CTA */}
      <div className={cn('px-3 pt-4 pb-2', collapsed && 'flex justify-center')}>
        <button
          onClick={() => navigate('/cashflow/upload')}
          className={cn(
            'flex items-center gap-2 transition-all duration-200 bg-white/5 hover:bg-white/10 text-white border border-white/5',
            collapsed
              ? 'p-2 justify-center w-9 h-9 rounded-full mx-auto'
              : 'px-3 py-2 w-full text-xs font-medium rounded-lg'
          )}
          title={collapsed ? 'New upload' : undefined}
        >
          <Plus className="w-4 h-4 flex-shrink-0" />
          {!collapsed && <span>New upload</span>}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 pb-4 pt-2 overflow-y-auto">
        <ul className="space-y-0.5">
          {menuItems.map((item) => {
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
                      ? 'bg-secondary text-white'
                      : 'text-sidebar-foreground hover:bg-white/5 hover:text-white'
                  )}
                >
                  <Icon className={cn("w-4 h-4 flex-shrink-0 transition-colors", isActive ? "text-white" : "text-inherit group-hover:text-white")} strokeWidth={1.5} />
                  {!collapsed && (
                    <span className="text-xs font-medium tracking-wide">{item.label}</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
};

export default Sidebar;
