/**
 * AgentResponseCacheService
 * Story 9.8: Agent Response Time Optimization
 *
 * Redis-based caching service for agent responses with TTL categories.
 */

import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { RedisService } from '../../redis/redis.service';
import {
  CacheCategory,
  CacheContext,
  CachedResponse,
  CacheStats,
  IAgentResponseCacheService,
  CACHE_CATEGORY_CONFIG,
  CACHE_PREFIX,
  CACHE_STATS_KEY,
  DEFAULT_CACHE_KEY_CONFIG,
} from '../interfaces/cache.interfaces';

/**
 * Response from fetch function for cacheOrFetch
 */
export interface FetchResponse {
  response: string;
  responseTime: number;
  modelUsed: string;
}

/**
 * Result from cacheOrFetch operation
 */
export interface CacheOrFetchResult {
  response: string;
  fromCache: boolean;
  category: CacheCategory;
  responseTime?: number;
}

@Injectable()
export class AgentResponseCacheService implements IAgentResponseCacheService {
  private readonly logger = new Logger(AgentResponseCacheService.name);
  private readonly inFlightRequests: Map<string, Promise<CacheOrFetchResult>> = new Map();

  constructor(private readonly redisService: RedisService) {}

  /**
   * Generate cache key from query and context
   * Uses SHA-256 hash for consistent key length
   */
  generateKey(query: string, context: CacheContext): string {
    const config = DEFAULT_CACHE_KEY_CONFIG;

    // Normalize query
    let normalizedQuery = query;
    if (config.normalizeQuery) {
      normalizedQuery = query.toLowerCase().trim().replace(/\s+/g, ' ');
    }

    // Build key components
    const components: string[] = [normalizedQuery];

    if (config.includeAgentId && context.agentId) {
      components.push(context.agentId);
    }

    if (config.includeProjectContext && context.projectId) {
      components.push(context.projectId);
    }

    if (context.workspaceId) {
      components.push(context.workspaceId);
    }

    // Generate hash for consistent key length
    const contentToHash = components.join(':');
    const hash = createHash('sha256').update(contentToHash).digest('hex').slice(0, 16);

    return `${CACHE_PREFIX}${context.agentId}:${hash}`;
  }

  /**
   * Detect cache category from query content
   */
  detectCategory(query: string): CacheCategory {
    const lowerQuery = query.toLowerCase();

    // Check STATUS patterns first (shortest TTL)
    for (const pattern of CACHE_CATEGORY_CONFIG[CacheCategory.STATUS].patterns) {
      if (lowerQuery.includes(pattern.toLowerCase())) {
        return CacheCategory.STATUS;
      }
    }

    // Check HELP patterns
    for (const pattern of CACHE_CATEGORY_CONFIG[CacheCategory.HELP].patterns) {
      if (lowerQuery.includes(pattern.toLowerCase())) {
        return CacheCategory.HELP;
      }
    }

    // Check PROJECT patterns
    for (const pattern of CACHE_CATEGORY_CONFIG[CacheCategory.PROJECT].patterns) {
      if (lowerQuery.includes(pattern.toLowerCase())) {
        return CacheCategory.PROJECT;
      }
    }

    // Default to PROJECT (moderate TTL)
    return CacheCategory.PROJECT;
  }

  /**
   * Get TTL for a cache category
   */
  getTTL(category: CacheCategory): number {
    return CACHE_CATEGORY_CONFIG[category].ttl;
  }

  /**
   * Get cached response for a key
   */
  async get(key: string): Promise<CachedResponse | null> {
    try {
      const cached = await this.redisService.get(key);

      if (!cached) {
        // Record cache miss
        await this.recordCacheMiss();
        return null;
      }

      const response = JSON.parse(cached) as CachedResponse;

      // Increment hit count asynchronously
      this.incrementHitCount(key).catch((err) => {
        this.logger.warn(`Failed to increment hit count: ${err.message}`);
      });

      return response;
    } catch (error: any) {
      this.logger.warn(`Cache get error: ${error.message}`);
      return null;
    }
  }

  /**
   * Set cached response with TTL
   */
  async set(key: string, response: CachedResponse, ttl: number): Promise<void> {
    try {
      const serialized = JSON.stringify(response);
      await this.redisService.set(key, serialized, ttl);

      this.logger.debug(`Cached response: ${key} (TTL: ${ttl}s)`);
    } catch (error: any) {
      this.logger.warn(`Cache set error: ${error.message}`);
      // Don't throw - caching is best-effort
    }
  }

