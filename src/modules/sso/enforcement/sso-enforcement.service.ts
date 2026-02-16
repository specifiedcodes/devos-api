import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual, IsNull, Not, In } from 'typeorm';
import { SsoEnforcementPolicy } from '../../../database/entities/sso-enforcement-policy.entity';
import { SamlConfiguration } from '../../../database/entities/saml-configuration.entity';
import { OidcConfiguration } from '../../../database/entities/oidc-configuration.entity';
import { Workspace } from '../../../database/entities/workspace.entity';
import { WorkspaceMember, WorkspaceRole } from '../../../database/entities/workspace-member.entity';
import { SsoAuditService } from '../sso-audit.service';
import { SsoAuditEventType } from '../../../database/entities/sso-audit-event.entity';
import { RedisService } from '../../redis/redis.service';
import { DomainVerificationService } from '../domain/domain-verification.service';
import { DomainStatus } from '../../../database/entities/sso-domain.entity';
import { SSO_ENFORCEMENT_CONSTANTS } from '../constants/enforcement.constants';
import {
  EnforcementStatus,
  EnforcementCheckResult,
  EnableEnforcementParams,
  UpdateEnforcementParams,
  DisableEnforcementParams,
} from '../interfaces/enforcement.interfaces';

@Injectable()
export class SsoEnforcementService {
  private readonly logger = new Logger(SsoEnforcementService.name);

  constructor(
    @InjectRepository(SsoEnforcementPolicy)
    private readonly enforcementPolicyRepository: Repository<SsoEnforcementPolicy>,
    @InjectRepository(SamlConfiguration)
    private readonly samlConfigRepository: Repository<SamlConfiguration>,
    @InjectRepository(OidcConfiguration)
    private readonly oidcConfigRepository: Repository<OidcConfiguration>,
    @InjectRepository(Workspace)
    private readonly workspaceRepository: Repository<Workspace>,
    @InjectRepository(WorkspaceMember)
    private readonly workspaceMemberRepository: Repository<WorkspaceMember>,
    private readonly redisService: RedisService,
    private readonly ssoAuditService: SsoAuditService,
    private readonly domainVerificationService: DomainVerificationService,
  ) {}

  /**
   * Get the enforcement status for a workspace.
   * Checks Redis cache first, falls back to PostgreSQL.
   */
  async getEnforcementStatus(workspaceId: string): Promise<EnforcementStatus> {
    // Try Redis cache first
    const cacheKey = `${SSO_ENFORCEMENT_CONSTANTS.REDIS_ENFORCEMENT_PREFIX}${workspaceId}`;
    const cached = await this.redisService.get(cacheKey);
    if (cached) {
      return JSON.parse(cached) as EnforcementStatus;
    }

    // Cache miss: query PostgreSQL
    const policy = await this.enforcementPolicyRepository.findOne({
      where: { workspaceId },
    });

    // Count active SSO providers
    const activeProviderCount = await this.countActiveProviders(workspaceId);

    if (!policy) {
      const defaultStatus: EnforcementStatus = {
        workspaceId,
        enforced: false,
        passwordLoginBlocked: false,
        registrationBlocked: false,
        inGracePeriod: false,
        gracePeriodEnd: null,
        gracePeriodRemainingHours: null,
        enforcementMessage: SSO_ENFORCEMENT_CONSTANTS.DEFAULT_ENFORCEMENT_MESSAGE,
        activeProviderCount,
      };

      // Cache the result
      await this.redisService.set(
        cacheKey,
        JSON.stringify(defaultStatus),
        SSO_ENFORCEMENT_CONSTANTS.ENFORCEMENT_CACHE_TTL_SECONDS,
      );

      return defaultStatus;
    }

    // Calculate grace period details
    const now = new Date();
    const inGracePeriod = !!(
      policy.enforced &&
      policy.gracePeriodEnd &&
      now < policy.gracePeriodEnd
    );
    const gracePeriodRemainingHours = inGracePeriod && policy.gracePeriodEnd
      ? Math.max(0, Math.ceil((policy.gracePeriodEnd.getTime() - now.getTime()) / (1000 * 60 * 60)))
      : null;

    // Determine if password login is blocked
    const passwordLoginBlocked = policy.enforced && (
      !policy.gracePeriodEnd || now >= policy.gracePeriodEnd
    );

    const status: EnforcementStatus = {
      workspaceId,
      enforced: policy.enforced,
      passwordLoginBlocked,
      registrationBlocked: policy.registrationBlocked,
      inGracePeriod,
      gracePeriodEnd: policy.gracePeriodEnd ? policy.gracePeriodEnd.toISOString() : null,
      gracePeriodRemainingHours,
      enforcementMessage: policy.enforcementMessage || SSO_ENFORCEMENT_CONSTANTS.DEFAULT_ENFORCEMENT_MESSAGE,
      activeProviderCount,
    };

    // Cache result
    await this.redisService.set(
      cacheKey,
      JSON.stringify(status),
      SSO_ENFORCEMENT_CONSTANTS.ENFORCEMENT_CACHE_TTL_SECONDS,
    );

    return status;
  }

