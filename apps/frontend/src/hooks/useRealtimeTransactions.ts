import { useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from '@/auth/AuthProvider';

export interface TransactionInsert {
  id: number;
  date: string;
  description: string;
  amount_idr: number;
  flow: "DB" | "CR";
}

export function useRealtimeTransactions(onInsert: (row: TransactionInsert) => void) {
  const { session } = useAuth();
  const userId = session?.user.id;
  const token = session?.access_token;
  useEffect(() => {
    if (!userId || !token) return;
    void supabase.realtime.setAuth(token);
    const channel = supabase
      .channel(`transactions-inserts:${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "transactions", filter: `user_id=eq.${userId}` },
        (payload) => onInsert(payload.new as TransactionInsert)
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [onInsert, userId, token]);
}
