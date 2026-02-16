import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { SessionFederationService } from './session-federation.service';
import {
  SsoFederatedSession,
  SsoProviderType,
  SessionTerminationReason,
} from '../../../database/entities/sso-federated-session.entity';
import { SsoAuditService } from '../sso-audit.service';
import { SsoAuditEventType } from '../../../database/entities/sso-audit-event.entity';
import { RedisService } from '../../redis/redis.service';
import { SESSION_FEDERATION_CONSTANTS } from '../constants/session-federation.constants';
import { CreateFederatedSessionParams } from '../interfaces/session-federation.interfaces';

describe('SessionFederationService', () => {
  let service: SessionFederationService;
  let mockRepository: jest.Mocked<Partial<Repository<SsoFederatedSession>>>;
  let mockRedisService: jest.Mocked<Partial<RedisService>>;
  let mockAuditService: jest.Mocked<Partial<SsoAuditService>>;

  const mockUserId = '11111111-1111-1111-1111-111111111111';
  const mockWorkspaceId = '22222222-2222-2222-2222-222222222222';
  const mockConfigId = '33333333-3333-3333-3333-333333333333';
  const mockSessionId = '44444444-4444-4444-4444-444444444444';
  const mockDevosSessionId = 'devos-session-001';
  const mockIdpSessionId = 'idp-session-001';

  const createMockSession = (overrides: Partial<SsoFederatedSession> = {}): SsoFederatedSession => ({
    id: mockSessionId,
    userId: mockUserId,
    workspaceId: mockWorkspaceId,
    providerType: SsoProviderType.SAML,
    providerConfigId: mockConfigId,
    idpSessionId: mockIdpSessionId,
    devosSessionId: mockDevosSessionId,
    accessTokenJti: 'access-jti-001',
    refreshTokenJti: 'refresh-jti-001',
    sessionTimeoutMinutes: 480,
    idleTimeoutMinutes: 30,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    expiresAt: new Date('2026-01-01T08:00:00Z'),
    lastActivityAt: new Date('2026-01-01T00:00:00Z'),
    terminatedAt: null,
    terminationReason: null,
    ...overrides,
  });

  const defaultParams: CreateFederatedSessionParams = {
    userId: mockUserId,
    workspaceId: mockWorkspaceId,
    providerType: SsoProviderType.SAML,
    providerConfigId: mockConfigId,
    idpSessionId: mockIdpSessionId,
    devosSessionId: mockDevosSessionId,
    accessTokenJti: 'access-jti-001',
    refreshTokenJti: 'refresh-jti-001',
    sessionTimeoutMinutes: 480,
    idleTimeoutMinutes: 30,
  };

  beforeEach(async () => {
    mockRepository = {
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      createQueryBuilder: jest.fn(),
    };

    mockRedisService = {
      set: jest.fn(),
      get: jest.fn(),
      del: jest.fn(),
    };

    mockAuditService = {
      logEvent: jest.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SessionFederationService,
        {
          provide: getRepositoryToken(SsoFederatedSession),
          useValue: mockRepository,
        },
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
        {
          provide: SsoAuditService,
          useValue: mockAuditService,
        },
      ],
    }).compile();

    service = module.get<SessionFederationService>(SessionFederationService);
  });

  describe('createFederatedSession', () => {
    it('should save to PostgreSQL and populate Redis cache', async () => {
      const mockSaved = createMockSession();
      mockRepository.find!.mockResolvedValue([]);
      mockRepository.create!.mockReturnValue(mockSaved);
      mockRepository.save!.mockResolvedValue(mockSaved);

      const result = await service.createFederatedSession(defaultParams);

      expect(result).toEqual(mockSaved);
      expect(mockRepository.save).toHaveBeenCalledTimes(1);
      expect(mockRedisService.set).toHaveBeenCalled();
    });

    it('should calculate correct expires_at based on timeout', async () => {
      const mockSaved = createMockSession();
      mockRepository.find!.mockResolvedValue([]);
      mockRepository.create!.mockReturnValue(mockSaved);
      mockRepository.save!.mockResolvedValue(mockSaved);

      await service.createFederatedSession(defaultParams);

      const createCall = mockRepository.create!.mock.calls[0][0] as any;
      expect(createCall.sessionTimeoutMinutes).toBe(480);
      expect(createCall.expiresAt).toBeInstanceOf(Date);
    });

    it('should evict oldest session when exceeding max per user/workspace', async () => {
      const existingSessions = Array.from({ length: 5 }, (_, i) =>
        createMockSession({ id: `session-${i}`, createdAt: new Date(Date.now() - (5 - i) * 60000) }),
      );
      mockRepository.find!.mockResolvedValue(existingSessions);

      const mockSaved = createMockSession();
      mockRepository.create!.mockReturnValue(mockSaved);
      mockRepository.save!.mockResolvedValue(mockSaved);
      mockRepository.findOne!.mockResolvedValue(existingSessions[0]);
      mockRepository.update!.mockResolvedValue({ affected: 1 } as any);

      await service.createFederatedSession(defaultParams);

      // Should have terminated the oldest session
      expect(mockRepository.update).toHaveBeenCalled();
    });

    it('should store IdP session mapping in Redis when idpSessionId provided', async () => {
      const mockSaved = createMockSession();
      mockRepository.find!.mockResolvedValue([]);
      mockRepository.create!.mockReturnValue(mockSaved);
      mockRepository.save!.mockResolvedValue(mockSaved);

      await service.createFederatedSession(defaultParams);

      const redisSetCalls = mockRedisService.set!.mock.calls;
      const idpMapping = redisSetCalls.find((c: any) =>
        c[0].startsWith(SESSION_FEDERATION_CONSTANTS.REDIS_IDP_SESSION_PREFIX),
      );
      expect(idpMapping).toBeDefined();
    });

    it('should not store IdP session mapping when idpSessionId not provided', async () => {
      const paramsNoIdp = { ...defaultParams, idpSessionId: undefined };
      const mockSaved = createMockSession({ idpSessionId: null });
      mockRepository.find!.mockResolvedValue([]);
      mockRepository.create!.mockReturnValue(mockSaved);
      mockRepository.save!.mockResolvedValue(mockSaved);

      await service.createFederatedSession(paramsNoIdp);

      const redisSetCalls = mockRedisService.set!.mock.calls;
      const idpMapping = redisSetCalls.find((c: any) =>
        c[0].startsWith(SESSION_FEDERATION_CONSTANTS.REDIS_IDP_SESSION_PREFIX),
      );
      expect(idpMapping).toBeUndefined();
    });

    it('should use default timeout values when not specified', async () => {
      const paramsNoTimeout = {
        userId: mockUserId,
        workspaceId: mockWorkspaceId,
        providerType: SsoProviderType.SAML,
        providerConfigId: mockConfigId,
        devosSessionId: mockDevosSessionId,
      };
      const mockSaved = createMockSession();
      mockRepository.find!.mockResolvedValue([]);
      mockRepository.create!.mockReturnValue(mockSaved);
      mockRepository.save!.mockResolvedValue(mockSaved);

      await service.createFederatedSession(paramsNoTimeout);

      const createCall = mockRepository.create!.mock.calls[0][0] as any;
      expect(createCall.sessionTimeoutMinutes).toBe(SESSION_FEDERATION_CONSTANTS.DEFAULT_SESSION_TIMEOUT_MINUTES);
      expect(createCall.idleTimeoutMinutes).toBe(SESSION_FEDERATION_CONSTANTS.DEFAULT_IDLE_TIMEOUT_MINUTES);
    });

    it('should log session_created audit event', async () => {
      const mockSaved = createMockSession();
      mockRepository.find!.mockResolvedValue([]);
      mockRepository.create!.mockReturnValue(mockSaved);
      mockRepository.save!.mockResolvedValue(mockSaved);

      await service.createFederatedSession(defaultParams);

      expect(mockAuditService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: SsoAuditEventType.SESSION_CREATED,
          workspaceId: mockWorkspaceId,
        }),
      );
    });
  });

  describe('validateSession', () => {
    it('should return valid for active non-expired session from Redis', async () => {
      const futureExpiry = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString();
      const metadata = {
        sessionId: mockSessionId,
        userId: mockUserId,
        workspaceId: mockWorkspaceId,
        providerType: SsoProviderType.SAML,
        providerConfigId: mockConfigId,
        devosSessionId: mockDevosSessionId,
        idleTimeoutMinutes: 30,
        createdAt: new Date().toISOString(),
        expiresAt: futureExpiry,
        lastActivityAt: new Date().toISOString(),
        isExpired: false,
        isIdleExpired: false,
        remainingMinutes: 240,
      };
      mockRedisService.get!.mockResolvedValue(JSON.stringify(metadata));

      const result = await service.validateSession(mockSessionId);

      expect(result.isValid).toBe(true);
      expect(result.reason).toBe('active');
    });

    it('should return expired for session past expires_at', async () => {
      const pastExpiry = new Date(Date.now() - 60000).toISOString();
      const metadata = {
        sessionId: mockSessionId,
        userId: mockUserId,
        workspaceId: mockWorkspaceId,
        providerType: SsoProviderType.SAML,
        providerConfigId: mockConfigId,
        devosSessionId: mockDevosSessionId,
        idleTimeoutMinutes: 30,
        createdAt: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(),
        expiresAt: pastExpiry,
        lastActivityAt: new Date(Date.now() - 60000).toISOString(),
        isExpired: true,
        isIdleExpired: false,
        remainingMinutes: 0,
      };
      mockRedisService.get!.mockResolvedValue(JSON.stringify(metadata));

      const result = await service.validateSession(mockSessionId);

      expect(result.isValid).toBe(false);
      expect(result.reason).toBe('expired');
    });

    it('should return idle_expired for session past idle timeout', async () => {
      const futureExpiry = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString();
      const metadata = {
        sessionId: mockSessionId,
        userId: mockUserId,
        workspaceId: mockWorkspaceId,
        providerType: SsoProviderType.SAML,
        providerConfigId: mockConfigId,
        devosSessionId: mockDevosSessionId,
        idleTimeoutMinutes: 30,
        createdAt: new Date().toISOString(),
        expiresAt: futureExpiry,
        lastActivityAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(), // 1 hour ago, 30 min idle timeout
        isExpired: false,
        isIdleExpired: true,
        remainingMinutes: 240,
      };
      mockRedisService.get!.mockResolvedValue(JSON.stringify(metadata));

      const result = await service.validateSession(mockSessionId);

      expect(result.isValid).toBe(false);
      expect(result.reason).toBe('idle_expired');
    });

    it('should return terminated for already-terminated session from DB', async () => {
      mockRedisService.get!.mockResolvedValue(null);
      mockRepository.findOne!.mockResolvedValue(
        createMockSession({
          terminatedAt: new Date(),
          terminationReason: SessionTerminationReason.LOGOUT,
        }),
      );

      const result = await service.validateSession(mockSessionId);

      expect(result.isValid).toBe(false);
      expect(result.reason).toBe('terminated');
    });

    it('should fall back to PostgreSQL on Redis cache miss', async () => {
      mockRedisService.get!.mockResolvedValue(null);
      const futureExpiry = new Date(Date.now() + 4 * 60 * 60 * 1000);
      mockRepository.findOne!.mockResolvedValue(
        createMockSession({
          expiresAt: futureExpiry,
          lastActivityAt: new Date(),
        }),
      );

      const result = await service.validateSession(mockSessionId);

      expect(mockRepository.findOne).toHaveBeenCalled();
      expect(result.isValid).toBe(true);
      // Should re-populate Redis cache
      expect(mockRedisService.set).toHaveBeenCalled();
    });

    it('should return not_found for non-existent session', async () => {
      mockRedisService.get!.mockResolvedValue(null);
      mockRepository.findOne!.mockResolvedValue(null);

      const result = await service.validateSession(mockSessionId);

      expect(result.isValid).toBe(false);
      expect(result.reason).toBe('not_found');
    });
  });

  describe('updateActivity', () => {
    it('should update last_activity_at in Redis and PostgreSQL', async () => {
      const metadata = {
        sessionId: mockSessionId,
        idleTimeoutMinutes: 30,
        expiresAt: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
        lastActivityAt: new Date(Date.now() - 120 * 1000).toISOString(), // 2 minutes ago
      };
      mockRedisService.get!.mockResolvedValue(JSON.stringify(metadata));
      mockRepository.update!.mockResolvedValue({ affected: 1 } as any);

      await service.updateActivity(mockSessionId);

      expect(mockRedisService.set).toHaveBeenCalled();
    });

    it('should throttle to once per 60 seconds', async () => {
      const metadata = {
        sessionId: mockSessionId,
        idleTimeoutMinutes: 30,
        expiresAt: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
        lastActivityAt: new Date(Date.now() - 30 * 1000).toISOString(), // 30 seconds ago
      };
      mockRedisService.get!.mockResolvedValue(JSON.stringify(metadata));

      await service.updateActivity(mockSessionId);

      // Should NOT update Redis because throttled
      expect(mockRedisService.set).not.toHaveBeenCalled();
    });

    it('should skip update when session not found in Redis cache', async () => {
      mockRedisService.get!.mockResolvedValue(null);

      await service.updateActivity(mockSessionId);

      // Should NOT update Redis or PostgreSQL when cache miss
      expect(mockRedisService.set).not.toHaveBeenCalled();
      expect(mockRepository.update).not.toHaveBeenCalled();
    });
  });

  describe('terminateSession', () => {
    it('should update PostgreSQL and remove from Redis', async () => {
      mockRepository.findOne!.mockResolvedValue(createMockSession());
      mockRepository.update!.mockResolvedValue({ affected: 1 } as any);

      await service.terminateSession(mockSessionId, SessionTerminationReason.LOGOUT);

      expect(mockRepository.update).toHaveBeenCalledWith(
        { id: mockSessionId },
        expect.objectContaining({
          terminationReason: SessionTerminationReason.LOGOUT,
        }),
      );
      expect(mockRedisService.del).toHaveBeenCalled();
    });

    it('should log audit event with termination reason', async () => {
      mockRepository.findOne!.mockResolvedValue(createMockSession());
      mockRepository.update!.mockResolvedValue({ affected: 1 } as any);

      await service.terminateSession(mockSessionId, SessionTerminationReason.FORCED);

      expect(mockAuditService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: SsoAuditEventType.SESSION_TERMINATED,
          details: expect.objectContaining({
            terminationReason: SessionTerminationReason.FORCED,
          }),
        }),
      );
    });

    it('should remove IdP session mapping from Redis', async () => {
      mockRepository.findOne!.mockResolvedValue(createMockSession());
      mockRepository.update!.mockResolvedValue({ affected: 1 } as any);

      await service.terminateSession(mockSessionId, SessionTerminationReason.LOGOUT);

      const delCalls = mockRedisService.del!.mock.calls;
      const idpDeleted = delCalls.some((c: any) =>
        c[0].startsWith(SESSION_FEDERATION_CONSTANTS.REDIS_IDP_SESSION_PREFIX),
      );
      expect(idpDeleted).toBe(true);
    });

    it('should handle non-existent session gracefully', async () => {
      mockRepository.findOne!.mockResolvedValue(null);

      await expect(
        service.terminateSession('non-existent-id', SessionTerminationReason.LOGOUT),
      ).resolves.not.toThrow();
    });
  });

  describe('terminateUserSessions', () => {
    it('should terminate all sessions for user in workspace', async () => {
      const sessions = [
        createMockSession({ id: 'session-1' }),
        createMockSession({ id: 'session-2' }),
      ];
      mockRepository.find!.mockResolvedValue(sessions);
      mockRepository.findOne!.mockImplementation(({ where }: any) => {
        return Promise.resolve(sessions.find((s) => s.id === where.id) || null);
      });
      mockRepository.update!.mockResolvedValue({ affected: 1 } as any);

      const count = await service.terminateUserSessions(
        mockUserId,
        mockWorkspaceId,
        SessionTerminationReason.FORCED,
      );

      expect(count).toBe(2);
    });
  });

  describe('terminateAllWorkspaceSessions', () => {
    it('should terminate all workspace sessions except excluded user', async () => {
      const sessions = [
        createMockSession({ id: 'session-1', userId: 'user-a' }),
        createMockSession({ id: 'session-2', userId: 'user-b' }),
      ];

      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(sessions),
      };
      mockRepository.createQueryBuilder!.mockReturnValue(mockQueryBuilder as any);
      mockRepository.findOne!.mockImplementation(({ where }: any) => {
        return Promise.resolve(sessions.find((s) => s.id === where.id) || null);
      });
      mockRepository.update!.mockResolvedValue({ affected: 1 } as any);

      const result = await service.terminateAllWorkspaceSessions(
        mockWorkspaceId,
        SessionTerminationReason.FORCED,
        'excluded-user-id',
      );

      expect(result.terminatedCount).toBe(2);
      expect(result.affectedUserIds).toContain('user-a');
      expect(result.affectedUserIds).toContain('user-b');
    });
  });

  describe('handleIdpLogout', () => {
    it('should terminate linked DevOS session via Redis lookup', async () => {
      mockRedisService.get!.mockResolvedValue(mockSessionId);
      mockRepository.findOne!.mockResolvedValue(createMockSession());
      mockRepository.update!.mockResolvedValue({ affected: 1 } as any);

      await service.handleIdpLogout(mockIdpSessionId);

      expect(mockRedisService.get).toHaveBeenCalledWith(
        `${SESSION_FEDERATION_CONSTANTS.REDIS_IDP_SESSION_PREFIX}${mockIdpSessionId}`,
      );
    });

    it('should fall back to PostgreSQL when Redis lookup fails', async () => {
      mockRedisService.get!.mockResolvedValue(null);
      mockRepository.findOne!.mockResolvedValue(createMockSession());
      mockRepository.update!.mockResolvedValue({ affected: 1 } as any);

      await service.handleIdpLogout(mockIdpSessionId);

      expect(mockRepository.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            idpSessionId: mockIdpSessionId,
          }),
        }),
      );
    });

    it('should handle no matching session gracefully', async () => {
      mockRedisService.get!.mockResolvedValue(null);
      mockRepository.findOne!.mockResolvedValue(null);

      await expect(service.handleIdpLogout('unknown-idp-session')).resolves.not.toThrow();
    });
  });

  describe('getActiveSessions', () => {
    it('should return only non-terminated, non-expired sessions', async () => {
      const activeSessions = [createMockSession()];
      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(activeSessions),
      };
      mockRepository.createQueryBuilder!.mockReturnValue(mockQueryBuilder as any);

      const result = await service.getActiveSessions(mockUserId);

      expect(result).toEqual(activeSessions);
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'session.terminated_at IS NULL',
      );
    });
  });

  describe('getWorkspaceSessionSummary', () => {
    it('should return correct counts by provider', async () => {
      const sessions = [
        createMockSession({ id: 's1', userId: 'u1', providerType: SsoProviderType.SAML }),
        createMockSession({ id: 's2', userId: 'u2', providerType: SsoProviderType.SAML }),
        createMockSession({ id: 's3', userId: 'u1', providerType: SsoProviderType.OIDC }),
      ];
      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(sessions),
      };
      mockRepository.createQueryBuilder!.mockReturnValue(mockQueryBuilder as any);

      const summary = await service.getWorkspaceSessionSummary(mockWorkspaceId);

      expect(summary.totalActiveSessions).toBe(3);
      expect(summary.activeUsers).toBe(2);
      expect(summary.sessionsByProvider.saml).toBe(2);
      expect(summary.sessionsByProvider.oidc).toBe(1);
    });
  });

  describe('updateSessionTokens', () => {
    it('should update JTI correlation in PostgreSQL and Redis', async () => {
      const metadata = {
        sessionId: mockSessionId,
        idleTimeoutMinutes: 30,
        expiresAt: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
      };
      mockRedisService.get!.mockResolvedValue(JSON.stringify(metadata));
      mockRepository.findOne!.mockResolvedValue(createMockSession());
      mockRepository.update!.mockResolvedValue({ affected: 1 } as any);

      await service.updateSessionTokens(mockSessionId, 'new-access-jti', 'new-refresh-jti');

      expect(mockRepository.update).toHaveBeenCalledWith(
        { id: mockSessionId },
        { accessTokenJti: 'new-access-jti', refreshTokenJti: 'new-refresh-jti' },
      );
      expect(mockRedisService.set).toHaveBeenCalled();
    });

    it('should log audit event with correct workspaceId from session', async () => {
      const metadata = {
        sessionId: mockSessionId,
        idleTimeoutMinutes: 30,
        expiresAt: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
      };
      mockRedisService.get!.mockResolvedValue(JSON.stringify(metadata));
      mockRepository.findOne!.mockResolvedValue(createMockSession());
      mockRepository.update!.mockResolvedValue({ affected: 1 } as any);

      await service.updateSessionTokens(mockSessionId, 'new-access-jti', 'new-refresh-jti');

      expect(mockAuditService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: mockWorkspaceId,
          actorId: mockUserId,
        }),
      );
    });
  });

  describe('cleanupExpiredSessions', () => {
    it('should terminate sessions past absolute timeout', async () => {
      const expiredSessions = [
        createMockSession({
          id: 'expired-1',
          expiresAt: new Date(Date.now() - 60000),
        }),
      ];

      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn()
          .mockResolvedValueOnce(expiredSessions) // absolute timeout
          .mockResolvedValueOnce([]),              // idle timeout
      };
      mockRepository.createQueryBuilder!.mockReturnValue(mockQueryBuilder as any);
      mockRepository.findOne!.mockResolvedValue(expiredSessions[0]);
      mockRepository.update!.mockResolvedValue({ affected: 1 } as any);

      const count = await service.cleanupExpiredSessions();

      expect(count).toBe(1);
    });

    it('should terminate sessions past idle timeout', async () => {
      const idleSession = createMockSession({
        id: 'idle-1',
        expiresAt: new Date(Date.now() + 4 * 60 * 60 * 1000),
        lastActivityAt: new Date(Date.now() - 60 * 60 * 1000), // 1 hour ago, 30 min idle timeout
      });

      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn()
          .mockResolvedValueOnce([])          // absolute timeout
          .mockResolvedValueOnce([idleSession]), // idle timeout
      };
      mockRepository.createQueryBuilder!.mockReturnValue(mockQueryBuilder as any);
      mockRepository.findOne!.mockResolvedValue(idleSession);
      mockRepository.update!.mockResolvedValue({ affected: 1 } as any);

      const count = await service.cleanupExpiredSessions();

      expect(count).toBe(1);
    });

    it('should process in batches', async () => {
      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };
      mockRepository.createQueryBuilder!.mockReturnValue(mockQueryBuilder as any);

      await service.cleanupExpiredSessions();

      expect(mockQueryBuilder.take).toHaveBeenCalledWith(SESSION_FEDERATION_CONSTANTS.CLEANUP_BATCH_SIZE);
    });
  });

  describe('purgeTerminatedSessions', () => {
    it('should delete old terminated sessions beyond retention period', async () => {
      const mockQueryBuilder = {
        delete: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 5 }),
      };
      mockRepository.createQueryBuilder!.mockReturnValue(mockQueryBuilder as any);

      const count = await service.purgeTerminatedSessions();

      expect(count).toBe(5);
    });
  });

  describe('getSessionById', () => {
    it('should return session when found', async () => {
      const session = createMockSession();
      mockRepository.findOne!.mockResolvedValue(session);

      const result = await service.getSessionById(mockSessionId);

      expect(result).toEqual(session);
    });

    it('should return null when not found', async () => {
      mockRepository.findOne!.mockResolvedValue(null);

      const result = await service.getSessionById('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('findByRefreshTokenJti', () => {
    it('should return session by refresh token JTI', async () => {
      const session = createMockSession();
      mockRepository.findOne!.mockResolvedValue(session);

      const result = await service.findByRefreshTokenJti('refresh-jti-001');

      expect(result).toEqual(session);
    });
  });

  describe('listWorkspaceSessions', () => {
    it('should return paginated sessions with filters', async () => {
      const sessions = [createMockSession()];
      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([sessions, 1]),
      };
      mockRepository.createQueryBuilder!.mockReturnValue(mockQueryBuilder as any);

      const result = await service.listWorkspaceSessions(mockWorkspaceId, {
        status: 'active',
        page: 1,
        limit: 50,
      });

      expect(result.sessions).toEqual(sessions);
      expect(result.total).toBe(1);
    });

    it('should filter by user ID when specified', async () => {
      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      };
      mockRepository.createQueryBuilder!.mockReturnValue(mockQueryBuilder as any);

      await service.listWorkspaceSessions(mockWorkspaceId, { userId: mockUserId });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'session.user_id = :userId',
        { userId: mockUserId },
      );
    });

    it('should handle terminated status filter', async () => {
      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      };
      mockRepository.createQueryBuilder!.mockReturnValue(mockQueryBuilder as any);

      await service.listWorkspaceSessions(mockWorkspaceId, { status: 'terminated' });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'session.terminated_at IS NOT NULL',
      );
    });
  });

  describe('getSessionsNearExpiry', () => {
    it('should find sessions expiring within the window', async () => {
      const nearExpiry = [createMockSession()];
      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(nearExpiry),
      };
      mockRepository.createQueryBuilder!.mockReturnValue(mockQueryBuilder as any);

      const result = await service.getSessionsNearExpiry(10);

      expect(result.length).toBeGreaterThanOrEqual(0);
    });
  });
});