  /**
   * Check if a password login attempt should be allowed or blocked by SSO enforcement.
   */
  async checkLoginEnforcement(
    email: string,
    workspaceId: string,
  ): Promise<EnforcementCheckResult> {
    const status = await this.getEnforcementStatus(workspaceId);

    if (!status.enforced) {
      return { allowed: true, reason: 'not_enforced' };
    }

    // Load workspace and policy in parallel to avoid redundant DB round trip
    const [workspace, policy] = await Promise.all([
      this.workspaceRepository.findOne({ where: { id: workspaceId } }),
      this.enforcementPolicyRepository.findOne({ where: { workspaceId } }),
    ]);

    if (workspace && policy) {
      if (policy.ownerBypassEnabled) {
        // Check if the email belongs to the workspace owner
        const ownerMember = await this.workspaceMemberRepository.findOne({
          where: { workspaceId, userId: workspace.ownerUserId },
          relations: ['user'],
        });

        if (ownerMember?.user?.email?.toLowerCase() === email.toLowerCase()) {
          return { allowed: true, reason: 'bypass_owner' };
        }
      }

      // Check bypass: email list
      if (policy.bypassEmails.map(e => e.toLowerCase()).includes(email.toLowerCase())) {
        return { allowed: true, reason: 'bypass_email' };
      }

      // Check grace period
      if (status.inGracePeriod) {
        return { allowed: true, reason: 'grace_period' };
      }
    }

    // Blocked: get SSO provider hint via domain lookup
    const domain = email.split('@')[1]?.toLowerCase();
    let ssoProviderHint: string | undefined;
    if (domain) {
      const domainLookup = await this.domainVerificationService.lookupDomain(domain);
      if (domainLookup) {
        ssoProviderHint = domainLookup.providerName || domainLookup.providerType;
      }
    }

    // Log blocked login attempt (fire-and-forget)
    void this.ssoAuditService.logEvent({
      workspaceId,
      eventType: SsoAuditEventType.ENFORCEMENT_LOGIN_BLOCKED,
      details: { email: email.toLowerCase(), reason: 'blocked' },
    });

    return {
      allowed: false,
      reason: 'blocked',
      enforcementMessage: status.enforcementMessage,
      redirectToSso: true,
      ssoProviderHint,
    };
  }

