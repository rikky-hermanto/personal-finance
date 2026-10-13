import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

type AuthState = {
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [queryClient, setQueryClient] = useState(() => new QueryClient());
  const queryClientRef = useRef(queryClient);
  const identity = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    let authEventSeen = false;
    const applySession = (next: Session | null) => {
      if (!active) return;
      const nextIdentity = next?.user.id ?? null;
      if (identity.current !== nextIdentity) {
        void queryClientRef.current.cancelQueries();
        queryClientRef.current.clear();
        const nextClient = new QueryClient();
        queryClientRef.current = nextClient;
        setQueryClient(nextClient);
        identity.current = nextIdentity;
      }
      setSession(next);
      setLoading(false);
    };
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => {
      authEventSeen = true;
      applySession(next);
    });
    supabase.auth.getSession().then(({ data, error }) => {
      if (authEventSeen) return;
      applySession(error ? null : data.session);
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  return (
    <AuthContext.Provider value={{ session, loading, signOut }}>
      <QueryClientProvider client={queryClient}>
        <div key={session?.user.id ?? 'signed-out'} className="contents">{children}</div>
      </QueryClientProvider>
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('AuthProvider is required');
  return context;
}
