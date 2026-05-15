import { Outlet } from 'react-router-dom';
import { useTheme } from 'next-themes';
import { Maximize2, Minimize2 } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { FocusModeProvider, useFocusMode } from '@/lib/focus-mode';
import { useFocusModeShortcut } from '@/hooks/useFocusModeShortcut';
import Sidebar from '@/components/Sidebar';
import ActivityPanel from '@/components/dashboard/ActivityPanel';
import { cn } from '@/lib/utils';

const AppShellInner = () => {
  const { focused, toggle } = useFocusMode();
  const { resolvedTheme } = useTheme();
  const isLight = resolvedTheme === 'light';
  const isZen = focused && isLight;

  useFocusModeShortcut();

  return (
    <div
      className={cn(
        'flex h-screen w-full overflow-hidden bg-background',
        isZen && 'zen-canvas'
      )}
    >
      <Sidebar />
      <main className="flex-1 overflow-hidden min-w-0 flex flex-col relative">
        {/* Focus mode toggle — ghost button, top-right corner */}
        <div className="absolute top-4 right-4 z-10">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={toggle}
                className={cn(
                  'p-1.5 rounded-md transition-all duration-200',
                  'text-muted-foreground hover:text-foreground hover:bg-foreground/5',
                  focused && 'text-foreground bg-foreground/5'
                )}
                aria-label={focused ? 'Exit focus mode' : 'Enter focus mode'}
              >
                {focused
                  ? <Minimize2 className="w-3.5 h-3.5" />
                  : <Maximize2 className="w-3.5 h-3.5" />
                }
              </button>
            </TooltipTrigger>
            <TooltipContent side="left" className="text-xs">
              {focused ? 'Exit focus mode' : 'Focus mode'} — ⌘.
            </TooltipContent>
          </Tooltip>
        </div>

        <div className={cn(
          'flex-1 overflow-hidden mt-2 mr-2 rounded-t-[24px] bg-card border border-foreground/[0.04] flex flex-col',
          !isZen && 'shadow-2xl',
          isZen && 'shadow-sm'
        )}>
          <div className="flex-1 overflow-auto min-w-0">
            <Outlet />
          </div>
        </div>
      </main>
      <ActivityPanel />
    </div>
  );
};

const AppShell = () => (
  <FocusModeProvider>
    <AppShellInner />
  </FocusModeProvider>
);

export default AppShell;
