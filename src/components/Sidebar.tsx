
import { useState } from 'react';
import { Upload, BarChart3, List, Settings, PieChart, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SidebarProps {
  activeView: string;
  onViewChange: (view: string) => void;
}

const Sidebar = ({ activeView, onViewChange }: SidebarProps) => {
  const [collapsed, setCollapsed] = useState(false);

  const menuItems = [
    { id: 'dashboard', label: 'Overview', icon: BarChart3 },
    { id: 'upload', label: 'Import', icon: Upload },
    { id: 'transactions', label: 'Transactions', icon: List },
    { id: 'categories', label: 'Categories', icon: PieChart },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <div className={cn(
      "bg-white border-r border-gray-100 h-screen flex flex-col transition-all duration-200",
      collapsed ? "w-16" : "w-64"
    )}>
      <div className="p-6 border-b border-gray-50 flex items-center justify-between">
        {!collapsed && (
          <div>
            <h1 className="text-lg font-medium text-gray-900">Finance</h1>
            <p className="text-xs text-gray-500 mt-0.5">Personal tracker</p>
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-1.5 rounded-md hover:bg-gray-50 text-gray-400 hover:text-gray-600 transition-colors"
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>
      
      <nav className="flex-1 px-3 py-6">
        <ul className="space-y-1">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeView === item.id;
            return (
              <li key={item.id}>
                <button
                  onClick={() => onViewChange(item.id)}
                  className={cn(
                    "w-full flex items-center text-left rounded-lg transition-all duration-150 group",
                    collapsed ? "px-3 py-3 justify-center" : "px-3 py-2.5",
                    isActive
                      ? "bg-gray-900 text-white shadow-sm"
                      : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                  )}
                  title={collapsed ? item.label : undefined}
                >
                  <Icon className={cn(
                    "w-4 h-4 flex-shrink-0",
                    !collapsed && "mr-3"
                  )} />
                  {!collapsed && (
                    <span className="text-sm font-medium">{item.label}</span>
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
