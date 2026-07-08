import { Outlet, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { Maximize2, Minimize2, Sparkles } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { FocusModeProvider, useFocusMode } from '@/lib/focus-mode';
import { useFocusModeShortcut } from '@/hooks/useFocusModeShortcut';
import { useAiPanelShortcut } from '@/hooks/useAiPanelShortcut';
import { ChatSessionProvider } from '@/hooks/useChatSession';
import Sidebar from '@/components/Sidebar';
import ActivityPanel from '@/components/dashboard/ActivityPanel';
import AiChatPanel from '@/components/chat/AiChatPanel';
import { cn } from '@/lib/utils';

const CHAT_OPEN_KEY = 'pf_chat_open';

const AppShellInner = () => {
  const { focused, toggle } = useFocusMode();
  const { resolvedTheme } = useTheme();
  const isLight = resolvedTheme === 'light';
  const isZen = focused && isLight;
  const { pathname } = useLocation();
  const isChatRoute = pathname.startsWith('/chat');

  const [chatOpen, setChatOpen] = useState<boolean>(() => {
    try {
      return localStorage.getItem(CHAT_OPEN_KEY) === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(CHAT_OPEN_KEY, String(chatOpen));
    } catch {
      // ignore
    }
  }, [chatOpen]);

  const toggleChat = () => setChatOpen((prev) => !prev);

  useFocusModeShortcut();
  useAiPanelShortcut(toggleChat);

  return (
    <div
      className={cn(
        'flex h-screen w-full overflow-hidden bg-sidebar',
        isZen && 'zen-canvas'
      )}
    >
      <Sidebar />
      <main className="flex-1 overflow-hidden min-w-0 flex flex-col relative">
        {/* AI chat + focus mode toggles — ghost buttons, top-right corner */}
        <div className="absolute top-4 right-4 z-10 flex items-center gap-1">
          {!isChatRoute && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={toggleChat}
                  className={cn(
                    'p-1.5 rounded-md transition-all duration-200',
                    'text-muted-foreground hover:text-foreground hover:bg-foreground/5',
                    chatOpen && 'text-success bg-success/10'
                  )}
                  aria-label="Ask AI — Ctrl+I"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="left" className="text-xs">
                Ask AI — ⌘I
              </TooltipContent>
            </Tooltip>
          )}
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
      {chatOpen && !isChatRoute ? <AiChatPanel onClose={toggleChat} /> : <ActivityPanel />}
    </div>
  );
};

const AppShell = () => (
  <FocusModeProvider>
    <ChatSessionProvider>
      <AppShellInner />
    </ChatSessionProvider>
  </FocusModeProvider>
);

export default AppShell;
