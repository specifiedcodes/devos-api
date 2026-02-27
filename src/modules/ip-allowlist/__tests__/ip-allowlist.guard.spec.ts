/**
 * IpAllowlistGuard Tests
 *
 * Story 20-4: IP Allowlisting
 * Target: 12 tests covering guard logic, bypass, IP extraction, blocking
 */
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IpAllowlistGuard, SKIP_IP_CHECK_KEY } from '../../../common/guards/ip-allowlist.guard';
import { IpAllowlistService } from '../services/ip-allowlist.service';
import { PermissionAuditService } from '../../permission-audit/services/permission-audit.service';
import { WorkspaceRole } from '../../../database/entities/workspace-member.entity';

describe('IpAllowlistGuard', () => {
  let guard: IpAllowlistGuard;
  let reflector: jest.Mocked<Reflector>;
  let ipAllowlistService: jest.Mocked<IpAllowlistService>;

  const mockWorkspaceId = '11111111-1111-1111-1111-111111111111';
  const mockUserId = '22222222-2222-2222-2222-222222222222';

  function createMockExecutionContext(overrides: {
    params?: Record<string, string>;
    body?: Record<string, string>;
    headers?: Record<string, string>;
    user?: { id: string };
    workspaceRole?: WorkspaceRole;
    ip?: string;
    method?: string;
    url?: string;
  } = {}): ExecutionContext {
    const request = {
      params: overrides.params ?? {},
      body: overrides.body ?? {},
      headers: overrides.headers ?? {},
      user: overrides.user ?? { id: mockUserId },
      workspaceRole: overrides.workspaceRole,
      ip: overrides.ip ?? '127.0.0.1',
      method: overrides.method ?? 'GET',
      url: overrides.url ?? '/api/test',
      connection: { remoteAddress: '127.0.0.1' },
    };

    return {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => ({}),
        getNext: () => ({}),
      }),
      getHandler: () => jest.fn(),
      getClass: () => jest.fn(),
      getType: () => 'http',
      getArgs: () => [request],
      getArgByIndex: () => request,
      switchToRpc: () => ({} as any),
      switchToWs: () => ({} as any),
    } as unknown as ExecutionContext;
  }

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(false),
    } as unknown as jest.Mocked<Reflector>;

    ipAllowlistService = {
      checkIp: jest.fn().mockResolvedValue({ allowed: true, inGracePeriod: false }),
      recordBlockedAttempt: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<IpAllowlistService>;

    const mockPermissionAuditService = { record: jest.fn().mockResolvedValue(undefined) } as unknown as PermissionAuditService;
    guard = new IpAllowlistGuard(reflector, ipAllowlistService, mockPermissionAuditService);
  });

  it('should pass through if @SkipIpCheck is present', async () => {
    reflector.getAllAndOverride.mockReturnValue(true);
    const context = createMockExecutionContext({ params: { workspaceId: mockWorkspaceId } });

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(ipAllowlistService.checkIp).not.toHaveBeenCalled();
  });

  it('should pass through if no workspaceId in request', async () => {
    const context = createMockExecutionContext({ params: {} });

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(ipAllowlistService.checkIp).not.toHaveBeenCalled();
  });

  it('should bypass for workspace owners', async () => {
    const context = createMockExecutionContext({
      params: { workspaceId: mockWorkspaceId },
      workspaceRole: WorkspaceRole.OWNER,
    });

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(ipAllowlistService.checkIp).not.toHaveBeenCalled();
  });

  it('should allow when IP is allowed', async () => {
    ipAllowlistService.checkIp.mockResolvedValue({ allowed: true, inGracePeriod: false });
    const context = createMockExecutionContext({
      params: { workspaceId: mockWorkspaceId },
      workspaceRole: WorkspaceRole.ADMIN,
    });

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
  });

  it('should throw ForbiddenException when IP is denied', async () => {
    ipAllowlistService.checkIp.mockResolvedValue({
      allowed: false,
      inGracePeriod: false,
      reason: 'ip_not_allowed',
    });
    const context = createMockExecutionContext({
      params: { workspaceId: mockWorkspaceId },
      workspaceRole: WorkspaceRole.ADMIN,
    });

    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
  });

  it('should record blocked attempt on denial', async () => {
    ipAllowlistService.checkIp.mockResolvedValue({
      allowed: false,
      inGracePeriod: false,
      reason: 'ip_not_allowed',
    });
    const context = createMockExecutionContext({
      params: { workspaceId: mockWorkspaceId },
      workspaceRole: WorkspaceRole.ADMIN,
    });

    await expect(guard.canActivate(context)).rejects.toThrow();

    expect(ipAllowlistService.recordBlockedAttempt).toHaveBeenCalledWith(
      mockWorkspaceId,
      expect.any(String),
      mockUserId,
      expect.any(String),
    );
  });

  it('should allow during grace period even with would-be denial', async () => {
    ipAllowlistService.checkIp.mockResolvedValue({
      allowed: true,
      inGracePeriod: true,
      reason: 'grace_period_would_deny',
    });
    const context = createMockExecutionContext({
      params: { workspaceId: mockWorkspaceId },
      workspaceRole: WorkspaceRole.ADMIN,
    });

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
  });

  it('should use request.ip over X-Forwarded-For header (trust proxy)', async () => {
    ipAllowlistService.checkIp.mockResolvedValue({ allowed: true, inGracePeriod: false });
    // When request.ip is set (respects Express trust proxy config), it takes priority
    const context = createMockExecutionContext({
      params: { workspaceId: mockWorkspaceId },
      workspaceRole: WorkspaceRole.ADMIN,
      headers: { 'x-forwarded-for': '203.0.113.50, 10.0.0.1' },
      ip: '192.168.1.100',
    });

    await guard.canActivate(context);

    // Should use request.ip, NOT X-Forwarded-For
    expect(ipAllowlistService.checkIp).toHaveBeenCalledWith(
      mockWorkspaceId,
      '192.168.1.100',
    );
  });

  it('should fall back to req.ip when no X-Forwarded-For', async () => {
    ipAllowlistService.checkIp.mockResolvedValue({ allowed: true, inGracePeriod: false });
    const context = createMockExecutionContext({
      params: { workspaceId: mockWorkspaceId },
      workspaceRole: WorkspaceRole.ADMIN,
      ip: '192.168.1.1',
    });

    await guard.canActivate(context);

    expect(ipAllowlistService.checkIp).toHaveBeenCalledWith(
      mockWorkspaceId,
      '192.168.1.1',
    );
  });

  it('should extract workspaceId from body when not in params', async () => {
    ipAllowlistService.checkIp.mockResolvedValue({ allowed: true, inGracePeriod: false });
    const context = createMockExecutionContext({
      params: {},
      body: { workspaceId: mockWorkspaceId },
      workspaceRole: WorkspaceRole.ADMIN,
    });

    await guard.canActivate(context);

    expect(ipAllowlistService.checkIp).toHaveBeenCalledWith(
      mockWorkspaceId,
      expect.any(String),
    );
  });

  it('should include IP_NOT_ALLOWED code in error response', async () => {
    ipAllowlistService.checkIp.mockResolvedValue({
      allowed: false,
      inGracePeriod: false,
      reason: 'ip_not_allowed',
    });
    const context = createMockExecutionContext({
      params: { workspaceId: mockWorkspaceId },
      workspaceRole: WorkspaceRole.ADMIN,
    });

    try {
      await guard.canActivate(context);
      fail('Should have thrown');
    } catch (error: any) {
      expect(error.response).toEqual(
        expect.objectContaining({ code: 'IP_NOT_ALLOWED' }),
      );
    }
  });

  it('should not block for DEVELOPER role when IP is allowed', async () => {
    ipAllowlistService.checkIp.mockResolvedValue({ allowed: true, inGracePeriod: false });
    const context = createMockExecutionContext({
      params: { workspaceId: mockWorkspaceId },
      workspaceRole: WorkspaceRole.DEVELOPER,
    });

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
  });
});