  /**
   * Enable SSO enforcement for a workspace.
   * Requires at least one active SSO provider and one verified domain.
   */
  async enableEnforcement(params: EnableEnforcementParams): Promise<SsoEnforcementPolicy> {
    // Validate prerequisites
    const activeProviderCount = await this.countActiveProviders(params.workspaceId);
    if (activeProviderCount < SSO_ENFORCEMENT_CONSTANTS.MIN_ACTIVE_PROVIDERS_FOR_ENFORCEMENT) {
      throw new BadRequestException(
        'At least one active SSO provider must be configured before enabling enforcement',
      );
    }

    // Check at least one verified domain exists
    const verifiedDomains = await this.domainVerificationService.listDomains(
      params.workspaceId,
      DomainStatus.VERIFIED,
    );
    if (verifiedDomains.length === 0) {
      throw new BadRequestException(
        'At least one verified domain must exist before enabling enforcement',
      );
    }

    // Find or create policy
    let policy = await this.enforcementPolicyRepository.findOne({
      where: { workspaceId: params.workspaceId },
    });

    const now = new Date();
    const gracePeriodHours = params.gracePeriodHours ?? SSO_ENFORCEMENT_CONSTANTS.DEFAULT_GRACE_PERIOD_HOURS;

    if (!policy) {
      policy = this.enforcementPolicyRepository.create({
        workspaceId: params.workspaceId,
      });
    }

    policy.enforced = true;
    policy.gracePeriodHours = gracePeriodHours;
    policy.gracePeriodStart = now;
    policy.gracePeriodEnd = gracePeriodHours > 0
      ? new Date(now.getTime() + gracePeriodHours * 60 * 60 * 1000)
      : null;
    policy.bypassEmails = params.bypassEmails ?? [];
    policy.ownerBypassEnabled = params.ownerBypassEnabled ?? true;
    policy.bypassServiceAccounts = params.bypassServiceAccounts ?? true;
    policy.enforcementMessage = params.enforcementMessage ?? SSO_ENFORCEMENT_CONSTANTS.DEFAULT_ENFORCEMENT_MESSAGE;
    policy.enforcedAt = now;
    policy.enforcedBy = params.actorId;
    policy.passwordLoginBlocked = gracePeriodHours === 0;
    policy.registrationBlocked = true;

    const saved = await this.enforcementPolicyRepository.save(policy);

    // Invalidate cache
    await this.invalidateCache(params.workspaceId);

    // Log audit event (fire-and-forget)
    void this.ssoAuditService.logEvent({
      workspaceId: params.workspaceId,
      eventType: SsoAuditEventType.ENFORCEMENT_ENABLED,
      actorId: params.actorId,
      details: {
        gracePeriodHours,
        bypassEmailCount: (params.bypassEmails ?? []).length,
        ownerBypassEnabled: params.ownerBypassEnabled ?? true,
        immediateEnforcement: gracePeriodHours === 0,
      },
    });

    return saved;
  }

  /**
   * Disable SSO enforcement for a workspace.
   */
  async disableEnforcement(params: DisableEnforcementParams): Promise<SsoEnforcementPolicy> {
    const policy = await this.enforcementPolicyRepository.findOne({
      where: { workspaceId: params.workspaceId },
    });

    if (!policy) {
      throw new NotFoundException('No enforcement policy found for this workspace');
    }

    policy.enforced = false;
    policy.passwordLoginBlocked = false;
    policy.registrationBlocked = false;
    policy.gracePeriodStart = null;
    policy.gracePeriodEnd = null;

    const saved = await this.enforcementPolicyRepository.save(policy);

    // Invalidate cache
    await this.invalidateCache(params.workspaceId);

    // Log audit event (fire-and-forget)
    void this.ssoAuditService.logEvent({
      workspaceId: params.workspaceId,
      eventType: SsoAuditEventType.ENFORCEMENT_DISABLED,
      actorId: params.actorId,
      details: {},
    });

    return saved;
  }

  /**
   * Update enforcement settings (partial update).
   */
  async updateEnforcement(params: UpdateEnforcementParams): Promise<SsoEnforcementPolicy> {
    const policy = await this.enforcementPolicyRepository.findOne({
      where: { workspaceId: params.workspaceId },
    });

    if (!policy) {
      throw new NotFoundException('No enforcement policy found for this workspace');
    }

    // Validate bypass emails count
    if (params.bypassEmails && params.bypassEmails.length > SSO_ENFORCEMENT_CONSTANTS.MAX_BYPASS_EMAILS) {
      throw new BadRequestException(
        `Maximum ${SSO_ENFORCEMENT_CONSTANTS.MAX_BYPASS_EMAILS} bypass emails allowed`,
      );
    }

    const changedFields: Record<string, unknown> = {};

    if (params.bypassEmails !== undefined) {
      changedFields.bypassEmails = params.bypassEmails;
      policy.bypassEmails = params.bypassEmails;
    }
    if (params.ownerBypassEnabled !== undefined) {
      changedFields.ownerBypassEnabled = params.ownerBypassEnabled;
      policy.ownerBypassEnabled = params.ownerBypassEnabled;
    }
    if (params.bypassServiceAccounts !== undefined) {
      changedFields.bypassServiceAccounts = params.bypassServiceAccounts;
      policy.bypassServiceAccounts = params.bypassServiceAccounts;
    }
    if (params.enforcementMessage !== undefined) {
      changedFields.enforcementMessage = params.enforcementMessage;
      policy.enforcementMessage = params.enforcementMessage;
    }

    const saved = await this.enforcementPolicyRepository.save(policy);

    // Invalidate cache
    await this.invalidateCache(params.workspaceId);

    // Log audit event (fire-and-forget)
    void this.ssoAuditService.logEvent({
      workspaceId: params.workspaceId,
      eventType: SsoAuditEventType.ENFORCEMENT_UPDATED,
      actorId: params.actorId,
      details: { changedFields },
    });

    return saved;
  }

