import { NavLink, Outlet } from 'react-router-dom';
import { useTheme } from 'next-themes';
import { LogOut, Moon, Sun } from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { cn } from '@/lib/utils';

const links = [
  { to: '/cashflow/overview', label: 'Overview' },
  { to: '/cashflow/transactions', label: 'Transactions' },
  { to: '/cashflow/upload', label: 'Import' },
  { to: '/cashflow/accounts', label: 'Accounts' },
  { to: '/cashflow/statement', label: 'Statement' },
  { to: '/cashflow/analysis', label: 'Analysis' },
  { to: '/settings/categories', label: 'Categories' },
  { to: '/settings/data', label: 'Data settings' },
];

export default function CashflowPilotShell() {
  const { session, signOut } = useAuth();
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <div className="min-h-screen bg-background text-foreground md:flex">
      <aside className="border-b border-border bg-sidebar px-4 py-5 md:min-h-screen md:w-56 md:shrink-0 md:border-b-0 md:border-r">
        <div className="font-title text-xl">Personal Finance</div>
        <p className="mt-1 text-xs text-muted-foreground">Cashflow pilot</p>
        <nav aria-label="Pilot navigation" className="mt-7 flex gap-1 overflow-x-auto md:flex-col">
          {links.map(link => <NavLink key={link.to} to={link.to} className={({ isActive }) => cn(
            'whitespace-nowrap rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground',
            isActive && 'bg-secondary text-foreground font-medium',
          )}>{link.label}</NavLink>)}
        </nav>
        <div className="mt-8 border-t border-border pt-4 text-xs text-muted-foreground">
          <p className="truncate" title={session?.user.email}>{session?.user.email}</p>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')} className="rounded-md p-2 hover:bg-secondary" aria-label="Toggle theme">
              {resolvedTheme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <button type="button" onClick={() => { void signOut(); }} className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-secondary" aria-label="Sign out"><LogOut size={16} /> Sign out</button>
          </div>
        </div>
      </aside>
      <div className="min-w-0 flex-1 overflow-auto"><Outlet /></div>
    </div>
  );
}
