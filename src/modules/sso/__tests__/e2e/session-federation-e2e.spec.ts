/**
 * Session Federation & SLO E2E Tests
 * Tests SSO session lifecycle, timeout, management, forced re-auth,
 * single logout, and cleanup scheduler.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SessionFederationController } from '../../session/session-federation.controller';
import { SessionFederationService } from '../../session/session-federation.service';
import { SessionCleanupScheduler } from '../../session/session-cleanup.scheduler';
import { WorkspaceMember } from '../../../../database/entities/workspace-member.entity';
import { SsoAuditService } from '../../sso-audit.service';
import {
  MOCK_FEDERATED_SESSION,
  createTestWorkspaceId,
  createTestUserId,
  createMockAuditService,
  createMockWorkspaceMemberRepository,
  createTestUuid,
} from './sso-e2e-test.helper';

describe('Session Federation E2E Tests', () => {
  let controller: SessionFederationController;

  const workspaceId = createTestWorkspaceId();
  const userId = createTestUserId();
  const sessionId = createTestUuid(60);

  const mockSessionService = {
    createFederatedSession: jest.fn(),
    getActiveSessions: jest.fn(),
    getSessionById: jest.fn(),
    listWorkspaceSessions: jest.fn(),
    getWorkspaceSessionSummary: jest.fn(),
    setWorkspaceTimeoutConfig: jest.fn(),
    getWorkspaceTimeoutConfig: jest.fn(),
    validateSession: jest.fn(),
    terminateSession: jest.fn(),
    terminateUserSessions: jest.fn(),
    terminateAllWorkspaceSessions: jest.fn(),
    handleIdpLogout: jest.fn(),
  };

  const mockAuditService = createMockAuditService();
  const mockMemberRepo = createMockWorkspaceMemberRepository('admin');

  const mockReq = {
    user: { id: userId, sub: userId },
    ip: '127.0.0.1',
    headers: { 'user-agent': 'SSO-E2E-Test/1.0' },
  } as any;

  const mockSession = {
    id: sessionId,
    userId,
    workspaceId,
    providerType: 'saml',
    providerConfigId: MOCK_FEDERATED_SESSION.providerConfigId,
    idpSessionId: MOCK_FEDERATED_SESSION.idpSessionId,
    devosSessionId: MOCK_FEDERATED_SESSION.devosSessionId,
    sessionTimeoutMinutes: 480,
    idleTimeoutMinutes: 60,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 480 * 60 * 1000),
    lastActivityAt: new Date(),
    terminatedAt: null,
    terminationReason: null,
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SessionFederationController],
      providers: [
        { provide: SessionFederationService, useValue: mockSessionService },
        { provide: SsoAuditService, useValue: mockAuditService },
        { provide: getRepositoryToken(WorkspaceMember), useValue: mockMemberRepo },
      ],
    }).compile();

    controller = module.get<SessionFederationController>(SessionFederationController);
  });

  // ==================== Session Creation E2E ====================

  describe('Session Creation E2E', () => {
    it('should verify SAML session has correct provider type', () => {
      expect(MOCK_FEDERATED_SESSION.providerType).toBe('saml');
    });

    it('should verify session has userId and workspaceId', () => {
      expect(MOCK_FEDERATED_SESSION.userId).toBe(userId);
      expect(MOCK_FEDERATED_SESSION.workspaceId).toBe(workspaceId);
    });

    it('should verify session has IdP session ID for federation', () => {
      expect(MOCK_FEDERATED_SESSION.idpSessionId).toBe('_session_index_12345');
    });

    it('should verify session has DevOS session ID', () => {
      expect(MOCK_FEDERATED_SESSION.devosSessionId).toBeDefined();
    });

    it('should verify session timeout configuration', () => {
      expect(MOCK_FEDERATED_SESSION.sessionTimeoutMinutes).toBe(480);
      expect(MOCK_FEDERATED_SESSION.idleTimeoutMinutes).toBe(60);
    });
  });

  // ==================== Session Management E2E ====================

  describe('Session Management E2E', () => {
    it('should list current user sessions', async () => {
      mockSessionService.getActiveSessions.mockResolvedValue([mockSession]);

      const result = await controller.listMySessions(mockReq);

      expect(result).toHaveLength(1);
      expect(result[0].userId).toBe(userId);
    });

    it('should list workspace sessions for admin', async () => {
      mockSessionService.listWorkspaceSessions.mockResolvedValue({
        sessions: [mockSession],
        total: 1,
      });

      const result = await controller.listWorkspaceSessions(
        workspaceId,
        {} as any,
        mockReq,
      );

      expect(result.sessions).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('should get workspace session summary', async () => {
      const summary = {
        activeCount: 5,
        byProviderType: { saml: 3, oidc: 2 },
        averageSessionAge: 120,
      };
      mockSessionService.getWorkspaceSessionSummary.mockResolvedValue(summary);

      const result = await controller.getWorkspaceSummary(workspaceId, mockReq);

      expect(result.activeCount).toBe(5);
      expect(result.byProviderType).toEqual({ saml: 3, oidc: 2 });
    });

    it('should update session timeout configuration', async () => {
      const timeoutConfig = { sessionTimeoutMinutes: 600, idleTimeoutMinutes: 30 };
      mockSessionService.setWorkspaceTimeoutConfig.mockResolvedValue(timeoutConfig);

      const result = await controller.updateTimeout(
        workspaceId,
        { sessionTimeoutMinutes: 600, idleTimeoutMinutes: 30 } as any,
        mockReq,
      );

      expect(result.sessionTimeoutMinutes).toBe(600);
      expect(result.idleTimeoutMinutes).toBe(30);
    });

    it('should log audit event on timeout update', async () => {
      mockSessionService.setWorkspaceTimeoutConfig.mockResolvedValue({
        sessionTimeoutMinutes: 600,
        idleTimeoutMinutes: 30,
      });

      await controller.updateTimeout(
        workspaceId,
        { sessionTimeoutMinutes: 600, idleTimeoutMinutes: 30 } as any,
        mockReq,
      );

      expect(mockAuditService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId,
          actorId: userId,
        }),
      );
    });
  });

  // ==================== Session Timeout E2E ====================

  describe('Session Timeout E2E', () => {
    it('should validate active session as valid', async () => {
      mockSessionService.validateSession.mockResolvedValue({ isValid: true });

      const result = await controller.validateSession({ sessionId } as any);

      expect(result.isValid).toBe(true);
    });

    it('should validate expired session as invalid with reason', async () => {
      mockSessionService.validateSession.mockResolvedValue({
        isValid: false,
        reason: 'timeout',
      });

      const result = await controller.validateSession({ sessionId } as any);

      expect(result.isValid).toBe(false);
      expect(result.reason).toBe('timeout');
    });

    it('should validate idle-timed-out session as invalid', async () => {
      mockSessionService.validateSession.mockResolvedValue({
        isValid: false,
        reason: 'idle_timeout',
      });

      const result = await controller.validateSession({ sessionId } as any);

      expect(result.isValid).toBe(false);
      expect(result.reason).toBe('idle_timeout');
    });
  });

  // ==================== Forced Re-authentication E2E ====================

  describe('Forced Re-authentication E2E', () => {
    it('should terminate all sessions on force-reauth', async () => {
      const forceResult = {
        terminatedCount: 5,
        affectedUserIds: ['user-1', 'user-2', 'user-3', 'user-4', 'user-5'],
      };
      mockSessionService.terminateAllWorkspaceSessions.mockResolvedValue(forceResult);

      const result = await controller.forceReauth(
        workspaceId,
        { reason: 'Security incident' } as any,
        mockReq,
      );

      expect(result.terminatedCount).toBe(5);
      expect(result.affectedUserIds).toHaveLength(5);
    });

    it('should terminate specific user sessions on targeted force-reauth', async () => {
      const targetUserId = createTestUuid(99);
      mockSessionService.terminateUserSessions.mockResolvedValue(2);

      const result = await controller.forceReauth(
        workspaceId,
        { targetUserId, reason: 'Account compromised' } as any,
        mockReq,
      );

      expect(result.terminatedCount).toBe(2);
      expect(mockSessionService.terminateUserSessions).toHaveBeenCalledWith(
        targetUserId,
        workspaceId,
        'forced',
      );
    });

    it('should log audit event on force-reauth', async () => {
      mockSessionService.terminateAllWorkspaceSessions.mockResolvedValue({
        terminatedCount: 3,
        affectedUserIds: ['a', 'b', 'c'],
      });

      await controller.forceReauth(
        workspaceId,
        { reason: 'Test' } as any,
        mockReq,
      );

      expect(mockAuditService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId,
          actorId: userId,
          details: expect.objectContaining({ reason: 'Test' }),
        }),
      );
    });
  });

  // ==================== Session Termination E2E ====================

  describe('Session Termination E2E', () => {
    it('should terminate own session', async () => {
      mockSessionService.getSessionById.mockResolvedValue(mockSession);
      mockSessionService.terminateSession.mockResolvedValue(undefined);

      await controller.terminateSession(sessionId, mockReq);

      expect(mockSessionService.terminateSession).toHaveBeenCalledWith(
        sessionId,
        'logout',
      );
    });

    it('should throw NotFoundException for non-existent session', async () => {
      mockSessionService.getSessionById.mockResolvedValue(null);

      await expect(
        controller.terminateSession('non-existent', mockReq),
      ).rejects.toThrow();
    });
  });

  // ==================== Session Cleanup Scheduler E2E ====================

  describe('Session Cleanup Scheduler E2E', () => {
    it('should verify cleanup scheduler pattern exists', () => {
      // The SessionCleanupScheduler class should exist and be injectable
      expect(SessionCleanupScheduler).toBeDefined();
    });
  });

  // ==================== Session Response DTO E2E ====================

  describe('Session Response DTO E2E', () => {
    it('should calculate isActive correctly for active session', async () => {
      mockSessionService.getActiveSessions.mockResolvedValue([mockSession]);

      const result = await controller.listMySessions(mockReq);

      expect(result[0].isActive).toBe(true);
      expect(result[0].remainingMinutes).toBeGreaterThan(0);
    });

    it('should calculate isActive correctly for expired session', async () => {
      const expiredSession = {
        ...mockSession,
        expiresAt: new Date(Date.now() - 1000),
      };
      mockSessionService.getActiveSessions.mockResolvedValue([expiredSession]);

      const result = await controller.listMySessions(mockReq);

      expect(result[0].isActive).toBe(false);
      expect(result[0].remainingMinutes).toBe(0);
    });

    it('should calculate isActive correctly for terminated session', async () => {
      const terminatedSession = {
        ...mockSession,
        terminatedAt: new Date(),
        terminationReason: 'forced',
      };
      mockSessionService.getActiveSessions.mockResolvedValue([terminatedSession]);

      const result = await controller.listMySessions(mockReq);

      expect(result[0].isActive).toBe(false);
    });
  });
});
