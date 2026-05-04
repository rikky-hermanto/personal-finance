import { Outlet } from 'react-router-dom';
import Sidebar from '@/components/Sidebar';
import ActivityPanel from '@/components/dashboard/ActivityPanel';

const AppShell = () => {
  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <Sidebar />
      <main className="flex-1 overflow-hidden min-w-0 flex flex-col relative">
        <div className="flex-1 overflow-hidden mt-2 mr-2 rounded-t-[24px] bg-card border border-white/[0.03] shadow-2xl flex flex-col">
          <div className="flex-1 overflow-auto min-w-0">
            <Outlet />
          </div>
        </div>
      </main>
      <ActivityPanel />
    </div>
  );
};

export default AppShell;

