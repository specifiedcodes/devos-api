/**
 * Cache Interfaces
 * Story 9.8: Agent Response Time Optimization
 *
 * Type definitions for response caching system with Redis TTL categories.
 */

/**
 * Cache categories with different TTLs
 */
export enum CacheCategory {
  STATUS = 'status',
  HELP = 'help',
  PROJECT = 'project',
}

/**
 * Cache key generation context
 */
export interface CacheContext {
  agentId: string;
  workspaceId?: string;
  projectId?: string;
}

/**
 * Cached response structure
 */
export interface CachedResponse {
  response: string;
  agentId: string;
  cachedAt: Date;
  expiresAt: Date;
  hitCount: number;
  metadata: {
    originalQuery: string;
    responseTime: number;
    modelUsed: string;
    category: CacheCategory;
  };
}

/**
 * Cache statistics for monitoring
 */
export interface CacheStats {
  totalHits: number;
  totalMisses: number;
  hitRate: number;
  entriesByCategory: Record<CacheCategory, number>;
  avgResponseTime: number;
}

/**
 * Cache configuration per category
 */
export interface CacheCategoryConfig {
  patterns: string[];
  ttl: number; // seconds
  maxEntries: number;
}

/**
 * Cache key strategy configuration
 */
export interface CacheKeyConfig {
  normalizeQuery: boolean;
  includeAgentId: boolean;
  includeProjectContext: boolean;
}

/**
 * Agent Response Cache Service Interface
 */
export interface IAgentResponseCacheService {
  /**
   * Get cached response for a query
   */
  get(key: string): Promise<CachedResponse | null>;

  /**
   * Set cached response with TTL
   */
  set(key: string, response: CachedResponse, ttl: number): Promise<void>;

  /**
   * Invalidate cache entries matching pattern
   */
  invalidate(pattern: string): Promise<number>;

  /**
   * Generate cache key from query and context
   */
  generateKey(query: string, context: CacheContext): string;

  /**
   * Detect cache category from query
   */
  detectCategory(query: string): CacheCategory;

  /**
   * Get TTL for a cache category
   */
  getTTL(category: CacheCategory): number;

  /**
   * Get cache statistics
   */
  getStats(): Promise<CacheStats>;

  /**
   * Increment hit count for a cache entry
   */
  incrementHitCount(key: string): Promise<void>;
}

/**
 * Cache category configurations with patterns and TTLs
 */
export const CACHE_CATEGORY_CONFIG: Record<CacheCategory, CacheCategoryConfig> = {
  [CacheCategory.STATUS]: {
    patterns: ['status', 'what are you working on', 'progress', 'current task'],
    ttl: 30, // 30 seconds - status changes quickly
    maxEntries: 100,
  },
  [CacheCategory.HELP]: {
    patterns: ['how to', 'what is', 'explain', 'help', 'why', 'can you'],
    ttl: 3600, // 1 hour - help content rarely changes
    maxEntries: 500,
  },
  [CacheCategory.PROJECT]: {
    patterns: ['story', 'task', 'epic', 'sprint', 'project'],
    ttl: 120, // 2 minutes - project state changes
    maxEntries: 200,
  },
};

/**
 * Default cache key configuration
 */
export const DEFAULT_CACHE_KEY_CONFIG: CacheKeyConfig = {
  normalizeQuery: true,
  includeAgentId: true,
  includeProjectContext: true,
};

/**
 * Cache prefix for Redis keys
 */
export const CACHE_PREFIX = 'agent_response:';

/**
 * Cache stats key in Redis
 */
export const CACHE_STATS_KEY = 'agent_response:stats';
