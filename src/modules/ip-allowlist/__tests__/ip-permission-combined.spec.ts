/**
 * IP Allowlist + Permission Guard Combined Tests
 *
 * Story 20-8: Permission Testing Suite (AC2)
 *
 * Tests verifying that IP allowlisting and permission enforcement work together
 * in the guard chain: IpAllowlistGuard -> PermissionGuard -> Handler
 */

import { ForbiddenException, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IpAllowlistGuard } from '../../../common/guards/ip-allowlist.guard';
import { PermissionGuard, RequiredPermission } from '../../../common/guards/permission.guard';
import { WorkspaceRole } from '../../../database/entities/workspace-member.entity';

// ---- Test Constants ----
const WORKSPACE_ID = 'ws-11111111-1111-1111-1111-111111111111';
const USER_ID = 'usr-22222222-2222-2222-2222-222222222222';
const ALLOWED_IP = '10.0.0.1';
const BLOCKED_IP = '192.168.1.100';

// ---- Mock Services ----

const mockIpAllowlistService = {
  checkIp: jest.fn(),
  recordBlockedAttempt: jest.fn().mockResolvedValue(undefined),
};

const mockPermissionCacheService = {
  checkPermission: jest.fn(),
};

const mockAuditService = {
  log: jest.fn().mockResolvedValue(undefined),
};

const mockPermissionAuditService = {
  record: jest.fn().mockResolvedValue(undefined),
};

// ---- Helper to create mock ExecutionContext ----

function createMockContext(overrides?: {
  user?: any;
  params?: any;
  body?: any;
  query?: any;
  workspaceRole?: WorkspaceRole;
  ip?: string;
  url?: string;
  path?: string;
  method?: string;
}): ExecutionContext {
  const request = {
    user: overrides?.user ?? { id: USER_ID },
    params: overrides?.params ?? { workspaceId: WORKSPACE_ID },
    body: overrides?.body ?? {},
    query: overrides?.query ?? {},
    workspaceRole: overrides?.workspaceRole,
    ip: overrides?.ip ?? ALLOWED_IP,
    url: overrides?.url ?? '/api/v1/workspaces/ws/projects',
    path: overrides?.path ?? '/api/v1/workspaces/ws/projects',
    method: overrides?.method ?? 'POST',
    headers: { 'user-agent': 'test-agent' },
    connection: { remoteAddress: overrides?.ip ?? ALLOWED_IP },
  };

  return {
    getHandler: jest.fn(),
    getClass: jest.fn(),
    switchToHttp: jest.fn().mockReturnValue({
      getRequest: jest.fn().mockReturnValue(request),
    }),
  } as any;
}

