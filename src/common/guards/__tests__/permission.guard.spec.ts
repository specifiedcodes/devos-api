/**
 * PermissionGuard Tests
 *
 * Story 20-3: Permission Enforcement Middleware
 * Tests for the NestJS guard that enforces granular permissions via @Permission decorator.
 * Covers: no-op when no decorator, userId/workspaceId extraction, grant/deny paths,
 * error response format, audit logging.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { PermissionGuard, RequiredPermission } from '../permission.guard';
import { PermissionCacheService } from '../../../modules/custom-roles/services/permission-cache.service';
import { AuditService } from '../../../shared/audit/audit.service';

describe('PermissionGuard', () => {
  let guard: PermissionGuard;
  let reflector: jest.Mocked<Reflector>;
  let permissionCacheService: jest.Mocked<Partial<PermissionCacheService>>;
  let auditService: jest.Mocked<Partial<AuditService>>;

  const mockUserId = '11111111-1111-1111-1111-111111111111';
  const mockWorkspaceId = '22222222-2222-2222-2222-222222222222';

  function createMockContext(overrides?: {
    user?: any;
    params?: any;
    body?: any;
    url?: string;
    method?: string;
    ip?: string;
    headers?: any;
  }): ExecutionContext {
    const request = {
      user: overrides?.user ?? { id: mockUserId },
      params: overrides?.params ?? { workspaceId: mockWorkspaceId },
      body: overrides?.body ?? {},
      url: overrides?.url ?? '/api/v1/workspaces/ws/projects',
      method: overrides?.method ?? 'POST',
      ip: overrides?.ip ?? '127.0.0.1',
      headers: overrides?.headers ?? { 'user-agent': 'test-agent' },
    };

    return {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue(request),
      }),
    } as any;
  }

  beforeEach(async () => {
    reflector = {
      getAllAndOverride: jest.fn(),
    } as any;

    permissionCacheService = {
      checkPermission: jest.fn(),
    };

    auditService = {
      log: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PermissionGuard,
        { provide: Reflector, useValue: reflector },
        { provide: PermissionCacheService, useValue: permissionCacheService },
        { provide: AuditService, useValue: auditService },
      ],
    }).compile();

    guard = module.get<PermissionGuard>(PermissionGuard);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ---- No-op for undecorated endpoints ----

  describe('no decorator present', () => {
    it('should return true when no @Permission decorator is set', async () => {
      reflector.getAllAndOverride.mockReturnValue(undefined);
      const context = createMockContext();

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(permissionCacheService.checkPermission).not.toHaveBeenCalled();
    });

    it('should return true when decorator returns null', async () => {
      reflector.getAllAndOverride.mockReturnValue(null);
      const context = createMockContext();

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
    });
  });

  // ---- Missing user or workspace context ----

  describe('missing context', () => {
    const permission: RequiredPermission = { resource: 'projects', action: 'create' };

    it('should throw ForbiddenException when userId is missing', async () => {
      reflector.getAllAndOverride.mockReturnValue(permission);
      const context = createMockContext({ user: {} });

      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
      await expect(guard.canActivate(context)).rejects.toThrow('Missing user or workspace context');
    });

    it('should throw ForbiddenException when workspaceId is missing', async () => {
      reflector.getAllAndOverride.mockReturnValue(permission);
      const context = createMockContext({ params: {}, body: {} });

      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });

    it('should extract workspaceId from params.id fallback', async () => {
      reflector.getAllAndOverride.mockReturnValue(permission);
      permissionCacheService.checkPermission!.mockResolvedValue(true);
      const context = createMockContext({ params: { id: mockWorkspaceId } });

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(permissionCacheService.checkPermission).toHaveBeenCalledWith(
        mockUserId, mockWorkspaceId, 'projects', 'create',
      );
    });

    it('should extract workspaceId from body.workspaceId fallback', async () => {
      reflector.getAllAndOverride.mockReturnValue(permission);
      permissionCacheService.checkPermission!.mockResolvedValue(true);
      const context = createMockContext({ params: {}, body: { workspaceId: mockWorkspaceId } });

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
    });
  });

  // ---- Permission granted ----

  describe('permission granted', () => {
    it('should return true when permission is granted', async () => {
      const permission: RequiredPermission = { resource: 'projects', action: 'create' };
      reflector.getAllAndOverride.mockReturnValue(permission);
      permissionCacheService.checkPermission!.mockResolvedValue(true);
      const context = createMockContext();

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
    });

    it('should attach checkedPermission to request when granted', async () => {
      const permission: RequiredPermission = { resource: 'agents', action: 'view' };
      reflector.getAllAndOverride.mockReturnValue(permission);
      permissionCacheService.checkPermission!.mockResolvedValue(true);
      const context = createMockContext();
      const request = context.switchToHttp().getRequest();

      await guard.canActivate(context);

      expect(request.checkedPermission).toEqual({ resource: 'agents', action: 'view' });
    });

    it('should not log audit when permission is granted', async () => {
      const permission: RequiredPermission = { resource: 'stories', action: 'read' };
      reflector.getAllAndOverride.mockReturnValue(permission);
      permissionCacheService.checkPermission!.mockResolvedValue(true);
      const context = createMockContext();

      await guard.canActivate(context);

      expect(auditService.log).not.toHaveBeenCalled();
    });
  });

  // ---- Permission denied ----

  describe('permission denied', () => {
    it('should throw ForbiddenException when permission is denied', async () => {
      const permission: RequiredPermission = { resource: 'secrets', action: 'view_plaintext' };
      reflector.getAllAndOverride.mockReturnValue(permission);
      permissionCacheService.checkPermission!.mockResolvedValue(false);
      const context = createMockContext();

      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });

    it('should include required permission in error response', async () => {
      const permission: RequiredPermission = { resource: 'deployments', action: 'approve' };
      reflector.getAllAndOverride.mockReturnValue(permission);
      permissionCacheService.checkPermission!.mockResolvedValue(false);
      const context = createMockContext();

      try {
        await guard.canActivate(context);
        fail('Expected ForbiddenException');
      } catch (e: any) {
        expect(e.getResponse()).toEqual({
          error: 'Insufficient permissions',
          required: 'deployments:approve',
          message: 'You do not have permission to perform this action',
        });
      }
    });

    it('should log audit on permission denial (fire-and-forget)', async () => {
      const permission: RequiredPermission = { resource: 'workspace', action: 'manage_roles' };
      reflector.getAllAndOverride.mockReturnValue(permission);
      permissionCacheService.checkPermission!.mockResolvedValue(false);
      const context = createMockContext();

      try {
        await guard.canActivate(context);
      } catch {
        // expected
      }

      expect(auditService.log).toHaveBeenCalledWith(
        mockWorkspaceId,
        mockUserId,
        'unauthorized_access_attempt',
        'permission_enforcement',
        mockWorkspaceId,
        expect.objectContaining({
          reason: 'insufficient_permission',
          required: 'workspace:manage_roles',
        }),
      );
    });

    it('should not fail if audit log throws', async () => {
      const permission: RequiredPermission = { resource: 'projects', action: 'delete' };
      reflector.getAllAndOverride.mockReturnValue(permission);
      permissionCacheService.checkPermission!.mockResolvedValue(false);
      auditService.log!.mockRejectedValue(new Error('Audit failed'));
      const context = createMockContext();

      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });
  });

  // ---- Various resource:action pairs ----

  describe('resource:action pairs', () => {
    const testCases: Array<{ resource: string; action: string }> = [
      { resource: 'projects', action: 'create' },
      { resource: 'agents', action: 'view' },
      { resource: 'stories', action: 'assign' },
      { resource: 'deployments', action: 'rollback' },
      { resource: 'secrets', action: 'view_plaintext' },
      { resource: 'integrations', action: 'connect' },
      { resource: 'workspace', action: 'manage_settings' },
      { resource: 'cost_management', action: 'export_reports' },
    ];

    testCases.forEach(({ resource, action }) => {
      it(`should check ${resource}:${action} permission correctly`, async () => {
        reflector.getAllAndOverride.mockReturnValue({ resource, action });
        permissionCacheService.checkPermission!.mockResolvedValue(true);
        const context = createMockContext();

        const result = await guard.canActivate(context);

        expect(result).toBe(true);
        expect(permissionCacheService.checkPermission).toHaveBeenCalledWith(
          mockUserId, mockWorkspaceId, resource, action,
        );
      });
    });
  });
});
