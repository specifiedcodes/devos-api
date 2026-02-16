import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, LessThan } from 'typeorm';
import {
  SsoFederatedSession,
  SsoProviderType,
  SessionTerminationReason,
} from '../../../database/entities/sso-federated-session.entity';
import { SsoAuditEventType } from '../../../database/entities/sso-audit-event.entity';
import { SsoAuditService } from '../sso-audit.service';
import { RedisService } from '../../redis/redis.service';
import { SESSION_FEDERATION_CONSTANTS } from '../constants/session-federation.constants';
import {
  CreateFederatedSessionParams,
  FederatedSessionMetadata,
  SessionValidationResult,
  ForceReauthResult,
  WorkspaceSessionSummary,
} from '../interfaces/session-federation.interfaces';

@Injectable()
export class SessionFederationService {
  private readonly logger = new Logger(SessionFederationService.name);

  constructor(
    @InjectRepository(SsoFederatedSession)
    private readonly federatedSessionRepository: Repository<SsoFederatedSession>,
    private readonly redisService: RedisService,
    private readonly ssoAuditService: SsoAuditService,
  ) {}

  /**
   * Create a new federated session linking SSO provider session with DevOS session.
   * Stores in PostgreSQL for persistence and Redis for low-latency validation.
   */
  async createFederatedSession(params: CreateFederatedSessionParams): Promise<SsoFederatedSession> {
    const sessionTimeoutMinutes = params.sessionTimeoutMinutes ?? SESSION_FEDERATION_CONSTANTS.DEFAULT_SESSION_TIMEOUT_MINUTES;
    const idleTimeoutMinutes = params.idleTimeoutMinutes ?? SESSION_FEDERATION_CONSTANTS.DEFAULT_IDLE_TIMEOUT_MINUTES;

    const now = new Date();
    const expiresAt = new Date(now.getTime() + sessionTimeoutMinutes * 60 * 1000);

    // Check existing active sessions for user+workspace, terminate oldest if exceeding max
    const existingActiveSessions = await this.federatedSessionRepository.find({
      where: {
        userId: params.userId,
        workspaceId: params.workspaceId,
        terminatedAt: IsNull(),
      },
      order: { createdAt: 'ASC' },
    });

    if (existingActiveSessions.length >= SESSION_FEDERATION_CONSTANTS.MAX_SESSIONS_PER_USER_WORKSPACE) {
      const sessionsToTerminate = existingActiveSessions.slice(
        0,
        existingActiveSessions.length - SESSION_FEDERATION_CONSTANTS.MAX_SESSIONS_PER_USER_WORKSPACE + 1,
      );
      for (const session of sessionsToTerminate) {
        await this.terminateSession(session.id, SessionTerminationReason.FORCED);
      }
    }

    // Save to PostgreSQL
    const federatedSession = this.federatedSessionRepository.create({
      userId: params.userId,
      workspaceId: params.workspaceId,
      providerType: params.providerType,
      providerConfigId: params.providerConfigId,
      idpSessionId: params.idpSessionId || null,
      devosSessionId: params.devosSessionId,
      accessTokenJti: params.accessTokenJti || null,
      refreshTokenJti: params.refreshTokenJti || null,
      sessionTimeoutMinutes,
      idleTimeoutMinutes,
      expiresAt,
      lastActivityAt: now,
    });

    const saved = await this.federatedSessionRepository.save(federatedSession);

    // Store session metadata in Redis
    const redisTtlSeconds = sessionTimeoutMinutes * 60 + SESSION_FEDERATION_CONSTANTS.REDIS_SESSION_TTL_BUFFER_SECONDS;

    const metadata: FederatedSessionMetadata = {
      sessionId: saved.id,
      userId: saved.userId,
      workspaceId: saved.workspaceId,
      providerType: saved.providerType,
      providerConfigId: saved.providerConfigId,
      idpSessionId: params.idpSessionId,
      devosSessionId: saved.devosSessionId,
      idleTimeoutMinutes,
      createdAt: saved.createdAt.toISOString(),
      expiresAt: saved.expiresAt.toISOString(),
      lastActivityAt: saved.lastActivityAt.toISOString(),
      isExpired: false,
      isIdleExpired: false,
      remainingMinutes: sessionTimeoutMinutes,
    };

    await this.redisService.set(
      `${SESSION_FEDERATION_CONSTANTS.REDIS_SESSION_PREFIX}${saved.id}`,
      JSON.stringify(metadata),
      redisTtlSeconds,
    );

    // If idpSessionId provided, store mapping for logout correlation
    if (params.idpSessionId) {
      await this.redisService.set(
        `${SESSION_FEDERATION_CONSTANTS.REDIS_IDP_SESSION_PREFIX}${params.idpSessionId}`,
        saved.id,
        redisTtlSeconds,
      );
    }

    // Log audit event (fire-and-forget)
    void this.ssoAuditService.logEvent({
      workspaceId: saved.workspaceId,
      eventType: SsoAuditEventType.SESSION_CREATED,
      actorId: saved.userId,
      targetUserId: saved.userId,
      details: {
        sessionId: saved.id,
        providerType: saved.providerType,
        providerConfigId: saved.providerConfigId,
        sessionTimeoutMinutes,
        idleTimeoutMinutes,
      },
    });

    return saved;
  }

