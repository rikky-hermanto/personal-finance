import { Outlet } from 'react-router-dom';
import Sidebar from '@/components/Sidebar';
import ActivityPanel from '@/components/dashboard/ActivityPanel';

const AppShell = () => {
  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <Sidebar />
      <main className="flex-1 overflow-auto min-w-0">
        <Outlet />
      </main>
      <ActivityPanel />
    </div>
  );
};

export default AppShell;

