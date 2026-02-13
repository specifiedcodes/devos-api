/**
 * AgentResponseCacheService Tests
 * Story 9.8: Agent Response Time Optimization
 *
 * Unit tests for response caching with Redis TTL categories.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { AgentResponseCacheService } from './agent-response-cache.service';
import { RedisService } from '../../redis/redis.service';
import {
  CacheCategory,
  CachedResponse,
  CACHE_PREFIX,
  CACHE_CATEGORY_CONFIG,
} from '../interfaces/cache.interfaces';

describe('AgentResponseCacheService', () => {
  let service: AgentResponseCacheService;
  let redisService: jest.Mocked<RedisService>;

  const mockCachedResponse: CachedResponse = {
    response: 'Test response',
    agentId: 'agent-123',
    cachedAt: new Date(),
    expiresAt: new Date(Date.now() + 3600000),
    hitCount: 0,
    metadata: {
      originalQuery: 'test query',
      responseTime: 500,
      modelUsed: 'claude-3-5-sonnet',
      category: CacheCategory.HELP,
    },
  };

  beforeEach(async () => {
    const mockRedisService = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      keys: jest.fn(),
      increment: jest.fn(),
      expire: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentResponseCacheService,
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
      ],
    }).compile();

    service = module.get<AgentResponseCacheService>(AgentResponseCacheService);
    redisService = module.get(RedisService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('generateKey', () => {
    it('should generate consistent cache key for same query and context', () => {
      const query = 'How do I create a new project?';
      const context = { agentId: 'agent-123', workspaceId: 'ws-456' };

      const key1 = service.generateKey(query, context);
      const key2 = service.generateKey(query, context);

      expect(key1).toBe(key2);
      expect(key1).toContain(CACHE_PREFIX);
      expect(key1).toContain('agent-123');
    });

    it('should normalize query (lowercase, trim whitespace)', () => {
      const context = { agentId: 'agent-123' };

      const key1 = service.generateKey('  How Do I Create?  ', context);
      const key2 = service.generateKey('how do i create?', context);

      expect(key1).toBe(key2);
    });

    it('should generate different keys for different agents', () => {
      const query = 'test query';
      const context1 = { agentId: 'agent-1' };
      const context2 = { agentId: 'agent-2' };

      const key1 = service.generateKey(query, context1);
      const key2 = service.generateKey(query, context2);

      expect(key1).not.toBe(key2);
    });

    it('should include project context when provided', () => {
      const query = 'test query';
      const context1 = { agentId: 'agent-123', projectId: 'proj-1' };
      const context2 = { agentId: 'agent-123', projectId: 'proj-2' };

      const key1 = service.generateKey(query, context1);
      const key2 = service.generateKey(query, context2);

      expect(key1).not.toBe(key2);
    });
  });

  describe('detectCategory', () => {
    it('should detect STATUS category for status-related queries', () => {
      expect(service.detectCategory('What is your current status?')).toBe(CacheCategory.STATUS);
      expect(service.detectCategory('What are you working on?')).toBe(CacheCategory.STATUS);
      expect(service.detectCategory('Show me progress')).toBe(CacheCategory.STATUS);
    });

    it('should detect HELP category for help-related queries', () => {
      expect(service.detectCategory('How to create a new file?')).toBe(CacheCategory.HELP);
      expect(service.detectCategory('What is a sprint?')).toBe(CacheCategory.HELP);
      expect(service.detectCategory('Explain the architecture')).toBe(CacheCategory.HELP);
    });

    it('should detect PROJECT category for project-related queries', () => {
      expect(service.detectCategory('Show me the story details')).toBe(CacheCategory.PROJECT);
      expect(service.detectCategory('What tasks are pending?')).toBe(CacheCategory.PROJECT);
      expect(service.detectCategory('Epic overview')).toBe(CacheCategory.PROJECT);
    });

    it('should default to PROJECT category for unknown queries', () => {
      expect(service.detectCategory('random unrelated query')).toBe(CacheCategory.PROJECT);
    });
  });

  describe('getTTL', () => {
    it('should return correct TTL for STATUS category', () => {
      expect(service.getTTL(CacheCategory.STATUS)).toBe(CACHE_CATEGORY_CONFIG.status.ttl);
    });

    it('should return correct TTL for HELP category', () => {
      expect(service.getTTL(CacheCategory.HELP)).toBe(CACHE_CATEGORY_CONFIG.help.ttl);
    });

    it('should return correct TTL for PROJECT category', () => {
      expect(service.getTTL(CacheCategory.PROJECT)).toBe(CACHE_CATEGORY_CONFIG.project.ttl);
    });
  });

  describe('get', () => {
    it('should return cached response when found', async () => {
      const key = 'test-key';
      redisService.get.mockResolvedValue(JSON.stringify(mockCachedResponse));

      const result = await service.get(key);

      expect(redisService.get).toHaveBeenCalledWith(key);
      expect(result).toBeDefined();
      expect(result?.response).toBe(mockCachedResponse.response);
    });

    it('should return null when cache miss', async () => {
      redisService.get.mockResolvedValue(null);

      const result = await service.get('nonexistent-key');

      expect(result).toBeNull();
    });

    it('should increment hit count on cache hit', async () => {
      const key = 'test-key';
      redisService.get.mockResolvedValue(JSON.stringify(mockCachedResponse));

      await service.get(key);

      expect(redisService.increment).toHaveBeenCalled();
    });

    it('should handle cache errors gracefully', async () => {
      redisService.get.mockRejectedValue(new Error('Redis error'));

      const result = await service.get('test-key');

      expect(result).toBeNull();
    });
  });

  describe('set', () => {
    it('should store cached response with TTL', async () => {
      const key = 'test-key';
      const ttl = 3600;

      await service.set(key, mockCachedResponse, ttl);

      expect(redisService.set).toHaveBeenCalledWith(
        key,
        expect.any(String),
        ttl,
      );
    });

    it('should serialize response to JSON', async () => {
      const key = 'test-key';

      await service.set(key, mockCachedResponse, 3600);

      const setCall = redisService.set.mock.calls[0];
      const serialized = JSON.parse(setCall[1] as string);
      expect(serialized.response).toBe(mockCachedResponse.response);
      expect(serialized.agentId).toBe(mockCachedResponse.agentId);
    });

    it('should handle set errors gracefully', async () => {
      redisService.set.mockRejectedValue(new Error('Redis error'));

      // Should not throw
      await expect(service.set('key', mockCachedResponse, 3600)).resolves.not.toThrow();
    });
  });

  describe('invalidate', () => {
    it('should invalidate matching cache entries', async () => {
      const pattern = 'agent_response:agent-123:*';
      redisService.keys.mockResolvedValue(['key1', 'key2', 'key3']);
      redisService.del.mockResolvedValue(undefined);

      const count = await service.invalidate(pattern);

      expect(redisService.keys).toHaveBeenCalledWith(pattern);
      expect(redisService.del).toHaveBeenCalledWith('key1', 'key2', 'key3');
      expect(count).toBe(3);
    });

    it('should return 0 when no matching entries', async () => {
      redisService.keys.mockResolvedValue([]);

      const count = await service.invalidate('no-match:*');

      expect(count).toBe(0);
      expect(redisService.del).not.toHaveBeenCalled();
    });

    it('should handle invalidation errors gracefully', async () => {
      redisService.keys.mockRejectedValue(new Error('Redis error'));

      const count = await service.invalidate('pattern:*');

      expect(count).toBe(0);
    });
  });

  describe('getStats', () => {
    it('should return cache statistics', async () => {
      const statsData = {
        totalHits: 100,
        totalMisses: 20,
        responseTimesSum: 50000,
        responseTimesCount: 100,
      };
      redisService.get.mockResolvedValue(JSON.stringify(statsData));

      const stats = await service.getStats();

      expect(stats).toBeDefined();
      expect(stats.totalHits).toBe(100);
      expect(stats.totalMisses).toBe(20);
      expect(stats.hitRate).toBeCloseTo(0.833, 2);
    });

    it('should return default stats when no data', async () => {
      redisService.get.mockResolvedValue(null);

      const stats = await service.getStats();

      expect(stats.totalHits).toBe(0);
      expect(stats.totalMisses).toBe(0);
      expect(stats.hitRate).toBe(0);
    });
  });

  describe('incrementHitCount', () => {
    it('should increment hit count for cache entry', async () => {
      const key = 'test-key';

      await service.incrementHitCount(key);

      expect(redisService.increment).toHaveBeenCalled();
    });

    it('should update global stats on hit', async () => {
      const key = 'test-key';

      await service.incrementHitCount(key);

      // Should increment global hit counter
      expect(redisService.increment).toHaveBeenCalledTimes(2);
    });
  });

  describe('cacheOrFetch', () => {
    it('should return cached response on cache hit', async () => {
      const query = 'How to do something?';
      const context = { agentId: 'agent-123' };
      const key = service.generateKey(query, context);

      redisService.get.mockResolvedValue(JSON.stringify(mockCachedResponse));

      const result = await service.cacheOrFetch(
        query,
        context,
        async () => ({
          response: 'fetched response',
          responseTime: 500,
          modelUsed: 'claude-3-5-sonnet',
        }),
      );

      expect(result.response).toBe(mockCachedResponse.response);
      expect(result.fromCache).toBe(true);
    });

    it('should fetch and cache on cache miss', async () => {
      const query = 'How to do something?';
      const context = { agentId: 'agent-123' };

      redisService.get.mockResolvedValue(null);

      const fetchFn = jest.fn().mockResolvedValue({
        response: 'fetched response',
        responseTime: 500,
        modelUsed: 'claude-3-5-sonnet',
      });

      const result = await service.cacheOrFetch(query, context, fetchFn);

      expect(fetchFn).toHaveBeenCalled();
      expect(result.response).toBe('fetched response');
      expect(result.fromCache).toBe(false);
      expect(redisService.set).toHaveBeenCalled();
    });

    it('should still return response if caching fails', async () => {
      const query = 'How to do something?';
      const context = { agentId: 'agent-123' };

      redisService.get.mockResolvedValue(null);
      redisService.set.mockRejectedValue(new Error('Redis error'));

      const result = await service.cacheOrFetch(
        query,
        context,
        async () => ({
          response: 'fetched response',
          responseTime: 500,
          modelUsed: 'claude-3-5-sonnet',
        }),
      );

      expect(result.response).toBe('fetched response');
      expect(result.fromCache).toBe(false);
    });
  });

  describe('invalidateAgentCache', () => {
    it('should invalidate all cache entries for an agent', async () => {
      const agentId = 'agent-123';
      redisService.keys.mockResolvedValue(['key1', 'key2']);

      await service.invalidateAgentCache(agentId);

      expect(redisService.keys).toHaveBeenCalledWith(expect.stringContaining(agentId));
    });
  });

  describe('invalidateProjectCache', () => {
    it('should invalidate all cache entries for a project', async () => {
      const projectId = 'proj-123';
      // Mock keys that match the wildcard pattern
      redisService.keys.mockResolvedValue(['key1', 'key2']);
      // Mock getting cached responses that contain the projectId in query
      redisService.get.mockImplementation((key: string) => {
        if (key === 'key1') {
          return Promise.resolve(JSON.stringify({
            response: 'test',
            metadata: { originalQuery: `query about ${projectId}` },
          }));
        }
        return Promise.resolve(null);
      });
      redisService.del.mockResolvedValue(undefined);

      await service.invalidateProjectCache(projectId);

      // Should use wildcard pattern since projectId is hashed
      expect(redisService.keys).toHaveBeenCalledWith(expect.stringContaining('agent_response:'));
    });
  });
});