  /**
   * Validate a federated session. Checks Redis cache first, falls back to PostgreSQL.
   */
  async validateSession(sessionId: string): Promise<SessionValidationResult> {
    const now = new Date();

    // Try Redis first
    const cachedData = await this.redisService.get(
      `${SESSION_FEDERATION_CONSTANTS.REDIS_SESSION_PREFIX}${sessionId}`,
    );

    if (cachedData) {
      const metadata: FederatedSessionMetadata = JSON.parse(cachedData);
      return this.evaluateSessionValidity(metadata, now);
    }

    // Redis cache miss - query PostgreSQL
    const session = await this.federatedSessionRepository.findOne({
      where: { id: sessionId },
    });

    if (!session) {
      return { isValid: false, reason: 'not_found' };
    }

    if (session.terminatedAt) {
      return { isValid: false, reason: 'terminated' };
    }

    // Re-populate Redis cache
    const metadata = this.buildMetadata(session, now);
    const ttlSeconds = Math.max(
      Math.floor((session.expiresAt.getTime() - now.getTime()) / 1000) + SESSION_FEDERATION_CONSTANTS.REDIS_SESSION_TTL_BUFFER_SECONDS,
      60,
    );

    await this.redisService.set(
      `${SESSION_FEDERATION_CONSTANTS.REDIS_SESSION_PREFIX}${session.id}`,
      JSON.stringify(metadata),
      ttlSeconds,
    );

    return this.evaluateSessionValidity(metadata, now);
  }

  /**
   * Update session activity timestamp. Throttled to once per 60 seconds.
   */
  async updateActivity(sessionId: string): Promise<void> {
    const now = new Date();

    // Check throttle via Redis cached metadata
    const cachedData = await this.redisService.get(
      `${SESSION_FEDERATION_CONSTANTS.REDIS_SESSION_PREFIX}${sessionId}`,
    );

    if (!cachedData) {
      // No cached session - skip activity update (session may not exist or was evicted from cache).
      // The next validateSession call will re-populate the cache from PostgreSQL.
      return;
    }

    const metadata: FederatedSessionMetadata = JSON.parse(cachedData);
    const lastActivity = new Date(metadata.lastActivityAt);
    const elapsedSeconds = (now.getTime() - lastActivity.getTime()) / 1000;

    if (elapsedSeconds < SESSION_FEDERATION_CONSTANTS.ACTIVITY_UPDATE_THROTTLE_SECONDS) {
      return; // Throttled
    }

    // Update Redis cached metadata
    metadata.lastActivityAt = now.toISOString();
    const ttlSeconds = Math.max(
      Math.floor((new Date(metadata.expiresAt).getTime() - now.getTime()) / 1000) + SESSION_FEDERATION_CONSTANTS.REDIS_SESSION_TTL_BUFFER_SECONDS,
      60,
    );
    await this.redisService.set(
      `${SESSION_FEDERATION_CONSTANTS.REDIS_SESSION_PREFIX}${sessionId}`,
      JSON.stringify(metadata),
      ttlSeconds,
    );

    // Async update PostgreSQL (fire-and-forget)
    this.federatedSessionRepository
      .update({ id: sessionId, terminatedAt: IsNull() }, { lastActivityAt: now })
      .catch((error) => {
        this.logger.error(`Failed to update activity for session ${sessionId}`, error);
      });
  }

