import { Test, TestingModule } from '@nestjs/testing';
import { ScimAdminController } from '../scim-admin.controller';
import { ScimTokenService } from '../scim-token.service';
import { ScimSyncLogService } from '../scim-sync-log.service';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';

describe('ScimAdminController', () => {
  let controller: ScimAdminController;

  const workspaceId = '550e8400-e29b-41d4-a716-446655440000';
  const tokenId = '550e8400-e29b-41d4-a716-446655440002';

  const mockScimTokenService = {
    getConfig: jest.fn(),
    updateConfig: jest.fn(),
    listTokens: jest.fn(),
    generateToken: jest.fn(),
    revokeToken: jest.fn(),
    rotateToken: jest.fn(),
  };

  const mockScimSyncLogService = {
    listLogs: jest.fn(),
  };

  const createMockRequest = () => ({
    user: { id: 'actor-1', sub: 'actor-1' },
  });

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ScimAdminController],
      providers: [
        { provide: ScimTokenService, useValue: mockScimTokenService },
        { provide: ScimSyncLogService, useValue: mockScimSyncLogService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ScimAdminController>(ScimAdminController);
  });

  describe('GET /config', () => {
    it('should return SCIM config for workspace', async () => {
      const config = { id: 'cfg-1', workspaceId, enabled: true, baseUrl: '', defaultRole: 'developer', syncGroups: true, autoDeactivate: true, autoReactivate: true, createdAt: new Date(), updatedAt: new Date() };
      mockScimTokenService.getConfig.mockResolvedValue(config);

      const result = await controller.getConfig(workspaceId);

      expect(result.workspaceId).toBe(workspaceId);
      expect(result.enabled).toBe(true);
    });

    it('should create default config if none exists', async () => {
      const config = { id: 'cfg-1', workspaceId, enabled: false, baseUrl: '', defaultRole: 'developer', syncGroups: true, autoDeactivate: true, autoReactivate: true, createdAt: new Date(), updatedAt: new Date() };
      mockScimTokenService.getConfig.mockResolvedValue(config);

      const result = await controller.getConfig(workspaceId);

      expect(result.enabled).toBe(false);
    });
  });

  describe('PUT /config', () => {
    it('should update SCIM config', async () => {
      const config = { id: 'cfg-1', workspaceId, enabled: true, baseUrl: '', defaultRole: 'admin', syncGroups: true, autoDeactivate: true, autoReactivate: true, createdAt: new Date(), updatedAt: new Date() };
      mockScimTokenService.updateConfig.mockResolvedValue(config);
      const req = createMockRequest();

      const result = await controller.updateConfig(workspaceId, { enabled: true, defaultRole: 'admin' }, req as any);

      expect(result.enabled).toBe(true);
      expect(result.defaultRole).toBe('admin');
    });
  });

  describe('GET /tokens', () => {
    it('should list tokens without exposing hashes', async () => {
      const tokens = [
        { id: 'tok-1', workspaceId, tokenPrefix: 'devos_sc_ab', label: 'Token 1', isActive: true, lastUsedAt: null, expiresAt: null, createdAt: new Date() },
      ];
      mockScimTokenService.listTokens.mockResolvedValue(tokens);

      const result = await controller.listTokens(workspaceId);

      expect(result).toHaveLength(1);
      expect(result[0].tokenPrefix).toBe('devos_sc_ab');
      expect((result[0] as any).tokenHash).toBeUndefined();
    });
  });

  describe('POST /tokens', () => {
    it('should generate token and return plaintext', async () => {
      const generated = {
        token: 'devos_sc_abcdef123456',
        tokenRecord: { id: 'tok-1', workspaceId, tokenPrefix: 'devos_sc_ab', label: 'My Token', isActive: true, lastUsedAt: null, expiresAt: null, createdAt: new Date() },
      };
      mockScimTokenService.generateToken.mockResolvedValue(generated);
      const req = createMockRequest();

      const result = await controller.generateToken(workspaceId, { label: 'My Token' }, req as any);

      expect(result.token).toBe('devos_sc_abcdef123456');
      expect(result.label).toBe('My Token');
    });
  });

  describe('DELETE /tokens/:id', () => {
    it('should revoke token', async () => {
      const revoked = { id: tokenId, workspaceId, tokenPrefix: 'devos_sc_ab', label: 'Token 1', isActive: false, lastUsedAt: null, expiresAt: null, createdAt: new Date() };
      mockScimTokenService.revokeToken.mockResolvedValue(revoked);
      const req = createMockRequest();

      const result = await controller.revokeToken(tokenId, workspaceId, req as any);

      expect(result.isActive).toBe(false);
    });
  });

  describe('POST /tokens/:id/rotate', () => {
    it('should rotate token (revokes old, returns new)', async () => {
      const rotated = {
        token: 'devos_sc_newtoken123',
        tokenRecord: { id: 'new-tok', workspaceId, tokenPrefix: 'devos_sc_ne', label: 'Token 1', isActive: true, lastUsedAt: null, expiresAt: null, createdAt: new Date() },
      };
      mockScimTokenService.rotateToken.mockResolvedValue(rotated);
      const req = createMockRequest();

      const result = await controller.rotateToken(tokenId, workspaceId, req as any);

      expect(result.token).toBe('devos_sc_newtoken123');
    });
  });

  describe('GET /sync-logs', () => {
    it('should return paginated sync logs', async () => {
      const logs = {
        logs: [{ id: 'log-1', operation: 'create_user', resourceType: 'user', status: 'success', createdAt: new Date(), resourceId: null, externalId: null, errorMessage: null }],
        total: 1,
        page: 1,
        limit: 50,
      };
      mockScimSyncLogService.listLogs.mockResolvedValue(logs);

      const result = await controller.listSyncLogs(workspaceId);

      expect(result.logs).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('should filter by resourceType, operation, status', async () => {
      mockScimSyncLogService.listLogs.mockResolvedValue({ logs: [], total: 0, page: 1, limit: 50 });

      await controller.listSyncLogs(workspaceId, '1', '10', 'user', 'create_user', 'success');

      expect(mockScimSyncLogService.listLogs).toHaveBeenCalledWith(workspaceId, {
        resourceType: 'user',
        operation: 'create_user',
        status: 'success',
        page: 1,
        limit: 10,
      });
    });
  });
});