describe('IP Allowlist + Permission Guard Combined Tests', () => {
  let ipGuard: IpAllowlistGuard;
  let permissionGuard: PermissionGuard;
  let reflector: jest.Mocked<Reflector>;

  beforeEach(() => {
    jest.clearAllMocks();

    reflector = {
      getAllAndOverride: jest.fn(),
    } as any;

    ipGuard = new IpAllowlistGuard(
      reflector,
      mockIpAllowlistService as any,
      mockPermissionAuditService as any,
    );

    permissionGuard = new PermissionGuard(
      reflector,
      mockPermissionCacheService as any,
      mockAuditService as any,
      mockPermissionAuditService as any,
    );
  });

  // ---- IP Blocked -> Permission Never Reached ----

  describe('IP blocked prevents permission check', () => {
    it('should throw 403 from IP guard before permission guard is invoked', async () => {
      reflector.getAllAndOverride.mockReturnValue(undefined); // no skip decorator
      mockIpAllowlistService.checkIp.mockResolvedValue({ allowed: false, reason: 'not_in_allowlist' });

      const context = createMockContext({ ip: BLOCKED_IP });

      await expect(ipGuard.canActivate(context)).rejects.toThrow(ForbiddenException);
      expect(mockPermissionCacheService.checkPermission).not.toHaveBeenCalled();
    });

    it('should include IP_NOT_ALLOWED code in error response', async () => {
      reflector.getAllAndOverride.mockReturnValue(undefined);
      mockIpAllowlistService.checkIp.mockResolvedValue({ allowed: false, reason: 'not_in_allowlist' });

      const context = createMockContext({ ip: BLOCKED_IP });

      try {
        await ipGuard.canActivate(context);
        fail('Expected ForbiddenException');
      } catch (e: any) {
        const response = e.getResponse();
        expect(response.code).toBe('IP_NOT_ALLOWED');
        expect(response.message).toContain('IP address is not allowed');
      }
    });
  });

  // ---- IP Allowed -> Permission Check ----

  describe('IP allowed proceeds to permission check', () => {
    it('should allow IP then check permission (both pass)', async () => {
      // IP guard passes
      reflector.getAllAndOverride
        .mockReturnValueOnce(undefined) // skip_ip_check = undefined
        .mockReturnValue({ resource: 'projects', action: 'create' } as RequiredPermission);
      mockIpAllowlistService.checkIp.mockResolvedValue({ allowed: true, reason: 'in_allowlist' });
      mockPermissionCacheService.checkPermission.mockResolvedValue(true);

      const context = createMockContext({ ip: ALLOWED_IP });

      const ipResult = await ipGuard.canActivate(context);
      expect(ipResult).toBe(true);

      // Now permission guard runs
      const permResult = await permissionGuard.canActivate(context);
      expect(permResult).toBe(true);
    });

    it('should allow IP but deny permission -> 403 with permission error', async () => {
      reflector.getAllAndOverride
        .mockReturnValueOnce(undefined) // skip_ip_check
        .mockReturnValue({ resource: 'deployments', action: 'approve' } as RequiredPermission);
      mockIpAllowlistService.checkIp.mockResolvedValue({ allowed: true, reason: 'in_allowlist' });
      mockPermissionCacheService.checkPermission.mockResolvedValue(false);

      const context = createMockContext({ ip: ALLOWED_IP });

      const ipResult = await ipGuard.canActivate(context);
      expect(ipResult).toBe(true);

      await expect(permissionGuard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });
  });

  // ---- Owner Bypass ----

  describe('Workspace owner bypasses IP allowlist', () => {
    it('should allow owner even when IP is not in allowlist', async () => {
      reflector.getAllAndOverride.mockReturnValue(undefined);

      const context = createMockContext({
        ip: BLOCKED_IP,
        workspaceRole: WorkspaceRole.OWNER,
      });

      const result = await ipGuard.canActivate(context);
      expect(result).toBe(true);
      expect(mockIpAllowlistService.checkIp).not.toHaveBeenCalled();
    });
  });

  // ---- Audit Trail ----

  describe('Audit trail entries', () => {
    it('should record access_denied_ip audit event when IP is blocked', async () => {
      reflector.getAllAndOverride.mockReturnValue(undefined);
      mockIpAllowlistService.checkIp.mockResolvedValue({ allowed: false, reason: 'not_in_allowlist' });

      const context = createMockContext({ ip: BLOCKED_IP });

      try {
        await ipGuard.canActivate(context);
      } catch {
        // expected
      }

      expect(mockPermissionAuditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'access_denied_ip',
          workspaceId: WORKSPACE_ID,
          actorId: USER_ID,
          afterState: expect.objectContaining({
            clientIp: BLOCKED_IP,
          }),
        }),
      );
    });

    it('should record blocked attempt via IpAllowlistService', async () => {
      reflector.getAllAndOverride.mockReturnValue(undefined);
      mockIpAllowlistService.checkIp.mockResolvedValue({ allowed: false, reason: 'not_in_allowlist' });

      const context = createMockContext({ ip: BLOCKED_IP });

      try {
        await ipGuard.canActivate(context);
      } catch {
        // expected
      }

      expect(mockIpAllowlistService.recordBlockedAttempt).toHaveBeenCalledWith(
        WORKSPACE_ID, BLOCKED_IP, USER_ID, expect.any(String),
      );
    });
  });

  // ---- Grace Period ----

  describe('Grace period behavior', () => {
    it('should allow access during grace period even when IP would be denied', async () => {
      reflector.getAllAndOverride.mockReturnValue(undefined);
      mockIpAllowlistService.checkIp.mockResolvedValue({
        allowed: true,
        reason: 'grace_period_would_deny',
      });

      const context = createMockContext({ ip: BLOCKED_IP });

      const result = await ipGuard.canActivate(context);
      expect(result).toBe(true);
    });
  });

  // ---- No Workspace Context ----

  describe('No workspace context', () => {
    it('should pass through IP guard when no workspaceId is present', async () => {
      reflector.getAllAndOverride.mockReturnValue(undefined);
      const context = createMockContext({ params: {} });

      const result = await ipGuard.canActivate(context);
      expect(result).toBe(true);
      expect(mockIpAllowlistService.checkIp).not.toHaveBeenCalled();
    });
  });

  // ---- Skip IP Check Decorator ----

  describe('Skip IP check decorator', () => {
    it('should skip IP check when @SkipIpCheck is present', async () => {
      reflector.getAllAndOverride.mockReturnValue(true); // skip_ip_check = true

      const context = createMockContext({ ip: BLOCKED_IP });

      const result = await ipGuard.canActivate(context);
      expect(result).toBe(true);
      expect(mockIpAllowlistService.checkIp).not.toHaveBeenCalled();
    });
  });
});