  /**
   * Terminate a specific federated session.
   */
  async terminateSession(sessionId: string, reason: SessionTerminationReason): Promise<void> {
    const now = new Date();

    // Get session to find workspace for audit logging
    const session = await this.federatedSessionRepository.findOne({
      where: { id: sessionId },
    });

    if (!session) {
      this.logger.warn(`Session not found for termination: ${sessionId}`);
      return;
    }

    // Update PostgreSQL
    await this.federatedSessionRepository.update(
      { id: sessionId },
      { terminatedAt: now, terminationReason: reason },
    );

    // Remove from Redis
    await this.redisService.del(
      `${SESSION_FEDERATION_CONSTANTS.REDIS_SESSION_PREFIX}${sessionId}`,
    );

    // Remove IdP session mapping if exists
    if (session.idpSessionId) {
      await this.redisService.del(
        `${SESSION_FEDERATION_CONSTANTS.REDIS_IDP_SESSION_PREFIX}${session.idpSessionId}`,
      );
    }

    // Log audit event
    void this.ssoAuditService.logEvent({
      workspaceId: session.workspaceId,
      eventType: SsoAuditEventType.SESSION_TERMINATED,
      actorId: session.userId,
      targetUserId: session.userId,
      details: {
        sessionId,
        terminationReason: reason,
        providerType: session.providerType,
      },
    });
  }

  /**
   * Terminate all active sessions for a user in a workspace.
   */
  async terminateUserSessions(
    userId: string,
    workspaceId: string,
    reason: SessionTerminationReason,
  ): Promise<number> {
    const activeSessions = await this.federatedSessionRepository.find({
      where: {
        userId,
        workspaceId,
        terminatedAt: IsNull(),
      },
    });

    for (const session of activeSessions) {
      await this.terminateSession(session.id, reason);
    }

    return activeSessions.length;
  }

  /**
   * Terminate all active sessions for a workspace (force re-authentication).
   */
  async terminateAllWorkspaceSessions(
    workspaceId: string,
    reason: SessionTerminationReason,
    excludeUserId?: string,
  ): Promise<ForceReauthResult> {
    const queryBuilder = this.federatedSessionRepository
      .createQueryBuilder('session')
      .where('session.workspace_id = :workspaceId', { workspaceId })
      .andWhere('session.terminated_at IS NULL');

    if (excludeUserId) {
      queryBuilder.andWhere('session.user_id != :excludeUserId', { excludeUserId });
    }

    const activeSessions = await queryBuilder.getMany();
    const affectedUserIds = new Set<string>();

    for (const session of activeSessions) {
      await this.terminateSession(session.id, reason);
      affectedUserIds.add(session.userId);
    }

    return {
      terminatedCount: activeSessions.length,
      affectedUserIds: Array.from(affectedUserIds),
    };
  }

  /**
   * Handle IdP-initiated logout by correlating the IdP session ID.
   */
  async handleIdpLogout(idpSessionId: string): Promise<void> {
    // Log that we received an IdP logout
    this.logger.log(`Processing IdP logout for session: ${idpSessionId}`);

    // Try Redis first for fast lookup
    const devosSessionId = await this.redisService.get(
      `${SESSION_FEDERATION_CONSTANTS.REDIS_IDP_SESSION_PREFIX}${idpSessionId}`,
    );

    if (devosSessionId) {
      await this.terminateSession(devosSessionId, SessionTerminationReason.IDP_LOGOUT);
      return;
    }

    // Fallback to PostgreSQL
    const session = await this.federatedSessionRepository.findOne({
      where: {
        idpSessionId,
        terminatedAt: IsNull(),
      },
    });

    if (session) {
      await this.terminateSession(session.id, SessionTerminationReason.IDP_LOGOUT);
    } else {
      this.logger.warn(`No active session found for IdP session: ${idpSessionId}`);
    }
  }

