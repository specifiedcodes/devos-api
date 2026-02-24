/**
 * PermissionCacheService Tests
 *
 * Story 20-3: Permission Enforcement Middleware
 * Tests for Redis-backed permission caching service.
 * Covers: cache hit, cache miss, cache write, invalidation methods, Redis failure fallback.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { PermissionCacheService } from '../services/permission-cache.service';
import { PermissionMatrixService } from '../services/permission-matrix.service';
import { RedisService } from '../../redis/redis.service';

describe('PermissionCacheService', () => {
  let service: PermissionCacheService;
  let redisService: jest.Mocked<Partial<RedisService>>;
  let permissionMatrixService: jest.Mocked<Partial<PermissionMatrixService>>;

  const mockWorkspaceId = '11111111-1111-1111-1111-111111111111';
  const mockUserId = '22222222-2222-2222-2222-222222222222';

  beforeEach(async () => {
    redisService = {
      get: jest.fn(),
      set: jest.fn().mockResolvedValue(undefined),
      scanKeys: jest.fn(),
      del: jest.fn(),
    };

    permissionMatrixService = {
      checkPermission: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PermissionCacheService,
        { provide: RedisService, useValue: redisService },
        { provide: PermissionMatrixService, useValue: permissionMatrixService },
      ],
    }).compile();

    service = module.get<PermissionCacheService>(PermissionCacheService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ---- checkPermission ----

  describe('checkPermission', () => {
    it('should return true on cache hit with value "1"', async () => {
      redisService.get!.mockResolvedValue('1');

      const result = await service.checkPermission(mockUserId, mockWorkspaceId, 'projects', 'create');

      expect(result).toBe(true);
      expect(redisService.get).toHaveBeenCalledWith(`perm:${mockWorkspaceId}:${mockUserId}:projects:create`);
      expect(permissionMatrixService.checkPermission).not.toHaveBeenCalled();
    });

    it('should return false on cache hit with value "0"', async () => {
      redisService.get!.mockResolvedValue('0');

      const result = await service.checkPermission(mockUserId, mockWorkspaceId, 'projects', 'delete');

      expect(result).toBe(false);
      expect(permissionMatrixService.checkPermission).not.toHaveBeenCalled();
    });

    it('should fall back to DB on cache miss and cache the result', async () => {
      redisService.get!.mockResolvedValue(null);
      permissionMatrixService.checkPermission!.mockResolvedValue(true);

      const result = await service.checkPermission(mockUserId, mockWorkspaceId, 'agents', 'view');

      expect(result).toBe(true);
      expect(permissionMatrixService.checkPermission).toHaveBeenCalledWith(
        mockUserId, mockWorkspaceId, 'agents', 'view',
      );
      expect(redisService.set).toHaveBeenCalledWith(
        `perm:${mockWorkspaceId}:${mockUserId}:agents:view`, '1', 300,
      );
    });

    it('should cache "0" when DB returns false', async () => {
      redisService.get!.mockResolvedValue(null);
      permissionMatrixService.checkPermission!.mockResolvedValue(false);

      const result = await service.checkPermission(mockUserId, mockWorkspaceId, 'secrets', 'view_plaintext');

      expect(result).toBe(false);
      expect(redisService.set).toHaveBeenCalledWith(
        `perm:${mockWorkspaceId}:${mockUserId}:secrets:view_plaintext`, '0', 300,
      );
    });

    it('should fall back to DB when Redis get fails', async () => {
      redisService.get!.mockRejectedValue(new Error('Redis connection error'));
      permissionMatrixService.checkPermission!.mockResolvedValue(true);

      const result = await service.checkPermission(mockUserId, mockWorkspaceId, 'projects', 'read');

      expect(result).toBe(true);
      expect(permissionMatrixService.checkPermission).toHaveBeenCalled();
    });

    it('should not throw when Redis set fails (fire-and-forget)', async () => {
      redisService.get!.mockResolvedValue(null);
      permissionMatrixService.checkPermission!.mockResolvedValue(true);
      redisService.set!.mockRejectedValue(new Error('Redis write error'));

      const result = await service.checkPermission(mockUserId, mockWorkspaceId, 'stories', 'create');

      expect(result).toBe(true);
    });

    it('should use correct cache key format', async () => {
      redisService.get!.mockResolvedValue('1');

      await service.checkPermission('user-123', 'ws-456', 'deployments', 'approve');

      expect(redisService.get).toHaveBeenCalledWith('perm:ws-456:user-123:deployments:approve');
    });
  });

  // ---- invalidateUserPermissions ----

  describe('invalidateUserPermissions', () => {
    it('should scan and delete user-specific cache keys', async () => {
      const mockKeys = [
        `perm:${mockWorkspaceId}:${mockUserId}:projects:create`,
        `perm:${mockWorkspaceId}:${mockUserId}:agents:view`,
      ];
      redisService.scanKeys!.mockResolvedValue(mockKeys);

      await service.invalidateUserPermissions(mockWorkspaceId, mockUserId);

      expect(redisService.scanKeys).toHaveBeenCalledWith(`perm:${mockWorkspaceId}:${mockUserId}:*`);
      expect(redisService.del).toHaveBeenCalledWith(...mockKeys);
    });

    it('should not call del when no matching keys found', async () => {
      redisService.scanKeys!.mockResolvedValue([]);

      await service.invalidateUserPermissions(mockWorkspaceId, mockUserId);

      expect(redisService.del).not.toHaveBeenCalled();
    });

    it('should not throw when Redis fails', async () => {
      redisService.scanKeys!.mockRejectedValue(new Error('Redis error'));

      await expect(service.invalidateUserPermissions(mockWorkspaceId, mockUserId)).resolves.toBeUndefined();
    });
  });

  // ---- invalidateRolePermissions ----

  describe('invalidateRolePermissions', () => {
    it('should scan and delete all workspace cache keys', async () => {
      const mockKeys = [
        `perm:${mockWorkspaceId}:user1:projects:create`,
        `perm:${mockWorkspaceId}:user2:agents:view`,
        `perm:${mockWorkspaceId}:user3:secrets:delete`,
      ];
      redisService.scanKeys!.mockResolvedValue(mockKeys);

      await service.invalidateRolePermissions(mockWorkspaceId);

      expect(redisService.scanKeys).toHaveBeenCalledWith(`perm:${mockWorkspaceId}:*`);
      expect(redisService.del).toHaveBeenCalledWith(...mockKeys);
    });

    it('should not call del when no matching keys found', async () => {
      redisService.scanKeys!.mockResolvedValue([]);

      await service.invalidateRolePermissions(mockWorkspaceId);

      expect(redisService.del).not.toHaveBeenCalled();
    });

    it('should not throw when Redis fails', async () => {
      redisService.scanKeys!.mockRejectedValue(new Error('Redis error'));

      await expect(service.invalidateRolePermissions(mockWorkspaceId)).resolves.toBeUndefined();
    });
  });

  // ---- invalidateAll ----

  describe('invalidateAll', () => {
    it('should scan and delete all permission cache keys', async () => {
      const mockKeys = [
        'perm:ws1:user1:projects:create',
        'perm:ws2:user2:agents:view',
      ];
      redisService.scanKeys!.mockResolvedValue(mockKeys);

      await service.invalidateAll();

      expect(redisService.scanKeys).toHaveBeenCalledWith('perm:*');
      expect(redisService.del).toHaveBeenCalledWith(...mockKeys);
    });

    it('should not call del when no matching keys found', async () => {
      redisService.scanKeys!.mockResolvedValue([]);

      await service.invalidateAll();

      expect(redisService.del).not.toHaveBeenCalled();
    });

    it('should not throw when Redis fails', async () => {
      redisService.scanKeys!.mockRejectedValue(new Error('Redis error'));

      await expect(service.invalidateAll()).resolves.toBeUndefined();
    });
  });

  // ---- buildCacheKey ----

  describe('buildCacheKey', () => {
    it('should build correct cache key format', () => {
      const key = service.buildCacheKey('ws-id', 'user-id', 'projects', 'create');
      expect(key).toBe('perm:ws-id:user-id:projects:create');
    });

    it('should handle special characters in IDs', () => {
      const key = service.buildCacheKey('ws-123', 'user-456', 'cost_management', 'view_own_usage');
      expect(key).toBe('perm:ws-123:user-456:cost_management:view_own_usage');
    });
  });
});
