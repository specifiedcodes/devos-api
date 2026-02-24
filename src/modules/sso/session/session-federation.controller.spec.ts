import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { SessionFederationController } from './session-federation.controller';
import { SessionFederationService } from './session-federation.service';
import { SsoAuditService } from '../sso-audit.service';
import { SsoAuditEventType } from '../../../database/entities/sso-audit-event.entity';
import {
  SsoFederatedSession,
  SsoProviderType,
  SessionTerminationReason,
} from '../../../database/entities/sso-federated-session.entity';
import { WorkspaceMember, WorkspaceRole } from '../../../database/entities/workspace-member.entity';

describe('SessionFederationController', () => {
  let controller: SessionFederationController;
  let mockService: jest.Mocked<Partial<SessionFederationService>>;
  let mockAuditService: jest.Mocked<Partial<SsoAuditService>>;
  let mockWorkspaceMemberRepo: any;

  const mockUserId = '11111111-1111-1111-1111-111111111111';
  const mockWorkspaceId = '22222222-2222-2222-2222-222222222222';
  const mockSessionId = '44444444-4444-4444-4444-444444444444';

  const mockRequest = (userId: string = mockUserId): any => ({
    user: { id: userId, sub: userId },
  });

  const createMockSession = (overrides: Partial<SsoFederatedSession> = {}): SsoFederatedSession => ({
    id: mockSessionId,
    userId: mockUserId,
    workspaceId: mockWorkspaceId,
    providerType: SsoProviderType.SAML,
    providerConfigId: '33333333-3333-3333-3333-333333333333',
    idpSessionId: 'idp-session-001',
    devosSessionId: 'devos-session-001',
    accessTokenJti: 'access-jti',
    refreshTokenJti: 'refresh-jti',
    sessionTimeoutMinutes: 480,
    idleTimeoutMinutes: 30,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    expiresAt: new Date('2026-01-01T08:00:00Z'),
    lastActivityAt: new Date('2026-01-01T00:00:00Z'),
    terminatedAt: null,
    terminationReason: null,
    ...overrides,
  });

  beforeEach(async () => {
    mockService = {
      getActiveSessions: jest.fn().mockResolvedValue([]),
      listWorkspaceSessions: jest.fn().mockResolvedValue({ sessions: [], total: 0 }),
      getWorkspaceSessionSummary: jest.fn().mockResolvedValue({
        workspaceId: mockWorkspaceId,
        totalActiveSessions: 0,
        activeUsers: 0,
        sessionsByProvider: {},
      }),
      terminateUserSessions: jest.fn().mockResolvedValue(0),
      terminateAllWorkspaceSessions: jest.fn().mockResolvedValue({
        terminatedCount: 0,
        affectedUserIds: [],
      }),
      getSessionById: jest.fn().mockResolvedValue(null),
      terminateSession: jest.fn().mockResolvedValue(undefined),
      validateSession: jest.fn().mockResolvedValue({ isValid: true, reason: 'active' }),
      setWorkspaceTimeoutConfig: jest.fn().mockImplementation((_wsId, config) => Promise.resolve({
        sessionTimeoutMinutes: config.sessionTimeoutMinutes ?? 480,
        idleTimeoutMinutes: config.idleTimeoutMinutes ?? 30,
      })),
    };

    mockAuditService = {
      logEvent: jest.fn().mockResolvedValue({}),
    };

    mockWorkspaceMemberRepo = {
      findOne: jest.fn().mockResolvedValue(null),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SessionFederationController],
      providers: [
        { provide: SessionFederationService, useValue: mockService },
        { provide: SsoAuditService, useValue: mockAuditService },
        { provide: getRepositoryToken(WorkspaceMember), useValue: mockWorkspaceMemberRepo },
      ],
    }).compile();

    controller = module.get<SessionFederationController>(SessionFederationController);
  });

  describe('GET /sessions (listMySessions)', () => {
    it('should return current user federated sessions (200)', async () => {
      const sessions = [createMockSession()];
      (mockService.getActiveSessions as jest.Mock).mockResolvedValue(sessions);

      const result = await controller.listMySessions(mockRequest());

      expect(result.length).toBe(1);
      expect(result[0].id).toBe(mockSessionId);
      expect(mockService.getActiveSessions).toHaveBeenCalledWith(mockUserId);
    });

    it('should return empty array for user with no SSO sessions (200)', async () => {
      (mockService.getActiveSessions as jest.Mock).mockResolvedValue([]);

      const result = await controller.listMySessions(mockRequest());

      expect(result).toEqual([]);
    });
  });

  describe('GET /sessions/workspace/:workspaceId (listWorkspaceSessions)', () => {
    it('should return workspace sessions for admin (200)', async () => {
      mockWorkspaceMemberRepo.findOne.mockResolvedValue({ role: WorkspaceRole.ADMIN });
      const sessions = [createMockSession()];
      (mockService.listWorkspaceSessions as jest.Mock).mockResolvedValue({ sessions, total: 1 });

      const result = await controller.listWorkspaceSessions(
        mockWorkspaceId,
        {},
        mockRequest(),
      );

      expect(result.sessions.length).toBe(1);
      expect(result.total).toBe(1);
    });

    it('should reject non-admin users (403)', async () => {
      mockWorkspaceMemberRepo.findOne.mockResolvedValue({ role: WorkspaceRole.DEVELOPER });

      await expect(
        controller.listWorkspaceSessions(mockWorkspaceId, {}, mockRequest()),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should reject users with no workspace membership (403)', async () => {
      mockWorkspaceMemberRepo.findOne.mockResolvedValue(null);

      await expect(
        controller.listWorkspaceSessions(mockWorkspaceId, {}, mockRequest()),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should apply query filters (status, userId, pagination)', async () => {
      mockWorkspaceMemberRepo.findOne.mockResolvedValue({ role: WorkspaceRole.ADMIN });
      (mockService.listWorkspaceSessions as jest.Mock).mockResolvedValue({ sessions: [], total: 0 });

      const query = { status: 'active' as const, userId: mockUserId, page: 2, limit: 25 };
      await controller.listWorkspaceSessions(mockWorkspaceId, query, mockRequest());

      expect(mockService.listWorkspaceSessions).toHaveBeenCalledWith(
        mockWorkspaceId,
        expect.objectContaining({
          userId: mockUserId,
          status: 'active',
          page: 2,
          limit: 25,
        }),
      );
    });
  });

  describe('GET /sessions/workspace/:workspaceId/summary', () => {
    it('should return correct counts (200)', async () => {
      mockWorkspaceMemberRepo.findOne.mockResolvedValue({ role: WorkspaceRole.OWNER });
      (mockService.getWorkspaceSessionSummary as jest.Mock).mockResolvedValue({
        workspaceId: mockWorkspaceId,
        totalActiveSessions: 5,
        activeUsers: 3,
        sessionsByProvider: { saml: 3, oidc: 2 },
      });

      const result = await controller.getWorkspaceSummary(mockWorkspaceId, mockRequest());

      expect(result.totalActiveSessions).toBe(5);
      expect(result.activeUsers).toBe(3);
    });

    it('should reject non-admin users (403)', async () => {
      mockWorkspaceMemberRepo.findOne.mockResolvedValue({ role: WorkspaceRole.DEVELOPER });

      await expect(
        controller.getWorkspaceSummary(mockWorkspaceId, mockRequest()),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('PUT /sessions/workspace/:workspaceId/timeout', () => {
    it('should update timeout configuration (200)', async () => {
      mockWorkspaceMemberRepo.findOne.mockResolvedValue({ role: WorkspaceRole.ADMIN });

      const dto = { sessionTimeoutMinutes: 720, idleTimeoutMinutes: 60 };
      const result = await controller.updateTimeout(mockWorkspaceId, dto, mockRequest());

      expect(result.sessionTimeoutMinutes).toBe(720);
      expect(result.idleTimeoutMinutes).toBe(60);
    });

    it('should reject non-admin users (403)', async () => {
      mockWorkspaceMemberRepo.findOne.mockResolvedValue({ role: WorkspaceRole.DEVELOPER });

      await expect(
        controller.updateTimeout(mockWorkspaceId, {}, mockRequest()),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should log audit event on timeout update', async () => {
      mockWorkspaceMemberRepo.findOne.mockResolvedValue({ role: WorkspaceRole.ADMIN });

      await controller.updateTimeout(
        mockWorkspaceId,
        { sessionTimeoutMinutes: 720 },
        mockRequest(),
      );

      expect(mockAuditService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: SsoAuditEventType.SESSION_TIMEOUT_UPDATED,
          workspaceId: mockWorkspaceId,
        }),
      );
    });
  });

  describe('POST /sessions/workspace/:workspaceId/force-reauth', () => {
    it('should terminate all sessions (200)', async () => {
      mockWorkspaceMemberRepo.findOne.mockResolvedValue({ role: WorkspaceRole.ADMIN });
      (mockService.terminateAllWorkspaceSessions as jest.Mock).mockResolvedValue({
        terminatedCount: 5,
        affectedUserIds: ['u1', 'u2'],
      });

      const dto = { reason: 'security_incident' };
      const result = await controller.forceReauth(mockWorkspaceId, dto, mockRequest());

      expect(result.terminatedCount).toBe(5);
      expect(result.affectedUserIds).toContain('u1');
    });

    it('should terminate only target user sessions with targetUserId', async () => {
      mockWorkspaceMemberRepo.findOne.mockResolvedValue({ role: WorkspaceRole.ADMIN });
      const targetUserId = '55555555-5555-5555-5555-555555555555';
      (mockService.terminateUserSessions as jest.Mock).mockResolvedValue(2);

      const dto = { targetUserId, reason: 'policy_change' };
      const result = await controller.forceReauth(mockWorkspaceId, dto, mockRequest());

      expect(result.terminatedCount).toBe(2);
      expect(result.affectedUserIds).toContain(targetUserId);
    });

    it('should log audit event', async () => {
      mockWorkspaceMemberRepo.findOne.mockResolvedValue({ role: WorkspaceRole.ADMIN });
      (mockService.terminateAllWorkspaceSessions as jest.Mock).mockResolvedValue({
        terminatedCount: 0,
        affectedUserIds: [],
      });

      await controller.forceReauth(
        mockWorkspaceId,
        { reason: 'test_reason' },
        mockRequest(),
      );

      expect(mockAuditService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: SsoAuditEventType.FORCED_REAUTH,
          details: expect.objectContaining({
            reason: 'test_reason',
          }),
        }),
      );
    });

    it('should reject non-admin users (403)', async () => {
      mockWorkspaceMemberRepo.findOne.mockResolvedValue({ role: WorkspaceRole.DEVELOPER });

      await expect(
        controller.forceReauth(
          mockWorkspaceId,
          { reason: 'test' },
          mockRequest(),
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('DELETE /sessions/:sessionId', () => {
    it('should terminate user own session (204)', async () => {
      (mockService.getSessionById as jest.Mock).mockResolvedValue(createMockSession());

      await controller.terminateSession(mockSessionId, mockRequest());

      expect(mockService.terminateSession).toHaveBeenCalledWith(
        mockSessionId,
        SessionTerminationReason.LOGOUT,
      );
    });

    it('should allow admin to terminate any workspace session (204)', async () => {
      const adminId = '99999999-9999-9999-9999-999999999999';
      (mockService.getSessionById as jest.Mock).mockResolvedValue(
        createMockSession({ userId: 'other-user' }),
      );
      mockWorkspaceMemberRepo.findOne.mockResolvedValue({ role: WorkspaceRole.ADMIN });

      await controller.terminateSession(mockSessionId, mockRequest(adminId));

      expect(mockService.terminateSession).toHaveBeenCalled();
    });

    it('should reject termination of another user session by non-admin (403)', async () => {
      const nonAdminId = '99999999-9999-9999-9999-999999999999';
      (mockService.getSessionById as jest.Mock).mockResolvedValue(
        createMockSession({ userId: 'other-user' }),
      );
      mockWorkspaceMemberRepo.findOne.mockResolvedValue({ role: WorkspaceRole.DEVELOPER });

      await expect(
        controller.terminateSession(mockSessionId, mockRequest(nonAdminId)),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should return 404 for non-existent session', async () => {
      (mockService.getSessionById as jest.Mock).mockResolvedValue(null);

      await expect(
        controller.terminateSession('non-existent-id', mockRequest()),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('POST /sessions/validate', () => {
    it('should return valid for active session (200)', async () => {
      (mockService.validateSession as jest.Mock).mockResolvedValue({
        isValid: true,
        reason: 'active',
      });

      const result = await controller.validateSession({ sessionId: mockSessionId });

      expect(result.isValid).toBe(true);
      expect(result.reason).toBe('active');
    });

    it('should return expired for timed-out session (200)', async () => {
      (mockService.validateSession as jest.Mock).mockResolvedValue({
        isValid: false,
        reason: 'expired',
      });

      const result = await controller.validateSession({ sessionId: mockSessionId });

      expect(result.isValid).toBe(false);
      expect(result.reason).toBe('expired');
    });

    it('should return not_found for missing session', async () => {
      (mockService.validateSession as jest.Mock).mockResolvedValue({
        isValid: false,
        reason: 'not_found',
      });

      const result = await controller.validateSession({ sessionId: 'missing' });

      expect(result.isValid).toBe(false);
      expect(result.reason).toBe('not_found');
    });
  });
});
