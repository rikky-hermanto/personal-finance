import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { BarChart3, Upload, List, PieChart, Settings, Menu, X, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

const menuItems = [
  { id: 'dashboard', label: 'Dashboard', icon: BarChart3, path: '/dashboard' },
  { id: 'upload', label: 'Upload', icon: Upload, path: '/upload' },
  { id: 'transactions', label: 'Transactions', icon: List, path: '/transactions' },
  { id: 'categories', label: 'Categories', icon: PieChart, path: '/categories' },
  { id: 'settings', label: 'Settings', icon: Settings, path: '/settings' },
];

const Sidebar = () => {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <div
      className={cn(
        'bg-sidebar border-r border-sidebar-border h-screen flex flex-col flex-shrink-0 transition-all duration-200 ease-in-out',
        collapsed ? 'w-14' : 'w-52'
      )}
    >
      {/* Header */}
      <div className="h-14 px-3 flex items-center justify-between border-b border-sidebar-border">
        {!collapsed && (
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 bg-foreground/10 rounded flex items-center justify-center flex-shrink-0">
              <BarChart3 className="w-3.5 h-3.5 text-sidebar-primary" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-sidebar-primary leading-none">Finance</div>
              <div className="text-[10px] text-sidebar-foreground mt-0.5 leading-none">Personal tracker</div>
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
          onClick={() => navigate('/upload')}
          className={cn(
            'flex items-center gap-2 rounded-md transition-colors bg-foreground/8 hover:bg-foreground/12 text-sidebar-primary border border-sidebar-border',
            collapsed
              ? 'p-2 justify-center w-8 h-8'
              : 'px-3 py-1.5 w-full text-xs font-medium'
          )}
          title={collapsed ? 'New upload' : undefined}
        >
          <Plus className="w-3.5 h-3.5 flex-shrink-0" />
          {!collapsed && <span>New upload</span>}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 pb-4 pt-2 overflow-y-auto">
        <ul className="space-y-0.5">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <li key={item.id}>
                <button
                  onClick={() => navigate(item.path)}
                  title={collapsed ? item.label : undefined}
                  className={cn(
                    'w-full flex items-center rounded-md transition-colors',
                    collapsed ? 'justify-center px-2 py-2' : 'px-3 py-2 gap-2.5',
                    isActive
                      ? 'bg-sidebar-accent text-sidebar-primary'
                      : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                  )}
                >
                  <Icon className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={1.5} />
                  {!collapsed && (
                    <span className="text-xs font-medium">{item.label}</span>
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
