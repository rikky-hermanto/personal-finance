const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:7208";

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

  // Add Frontend as a pseudo-service (if we're here, it's online)
  services.push({
    name: 'Frontend Application',
    status: 'online',
    duration: '0ms',
    message: 'Operational'
  });

  return services;
}
