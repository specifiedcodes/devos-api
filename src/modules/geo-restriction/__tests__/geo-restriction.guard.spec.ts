/**
 * GeoRestrictionGuard Tests
 * Story 20-5: Geo-Restriction
 * Target: 10 tests covering guard logic, bypass, blocking
 */
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GeoRestrictionGuard, SKIP_GEO_CHECK_KEY } from '../../../common/guards/geo-restriction.guard';
import { GeoRestrictionService } from '../services/geo-restriction.service';
import { WorkspaceRole } from '../../../database/entities/workspace-member.entity';

describe('GeoRestrictionGuard', () => {
  let guard: GeoRestrictionGuard;
  let reflector: jest.Mocked<Reflector>;
  let geoRestrictionService: jest.Mocked<Partial<GeoRestrictionService>>;

  const mockWorkspaceId = '11111111-1111-1111-1111-111111111111';
  const mockUserId = '22222222-2222-2222-2222-222222222222';

  function createMockExecutionContext(overrides: {
    params?: Record<string, string>;
    body?: Record<string, string>;
    user?: { id: string };
    workspaceRole?: WorkspaceRole;
    ip?: string;
    method?: string;
    url?: string;
  } = {}): ExecutionContext {
    const request = {
      params: overrides.params ?? {},
      body: overrides.body ?? {},
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

    geoRestrictionService = {
      checkGeo: jest.fn().mockResolvedValue({ allowed: true, detectedCountry: null }),
      recordBlockedAttempt: jest.fn().mockResolvedValue(undefined),
    };

    guard = new GeoRestrictionGuard(reflector, geoRestrictionService as any);
  });

  it('should pass through when no workspaceId present', async () => {
    const context = createMockExecutionContext({ params: {} });

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
  });

  it('should pass through when @SkipGeoCheck decorator is set', async () => {
    reflector.getAllAndOverride.mockReturnValue(true);
    const context = createMockExecutionContext({
      params: { workspaceId: mockWorkspaceId },
    });

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(geoRestrictionService.checkGeo).not.toHaveBeenCalled();
  });

  it('should bypass for workspace owner', async () => {
    const context = createMockExecutionContext({
      params: { workspaceId: mockWorkspaceId },
      workspaceRole: WorkspaceRole.OWNER,
    });

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(geoRestrictionService.checkGeo).not.toHaveBeenCalled();
  });

  it('should allow when geo check returns allowed', async () => {
    geoRestrictionService.checkGeo!.mockResolvedValue({
      allowed: true,
      detectedCountry: 'US',
    });
    const context = createMockExecutionContext({
      params: { workspaceId: mockWorkspaceId },
    });

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
  });

  it('should throw 403 ForbiddenException when geo check denies', async () => {
    geoRestrictionService.checkGeo!.mockResolvedValue({
      allowed: false,
      detectedCountry: 'CN',
      reason: 'country_in_blocklist',
    });
    const context = createMockExecutionContext({
      params: { workspaceId: mockWorkspaceId },
    });

    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
  });

  it('should record blocked attempt when geo denies', async () => {
    geoRestrictionService.checkGeo!.mockResolvedValue({
      allowed: false,
      detectedCountry: 'CN',
      reason: 'country_in_blocklist',
    });
    const context = createMockExecutionContext({
      params: { workspaceId: mockWorkspaceId },
    });

    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    expect(geoRestrictionService.recordBlockedAttempt).toHaveBeenCalled();
  });

  it('should allow in log-only mode and record attempt', async () => {
    geoRestrictionService.checkGeo!.mockResolvedValue({
      allowed: true,
      detectedCountry: 'CN',
      reason: 'log_only_would_deny',
    });
    const context = createMockExecutionContext({
      params: { workspaceId: mockWorkspaceId },
    });

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(geoRestrictionService.recordBlockedAttempt).toHaveBeenCalled();
  });

  it('should allow when geo not active', async () => {
    geoRestrictionService.checkGeo!.mockResolvedValue({
      allowed: true,
      detectedCountry: null,
      reason: 'geo_not_active',
    });
    const context = createMockExecutionContext({
      params: { workspaceId: mockWorkspaceId },
    });

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
  });

  it('should extract workspaceId from body if not in params', async () => {
    geoRestrictionService.checkGeo!.mockResolvedValue({ allowed: true, detectedCountry: null });
    const context = createMockExecutionContext({
      params: {},
      body: { workspaceId: mockWorkspaceId },
    });

    await guard.canActivate(context);

    expect(geoRestrictionService.checkGeo).toHaveBeenCalledWith(mockWorkspaceId, expect.any(String));
  });

  it('should throw ForbiddenException with GEO_RESTRICTED code', async () => {
    geoRestrictionService.checkGeo!.mockResolvedValue({
      allowed: false,
      detectedCountry: 'RU',
      reason: 'country_in_blocklist',
    });
    const context = createMockExecutionContext({
      params: { workspaceId: mockWorkspaceId },
    });

    try {
      await guard.canActivate(context);
      fail('Should have thrown');
    } catch (err: any) {
      expect(err).toBeInstanceOf(ForbiddenException);
      const response = err.getResponse();
      expect(response.code).toBe('GEO_RESTRICTED');
    }
  });
});