  /**
   * Get all active federated sessions for a user.
   */
  async getActiveSessions(userId: string): Promise<SsoFederatedSession[]> {
    const now = new Date();

    return this.federatedSessionRepository
      .createQueryBuilder('session')
      .where('session.user_id = :userId', { userId })
      .andWhere('session.terminated_at IS NULL')
      .andWhere('session.expires_at > :now', { now })
      .orderBy('session.created_at', 'DESC')
      .getMany();
  }

  /**
   * Get workspace session summary with counts by provider.
   */
  async getWorkspaceSessionSummary(workspaceId: string): Promise<WorkspaceSessionSummary> {
    const now = new Date();

    const activeSessions = await this.federatedSessionRepository
      .createQueryBuilder('session')
      .where('session.workspace_id = :workspaceId', { workspaceId })
      .andWhere('session.terminated_at IS NULL')
      .andWhere('session.expires_at > :now', { now })
      .getMany();

    const uniqueUsers = new Set(activeSessions.map((s) => s.userId));
    const sessionsByProvider: Record<string, number> = {};

    for (const session of activeSessions) {
      sessionsByProvider[session.providerType] = (sessionsByProvider[session.providerType] || 0) + 1;
    }

    return {
      workspaceId,
      totalActiveSessions: activeSessions.length,
      activeUsers: uniqueUsers.size,
      sessionsByProvider,
    };
  }

  /**
   * Update token JTI correlation on token refresh.
   */
  async updateSessionTokens(
    sessionId: string,
    accessTokenJti: string,
    refreshTokenJti: string,
  ): Promise<void> {
    // Fetch session first to get workspaceId for audit logging
    const session = await this.federatedSessionRepository.findOne({
      where: { id: sessionId },
    });

    // Update PostgreSQL
    await this.federatedSessionRepository.update(
      { id: sessionId },
      { accessTokenJti, refreshTokenJti },
    );

    // Update Redis cache
    const cachedData = await this.redisService.get(
      `${SESSION_FEDERATION_CONSTANTS.REDIS_SESSION_PREFIX}${sessionId}`,
    );

    if (cachedData) {
      const metadata: FederatedSessionMetadata = JSON.parse(cachedData);
      const now = new Date();
      const ttlSeconds = Math.max(
        Math.floor((new Date(metadata.expiresAt).getTime() - now.getTime()) / 1000) + SESSION_FEDERATION_CONSTANTS.REDIS_SESSION_TTL_BUFFER_SECONDS,
        60,
      );
      await this.redisService.set(
        `${SESSION_FEDERATION_CONSTANTS.REDIS_SESSION_PREFIX}${sessionId}`,
        JSON.stringify(metadata),
        ttlSeconds,
      );
    }

    // Log audit event (fire-and-forget)
    if (session) {
      void this.ssoAuditService.logEvent({
        workspaceId: session.workspaceId,
        eventType: SsoAuditEventType.SESSION_TOKEN_REFRESHED,
        actorId: session.userId,
        targetUserId: session.userId,
        details: { sessionId },
      });
    }
  }

  /**
   * Find sessions near expiry for warning notifications.
   */
  async getSessionsNearExpiry(windowMinutes: number): Promise<SsoFederatedSession[]> {
    const now = new Date();
    const windowEnd = new Date(now.getTime() + windowMinutes * 60 * 1000);

    // Find sessions expiring soon (absolute timeout)
    const expiringAbsolute = await this.federatedSessionRepository
      .createQueryBuilder('session')
      .where('session.terminated_at IS NULL')
      .andWhere('session.expires_at > :now', { now })
      .andWhere('session.expires_at <= :windowEnd', { windowEnd })
      .getMany();

    // Find sessions with idle timeout approaching
    const expiringIdle = await this.federatedSessionRepository
      .createQueryBuilder('session')
      .where('session.terminated_at IS NULL')
      .andWhere('session.expires_at > :now', { now })
      .andWhere("session.last_activity_at + (session.idle_timeout_minutes || ' minutes')::interval <= :windowEnd", { windowEnd })
      .andWhere("session.last_activity_at + (session.idle_timeout_minutes || ' minutes')::interval > :now", { now })
      .getMany();

    // Deduplicate by session ID
    const sessionMap = new Map<string, SsoFederatedSession>();
    for (const session of [...expiringAbsolute, ...expiringIdle]) {
      sessionMap.set(session.id, session);
    }

    return Array.from(sessionMap.values());
  }

