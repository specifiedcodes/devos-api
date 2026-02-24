/**
 * Geo-Restriction + Permission Guard Combined Tests
 *
 * Story 20-8: Permission Testing Suite (AC3)
 *
 * Tests verifying that geo-restriction and permission enforcement work together
 * in the guard chain: GeoRestrictionGuard -> PermissionGuard -> Handler
 */

import { ForbiddenException, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GeoRestrictionGuard } from '../../../common/guards/geo-restriction.guard';
import { PermissionGuard, RequiredPermission } from '../../../common/guards/permission.guard';
import { WorkspaceRole } from '../../../database/entities/workspace-member.entity';

// ---- Test Constants ----
const WORKSPACE_ID = 'ws-11111111-1111-1111-1111-111111111111';
const USER_ID = 'usr-22222222-2222-2222-2222-222222222222';
const ALLOWED_COUNTRY_IP = '203.0.113.50'; // US-based IP
const BLOCKED_COUNTRY_IP = '198.51.100.10'; // Blocked country IP

// ---- Mock Services ----

const mockGeoRestrictionService = {
  checkGeo: jest.fn(),
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
    ip: overrides?.ip ?? ALLOWED_COUNTRY_IP,
    url: overrides?.url ?? '/api/v1/workspaces/ws/projects',
    path: overrides?.path ?? '/api/v1/workspaces/ws/projects',
    method: overrides?.method ?? 'GET',
    headers: { 'user-agent': 'test-agent' },
    connection: { remoteAddress: overrides?.ip ?? ALLOWED_COUNTRY_IP },
  };

  return {
    getHandler: jest.fn(),
    getClass: jest.fn(),
    switchToHttp: jest.fn().mockReturnValue({
      getRequest: jest.fn().mockReturnValue(request),
    }),
  } as any;
}

