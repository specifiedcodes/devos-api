export interface AuditExportFilters {
  workspaceId: string;
  eventType?: string;
  actorId?: string;
  targetUserId?: string;
  dateFrom?: Date;
  dateTo?: Date;
}

export interface AuditExportResult {
  format: 'csv' | 'json';
  data: string;
  filename: string;
  rowCount: number;
}

export interface ComplianceReport {
  workspaceId: string;
  period: { from: string; to: string };
  summary: {
    totalEvents: number;
    totalLogins: number;
    successfulLogins: number;
    failedLogins: number;
    uniqueUsers: number;
    loginSuccessRate: number;
  };
  providerHealth: Array<{
    providerId: string;
    providerType: 'saml' | 'oidc';
    providerName: string;
    totalLogins: number;
    successfulLogins: number;
    failedLogins: number;
    successRate: number;
    lastSuccessfulLogin: string | null;
    lastError: string | null;
  }>;
  provisioningReport: {
    totalProvisioned: number;
    jitProvisioned: number;
    scimProvisioned: number;
    deactivated: number;
    updated: number;
  };
  enforcementReport: {
    enforcementEnabled: boolean;
    enforcementChanges: number;
    blockedLogins: number;
    bypassedLogins: number;
  };
}

export interface WebhookDeliveryPayload {
  id: string;
  event: {
    id: string;
    eventType: string;
    workspaceId: string;
    actorId: string | null;
    targetUserId: string | null;
    ipAddress: string | null;
    details: Record<string, unknown>;
    createdAt: string;
  };
  deliveredAt: string;
}

export interface AlertRuleEvaluationResult {
  ruleId: string;
  triggered: boolean;
  eventCount: number;
  threshold: number;
  windowMinutes: number;
}

export interface CreateAlertRuleParams {
  workspaceId: string;
  name: string;
  description?: string;
  eventTypes: string[];
  threshold: number;
  windowMinutes: number;
  notificationChannels: Array<{ type: string; target: string }>;
  cooldownMinutes?: number;
  actorId: string;
}

export interface UpdateAlertRuleParams {
  ruleId: string;
  workspaceId: string;
  name?: string;
  description?: string;
  eventTypes?: string[];
  threshold?: number;
  windowMinutes?: number;
  notificationChannels?: Array<{ type: string; target: string }>;
  isActive?: boolean;
  cooldownMinutes?: number;
  actorId: string;
}

export interface CreateWebhookParams {
  workspaceId: string;
  name: string;
  url: string;
  secret?: string;
  eventTypes?: string[];
  headers?: Record<string, string>;
  retryCount?: number;
  timeoutMs?: number;
  actorId: string;
}

export interface UpdateWebhookParams {
  webhookId: string;
  workspaceId: string;
  name?: string;
  url?: string;
  secret?: string;
  eventTypes?: string[];
  headers?: Record<string, string>;
  isActive?: boolean;
  retryCount?: number;
  timeoutMs?: number;
  actorId: string;
}