  /**
   * Process expired grace periods.
   * Transitions policies to fully enforced (password_login_blocked = true).
   * Called by the scheduler every 5 minutes.
   */
  async processGracePeriodExpiry(): Promise<number> {
    const now = new Date();

    const expiredPolicies = await this.enforcementPolicyRepository.find({
      where: {
        enforced: true,
        gracePeriodEnd: LessThanOrEqual(now),
        passwordLoginBlocked: false,
      },
    });

    if (expiredPolicies.length === 0) {
      return 0;
    }

    // Batch update all expired policies in a single query
    const expiredIds = expiredPolicies.map(p => p.id);
    await this.enforcementPolicyRepository.update(
      { id: In(expiredIds) },
      { passwordLoginBlocked: true },
    );

    // Invalidate caches and log audit events for each transitioned workspace
    await Promise.all(
      expiredPolicies.map(async (policy) => {
        await this.invalidateCache(policy.workspaceId);

        // Log audit event (fire-and-forget)
        void this.ssoAuditService.logEvent({
          workspaceId: policy.workspaceId,
          eventType: SsoAuditEventType.ENFORCEMENT_GRACE_PERIOD_EXPIRED,
          details: {
            policyId: policy.id,
            enforcedBy: policy.enforcedBy,
          },
        });
      }),
    );

    return expiredPolicies.length;
  }

  /**
   * Get the list of bypass emails for a workspace.
   */
  async getBypassList(workspaceId: string): Promise<string[]> {
    const policy = await this.enforcementPolicyRepository.findOne({
      where: { workspaceId },
    });
    return policy?.bypassEmails ?? [];
  }

  /**
   * Add an email to the bypass list.
   */
  async addBypassEmail(workspaceId: string, email: string, actorId: string): Promise<string[]> {
    const policy = await this.enforcementPolicyRepository.findOne({
      where: { workspaceId },
    });

    if (!policy) {
      throw new NotFoundException('No enforcement policy found for this workspace');
    }

    const normalizedEmail = email.toLowerCase();

    // Check limit
    if (policy.bypassEmails.length >= SSO_ENFORCEMENT_CONSTANTS.MAX_BYPASS_EMAILS) {
      throw new BadRequestException(
        `Maximum ${SSO_ENFORCEMENT_CONSTANTS.MAX_BYPASS_EMAILS} bypass emails allowed`,
      );
    }

    // Prevent duplicates
    if (!policy.bypassEmails.map(e => e.toLowerCase()).includes(normalizedEmail)) {
      policy.bypassEmails = [...policy.bypassEmails, normalizedEmail];
      await this.enforcementPolicyRepository.save(policy);
      await this.invalidateCache(workspaceId);

      // Log audit event (fire-and-forget)
      void this.ssoAuditService.logEvent({
        workspaceId,
        eventType: SsoAuditEventType.ENFORCEMENT_BYPASS_ADDED,
        actorId,
        details: { email: normalizedEmail },
      });
    }

    return policy.bypassEmails;
  }

  /**
   * Remove an email from the bypass list.
   */
  async removeBypassEmail(workspaceId: string, email: string, actorId: string): Promise<string[]> {
    const policy = await this.enforcementPolicyRepository.findOne({
      where: { workspaceId },
    });

    if (!policy) {
      throw new NotFoundException('No enforcement policy found for this workspace');
    }

    const normalizedEmail = email.toLowerCase();
    policy.bypassEmails = policy.bypassEmails.filter(
      e => e.toLowerCase() !== normalizedEmail,
    );

    await this.enforcementPolicyRepository.save(policy);
    await this.invalidateCache(workspaceId);

    // Log audit event (fire-and-forget)
    void this.ssoAuditService.logEvent({
      workspaceId,
      eventType: SsoAuditEventType.ENFORCEMENT_BYPASS_REMOVED,
      actorId,
      details: { email: normalizedEmail },
    });

    return policy.bypassEmails;
  }

