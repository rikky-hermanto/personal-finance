import React, { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, AlertCircle, RefreshCw, Activity } from 'lucide-react';
import { getSystemHealth, mapHealthResponse, ServiceStatus } from '@/api/statusApi';
import { cn } from '@/lib/utils';

const ServiceCard = ({ service }: { service: ServiceStatus }) => {
  return (
    <div className="bg-card border rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow flex items-center justify-between">
      <div className="flex items-center gap-4">
        <div className={cn(
          "w-12 h-12 rounded-full flex items-center justify-center",
          service.status === 'online' ? "bg-emerald-500/10 text-emerald-500" :
          service.status === 'offline' ? "bg-rose-500/10 text-rose-500" :
          "bg-amber-500/10 text-amber-500"
        )}>
          {service.status === 'online' ? (
            <CheckCircle2 className="w-6 h-6" />
          ) : service.status === 'offline' ? (
            <XCircle className="w-6 h-6" />
          ) : (
            <AlertCircle className="w-6 h-6" />
          )}
        </div>
        <div>
          <h3 className="text-lg font-semibold text-foreground">{service.name}</h3>
          <p className="text-sm text-muted-foreground">{service.message || 'Operational'}</p>
        </div>
      </div>
      
      <div className="text-right">
        <div className={cn(
          "px-3 py-1 rounded-full text-xs font-medium inline-flex items-center gap-1.5 mb-1",
          service.status === 'online' ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20" :
          service.status === 'offline' ? "bg-rose-500/10 text-rose-500 border border-rose-500/20" :
          "bg-amber-500/10 text-amber-500 border border-amber-500/20"
        )}>
          <span className={cn(
            "w-2 h-2 rounded-full animate-pulse",
            service.status === 'online' ? "bg-emerald-500" :
            service.status === 'offline' ? "bg-rose-500" :
            "bg-amber-500"
          )} />
          {service.status.charAt(0).toUpperCase() + service.status.slice(1)}
        </div>
        <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground/60">
          Response: {service.duration}
        </p>
      </div>
    </div>
  );
};

export default function StatusPage() {
  const [services, setServices] = useState<ServiceStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  const fetchStatus = async () => {
    try {
      setLoading(true);
      const data = await getSystemHealth();
      setServices(mapHealthResponse(data));
      setLastUpdated(new Date());
      setError(null);
    } catch (err) {
      console.error(err);
      setError('Failed to reach backend health service');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 30000); // Poll every 30s
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-card border border-white/[0.03] rounded-[32px] shadow-2xl p-10 space-y-10">
        <header className="flex justify-between items-end">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">System Health</h1>
            <p className="text-sm text-muted-foreground mt-1">Real-time status of all service endpoints.</p>
          </div>
          <button 
            onClick={fetchStatus}
            disabled={loading}
            className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 flex items-center gap-2 mb-1"
          >
            <RefreshCw className={cn("w-3 h-3", loading && "animate-spin")} />
            {lastUpdated.toLocaleTimeString()}
          </button>
        </header>

        {error && (
          <div className="bg-rose-500/5 border border-rose-500/10 text-rose-500 p-4 rounded-xl flex items-center gap-3 text-sm">
            <XCircle className="w-4 h-4" />
            {error}
          </div>
        )}

        <section className="space-y-6">
          <h2 className="text-[10px] font-black text-muted-foreground/40 uppercase tracking-[0.2em] px-1">
            Service Endpoints
          </h2>
          <div className="space-y-2">
            {loading && services.length === 0 ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="p-4 h-16 animate-pulse bg-white/[0.01] rounded-xl" />
              ))
            ) : (
              services.map(service => (
                <div key={service.name} className="p-4 flex items-center justify-between hover:bg-white/[0.01] rounded-xl transition-colors group">
                  <div className="flex items-center gap-5">
                    <div className={cn(
                      "w-2 h-2 rounded-full",
                      service.status === 'online' ? "bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]" :
                      service.status === 'offline' ? "bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.5)]" :
                      "bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.5)]"
                    )} />
                    <div>
                      <h3 className="text-sm font-semibold tracking-tight">{service.name}</h3>
                      <p className="text-[11px] text-muted-foreground/60 mt-0.5 line-clamp-1">{service.message || 'All systems normal'}</p>
                    </div>
                  </div>
                  
                  <div className="text-right">
                    <span className={cn(
                      "text-[10px] font-black uppercase tracking-widest",
                      service.status === 'online' ? "text-emerald-500" :
                      service.status === 'offline' ? "text-rose-500" :
                      "text-amber-500"
                    )}>
                      {service.status}
                    </span>
                    <p className="text-[9px] text-muted-foreground/20 font-mono mt-0.5">
                      {service.duration}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <footer className="pt-4 border-t border-white/[0.02] flex justify-between items-center">
          <p className="text-[9px] uppercase tracking-[0.2em] font-bold text-muted-foreground/20">
            Internal Monitoring • v0.1.0
          </p>
          <a href="/" className="text-[10px] font-bold text-muted-foreground/40 hover:text-primary transition-colors">
            Return to Dashboard
          </a>
        </footer>
      </div>
    </div>
  );
}