  /**
   * Invalidate cache entries matching pattern
   */
  async invalidate(pattern: string): Promise<number> {
    try {
      const keys = await this.redisService.keys(pattern);

      if (keys.length === 0) {
        return 0;
      }

      await this.redisService.del(...keys);

      this.logger.log(`Invalidated ${keys.length} cache entries matching: ${pattern}`);
      return keys.length;
    } catch (error: any) {
      this.logger.warn(`Cache invalidation error: ${error.message}`);
      return 0;
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<CacheStats> {
    try {
      const statsJson = await this.redisService.get(CACHE_STATS_KEY);

      if (!statsJson) {
        return {
          totalHits: 0,
          totalMisses: 0,
          hitRate: 0,
          entriesByCategory: {
            [CacheCategory.STATUS]: 0,
            [CacheCategory.HELP]: 0,
            [CacheCategory.PROJECT]: 0,
          },
          avgResponseTime: 0,
        };
      }

      const stats = JSON.parse(statsJson);
      const total = stats.totalHits + stats.totalMisses;

      return {
        totalHits: stats.totalHits || 0,
        totalMisses: stats.totalMisses || 0,
        hitRate: total > 0 ? stats.totalHits / total : 0,
        entriesByCategory: stats.entriesByCategory || {
          [CacheCategory.STATUS]: 0,
          [CacheCategory.HELP]: 0,
          [CacheCategory.PROJECT]: 0,
        },
        avgResponseTime:
          stats.responseTimesCount > 0
            ? stats.responseTimesSum / stats.responseTimesCount
            : 0,
      };
    } catch (error: any) {
      this.logger.warn(`Failed to get cache stats: ${error.message}`);
      return {
        totalHits: 0,
        totalMisses: 0,
        hitRate: 0,
        entriesByCategory: {
          [CacheCategory.STATUS]: 0,
          [CacheCategory.HELP]: 0,
          [CacheCategory.PROJECT]: 0,
        },
        avgResponseTime: 0,
      };
    }
  }

  /**
   * Increment hit count for a cache entry
   */
  async incrementHitCount(key: string): Promise<void> {
    try {
      // Increment entry-specific hit count
      await this.redisService.increment(`${key}:hits`, 1);

      // Increment global hit counter
      await this.redisService.increment(`${CACHE_STATS_KEY}:hits`, 1);
    } catch (error: any) {
      this.logger.warn(`Failed to increment hit count: ${error.message}`);
    }
  }

  /**
   * Record a cache miss in statistics
   */
  private async recordCacheMiss(): Promise<void> {
    try {
      await this.redisService.increment(`${CACHE_STATS_KEY}:misses`, 1);
    } catch (error: any) {
      this.logger.warn(`Failed to record cache miss: ${error.message}`);
    }
  }

  /**
   * Cache-through helper: check cache, fetch if miss, store result
   * Uses in-flight request tracking to prevent duplicate API calls for same query
   */
  async cacheOrFetch(
    query: string,
    context: CacheContext,
    fetchFn: () => Promise<FetchResponse>,
  ): Promise<CacheOrFetchResult> {
    const key = this.generateKey(query, context);
    const category = this.detectCategory(query);

    // Try cache first
    const cached = await this.get(key);
    if (cached) {
      this.logger.debug(`Cache hit for query: ${query.substring(0, 50)}...`);
      return {
        response: cached.response,
        fromCache: true,
        category,
        responseTime: cached.metadata.responseTime,
      };
    }

    // Check if there's already an in-flight request for this key
    // This prevents duplicate API calls when multiple concurrent requests miss the cache
    const inFlight = this.inFlightRequests.get(key);
    if (inFlight) {
      this.logger.debug(`Waiting for in-flight request: ${query.substring(0, 50)}...`);
      return inFlight;
    }

    // Cache miss - fetch fresh response
    this.logger.debug(`Cache miss for query: ${query.substring(0, 50)}...`);

    // Create the fetch promise and track it
    const fetchPromise = this.performFetch(key, category, query, context, fetchFn);
    this.inFlightRequests.set(key, fetchPromise);

    try {
      const result = await fetchPromise;
      return result;
    } finally {
      // Always clean up in-flight tracking
      this.inFlightRequests.delete(key);
    }
  }

  /**
   * Perform the actual fetch and cache operation
   */
  private async performFetch(
    key: string,
    category: CacheCategory,
    query: string,
    context: CacheContext,
    fetchFn: () => Promise<FetchResponse>,
  ): Promise<CacheOrFetchResult> {
    const startTime = Date.now();
    const fetchResult = await fetchFn();
    const responseTime = fetchResult.responseTime || (Date.now() - startTime);

    // Build cached response object
    const ttl = this.getTTL(category);
    const cachedResponse: CachedResponse = {
      response: fetchResult.response,
      agentId: context.agentId,
      cachedAt: new Date(),
      expiresAt: new Date(Date.now() + ttl * 1000),
      hitCount: 0,
      metadata: {
        originalQuery: query,
        responseTime,
        modelUsed: fetchResult.modelUsed,
        category,
      },
    };

    // Store in cache - await to ensure it's cached before other requests can proceed
    try {
      await this.set(key, cachedResponse, ttl);
    } catch (err: any) {
      this.logger.warn(`Failed to cache response: ${err.message}`);
    }

    return {
      response: fetchResult.response,
      fromCache: false,
      category,
      responseTime,
    };
  }

  /**
   * Invalidate all cache entries for an agent
   */
  async invalidateAgentCache(agentId: string): Promise<number> {
    const pattern = `${CACHE_PREFIX}${agentId}:*`;
    return this.invalidate(pattern);
  }

  /**
   * Invalidate all cache entries for a project
   * Note: This requires scanning all keys since project is part of hash
   */
  async invalidateProjectCache(projectId: string): Promise<number> {
    // Since projectId is hashed into the key, we need to use a broader pattern
    // and potentially track project associations separately
    const pattern = `${CACHE_PREFIX}*`;

    try {
      const keys = await this.redisService.keys(pattern);
      let invalidatedCount = 0;

      // Check each key's metadata for project match
      for (const key of keys) {
        try {
          const cached = await this.redisService.get(key);
          if (cached) {
            const response = JSON.parse(cached) as CachedResponse;
            // Check if originalQuery mentions the project
            // or use stored projectId in metadata
            if (response.metadata?.originalQuery?.includes(projectId)) {
              await this.redisService.del(key);
              invalidatedCount++;
            }
          }
        } catch {
          // Skip invalid entries
        }
      }

      this.logger.log(`Invalidated ${invalidatedCount} cache entries for project: ${projectId}`);
      return invalidatedCount;
    } catch (error: any) {
      this.logger.warn(`Failed to invalidate project cache: ${error.message}`);
      return 0;
    }
  }

  /**
   * Clear all cache entries (admin operation)
   */
  async clearAll(): Promise<number> {
    return this.invalidate(`${CACHE_PREFIX}*`);
  }
}
