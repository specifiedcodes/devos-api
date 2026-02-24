import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';
import { PermissionMatrixService } from './permission-matrix.service';

/**
 * Redis-cached permission check service.
 * Wraps PermissionMatrixService.checkPermission() with Redis caching
 * to achieve <5ms permission lookups on cache hits.
 *
 * Cache strategy:
 * - Key: `perm:{workspaceId}:{userId}:{resource}:{action}`
 * - Value: '1' (granted) or '0' (denied)
 * - TTL: 300 seconds (5 minutes)
 * - Invalidation: On role change, permission update, or member role assignment change
 *
 * Fallback:
 * - If Redis is unavailable, falls through to PermissionMatrixService.checkPermission() directly
 * - Ensures the system never fails closed due to cache unavailability
 */
@Injectable()
export class PermissionCacheService {
  private readonly logger = new Logger(PermissionCacheService.name);
  private readonly CACHE_PREFIX = 'perm:';
  private readonly CACHE_TTL = 300; // 5 minutes
  private readonly DEL_BATCH_SIZE = 500; // Max keys per DEL command to avoid Redis blocking

  constructor(
    private readonly redisService: RedisService,
    @Inject(forwardRef(() => PermissionMatrixService))
    private readonly permissionMatrixService: PermissionMatrixService,
  ) {}

  /**
   * Check if a user has a specific permission in a workspace.
   * Cache-first: Checks Redis, falls back to DB via PermissionMatrixService.
   *
   * @param userId - User ID to check
   * @param workspaceId - Workspace context
   * @param resource - Resource type (e.g., 'projects')
   * @param action - Permission action (e.g., 'create')
   * @returns true if permission is granted
   */
  async checkPermission(
    userId: string,
    workspaceId: string,
    resource: string,
    action: string,
  ): Promise<boolean> {
    const cacheKey = this.buildCacheKey(workspaceId, userId, resource, action);

    // 1. Try Redis cache
    try {
      const cached = await this.redisService.get(cacheKey);
      if (cached !== null) {
        return cached === '1';
      }
    } catch (error) {
      this.logger.warn(`Redis cache read failed for ${cacheKey}, falling back to DB`);
    }

    // 2. Cache miss - check via PermissionMatrixService (DB)
    const granted = await this.permissionMatrixService.checkPermission(
      userId,
      workspaceId,
      resource,
      action,
    );

    // 3. Store result in cache (true fire-and-forget: don't await the write)
    this.redisService
      .set(cacheKey, granted ? '1' : '0', this.CACHE_TTL)
      .catch((error) => {
        this.logger.warn(`Redis cache write failed for ${cacheKey}`);
      });

    return granted;
  }

  /**
   * Invalidate all cached permissions for a user in a workspace.
   * Called when:
   * - User's role changes (system or custom role assignment)
   * - Permissions are modified for the user's role
   * - User is removed from workspace
   *
   * Uses Redis SCAN to find and delete matching keys to avoid blocking.
   */
  async invalidateUserPermissions(
    workspaceId: string,
    userId: string,
  ): Promise<void> {
    try {
      const pattern = `${this.CACHE_PREFIX}${workspaceId}:${userId}:*`;
      const keys = await this.redisService.scanKeys(pattern);
      if (keys.length > 0) {
        await this.batchDel(keys);
        this.logger.log(
          `Invalidated ${keys.length} permission cache entries for user=${userId} workspace=${workspaceId}`,
        );
      }
    } catch (error) {
      this.logger.warn(
        `Failed to invalidate permission cache for user=${userId} workspace=${workspaceId}`,
      );
    }
  }

  /**
   * Invalidate all cached permissions for a role in a workspace.
   * Called when:
   * - Role permissions are modified (set, bulk set, resource action, reset)
   * - Role is deleted
   *
   * This invalidates ALL users in the workspace since we don't track
   * which users have which role in the cache. A more targeted approach
   * could query workspace members with the specific role, but the
   * broad invalidation is simpler and the 5-minute TTL limits stale data.
   */
  async invalidateRolePermissions(workspaceId: string): Promise<void> {
    try {
      const pattern = `${this.CACHE_PREFIX}${workspaceId}:*`;
      const keys = await this.redisService.scanKeys(pattern);
      if (keys.length > 0) {
        await this.batchDel(keys);
        this.logger.log(
          `Invalidated ${keys.length} permission cache entries for workspace=${workspaceId}`,
        );
      }
    } catch (error) {
      this.logger.warn(
        `Failed to invalidate permission cache for workspace=${workspaceId}`,
      );
    }
  }

  /**
   * Invalidate the entire permission cache.
   * Nuclear option - used for admin operations or system maintenance.
   */
  async invalidateAll(): Promise<void> {
    try {
      const pattern = `${this.CACHE_PREFIX}*`;
      const keys = await this.redisService.scanKeys(pattern);
      if (keys.length > 0) {
        await this.batchDel(keys);
        this.logger.log(`Invalidated all ${keys.length} permission cache entries`);
      }
    } catch (error) {
      this.logger.warn('Failed to invalidate all permission cache entries');
    }
  }

  /**
   * Delete keys in batches to avoid Redis blocking on large DEL commands
   * and Node.js argument limits on spread operations.
   */
  private async batchDel(keys: string[]): Promise<void> {
    for (let i = 0; i < keys.length; i += this.DEL_BATCH_SIZE) {
      const batch = keys.slice(i, i + this.DEL_BATCH_SIZE);
      await this.redisService.del(...batch);
    }
  }

  /**
   * Build a Redis cache key for a permission check.
   * Sanitizes components to prevent cache key injection via colons or glob characters.
   */
  buildCacheKey(
    workspaceId: string,
    userId: string,
    resource: string,
    action: string,
  ): string {
    return `${this.CACHE_PREFIX}${this.sanitizeKeyComponent(workspaceId)}:${this.sanitizeKeyComponent(userId)}:${this.sanitizeKeyComponent(resource)}:${this.sanitizeKeyComponent(action)}`;
  }

  /**
   * Sanitize a cache key component by replacing colons and Redis glob characters
   * to prevent cache key collisions and over-broad SCAN pattern matches.
   */
  private sanitizeKeyComponent(value: string): string {
    return value.replace(/[:\*\?\[\]]/g, '_');
  }
}
