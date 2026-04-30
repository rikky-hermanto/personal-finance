import { ReactNode } from 'react';
import Sidebar from '@/components/Sidebar';
import ActivityPanel from '@/components/dashboard/ActivityPanel';
import { Transaction } from '@/types/Transaction';

interface AppShellProps {
  activeView: string;
  onViewChange: (view: string) => void;
  transactions: Transaction[];
  children: ReactNode;
}

const AppShell = ({ activeView, onViewChange, transactions, children }: AppShellProps) => {
  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <Sidebar activeView={activeView} onViewChange={onViewChange} />
      <main className="flex-1 overflow-auto min-w-0">
        {children}
      </main>
      <ActivityPanel transactions={transactions} />
    </div>
  );
};

export default AppShell;
