import { useEffect } from "react";
import { supabase } from "@/lib/supabase";

export interface TransactionInsert {
  id: number;
  date: string;
  description: string;
  amount_idr: number;
  flow: "DB" | "CR";
}

export function useRealtimeTransactions(onInsert: (row: TransactionInsert) => void) {
  useEffect(() => {
    const channel = supabase
      .channel("transactions-inserts")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "transactions" },
        (payload) => onInsert(payload.new as TransactionInsert)
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [onInsert]);
}
