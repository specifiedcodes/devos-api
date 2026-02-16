import { SsoProviderType, SessionTerminationReason } from '../../../database/entities/sso-federated-session.entity';

export interface CreateFederatedSessionParams {
  userId: string;
  workspaceId: string;
  providerType: SsoProviderType;
  providerConfigId: string;
  idpSessionId?: string;
  devosSessionId: string;
  accessTokenJti?: string;
  refreshTokenJti?: string;
  sessionTimeoutMinutes?: number;
  idleTimeoutMinutes?: number;
}

export interface FederatedSessionMetadata {
  sessionId: string;
  userId: string;
  workspaceId: string;
  providerType: SsoProviderType;
  providerConfigId: string;
  idpSessionId?: string;
  devosSessionId: string;
  idleTimeoutMinutes: number;
  createdAt: string;
  expiresAt: string;
  lastActivityAt: string;
  isExpired: boolean;
  isIdleExpired: boolean;
  remainingMinutes: number;
}

export interface SessionValidationResult {
  isValid: boolean;
  session?: FederatedSessionMetadata;
  reason?: 'active' | 'expired' | 'idle_expired' | 'terminated' | 'not_found';
}

export interface ForceReauthResult {
  terminatedCount: number;
  affectedUserIds: string[];
}

export interface SessionTimeoutConfig {
  sessionTimeoutMinutes: number;
  idleTimeoutMinutes: number;
}

export interface ActiveSessionSummary {
  totalActiveSessions: number;
  sessionsPerWorkspace: Record<string, number>;
  oldestSession: string | null;
  newestSession: string | null;
}

export interface WorkspaceSessionSummary {
  workspaceId: string;
  totalActiveSessions: number;
  activeUsers: number;
  sessionsByProvider: Record<string, number>;
}
