const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:7208";
const AI_SERVICE_URL = import.meta.env.VITE_AI_SERVICE_URL || "http://localhost:8000";

// Local dev hosts for services without a frontend-facing base URL env var (see Ports & URLs in CLAUDE.md).
export const SERVICE_URLS: Record<string, string> = {
  "Backend API": `${API_BASE_URL}/health`, // no landing page at root, health check is what's actually live
  "Database": "http://localhost:54323", // Supabase Studio
  "AI Service": `${AI_SERVICE_URL}/docs`, // FastAPI interactive docs
  "Grafana Monitoring": "http://localhost:3000",
  "Frontend Application": typeof window !== "undefined" ? window.location.origin : "http://localhost:8080",
};

export interface HealthEntry {
  status: 'Healthy' | 'Unhealthy' | 'Degraded';
  duration: string;
  description?: string;
  data: Record<string, any>;
}

export interface HealthResponse {
  status: 'Healthy' | 'Unhealthy' | 'Degraded';
  totalDuration: string;
  entries: Record<string, HealthEntry>;
}

export interface ServiceStatus {
  name: string;
  status: 'online' | 'offline' | 'degraded';
  duration: string;
  message?: string;
}

export async function getSystemHealth(): Promise<HealthResponse> {
  const res = await fetch(`${API_BASE_URL}/health`);
  if (!res.ok && res.status !== 503) {
    // 503 is returned by health checks if unhealthy, but we still want the JSON
    throw new Error('Failed to fetch system health');
  }
  return res.json();
}

export function mapHealthResponse(data: HealthResponse): ServiceStatus[] {
  const services: ServiceStatus[] = Object.entries(data.entries).map(([name, entry]) => ({
    name,
    status: entry.status === 'Healthy' ? 'online' : entry.status === 'Unhealthy' ? 'offline' : 'degraded',
    duration: entry.duration,
    message: entry.description
  }));

  // Add Backend API (if we got a response, it's online)
  services.unshift({
    name: 'Backend API',
    status: 'online',
    duration: data.totalDuration,
    message: 'System is responsive'
  });

  // Add Frontend as a pseudo-service (if we're here, it's online)
  services.push({
    name: 'Frontend Application',
    status: 'online',
    duration: '0ms',
    message: 'Operational'
  });

  return services;
}