  /**
   * Check if a user email is bypassed from SSO enforcement for a workspace.
   */
  async isUserBypassed(workspaceId: string, email: string): Promise<boolean> {
    const normalizedEmail = email.toLowerCase();

    // Try Redis cache
    const cacheKey = `${SSO_ENFORCEMENT_CONSTANTS.REDIS_BYPASS_CHECK_PREFIX}${workspaceId}:${normalizedEmail}`;
    const cached = await this.redisService.get(cacheKey);
    if (cached !== null) {
      return cached === 'true';
    }

    const policy = await this.enforcementPolicyRepository.findOne({
      where: { workspaceId },
    });

    if (!policy || !policy.enforced) {
      await this.redisService.set(cacheKey, 'true', SSO_ENFORCEMENT_CONSTANTS.BYPASS_CACHE_TTL_SECONDS);
      return true;
    }

    // Check owner bypass
    if (policy.ownerBypassEnabled) {
      const workspace = await this.workspaceRepository.findOne({
        where: { id: workspaceId },
      });
      if (workspace) {
        const ownerMember = await this.workspaceMemberRepository.findOne({
          where: { workspaceId, userId: workspace.ownerUserId },
          relations: ['user'],
        });
        if (ownerMember?.user?.email?.toLowerCase() === normalizedEmail) {
          await this.redisService.set(cacheKey, 'true', SSO_ENFORCEMENT_CONSTANTS.BYPASS_CACHE_TTL_SECONDS);
          return true;
        }
      }
    }

    // Check email bypass list
    if (policy.bypassEmails.map(e => e.toLowerCase()).includes(normalizedEmail)) {
      await this.redisService.set(cacheKey, 'true', SSO_ENFORCEMENT_CONSTANTS.BYPASS_CACHE_TTL_SECONDS);
      return true;
    }

    await this.redisService.set(cacheKey, 'false', SSO_ENFORCEMENT_CONSTANTS.BYPASS_CACHE_TTL_SECONDS);
    return false;
  }

  /**
   * Get the enforcement policy entity for a workspace (used by controller for response building).
   */
  async getPolicy(workspaceId: string): Promise<SsoEnforcementPolicy | null> {
    return this.enforcementPolicyRepository.findOne({
      where: { workspaceId },
    });
  }

  /**
   * Find policies in grace period for reminder notifications.
   */
  async findPoliciesInGracePeriod(): Promise<SsoEnforcementPolicy[]> {
    return this.enforcementPolicyRepository.find({
      where: {
        enforced: true,
        passwordLoginBlocked: false,
        gracePeriodEnd: Not(IsNull()),
      },
    });
  }

  /**
   * Count active SSO providers (SAML + OIDC) for a workspace.
   */
  private async countActiveProviders(workspaceId: string): Promise<number> {
    const [samlCount, oidcCount] = await Promise.all([
      this.samlConfigRepository.count({
        where: { workspaceId, isActive: true },
      }),
      this.oidcConfigRepository.count({
        where: { workspaceId, isActive: true },
      }),
    ]);
    return samlCount + oidcCount;
  }

  /**
   * Invalidate Redis cache for a workspace's enforcement data.
   * Clears both the enforcement status cache and all bypass check cache entries.
   */
  private async invalidateCache(workspaceId: string): Promise<void> {
    const enforcementKey = `${SSO_ENFORCEMENT_CONSTANTS.REDIS_ENFORCEMENT_PREFIX}${workspaceId}`;
    await this.redisService.del(enforcementKey);

    // Also clear bypass check cache entries for this workspace to prevent stale bypass results
    try {
      const bypassPattern = `${SSO_ENFORCEMENT_CONSTANTS.REDIS_BYPASS_CHECK_PREFIX}${workspaceId}:*`;
      const bypassKeys = await this.redisService.scanKeys(bypassPattern);
      if (bypassKeys && bypassKeys.length > 0) {
        await Promise.all(bypassKeys.map(key => this.redisService.del(key)));
      }
    } catch (error) {
      this.logger.warn(`Failed to clear bypass cache for workspace ${workspaceId}`, error);
    }
  }
}
