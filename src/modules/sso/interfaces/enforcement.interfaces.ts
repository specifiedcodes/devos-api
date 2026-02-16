export interface EnforcementStatus {
  workspaceId: string;
  enforced: boolean;
  passwordLoginBlocked: boolean;
  registrationBlocked: boolean;
  inGracePeriod: boolean;
  gracePeriodEnd: string | null;
  gracePeriodRemainingHours: number | null;
  enforcementMessage: string;
  activeProviderCount: number;
}

export interface EnforcementCheckResult {
  allowed: boolean;
  reason: 'not_enforced' | 'bypass_owner' | 'bypass_email' | 'bypass_service_account' | 'grace_period' | 'blocked';
  enforcementMessage?: string;
  redirectToSso?: boolean;
  ssoProviderHint?: string;
}

export interface EnableEnforcementParams {
  workspaceId: string;
  actorId: string;
  gracePeriodHours?: number;
  bypassEmails?: string[];
  ownerBypassEnabled?: boolean;
  bypassServiceAccounts?: boolean;
  enforcementMessage?: string;
}

export interface UpdateEnforcementParams {
  workspaceId: string;
  actorId: string;
  bypassEmails?: string[];
  ownerBypassEnabled?: boolean;
  bypassServiceAccounts?: boolean;
  enforcementMessage?: string;
  gracePeriodHours?: number;
}

export interface DisableEnforcementParams {
  workspaceId: string;
  actorId: string;
}

export interface GracePeriodExpiredEvent {
  workspaceId: string;
  policyId: string;
  enforcedBy: string | null;
}
