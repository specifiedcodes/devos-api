/**
 * GeoRestrictionController Tests
 * Story 20-5: Geo-Restriction
 * Target: 12 tests covering all 6 endpoints with mock service
 */
import { Test, TestingModule } from '@nestjs/testing';
import { GeoRestrictionController } from '../controllers/geo-restriction.controller';
import { GeoRestrictionService } from '../services/geo-restriction.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RoleGuard } from '../../../common/guards/role.guard';
import { PermissionGuard } from '../../../common/guards/permission.guard';
import { GeoRestrictionMode } from '../../../database/entities/geo-restriction.entity';
import { GeoRestrictionResponseDto } from '../dto/geo-restriction-response.dto';

describe('GeoRestrictionController', () => {
  let controller: GeoRestrictionController;
  let service: jest.Mocked<Partial<GeoRestrictionService>>;

  const WORKSPACE_ID = '11111111-1111-1111-1111-111111111111';
  const USER_ID = '22222222-2222-2222-2222-222222222222';

  const mockConfig: GeoRestrictionResponseDto = {
    id: '33333333-3333-3333-3333-333333333333',
    workspaceId: WORKSPACE_ID,
    mode: GeoRestrictionMode.BLOCKLIST,
    countries: [],
    isActive: false,
    logOnly: false,
    createdBy: USER_ID,
    lastModifiedBy: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  };

  const mockReq = { user: { id: USER_ID }, ip: '127.0.0.1', connection: { remoteAddress: '127.0.0.1' } };

  beforeEach(async () => {
    service = {
      getConfig: jest.fn().mockResolvedValue(mockConfig),
      updateConfig: jest.fn().mockResolvedValue({ ...mockConfig, isActive: true }),
      testGeo: jest.fn().mockResolvedValue({
        ipAddress: '127.0.0.1',
        detectedCountry: 'US',
        isAllowed: true,
        isActive: false,
        isLogOnly: false,
        geoIpAvailable: true,
        reason: 'geo_not_active',
      }),
      getBlockedAttempts: jest.fn().mockResolvedValue([]),
      getDatabaseInfo: jest.fn().mockReturnValue({ available: true, buildDate: null, type: null }),
      getCountryList: jest.fn().mockReturnValue([{ code: 'US', name: 'United States' }]),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [GeoRestrictionController],
      providers: [
        { provide: GeoRestrictionService, useValue: service },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .overrideGuard(RoleGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .compile();

    controller = module.get<GeoRestrictionController>(GeoRestrictionController);
  });

  // ==================== CONFIG ====================

  describe('GET /', () => {
    it('should return geo-restriction config', async () => {
      const result = await controller.getConfig(WORKSPACE_ID, mockReq as any);

      expect(result.workspaceId).toBe(WORKSPACE_ID);
      expect(service.getConfig).toHaveBeenCalledWith(WORKSPACE_ID, USER_ID);
    });

    it('should pass correct workspaceId and userId', async () => {
      await controller.getConfig(WORKSPACE_ID, mockReq as any);

      expect(service.getConfig).toHaveBeenCalledWith(WORKSPACE_ID, USER_ID);
    });
  });

  describe('PUT /', () => {
    it('should update config and return updated result', async () => {
      const dto = { isActive: true };

      const result = await controller.updateConfig(WORKSPACE_ID, dto, mockReq as any);

      expect(result.isActive).toBe(true);
      expect(service.updateConfig).toHaveBeenCalledWith(WORKSPACE_ID, USER_ID, dto);
    });

    it('should pass mode update to service', async () => {
      const dto = { mode: GeoRestrictionMode.ALLOWLIST };

      await controller.updateConfig(WORKSPACE_ID, dto, mockReq as any);

      expect(service.updateConfig).toHaveBeenCalledWith(WORKSPACE_ID, USER_ID, dto);
    });
  });

  // ==================== TESTING & MONITORING ====================

  describe('POST /test', () => {
    it('should return test geo result', async () => {
      const result = await controller.testGeo(WORKSPACE_ID, mockReq as any);

      expect(result.ipAddress).toBeDefined();
      expect(result.isAllowed).toBeDefined();
      expect(service.testGeo).toHaveBeenCalled();
    });

    it('should pass client IP to service', async () => {
      await controller.testGeo(WORKSPACE_ID, mockReq as any);

      expect(service.testGeo).toHaveBeenCalledWith(WORKSPACE_ID, expect.any(String));
    });
  });

  describe('GET /blocked-attempts', () => {
    it('should return blocked attempts array', async () => {
      const result = await controller.getBlockedAttempts(WORKSPACE_ID);

      expect(Array.isArray(result)).toBe(true);
      expect(service.getBlockedAttempts).toHaveBeenCalledWith(WORKSPACE_ID);
    });

    it('should return empty array when no blocked attempts', async () => {
      service.getBlockedAttempts!.mockResolvedValue([]);

      const result = await controller.getBlockedAttempts(WORKSPACE_ID);

      expect(result).toEqual([]);
    });
  });

  // ==================== REFERENCE DATA ====================

  describe('GET /database-info', () => {
    it('should return database info', async () => {
      const result = await controller.getDatabaseInfo();

      expect(result.available).toBeDefined();
      expect(service.getDatabaseInfo).toHaveBeenCalled();
    });
  });

  describe('GET /countries', () => {
    it('should return country list', async () => {
      const result = await controller.getCountryList();

      expect(Array.isArray(result)).toBe(true);
      expect(result[0]).toHaveProperty('code');
      expect(result[0]).toHaveProperty('name');
      expect(service.getCountryList).toHaveBeenCalled();
    });
  });
});