  /**
   * Clean up expired sessions (absolute timeout and idle timeout).
   * Processes in batches to avoid overloading the database.
   */
  async cleanupExpiredSessions(): Promise<number> {
    const now = new Date();
    let totalCleaned = 0;

    // Find sessions past absolute timeout
    const expiredAbsolute = await this.federatedSessionRepository
      .createQueryBuilder('session')
      .where('session.terminated_at IS NULL')
      .andWhere('session.expires_at < :now', { now })
      .take(SESSION_FEDERATION_CONSTANTS.CLEANUP_BATCH_SIZE)
      .getMany();

    for (const session of expiredAbsolute) {
      await this.terminateSession(session.id, SessionTerminationReason.TIMEOUT);
      totalCleaned++;
    }

    // Find sessions past idle timeout
    const expiredIdle = await this.federatedSessionRepository
      .createQueryBuilder('session')
      .where('session.terminated_at IS NULL')
      .andWhere('session.expires_at >= :now', { now })
      .andWhere("session.last_activity_at + (session.idle_timeout_minutes || ' minutes')::interval < :now", { now })
      .take(SESSION_FEDERATION_CONSTANTS.CLEANUP_BATCH_SIZE)
      .getMany();

    for (const session of expiredIdle) {
      await this.terminateSession(session.id, SessionTerminationReason.IDLE_TIMEOUT);
      totalCleaned++;
    }

    return totalCleaned;
  }

  /**
   * Purge old terminated sessions beyond retention period.
   */
  async purgeTerminatedSessions(): Promise<number> {
    const retentionCutoff = new Date();
    retentionCutoff.setDate(retentionCutoff.getDate() - SESSION_FEDERATION_CONSTANTS.TERMINATED_SESSION_RETENTION_DAYS);

    const result = await this.federatedSessionRepository
      .createQueryBuilder()
      .delete()
      .from(SsoFederatedSession)
      .where('terminated_at IS NOT NULL')
      .andWhere('terminated_at < :cutoff', { cutoff: retentionCutoff })
      .execute();

    return result.affected || 0;
  }

  /**
   * Get a federated session by its ID.
   */
  async getSessionById(sessionId: string): Promise<SsoFederatedSession | null> {
    return this.federatedSessionRepository.findOne({
      where: { id: sessionId },
    });
  }

  /**
   * Find federated session by refresh token JTI.
   * Used during token refresh to validate SSO session.
   */
  async findByRefreshTokenJti(refreshTokenJti: string): Promise<SsoFederatedSession | null> {
    return this.federatedSessionRepository.findOne({
      where: { refreshTokenJti },
    });
  }

  /**
   * List workspace sessions with filtering and pagination.
   */
  async listWorkspaceSessions(
    workspaceId: string,
    options: {
      userId?: string;
      status?: 'active' | 'terminated' | 'all';
      page?: number;
      limit?: number;
    } = {},
  ): Promise<{ sessions: SsoFederatedSession[]; total: number }> {
    const page = Math.max(1, options.page || 1);
    const limit = Math.min(200, Math.max(1, options.limit || 50));
    const skip = (page - 1) * limit;
    const now = new Date();

    const queryBuilder = this.federatedSessionRepository
      .createQueryBuilder('session')
      .where('session.workspace_id = :workspaceId', { workspaceId });

    if (options.userId) {
      queryBuilder.andWhere('session.user_id = :userId', { userId: options.userId });
    }

    if (options.status === 'active') {
      queryBuilder
        .andWhere('session.terminated_at IS NULL')
        .andWhere('session.expires_at > :now', { now });
    } else if (options.status === 'terminated') {
      queryBuilder.andWhere('session.terminated_at IS NOT NULL');
    }
    // 'all' - no additional filter

    const [sessions, total] = await queryBuilder
      .orderBy('session.created_at', 'DESC')
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    return { sessions, total };
  }

