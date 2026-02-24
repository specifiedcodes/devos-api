/**
 * GeoRestrictionService Tests
 * Story 20-5: Geo-Restriction
 * Target: 35 tests covering config CRUD, checkGeo hot path, blocked attempts, caching
 */
import { BadRequestException } from '@nestjs/common';
import { GeoRestrictionService } from '../services/geo-restriction.service';
import { GeoIpLookupService } from '../services/geoip-lookup.service';
import { GeoRestriction, GeoRestrictionMode } from '../../../database/entities/geo-restriction.entity';

describe('GeoRestrictionService', () => {
  let service: GeoRestrictionService;
  let mockRepository: any;
  let mockRedisService: any;
  let mockAuditService: any;
  let mockGeoIpLookupService: jest.Mocked<Partial<GeoIpLookupService>>;

  const WORKSPACE_ID = '11111111-1111-1111-1111-111111111111';
  const USER_ID = '22222222-2222-2222-2222-222222222222';

  const createMockConfig = (overrides: Partial<GeoRestriction> = {}): GeoRestriction => ({
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
    ...overrides,
  });

  beforeEach(() => {
    mockRepository = {
      findOne: jest.fn(),
      create: jest.fn().mockImplementation((data) => ({ ...createMockConfig(), ...data })),
      save: jest.fn().mockImplementation((data) => Promise.resolve({ ...createMockConfig(), ...data })),
    };

    mockRedisService = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
      zadd: jest.fn().mockResolvedValue(1),
      zrevrange: jest.fn().mockResolvedValue([]),
      zremrangebyrank: jest.fn().mockResolvedValue(0),
      expire: jest.fn().mockResolvedValue(1),
    };

    mockAuditService = {
      log: jest.fn().mockResolvedValue(undefined),
    };

    mockGeoIpLookupService = {
      lookup: jest.fn().mockReturnValue(null),
      isDatabaseAvailable: jest.fn().mockReturnValue(true),
      getDatabaseInfo: jest.fn().mockReturnValue({ available: true, buildDate: null, type: null }),
    };

    service = new GeoRestrictionService(
      mockRepository,
      mockRedisService,
      mockAuditService,
      mockGeoIpLookupService as any,
    );
  });

  // ==================== CONFIG OPERATIONS ====================

  describe('getConfig', () => {
    it('should return existing config', async () => {
      const existing = createMockConfig();
      mockRepository.findOne.mockResolvedValue(existing);

      const result = await service.getConfig(WORKSPACE_ID, USER_ID);

      expect(result.workspaceId).toBe(WORKSPACE_ID);
      expect(result.mode).toBe('blocklist');
    });

    it('should create new config if none exists (get-or-create)', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      const result = await service.getConfig(WORKSPACE_ID, USER_ID);

      expect(mockRepository.create).toHaveBeenCalled();
      expect(mockRepository.save).toHaveBeenCalled();
      expect(result.isActive).toBe(false);
    });
  });

  describe('updateConfig', () => {
    it('should update mode', async () => {
      mockRepository.findOne.mockResolvedValue(createMockConfig());

      const result = await service.updateConfig(WORKSPACE_ID, USER_ID, {
        mode: GeoRestrictionMode.ALLOWLIST,
      });

      expect(result.mode).toBe('allowlist');
    });

    it('should update countries with deduplication', async () => {
      mockRepository.findOne.mockResolvedValue(createMockConfig());

      const result = await service.updateConfig(WORKSPACE_ID, USER_ID, {
        countries: ['US', 'GB', 'US'],
      });

      expect(result.countries).toEqual(['US', 'GB']);
    });

    it('should toggle isActive', async () => {
      mockRepository.findOne.mockResolvedValue(createMockConfig());

      const result = await service.updateConfig(WORKSPACE_ID, USER_ID, {
        isActive: true,
      });

      expect(result.isActive).toBe(true);
    });

    it('should toggle logOnly', async () => {
      mockRepository.findOne.mockResolvedValue(createMockConfig());

      const result = await service.updateConfig(WORKSPACE_ID, USER_ID, {
        logOnly: true,
      });

      expect(result.logOnly).toBe(true);
    });

    it('should reject invalid country codes', async () => {
      mockRepository.findOne.mockResolvedValue(createMockConfig());

      await expect(
        service.updateConfig(WORKSPACE_ID, USER_ID, {
          countries: ['XX', 'YY'],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject countries exceeding max limit', async () => {
      mockRepository.findOne.mockResolvedValue(createMockConfig());
      const tooMany = Array.from({ length: 251 }, (_, i) => `A${String(i).padStart(1, '0')}`);

      await expect(
        service.updateConfig(WORKSPACE_ID, USER_ID, {
          countries: tooMany,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should invalidate Redis cache after update', async () => {
      mockRepository.findOne.mockResolvedValue(createMockConfig());

      await service.updateConfig(WORKSPACE_ID, USER_ID, { isActive: true });

      expect(mockRedisService.del).toHaveBeenCalledWith(`geo_config:${WORKSPACE_ID}`);
    });

    it('should set lastModifiedBy to current user', async () => {
      mockRepository.findOne.mockResolvedValue(createMockConfig());

      await service.updateConfig(WORKSPACE_ID, USER_ID, { isActive: true });

      expect(mockRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ lastModifiedBy: USER_ID }),
      );
    });

    it('should create config if none exists on update', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await service.updateConfig(WORKSPACE_ID, USER_ID, { isActive: true });

      expect(mockRepository.create).toHaveBeenCalled();
    });

    it('should fire audit log on update', async () => {
      mockRepository.findOne.mockResolvedValue(createMockConfig());

      await service.updateConfig(WORKSPACE_ID, USER_ID, { isActive: true });

      expect(mockAuditService.log).toHaveBeenCalledWith(
        WORKSPACE_ID,
        USER_ID,
        'update',
        'geo_restriction',
        expect.any(String),
        expect.objectContaining({ action: 'geo_restriction_updated' }),
      );
    });
  });

  // ==================== CHECK GEO ====================

  describe('checkGeo', () => {
    it('should allow when geo-restriction is not active', async () => {
      mockRedisService.get.mockResolvedValue(null);
      mockRepository.findOne.mockResolvedValue(createMockConfig({ isActive: false }));

      const result = await service.checkGeo(WORKSPACE_ID, '8.8.8.8');

      expect(result.allowed).toBe(true);
      expect(result.reason).toBe('geo_not_active');
    });

    it('should allow when no config exists', async () => {
      mockRedisService.get.mockResolvedValue(null);
      mockRepository.findOne.mockResolvedValue(null);

      const result = await service.checkGeo(WORKSPACE_ID, '8.8.8.8');

      expect(result.allowed).toBe(true);
    });

    it('should allow when allowlist contains detected country', async () => {
      mockRedisService.get.mockResolvedValue(
        JSON.stringify({ isActive: true, mode: 'allowlist', countries: ['US', 'GB'], logOnly: false }),
      );
      mockGeoIpLookupService.lookup!.mockReturnValue('US');

      const result = await service.checkGeo(WORKSPACE_ID, '8.8.8.8');

      expect(result.allowed).toBe(true);
      expect(result.detectedCountry).toBe('US');
    });

    it('should deny when allowlist does NOT contain detected country', async () => {
      mockRedisService.get.mockResolvedValue(
        JSON.stringify({ isActive: true, mode: 'allowlist', countries: ['US', 'GB'], logOnly: false }),
      );
      mockGeoIpLookupService.lookup!.mockReturnValue('DE');

      const result = await service.checkGeo(WORKSPACE_ID, '8.8.8.8');

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('country_not_in_allowlist');
    });

    it('should deny when blocklist contains detected country', async () => {
      mockRedisService.get.mockResolvedValue(
        JSON.stringify({ isActive: true, mode: 'blocklist', countries: ['CN', 'RU'], logOnly: false }),
      );
      mockGeoIpLookupService.lookup!.mockReturnValue('CN');

      const result = await service.checkGeo(WORKSPACE_ID, '8.8.8.8');

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('country_in_blocklist');
    });

    it('should allow when blocklist does NOT contain detected country', async () => {
      mockRedisService.get.mockResolvedValue(
        JSON.stringify({ isActive: true, mode: 'blocklist', countries: ['CN', 'RU'], logOnly: false }),
      );
      mockGeoIpLookupService.lookup!.mockReturnValue('US');

      const result = await service.checkGeo(WORKSPACE_ID, '8.8.8.8');

      expect(result.allowed).toBe(true);
    });

    it('should allow (fail-open) when GeoIP lookup returns null', async () => {
      mockRedisService.get.mockResolvedValue(
        JSON.stringify({ isActive: true, mode: 'blocklist', countries: ['CN'], logOnly: false }),
      );
      mockGeoIpLookupService.lookup!.mockReturnValue(null);

      const result = await service.checkGeo(WORKSPACE_ID, '10.0.0.1');

      expect(result.allowed).toBe(true);
      expect(result.reason).toBe('geo_lookup_failed');
    });

    it('should allow in log-only mode when would deny', async () => {
      mockRedisService.get.mockResolvedValue(
        JSON.stringify({ isActive: true, mode: 'blocklist', countries: ['CN'], logOnly: true }),
      );
      mockGeoIpLookupService.lookup!.mockReturnValue('CN');

      const result = await service.checkGeo(WORKSPACE_ID, '8.8.8.8');

      expect(result.allowed).toBe(true);
      expect(result.reason).toBe('log_only_would_deny');
    });

    it('should use cached config from Redis when available', async () => {
      mockRedisService.get.mockResolvedValue(
        JSON.stringify({ isActive: true, mode: 'blocklist', countries: ['CN'], logOnly: false }),
      );
      mockGeoIpLookupService.lookup!.mockReturnValue('US');

      const result = await service.checkGeo(WORKSPACE_ID, '8.8.8.8');

      expect(result.allowed).toBe(true);
      expect(mockRepository.findOne).not.toHaveBeenCalled(); // Should use cache, not DB
    });

    it('should fall through to DB on cache miss and populate cache', async () => {
      mockRedisService.get.mockResolvedValue(null);
      mockRepository.findOne.mockResolvedValue(
        createMockConfig({ isActive: true, mode: GeoRestrictionMode.BLOCKLIST, countries: ['CN'], logOnly: false }),
      );
      mockGeoIpLookupService.lookup!.mockReturnValue('US');

      const result = await service.checkGeo(WORKSPACE_ID, '8.8.8.8');

      expect(result.allowed).toBe(true);
      expect(mockRepository.findOne).toHaveBeenCalled();
      expect(mockRedisService.set).toHaveBeenCalled();
    });
  });

  // ==================== TEST GEO ====================

  describe('testGeo', () => {
    it('should return detailed test result when not active', async () => {
      mockRepository.findOne.mockResolvedValue(createMockConfig({ isActive: false }));

      const result = await service.testGeo(WORKSPACE_ID, '8.8.8.8');

      expect(result.isAllowed).toBe(true);
      expect(result.isActive).toBe(false);
      expect(result.reason).toBe('geo_not_active');
    });

    it('should return detected country in test result', async () => {
      mockRepository.findOne.mockResolvedValue(
        createMockConfig({ isActive: true, mode: GeoRestrictionMode.BLOCKLIST, countries: [] }),
      );
      mockGeoIpLookupService.lookup!.mockReturnValue('US');

      const result = await service.testGeo(WORKSPACE_ID, '8.8.8.8');

      expect(result.detectedCountry).toBe('US');
      expect(result.ipAddress).toBe('8.8.8.8');
    });

    it('should report geoIpAvailable in test result', async () => {
      mockRepository.findOne.mockResolvedValue(null);
      mockGeoIpLookupService.isDatabaseAvailable!.mockReturnValue(false);

      const result = await service.testGeo(WORKSPACE_ID, '8.8.8.8');

      expect(result.geoIpAvailable).toBe(false);
    });
  });

  // ==================== BLOCKED ATTEMPTS ====================

  describe('recordBlockedAttempt', () => {
    it('should record blocked attempt to Redis sorted set', async () => {
      await service.recordBlockedAttempt(WORKSPACE_ID, '8.8.8.8', USER_ID, 'CN', 'GET /api/test');

      expect(mockRedisService.zadd).toHaveBeenCalledWith(
        `geo_blocked:${WORKSPACE_ID}`,
        expect.any(Number),
        expect.any(String),
      );
    });

    it('should trim sorted set to max entries', async () => {
      await service.recordBlockedAttempt(WORKSPACE_ID, '8.8.8.8', USER_ID, 'CN', 'GET /api/test');

      expect(mockRedisService.zremrangebyrank).toHaveBeenCalled();
    });

    it('should set TTL on blocked attempts key', async () => {
      await service.recordBlockedAttempt(WORKSPACE_ID, '8.8.8.8', USER_ID, 'CN', 'GET /api/test');

      expect(mockRedisService.expire).toHaveBeenCalledWith(
        `geo_blocked:${WORKSPACE_ID}`,
        86400,
      );
    });

    it('should not throw on Redis error', async () => {
      mockRedisService.zadd.mockRejectedValue(new Error('Redis down'));

      await expect(
        service.recordBlockedAttempt(WORKSPACE_ID, '8.8.8.8', USER_ID, 'CN', 'GET /api/test'),
      ).resolves.not.toThrow();
    });
  });

  describe('getBlockedAttempts', () => {
    it('should return parsed blocked attempts from Redis', async () => {
      const mockEntry = JSON.stringify({
        ipAddress: '8.8.8.8',
        userId: USER_ID,
        detectedCountry: 'CN',
        endpoint: 'GET /api/test',
        timestamp: '2026-01-01T00:00:00.000Z',
      });
      mockRedisService.zrevrange.mockResolvedValue([mockEntry]);

      const result = await service.getBlockedAttempts(WORKSPACE_ID);

      expect(result).toHaveLength(1);
      expect(result[0].ipAddress).toBe('8.8.8.8');
      expect(result[0].detectedCountry).toBe('CN');
    });

    it('should clamp limit to max 100', async () => {
      mockRedisService.zrevrange.mockResolvedValue([]);

      await service.getBlockedAttempts(WORKSPACE_ID, 500);

      expect(mockRedisService.zrevrange).toHaveBeenCalledWith(
        `geo_blocked:${WORKSPACE_ID}`,
        0,
        99, // clamped to 100 - 1
      );
    });

    it('should return empty array on Redis error', async () => {
      mockRedisService.zrevrange.mockRejectedValue(new Error('Redis down'));

      const result = await service.getBlockedAttempts(WORKSPACE_ID);

      expect(result).toEqual([]);
    });
  });

  // ==================== UTILITY ====================

  describe('getDatabaseInfo', () => {
    it('should delegate to GeoIpLookupService', () => {
      const result = service.getDatabaseInfo();
      expect(mockGeoIpLookupService.getDatabaseInfo).toHaveBeenCalled();
      expect(result.available).toBe(true);
    });
  });

  describe('getCountryList', () => {
    it('should return the full country list', () => {
      const result = service.getCountryList();
      expect(result.length).toBeGreaterThan(200);
      expect(result[0]).toHaveProperty('code');
      expect(result[0]).toHaveProperty('name');
    });
  });
});
