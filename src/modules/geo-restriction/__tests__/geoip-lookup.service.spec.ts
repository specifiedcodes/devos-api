/**
 * GeoIpLookupService Tests
 * Story 20-5: Geo-Restriction
 * Target: 10 tests covering database loading, lookup, failure scenarios
 */

// Mock fs module
const mockExistsSync = jest.fn();
jest.mock('fs', () => ({
  existsSync: mockExistsSync,
}));

// Mock maxmind as a virtual module (may not be installed)
const mockMaxmindOpen = jest.fn();
jest.mock('maxmind', () => ({
  open: mockMaxmindOpen,
}), { virtual: true });

import { GeoIpLookupService } from '../services/geoip-lookup.service';

describe('GeoIpLookupService', () => {
  let service: GeoIpLookupService;

  beforeEach(() => {
    service = new GeoIpLookupService();
    jest.clearAllMocks();
  });

  describe('loadDatabase', () => {
    it('should load database when file exists at first path', async () => {
      const mockReader = { get: jest.fn(), metadata: {} };
      mockExistsSync.mockReturnValueOnce(true);
      mockMaxmindOpen.mockResolvedValueOnce(mockReader);

      await service.loadDatabase();

      expect(service.isDatabaseAvailable()).toBe(true);
    });

    it('should try multiple paths when first is not found', async () => {
      const mockReader = { get: jest.fn(), metadata: {} };
      mockExistsSync.mockReturnValueOnce(false).mockReturnValueOnce(true);
      mockMaxmindOpen.mockResolvedValueOnce(mockReader);

      await service.loadDatabase();

      expect(service.isDatabaseAvailable()).toBe(true);
      expect(mockExistsSync).toHaveBeenCalledTimes(2);
    });

    it('should set isAvailable false when no database file found', async () => {
      mockExistsSync.mockReturnValue(false);

      await service.loadDatabase();

      expect(service.isDatabaseAvailable()).toBe(false);
    });

    it('should handle maxmind open error gracefully', async () => {
      mockExistsSync.mockReturnValueOnce(true);
      mockMaxmindOpen.mockRejectedValueOnce(new Error('Failed to load'));

      await service.loadDatabase();

      expect(service.isDatabaseAvailable()).toBe(false);
    });
  });

  describe('lookup', () => {
    it('should return country code when lookup succeeds', async () => {
      const mockReader = {
        get: jest.fn().mockReturnValue({ country: { iso_code: 'US' } }),
        metadata: {},
      };
      mockExistsSync.mockReturnValueOnce(true);
      mockMaxmindOpen.mockResolvedValueOnce(mockReader);
      await service.loadDatabase();

      const result = service.lookup('8.8.8.8');

      expect(result).toBe('US');
    });

    it('should return null when database is not available', () => {
      const result = service.lookup('8.8.8.8');
      expect(result).toBeNull();
    });

    it('should return null when lookup returns no country data', async () => {
      const mockReader = {
        get: jest.fn().mockReturnValue(null),
        metadata: {},
      };
      mockExistsSync.mockReturnValueOnce(true);
      mockMaxmindOpen.mockResolvedValueOnce(mockReader);
      await service.loadDatabase();

      const result = service.lookup('10.0.0.1');

      expect(result).toBeNull();
    });

    it('should return null when lookup throws error (fail-open)', async () => {
      const mockReader = {
        get: jest.fn().mockImplementation(() => { throw new Error('Lookup failed'); }),
        metadata: {},
      };
      mockExistsSync.mockReturnValueOnce(true);
      mockMaxmindOpen.mockResolvedValueOnce(mockReader);
      await service.loadDatabase();

      const result = service.lookup('invalid-ip');

      expect(result).toBeNull();
    });
  });

  describe('getDatabaseInfo', () => {
    it('should return unavailable info when database not loaded', () => {
      const info = service.getDatabaseInfo();
      expect(info).toEqual({ available: false, buildDate: null, type: null });
    });

    it('should return database metadata when available', async () => {
      const mockReader = {
        get: jest.fn(),
        metadata: { buildEpoch: 1700000000, databaseType: 'GeoLite2-Country' },
      };
      mockExistsSync.mockReturnValueOnce(true);
      mockMaxmindOpen.mockResolvedValueOnce(mockReader);
      await service.loadDatabase();

      const info = service.getDatabaseInfo();

      expect(info.available).toBe(true);
      expect(info.buildDate).toBeDefined();
      expect(info.type).toBe('GeoLite2-Country');
    });
  });
});