describe('Geo-Restriction + Permission Guard Combined Tests', () => {
  let geoGuard: GeoRestrictionGuard;
  let permissionGuard: PermissionGuard;
  let reflector: jest.Mocked<Reflector>;

  beforeEach(() => {
    jest.clearAllMocks();

    reflector = {
      getAllAndOverride: jest.fn(),
    } as any;

    geoGuard = new GeoRestrictionGuard(
      reflector,
      mockGeoRestrictionService as any,
      mockPermissionAuditService as any,
    );

    permissionGuard = new PermissionGuard(
      reflector,
      mockPermissionCacheService as any,
      mockAuditService as any,
      mockPermissionAuditService as any,
    );
  });

  // ---- Geo Blocked -> Permission Never Reached ----

  describe('Geo blocked prevents permission check', () => {
    it('should throw 403 from geo guard before permission guard is invoked', async () => {
      reflector.getAllAndOverride.mockReturnValue(undefined); // no skip decorator
      mockGeoRestrictionService.checkGeo.mockResolvedValue({
        allowed: false,
        detectedCountry: 'CN',
        reason: 'country_blocked',
      });

      const context = createMockContext({ ip: BLOCKED_COUNTRY_IP });

      await expect(geoGuard.canActivate(context)).rejects.toThrow(ForbiddenException);
      expect(mockPermissionCacheService.checkPermission).not.toHaveBeenCalled();
    });

    it('should include GEO_RESTRICTED code in error response', async () => {
      reflector.getAllAndOverride.mockReturnValue(undefined);
      mockGeoRestrictionService.checkGeo.mockResolvedValue({
        allowed: false,
        detectedCountry: 'RU',
        reason: 'country_blocked',
      });

      const context = createMockContext({ ip: BLOCKED_COUNTRY_IP });

      try {
        await geoGuard.canActivate(context);
        fail('Expected ForbiddenException');
      } catch (e: any) {
        const response = e.getResponse();
        expect(response.code).toBe('GEO_RESTRICTED');
        expect(response.message).toContain('Access restricted from your location');
      }
    });
  });

  // ---- Geo Allowed -> Permission Check ----

  describe('Allowed country proceeds to permission check', () => {
    it('should allow geo then check permission (both pass)', async () => {
      reflector.getAllAndOverride
        .mockReturnValueOnce(undefined) // skip_geo_check = undefined
        .mockReturnValue({ resource: 'projects', action: 'read' } as RequiredPermission);
      mockGeoRestrictionService.checkGeo.mockResolvedValue({
        allowed: true,
        detectedCountry: 'US',
        reason: 'country_allowed',
      });
      mockPermissionCacheService.checkPermission.mockResolvedValue(true);

      const context = createMockContext({ ip: ALLOWED_COUNTRY_IP });

      const geoResult = await geoGuard.canActivate(context);
      expect(geoResult).toBe(true);

      const permResult = await permissionGuard.canActivate(context);
      expect(permResult).toBe(true);
    });

    it('should allow geo but deny permission -> 403 with permission error', async () => {
      reflector.getAllAndOverride
        .mockReturnValueOnce(undefined) // skip_geo_check
        .mockReturnValue({ resource: 'secrets', action: 'view_plaintext' } as RequiredPermission);
      mockGeoRestrictionService.checkGeo.mockResolvedValue({
        allowed: true,
        detectedCountry: 'US',
        reason: 'country_allowed',
      });
      mockPermissionCacheService.checkPermission.mockResolvedValue(false);

      const context = createMockContext({ ip: ALLOWED_COUNTRY_IP });

      const geoResult = await geoGuard.canActivate(context);
      expect(geoResult).toBe(true);

      try {
        await permissionGuard.canActivate(context);
        fail('Expected ForbiddenException');
      } catch (e: any) {
        const response = e.getResponse();
        expect(response.required).toBe('secrets:view_plaintext');
      }
    });
  });

  // ---- Owner Bypass ----

  describe('Workspace owner exempt from geo-restrictions', () => {
    it('should allow owner even from blocked country', async () => {
      reflector.getAllAndOverride.mockReturnValue(undefined);

      const context = createMockContext({
        ip: BLOCKED_COUNTRY_IP,
        workspaceRole: WorkspaceRole.OWNER,
      });

      const result = await geoGuard.canActivate(context);
      expect(result).toBe(true);
      expect(mockGeoRestrictionService.checkGeo).not.toHaveBeenCalled();
    });
  });

  // ---- Blocklist vs Allowlist Mode ----

  describe('Blocklist and allowlist modes', () => {
    it('should block country in blocklist mode', async () => {
      reflector.getAllAndOverride.mockReturnValue(undefined);
      mockGeoRestrictionService.checkGeo.mockResolvedValue({
        allowed: false,
        detectedCountry: 'CN',
        reason: 'country_in_blocklist',
      });

      const context = createMockContext({ ip: BLOCKED_COUNTRY_IP });

      await expect(geoGuard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });

    it('should block country not in allowlist (allowlist mode)', async () => {
      reflector.getAllAndOverride.mockReturnValue(undefined);
      mockGeoRestrictionService.checkGeo.mockResolvedValue({
        allowed: false,
        detectedCountry: 'BR',
        reason: 'country_not_in_allowlist',
      });

      const context = createMockContext({ ip: '200.100.50.25' });

      await expect(geoGuard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });
  });

  // ---- GeoIP Lookup Failure ----

  describe('GeoIP lookup failure - fail open', () => {
    it('should allow access when GeoIP lookup fails (fail-open)', async () => {
      reflector.getAllAndOverride.mockReturnValue(undefined);
      mockGeoRestrictionService.checkGeo.mockResolvedValue({
        allowed: true,
        detectedCountry: 'unknown',
        reason: 'geoip_lookup_failed',
      });

      const context = createMockContext();

      const result = await geoGuard.canActivate(context);
      expect(result).toBe(true);
    });
  });

  // ---- Audit Trail ----

  describe('Audit trail entries', () => {
    it('should record access_denied_geo audit event when geo is blocked', async () => {
      reflector.getAllAndOverride.mockReturnValue(undefined);
      mockGeoRestrictionService.checkGeo.mockResolvedValue({
        allowed: false,
        detectedCountry: 'KP',
        reason: 'country_blocked',
      });

      const context = createMockContext({ ip: BLOCKED_COUNTRY_IP });

      try {
        await geoGuard.canActivate(context);
      } catch {
        // expected
      }

      expect(mockPermissionAuditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'access_denied_geo',
          workspaceId: WORKSPACE_ID,
          actorId: USER_ID,
          afterState: expect.objectContaining({
            detectedCountry: 'KP',
          }),
        }),
      );
    });

    it('should record blocked attempt via GeoRestrictionService', async () => {
      reflector.getAllAndOverride.mockReturnValue(undefined);
      mockGeoRestrictionService.checkGeo.mockResolvedValue({
        allowed: false,
        detectedCountry: 'IR',
        reason: 'country_blocked',
      });

      const context = createMockContext({ ip: BLOCKED_COUNTRY_IP });

      try {
        await geoGuard.canActivate(context);
      } catch {
        // expected
      }

      expect(mockGeoRestrictionService.recordBlockedAttempt).toHaveBeenCalledWith(
        WORKSPACE_ID, BLOCKED_COUNTRY_IP, USER_ID, 'IR', expect.any(String),
      );
    });
  });

  // ---- No Workspace Context ----

  describe('No workspace context', () => {
    it('should pass through geo guard when no workspaceId is present', async () => {
      reflector.getAllAndOverride.mockReturnValue(undefined);
      const context = createMockContext({ params: {} });

      const result = await geoGuard.canActivate(context);
      expect(result).toBe(true);
      expect(mockGeoRestrictionService.checkGeo).not.toHaveBeenCalled();
    });
  });

  // ---- Skip Geo Check Decorator ----

  describe('Skip geo check decorator', () => {
    it('should skip geo check when @SkipGeoCheck is present', async () => {
      reflector.getAllAndOverride.mockReturnValue(true); // skip_geo_check = true

      const context = createMockContext({ ip: BLOCKED_COUNTRY_IP });

      const result = await geoGuard.canActivate(context);
      expect(result).toBe(true);
      expect(mockGeoRestrictionService.checkGeo).not.toHaveBeenCalled();
    });
  });
});
