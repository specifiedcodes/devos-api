/**
 * Health Check DTOs
 * Story 14.5: Health Check Dashboard
 *
 * TypeScript interfaces for health check request/response types.
 */

export interface HealthProbeResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  responseTimeMs: number;
  details?: Record<string, unknown>;
  error?: string;
  lastChecked: string; // ISO timestamp
}

export interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  version: string;
  services: Record<string, HealthProbeResult>;
  summary: {
    total: number;
    healthy: number;
    degraded: number;
    unhealthy: number;
  };
}

export interface HealthLivenessDto {
  status: 'ok';
  timestamp: string;
  uptime: number;
}

export interface HealthReadinessDto {
  status: 'ready' | 'not_ready';
  timestamp: string;
  checks: Record<string, { status: string; responseTimeMs: number; error?: string }>;
}

export interface HealthHistoryEntry {
  timestamp: string;
  overallStatus: 'healthy' | 'degraded' | 'unhealthy';
  services: Record<string, 'healthy' | 'degraded' | 'unhealthy'>;
  totalResponseTimeMs: number;
}

export interface HealthIncident {
  startedAt: string;
  resolvedAt: string | null;
  duration: number; // seconds
  affectedServices: string[];
  severity: 'degraded' | 'unhealthy';
}

export interface HealthHistoryResponse {
  duration: '1h' | '6h' | '24h';
  entries: HealthHistoryEntry[];
  uptimePercentage: number;
  incidents: HealthIncident[];
}