  /**
   * Store workspace session timeout configuration in Redis.
   * Used by SAML/OIDC callbacks to apply workspace-level timeout settings to new sessions.
   */
  async setWorkspaceTimeoutConfig(
    workspaceId: string,
    config: { sessionTimeoutMinutes?: number; idleTimeoutMinutes?: number },
  ): Promise<{ sessionTimeoutMinutes: number; idleTimeoutMinutes: number }> {
    const resolved = {
      sessionTimeoutMinutes: config.sessionTimeoutMinutes ?? SESSION_FEDERATION_CONSTANTS.DEFAULT_SESSION_TIMEOUT_MINUTES,
      idleTimeoutMinutes: config.idleTimeoutMinutes ?? SESSION_FEDERATION_CONSTANTS.DEFAULT_IDLE_TIMEOUT_MINUTES,
    };

    await this.redisService.set(
      `sso:ws:${workspaceId}:timeout_config`,
      JSON.stringify(resolved),
      0, // No TTL - persists until explicitly changed
    );

    return resolved;
  }

  /**
   * Get workspace session timeout configuration from Redis.
   * Returns defaults if no custom configuration has been set.
   */
  async getWorkspaceTimeoutConfig(
    workspaceId: string,
  ): Promise<{ sessionTimeoutMinutes: number; idleTimeoutMinutes: number }> {
    const cached = await this.redisService.get(`sso:ws:${workspaceId}:timeout_config`);
    if (cached) {
      return JSON.parse(cached);
    }
    return {
      sessionTimeoutMinutes: SESSION_FEDERATION_CONSTANTS.DEFAULT_SESSION_TIMEOUT_MINUTES,
      idleTimeoutMinutes: SESSION_FEDERATION_CONSTANTS.DEFAULT_IDLE_TIMEOUT_MINUTES,
    };
  }

  /**
   * Build FederatedSessionMetadata from a database entity.
   */
  private buildMetadata(session: SsoFederatedSession, now: Date): FederatedSessionMetadata {
    const expiresAt = new Date(session.expiresAt);
    const lastActivityAt = new Date(session.lastActivityAt);
    const idleExpiresAt = new Date(lastActivityAt.getTime() + session.idleTimeoutMinutes * 60 * 1000);

    return {
      sessionId: session.id,
      userId: session.userId,
      workspaceId: session.workspaceId,
      providerType: session.providerType,
      providerConfigId: session.providerConfigId,
      idpSessionId: session.idpSessionId || undefined,
      devosSessionId: session.devosSessionId,
      idleTimeoutMinutes: session.idleTimeoutMinutes,
      createdAt: session.createdAt.toISOString(),
      expiresAt: session.expiresAt.toISOString(),
      lastActivityAt: session.lastActivityAt.toISOString(),
      isExpired: now >= expiresAt,
      isIdleExpired: now >= idleExpiresAt,
      remainingMinutes: Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / 60000)),
    };
  }

  /**
   * Evaluate session validity from metadata.
   */
  private evaluateSessionValidity(
    metadata: FederatedSessionMetadata,
    now: Date,
  ): SessionValidationResult {
    const expiresAt = new Date(metadata.expiresAt);
    const lastActivityAt = new Date(metadata.lastActivityAt);

    // Check absolute timeout
    if (now >= expiresAt) {
      return {
        isValid: false,
        session: { ...metadata, isExpired: true, remainingMinutes: 0 },
        reason: 'expired',
      };
    }

    // Check idle timeout dynamically using idleTimeoutMinutes from metadata
    const idleTimeoutMs = (metadata.idleTimeoutMinutes || SESSION_FEDERATION_CONSTANTS.DEFAULT_IDLE_TIMEOUT_MINUTES) * 60 * 1000;
    const idleExpiresAt = new Date(lastActivityAt.getTime() + idleTimeoutMs);
    if (now >= idleExpiresAt) {
      return {
        isValid: false,
        session: { ...metadata, isIdleExpired: true },
        reason: 'idle_expired',
      };
    }

    return {
      isValid: true,
      session: {
        ...metadata,
        isExpired: false,
        isIdleExpired: false,
        remainingMinutes: Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / 60000)),
      },
      reason: 'active',
    };
  }
}
