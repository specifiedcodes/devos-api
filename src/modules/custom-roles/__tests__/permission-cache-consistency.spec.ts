/**
 * Permission Cache Consistency Tests
 *
 * Story 20-8: Permission Testing Suite (AC4)
 *
 * Tests ensuring cache consistency across permission operations:
 * cache miss/hit flows, invalidation patterns, Redis fallback, key sanitization,
 * and concurrent access correctness.
 */

import { PermissionCacheService } from '../services/permission-cache.service';

// ---- Test Constants ----
const WORKSPACE_ID = 'ws-11111111-1111-1111-1111-111111111111';
const USER_ID = 'usr-22222222-2222-2222-2222-222222222222';
const OTHER_USER_ID = 'usr-33333333-3333-3333-3333-333333333333';

// ---- Mock Services ----

const createMockRedisService = () => ({
  get: jest.fn(),
  set: jest.fn().mockResolvedValue(undefined),
  del: jest.fn().mockResolvedValue(undefined),
  scanKeys: jest.fn().mockResolvedValue([]),
});

const createMockMatrixService = () => ({
  checkPermission: jest.fn(),
});

describe('Permission Cache Consistency', () => {
  let cacheService: PermissionCacheService;
  let mockRedisService: ReturnType<typeof createMockRedisService>;
  let mockMatrixService: ReturnType<typeof createMockMatrixService>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRedisService = createMockRedisService();
    mockMatrixService = createMockMatrixService();
    cacheService = new PermissionCacheService(
      mockRedisService as any,
      mockMatrixService as any,
    );
  });

  // ---- Cache Miss -> DB -> Store ----

  describe('Cache miss -> DB lookup -> cache store', () => {
    it('should check Redis first, then fall back to DB on cache miss', async () => {
      mockRedisService.get.mockResolvedValue(null); // cache miss
      mockMatrixService.checkPermission.mockResolvedValue(true);

      const result = await cacheService.checkPermission(
        USER_ID, WORKSPACE_ID, 'projects', 'create',
      );

      expect(result).toBe(true);
      expect(mockRedisService.get).toHaveBeenCalledTimes(1);
      expect(mockMatrixService.checkPermission).toHaveBeenCalledWith(
        USER_ID, WORKSPACE_ID, 'projects', 'create',
      );
    });

    it('should store granted result as "1" in Redis', async () => {
      mockRedisService.get.mockResolvedValue(null);
      mockMatrixService.checkPermission.mockResolvedValue(true);

      await cacheService.checkPermission(USER_ID, WORKSPACE_ID, 'projects', 'create');

      // Wait for fire-and-forget set
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockRedisService.set).toHaveBeenCalledWith(
        expect.any(String), '1', 300,
      );
    });

    it('should store denied result as "0" in Redis', async () => {
      mockRedisService.get.mockResolvedValue(null);
      mockMatrixService.checkPermission.mockResolvedValue(false);

      await cacheService.checkPermission(USER_ID, WORKSPACE_ID, 'secrets', 'view_plaintext');

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockRedisService.set).toHaveBeenCalledWith(
        expect.any(String), '0', 300,
      );
    });
  });

  // ---- Cache Hit ----

  describe('Cache hit returns correct value', () => {
    it('should return true when cache contains "1"', async () => {
      mockRedisService.get.mockResolvedValue('1');

      const result = await cacheService.checkPermission(
        USER_ID, WORKSPACE_ID, 'projects', 'create',
      );

      expect(result).toBe(true);
      expect(mockMatrixService.checkPermission).not.toHaveBeenCalled();
    });

    it('should return false when cache contains "0"', async () => {
      mockRedisService.get.mockResolvedValue('0');

      const result = await cacheService.checkPermission(
        USER_ID, WORKSPACE_ID, 'secrets', 'view_plaintext',
      );

      expect(result).toBe(false);
      expect(mockMatrixService.checkPermission).not.toHaveBeenCalled();
    });
  });

  // ---- Role Permission Update Invalidation ----

  describe('Role permission update invalidates workspace cache', () => {
    it('should delete all cached keys for workspace on role permission change', async () => {
      const mockKeys = [
        `perm:${WORKSPACE_ID}:${USER_ID}:projects:create`,
        `perm:${WORKSPACE_ID}:${USER_ID}:stories:read`,
        `perm:${WORKSPACE_ID}:${OTHER_USER_ID}:projects:create`,
      ];
      mockRedisService.scanKeys.mockResolvedValue(mockKeys);

      await cacheService.invalidateRolePermissions(WORKSPACE_ID);

      expect(mockRedisService.scanKeys).toHaveBeenCalledWith(`perm:${WORKSPACE_ID}:*`);
      expect(mockRedisService.del).toHaveBeenCalledWith(...mockKeys);
    });

    it('should not call del when no keys match workspace pattern', async () => {
      mockRedisService.scanKeys.mockResolvedValue([]);

      await cacheService.invalidateRolePermissions(WORKSPACE_ID);

      expect(mockRedisService.del).not.toHaveBeenCalled();
    });
  });

  // ---- User Role Change Invalidation ----

  describe('User role change invalidates user cache', () => {
    it('should delete only the specific user keys on role change', async () => {
      const userKeys = [
        `perm:${WORKSPACE_ID}:${USER_ID}:projects:create`,
        `perm:${WORKSPACE_ID}:${USER_ID}:stories:read`,
      ];
      mockRedisService.scanKeys.mockResolvedValue(userKeys);

      await cacheService.invalidateUserPermissions(WORKSPACE_ID, USER_ID);

      expect(mockRedisService.scanKeys).toHaveBeenCalledWith(
        `perm:${WORKSPACE_ID}:${USER_ID}:*`,
      );
      expect(mockRedisService.del).toHaveBeenCalledWith(...userKeys);
    });
  });

  // ---- Bulk Update Workspace-Wide Invalidation ----

  describe('Bulk update invalidates entire workspace', () => {
    it('should invalidate all workspace keys on bulk permission update', async () => {
      const allKeys = [
        `perm:${WORKSPACE_ID}:${USER_ID}:projects:create`,
        `perm:${WORKSPACE_ID}:${OTHER_USER_ID}:agents:view`,
      ];
      mockRedisService.scanKeys.mockResolvedValue(allKeys);

      await cacheService.invalidateRolePermissions(WORKSPACE_ID);

      expect(mockRedisService.del).toHaveBeenCalledWith(...allKeys);
    });
  });

  // ---- Role Deletion Invalidation ----

  describe('Role deletion invalidates workspace cache', () => {
    it('should clear workspace cache when role is deleted', async () => {
      const allKeys = [`perm:${WORKSPACE_ID}:${USER_ID}:projects:create`];
      mockRedisService.scanKeys.mockResolvedValue(allKeys);

      await cacheService.invalidateRolePermissions(WORKSPACE_ID);

      expect(mockRedisService.del).toHaveBeenCalled();
    });
  });

  // ---- Redis Unavailable Fallback ----

  describe('Redis unavailable falls back to DB', () => {
    it('should return DB result when Redis get throws', async () => {
      mockRedisService.get.mockRejectedValue(new Error('Connection refused'));
      mockMatrixService.checkPermission.mockResolvedValue(true);

      const result = await cacheService.checkPermission(
        USER_ID, WORKSPACE_ID, 'projects', 'create',
      );

      expect(result).toBe(true);
      expect(mockMatrixService.checkPermission).toHaveBeenCalled();
    });

    it('should not throw when Redis set fails (fire-and-forget)', async () => {
      mockRedisService.get.mockResolvedValue(null);
      mockMatrixService.checkPermission.mockResolvedValue(true);
      mockRedisService.set.mockRejectedValue(new Error('Connection refused'));

      const result = await cacheService.checkPermission(
        USER_ID, WORKSPACE_ID, 'projects', 'create',
      );

      expect(result).toBe(true);
    });

    it('should not throw when invalidation fails', async () => {
      mockRedisService.scanKeys.mockRejectedValue(new Error('Connection refused'));

      await expect(
        cacheService.invalidateUserPermissions(WORKSPACE_ID, USER_ID),
      ).resolves.not.toThrow();
    });
  });

  // ---- Cache Key Sanitization ----

  describe('Cache key sanitization prevents injection', () => {
    it('should sanitize colons in key components', () => {
      const key = cacheService.buildCacheKey('ws:id', 'user:id', 'res:type', 'act:ion');
      expect(key).not.toContain('ws:id');
      expect(key).toContain('ws_id');
    });

    it('should sanitize glob characters (* ? [ ]) in key components', () => {
      const key = cacheService.buildCacheKey('ws*id', 'user?id', 'res[type]', 'action');
      expect(key).not.toContain('*');
      expect(key).not.toContain('?');
      expect(key).not.toContain('[');
      expect(key).not.toContain(']');
    });

    it('should produce consistent keys for same inputs', () => {
      const key1 = cacheService.buildCacheKey(WORKSPACE_ID, USER_ID, 'projects', 'create');
      const key2 = cacheService.buildCacheKey(WORKSPACE_ID, USER_ID, 'projects', 'create');
      expect(key1).toBe(key2);
    });

    it('should produce different keys for different permissions', () => {
      const key1 = cacheService.buildCacheKey(WORKSPACE_ID, USER_ID, 'projects', 'create');
      const key2 = cacheService.buildCacheKey(WORKSPACE_ID, USER_ID, 'projects', 'delete');
      expect(key1).not.toBe(key2);
    });
  });

  // ---- Batch Deletion ----

  describe('Batch deletion for large key sets', () => {
    it('should batch delete keys in chunks when key count exceeds batch size', async () => {
      // Create 750 mock keys to test batching
      const keys = Array.from({ length: 750 }, (_, i) => `perm:${WORKSPACE_ID}:user${i}:projects:create`);
      mockRedisService.scanKeys.mockResolvedValue(keys);

      await cacheService.invalidateRolePermissions(WORKSPACE_ID);

      // Should be called multiple times (batched), not once with all 750 keys
      expect(mockRedisService.del).toHaveBeenCalled();
      expect(mockRedisService.del.mock.calls.length).toBeGreaterThan(1);

      // Verify all 750 keys were included across all batch calls
      const allDeletedKeys = mockRedisService.del.mock.calls.flat();
      expect(allDeletedKeys).toHaveLength(750);
    });
  });
});
